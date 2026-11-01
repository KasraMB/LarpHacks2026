"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import type { Failure } from "@/contracts";
import { failureSchema } from "@/contracts/domain";
import { liveEventSchema, type LiveEvent } from "@/contracts/live";
import type { LiveSuggestState } from "@/components/contracts";
import { capPhrase, readNdjson, retryAfterMs } from "./ndjson";

/** Retrieval cadence while speech continues (spec: 500–750 ms). */
export const RETRIEVAL_INTERVAL_MS = 600;
/** The server admits one request per account every 350 ms, across both kinds. */
const REQUEST_SPACING_MS = 400;
const RETRYABLE_BACKOFF_MS = 2000;
const MIN_CHARS = 2;
/** Speech starts a generation from an early phrase instead of waiting for a full sentence. */
const MIN_WORDS_FOR_AUTO_GENERATION = 3;
/** Fail for every phrase, so retrying on new speech would only repeat them. */
const CONFIG_ERROR_CODES = new Set(["AI_MISSING_KEY", "AI_MISSING_MODEL"]);

export const initialLiveSuggestState: LiveSuggestState = {
  matches: null,
  suggestion: null,
  generatingRevision: null,
  error: null,
  halted: false,
  generationPaused: false,
};

/** speech: may start generations itself. typing: retrieval only. submit: explicit ask, replaces a running generation. */
export type PhraseSource = "speech" | "typing" | "submit";

type Outcome =
  | { kind: "done" }
  | { kind: "error"; error: Failure }
  | { kind: "incomplete"; error: Failure | null }
  | { kind: "aborted" }
  | { kind: "busy"; waitMs: number }
  | { kind: "failed"; error: Failure };

type Deps = {
  fetch: typeof globalThis.fetch;
  now: () => number;
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
};

const envelopeSchema = z.object({ ok: z.literal(false), error: failureSchema });
const networkFailure: Failure = { code: "NETWORK", message: "Could not reach live suggestions. Check your connection.", retryable: true };
const invalidFailure: Failure = { code: "INVALID_STREAM", message: "Live suggestions sent an unexpected response.", retryable: true };

/** Framework-free request scheduler; the hook below owns one per deck. */
export class LiveSuggestSession {
  private state: LiveSuggestState = initialLiveSuggestState;
  private disposed = false;
  private phrase = "";
  private revision = 0;
  private autoGenerate = false;
  private submittedRevision = -1;

  private lastSentAt = -Infinity;
  private backoffUntil = 0;

  private retrieval: AbortController | null = null;
  private retrievalTimer: unknown = null;
  private lastRetrievalAt = -Infinity;
  private retrievedRevision = -1;
  private matchesRevision = -1;

  private generation: { controller: AbortController; revision: number } | null = null;
  private generationTimer: unknown = null;
  private generatedRevision = -1;

  constructor(
    private readonly deckId: string,
    private readonly onState: (state: LiveSuggestState) => void,
    private readonly deps: Deps = {
      fetch: (...args) => globalThis.fetch(...args),
      now: () => Date.now(),
      setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
      clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
    },
  ) {}

  update(raw: string, source: PhraseSource) {
    if (this.disposed) return;
    const text = capPhrase(raw);
    if (text.length < MIN_CHARS) return;
    if (source === "submit" && this.state.halted) {
      this.resume();
      this.retrievedRevision = this.generatedRevision = -1;
    }
    if (text !== this.phrase) {
      this.phrase = text;
      this.revision++;
    } else if (source !== "submit") {
      return;
    }
    this.autoGenerate = source === "speech";
    if (source === "submit") {
      if (this.state.generationPaused) this.set({ generationPaused: false });
      this.submittedRevision = this.revision;
      // An explicit new question replaces the running answer.
      if (this.generation && this.generation.revision !== this.revision) this.abortGeneration();
    }
    this.scheduleRetrieval();
    this.scheduleGeneration();
  }

  /** Clears a halt or paused generation after a user action such as Listen. */
  resume() {
    if (this.disposed) return;
    if (this.state.halted || this.state.error || this.state.generationPaused) {
      this.set({ halted: false, error: null, generationPaused: false });
    }
  }

  /** Re-sends the current phrase after an explicit Retry. */
  retry() {
    this.resume();
    this.generatedRevision = -1;
    this.retrievedRevision = -1;
    this.scheduleRetrieval();
    this.scheduleGeneration();
  }

  stop() {
    this.retrieval?.abort();
    this.retrieval = null;
    this.abortGeneration();
    this.clearTimers();
    const suggestion = this.state.suggestion;
    this.set({
      generatingRevision: null,
      suggestion: suggestion?.status === "streaming" ? { ...suggestion, status: "incomplete" } : suggestion,
    });
  }

