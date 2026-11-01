import { failureSchema } from "../contracts/domain";
import { liveEventSchema, type LiveEvent } from "../contracts/live";

export type { LiveEvent } from "../contracts/live";

class LiveHttpError extends Error {
  constructor(message: string, readonly status: number, readonly retryAfterMs: number) {
    super(message);
  }
}

const abortError = () => new DOMException("Live session stopped.", "AbortError");

/** Consume a bounded NDJSON response. A terminal error is an event, not success. */
export async function consumeLiveResponse(
  response: Response,
  onEvent: (event: LiveEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  if (!response.body) {
    if (!response.ok) throw new LiveHttpError(`Live suggestions are unavailable (${response.status}).`, response.status, 1_000);
    throw new Error("The live response was empty.");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let events = 0;
  let outputLength = 0;
  let buffer = "";
  const cancel = () => { void reader.cancel().catch(() => undefined); };
  signal?.addEventListener("abort", cancel, { once: true });
  const read = async () => {
    if (signal?.aborted) throw abortError();
    const chunk = await reader.read();
    if (signal?.aborted) throw abortError();
    bytes += chunk.value?.byteLength ?? 0;
    if (bytes > (response.ok ? 524_288 : 8_192)) throw new Error("The live response exceeded its size limit.");
    return chunk;
  };
  try {
    if (!response.ok) {
      while (true) {
        const chunk = await read();
        buffer += decoder.decode(chunk.value, { stream: !chunk.done });
        if (chunk.done) break;
      }
      let message = `Live suggestions are unavailable (${response.status}).`;
      try {
        const payload: unknown = JSON.parse(buffer);
        if (payload && typeof payload === "object" && "ok" in payload && payload.ok === false && "error" in payload) {
          const parsed = failureSchema.safeParse(payload.error);
          if (parsed.success) message = parsed.data.message.slice(0, 500);
        }
      } catch { /* Never expose raw HTML or server response bodies. */ }
      const retryHeader = response.headers.get("retry-after");
      const seconds = retryHeader === null ? NaN : Number(retryHeader);
      const delay = Number.isFinite(seconds) ? seconds * 1_000 : Date.parse(retryHeader ?? "") - Date.now();
      throw new LiveHttpError(message, response.status, Math.max(1_000, Number.isFinite(delay) ? delay : 1_000));
    }
    if (!response.headers.get("content-type")?.toLowerCase().includes("application/x-ndjson")) {
      throw new Error("The live response had an unexpected format.");
    }
    const dispatch = (line: string) => {
      if (!line.trim()) return false;
      if (line.length > 131_072 || ++events > 2_048) throw new Error("The live response exceeded its event limit.");
      let event: LiveEvent;
      try { event = liveEventSchema.parse(JSON.parse(line)); }
      catch { throw new Error("The live response contained an invalid event."); }
      if (event.type === "delta") outputLength += event.text.length;
      if (outputLength > 12_000) throw new Error("The live response exceeded its output limit.");
      onEvent(event);
      return event.type === "done" || event.type === "error";
    };
    while (true) {
      const chunk = await read();
      buffer += decoder.decode(chunk.value, { stream: !chunk.done });
      let newline: number;
      while ((newline = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        if (dispatch(line)) return;
      }
      if (buffer.length > 131_072) throw new Error("The live response exceeded its event limit.");
      if (chunk.done) {
        if (buffer && dispatch(buffer)) return;
        throw new Error("The live response ended before the suggestion was complete.");
      }
    }
  } finally {
    signal?.removeEventListener("abort", cancel);
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

type Scheduler = {
  setInterval(callback: () => void, milliseconds: number): unknown;
  clearInterval(handle: unknown): void;
};

/** A running cadence keeps interim speech moving even when the speaker never pauses. */
export function createLiveSession(options: {
  deckId: string;
  onEvent: (event: LiveEvent) => void;
  onError: (message: string) => void;
  onGenerationStart?: (revision: number, transcript: string) => void;
  retrieve?: boolean;
  requestTimeoutMs?: number;
  fetchImpl?: typeof fetch;
  now?: () => number;
  scheduler?: Scheduler;
}): { update(transcript: string): void; stop(): void } {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const scheduler: Scheduler = options.scheduler ?? {
    setInterval: (callback, milliseconds) => setInterval(callback, milliseconds),
    clearInterval: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
  };
  const controllers = new Set<AbortController>();
  let stopped = false;
  let transcript = "";
  let revision = 0;
  let generationRevision = -1;
  let retrievalRevision = -1;
  let matchedRevision = -1;
  let generationActive = false;
  let retrievalActive = false;
  let generatedText = "";
  let retrievedText = "";
  let lastRequestAt = -Infinity;
  let lastGenerationAt = -Infinity;
  let lastRetrievalAt = -Infinity;
  let pausedUntil = -Infinity;

  const stop = () => {
    if (stopped) return;
    stopped = true;
    transcript = "";
    scheduler.clearInterval(interval);
    for (const controller of controllers) controller.abort();
    controllers.clear();
  };

  const request = async (generate: boolean) => {
    const sentText = transcript;
    const sentRevision = revision;
    const controller = new AbortController();
    controllers.add(controller);
    lastRequestAt = now();
    if (generate) {
      generationActive = true;
      generationRevision = sentRevision;
      generatedText = sentText;
      lastGenerationAt = lastRequestAt;
    } else {
      retrievalActive = true;
    }
    retrievalRevision = sentRevision;
    retrievedText = sentText;
    lastRetrievalAt = lastRequestAt;
    let timedOut = false;
    let rejectDeadline: ((reason: Error) => void) | undefined;
    const timeoutMessage = "Live suggestions took too long. Try a new phrase or restart listening.";
    const deadline = new Promise<never>((_resolve, reject) => { rejectDeadline = reject; });
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
      rejectDeadline?.(new Error(timeoutMessage));
    }, options.requestTimeoutMs ?? 25_000);
    try {
      if (generate) options.onGenerationStart?.(sentRevision, sentText);
      if (stopped || controller.signal.aborted) return;
      const response = await Promise.race([fetchImpl("/api/live/suggest", {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deckId: options.deckId, transcript: sentText, revision: sentRevision, generate }),
        signal: controller.signal,
      }).then((response) => {
        if (controller.signal.aborted) {
          void response.body?.cancel().catch(() => undefined);
          throw abortError();
        }
        return response;
      }), deadline]);
      await Promise.race([consumeLiveResponse(response, (event) => {
        if (stopped || controller.signal.aborted || event.revision !== sentRevision) return;
        if (event.type === "matches") {
          if (event.revision < retrievalRevision || event.revision < matchedRevision) return;
          matchedRevision = event.revision;
        } else if (!generate || event.revision !== generationRevision) return;
        options.onEvent(event);
      }, controller.signal), deadline]);
    } catch (error) {
      if (!stopped && (timedOut || !controller.signal.aborted)) {
        if (error instanceof LiveHttpError && error.status === 429) {
          pausedUntil = Math.max(pausedUntil, now() + error.retryAfterMs);
          if (generate && generatedText === sentText) generatedText = "";
          if (retrievedText === sentText) retrievedText = "";
        }
        options.onError(timedOut ? timeoutMessage : error instanceof Error ? error.message : "Live suggestions are unavailable.");
        if (error instanceof LiveHttpError && [401, 403, 404].includes(error.status)) stop();
      }
    } finally {
      clearTimeout(timeout);
      controllers.delete(controller);
      if (generate) generationActive = false;
      else retrievalActive = false;
    }
  };

  const tick = () => {
    const time = now();
    if (stopped || transcript.length < 2 || !/[\p{L}\p{N}]/u.test(transcript) ||
      time < pausedUntil || time - lastRequestAt < 350 || controllers.size >= 2) return;
    if (!generationActive && generatedText !== transcript && time - lastGenerationAt >= 1_600) {
      void request(true);
    } else if (options.retrieve !== false && !retrievalActive && retrievedText !== transcript && time - lastRetrievalAt >= 800) {
      void request(false);
    }
  };
  const interval = scheduler.setInterval(tick, 50);
  return {
    update(value) {
      if (stopped) return;
      const next = value.slice(-1_600).trim();
      if (next === transcript) return;
      transcript = next;
      revision++;
      tick();
    },
    stop,
  };
}