  dispose() {
    this.stop();
    this.disposed = true;
  }

  private abortGeneration() {
    this.generation?.controller.abort();
    this.generation = null;
    if (this.generationTimer !== null) this.deps.clearTimeout(this.generationTimer);
    this.generationTimer = null;
  }

  private clearTimers() {
    if (this.retrievalTimer !== null) this.deps.clearTimeout(this.retrievalTimer);
    if (this.generationTimer !== null) this.deps.clearTimeout(this.generationTimer);
    this.retrievalTimer = this.generationTimer = null;
  }

  private set(patch: Partial<LiveSuggestState>) {
    if (this.disposed) return;
    this.state = { ...this.state, ...patch };
    this.onState(this.state);
  }

  private slotWait() {
    const now = this.deps.now();
    return Math.max(0, this.lastSentAt + REQUEST_SPACING_MS - now, this.backoffUntil - now);
  }

  private backOff(ms: number) {
    this.backoffUntil = Math.max(this.backoffUntil, this.deps.now() + ms);
  }

  private scheduleRetrieval() {
    // One in flight at most; its completion reschedules if the phrase moved on.
    if (this.disposed || this.state.halted || this.retrieval || this.retrievalTimer !== null) return;
    if (this.retrievedRevision === this.revision || this.phrase.length < MIN_CHARS) return;
    const wait = Math.max(this.lastRetrievalAt + RETRIEVAL_INTERVAL_MS - this.deps.now(), this.slotWait(), 0);
    this.retrievalTimer = this.deps.setTimeout(() => {
      this.retrievalTimer = null;
      void this.runRetrieval();
    }, wait);
  }

  private async runRetrieval() {
    if (this.disposed || this.state.halted || this.retrieval) return;
    if (this.slotWait() > 0) return this.scheduleRetrieval();
    if (this.retrievedRevision === this.revision) return;
    const revision = this.revision;
    const controller = new AbortController();
    this.retrieval = controller;
    this.retrievedRevision = revision;
    this.lastRetrievalAt = this.lastSentAt = this.deps.now();
    const outcome = await this.request(this.phrase, revision, false, controller);
    if (this.retrieval !== controller) return;
    this.retrieval = null;
    if (outcome.kind === "busy") {
      this.backOff(outcome.waitMs);
      this.retrievedRevision = -1;
    } else if (outcome.kind === "failed" || outcome.kind === "error" || (outcome.kind === "incomplete" && outcome.error)) {
      const error = outcome.error ?? invalidFailure;
      if (!error.retryable) return this.halt(error);
      this.backOff(RETRYABLE_BACKOFF_MS);
      this.set({ error });
    } else if (outcome.kind === "done" && this.state.error) {
      this.set({ error: null });
    }
    this.scheduleRetrieval();
    // A generation may have been waiting for the slot this request held.
    this.scheduleGeneration();
  }

  private readyToGenerate() {
    if (this.revision === this.submittedRevision) return true;
    return this.autoGenerate && this.phrase.split(" ").length >= MIN_WORDS_FOR_AUTO_GENERATION;
  }

  private scheduleGeneration() {
    if (this.disposed || this.state.halted || this.state.generationPaused || this.generation || this.generationTimer !== null) return;
    if (this.generatedRevision === this.revision || !this.readyToGenerate()) return;
    this.generationTimer = this.deps.setTimeout(() => {
      this.generationTimer = null;
      void this.runGeneration();
    }, this.slotWait());
  }

  private async runGeneration() {
    if (this.disposed || this.state.halted || this.state.generationPaused || this.generation) return;
    if (this.slotWait() > 0) return this.scheduleGeneration();
    if (this.generatedRevision === this.revision || !this.readyToGenerate()) return;
    const revision = this.revision;
    const controller = new AbortController();
    this.generation = { controller, revision };
    this.generatedRevision = revision;
    this.lastSentAt = this.deps.now();
    this.set({ generatingRevision: revision });
    const outcome = await this.request(this.phrase, revision, true, controller);
    // Replaced or stopped; whoever aborted it owns the state now.
    if (this.generation?.controller !== controller) return;
    this.generation = null;
    const current = this.state.suggestion?.revision === revision ? this.state.suggestion : null;
    const base = current ?? { revision, text: "", status: "streaming" as const, error: null };
    switch (outcome.kind) {
      case "done":
        this.set({ generatingRevision: null, suggestion: { ...base, status: "done" }, error: null });
        break;
      case "error":
      case "incomplete":
        this.set({ generatingRevision: null, suggestion: { ...base, status: "incomplete", error: outcome.error } });
        if (outcome.error?.retryable) this.backOff(RETRYABLE_BACKOFF_MS);
        // Phrase-specific errors refresh on the next phrase; the revision guard stops same-phrase retries.
        if (outcome.error && CONFIG_ERROR_CODES.has(outcome.error.code)) {
          this.set({ generationPaused: true });
          return;
        }
        break;
      case "busy":
        this.backOff(outcome.waitMs);
        this.generatedRevision = -1;
        this.set({ generatingRevision: null });
        break;
      case "failed":
        if (!outcome.error.retryable) return this.halt(outcome.error);
        this.backOff(RETRYABLE_BACKOFF_MS);
        this.set({ generatingRevision: null, error: outcome.error });
        break;
      case "aborted":
        this.set({ generatingRevision: null });
        return;
    }
    // Refresh from the newest phrase if it changed while this one streamed.
    this.scheduleGeneration();
  }

  private halt(error: Failure) {
    this.stop();
    this.set({ halted: true, error });
  }

  private handleEvent(event: LiveEvent, revision: number, generate: boolean) {
    if (event.revision !== revision) return;
    if (event.type === "matches") {
      if (event.revision <= this.matchesRevision) return;
      this.matchesRevision = event.revision;
      this.set({ matches: { revision: event.revision, cards: event.cards, warnings: event.warnings } });
    } else if (event.type === "delta" && generate && this.generation?.revision === revision) {
      const previous = this.state.suggestion;
      // The previous answer stays visible until the new one produces text.
      const text = previous?.revision === revision ? previous.text + event.text : event.text;
      this.set({ suggestion: { revision, text, status: "streaming", error: null } });
    }
  }

  private async request(transcript: string, revision: number, generate: boolean, controller: AbortController): Promise<Outcome> {
    const { signal } = controller;
    let response: Response;
    try {
      response = await this.deps.fetch("/api/live/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deckId: this.deckId, transcript, revision, generate }),
        cache: "no-store",
        signal,
      });
    } catch {
      return signal.aborted ? { kind: "aborted" } : { kind: "failed", error: networkFailure };
    }
    if (signal.aborted) {
      void response.body?.cancel().catch(() => {});
      return { kind: "aborted" };
    }
    if (response.status === 429) {
      void response.body?.cancel().catch(() => {});
      return { kind: "busy", waitMs: retryAfterMs(response.headers.get("Retry-After")) };
    }
    if (response.status !== 200 || !response.body) {
      let error: Failure = { code: `HTTP_${response.status}`, message: "Live suggestions are unavailable right now.", retryable: response.status >= 500 };
      try {
        const parsed = envelopeSchema.safeParse(await response.json());
        if (parsed.success) error = parsed.data.error;
      } catch {
        // Keep the generic failure when the body is not the JSON envelope.
      }
      return signal.aborted ? { kind: "aborted" } : { kind: "failed", error };
    }

    let terminal: Outcome | null = null;
    let invalid = false;
    try {
      const end = await readNdjson(response.body, (value) => {
        if (signal.aborted) return true;
        const parsed = liveEventSchema.safeParse(value);
        if (!parsed.success) {
          invalid = true;
          return true;
        }
        const event = parsed.data;
        this.handleEvent(event, revision, generate);
        if (event.type === "done") terminal = { kind: "done" };
        if (event.type === "error") terminal = { kind: "error", error: event.error };
        return terminal !== null;
      });
      if (end === "invalid") invalid = true;
    } catch {
      if (signal.aborted) return { kind: "aborted" };
      return { kind: "incomplete", error: null };
    }
    if (signal.aborted) return { kind: "aborted" };
    if (terminal) return terminal;
    // Connection ended with no done or error event.
    return { kind: "incomplete", error: invalid ? invalidFailure : null };
  }
}

/** Live suggestions for one completed deck; pass null to keep it idle. */
export function useLiveSuggest(deckId: string | null) {
  const [state, setState] = useState<LiveSuggestState>(initialLiveSuggestState);
  const session = useRef<LiveSuggestSession | null>(null);

  useEffect(() => {
    if (!deckId) return;
    const current = new LiveSuggestSession(deckId, setState);
    session.current = current;
    return () => {
      current.dispose();
      if (session.current === current) session.current = null;
      setState(initialLiveSuggestState);
    };
  }, [deckId]);

  const update = useCallback((text: string, source: PhraseSource) => session.current?.update(text, source), []);
  const stop = useCallback(() => session.current?.stop(), []);
  const resume = useCallback(() => session.current?.resume(), []);
  const retry = useCallback(() => session.current?.retry(), []);
  return { state, update, stop, resume, retry };
}
