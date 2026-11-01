import type { Failure } from "@/contracts";
import { liveRequestSchema, type LiveEvent } from "@/contracts/live";
import type { Repository } from "./ports";
import type { LiveSuggestionProvider } from "./ai/live";
import { deckGenerationFailure } from "./ai/errors";
import { matchLiveCards } from "./live-matching";

type Dependencies = {
  configuredOrigin(): string | undefined;
  getSession(headers: Headers): Promise<{ user: { id: string } } | null>;
  repositoryForUser(userId: string): Repository;
  provider: LiveSuggestionProvider;
  now?: () => number;
  deadlineMs?: number;
  bodyDeadlineMs?: number;
};

const privateHeaders = { "Cache-Control": "private, no-store" };
function failure(status: number, code: string, message: string, retryable = false) {
  return Response.json({ ok: false, error: { code, message, retryable } }, {
    status, headers: { ...privateHeaders, ...(status === 429 ? { "Retry-After": "1" } : {}) },
  });
}

/** In-process overload protection, not a distributed billing quota. */
export function createLiveOperationHandler(deps: Dependencies) {
  const users = new Map<string, { active: number; last: number }>();
  let active = 0;
  const now = deps.now ?? Date.now;
  function admit(userId: string): (() => void) | null {
    const at = now();
    for (const [id, state] of users) if (!state.active && at - state.last > 60_000) users.delete(id);
    const state = users.get(userId);
    if (active >= 32 || (!state && users.size >= 1_000) || (state && (state.active >= 2 || at - state.last < 350))) return null;
    const current = state ?? { active: 0, last: at };
    current.active++; current.last = at; active++;
    users.set(userId, current);
    let released = false;
    return () => { if (!released) { released = true; current.active--; active--; } };
  }

  return async function POST(request: Request): Promise<Response> {
    let release: (() => void) | undefined;
    try {
      let origin: URL;
      try {
        origin = new URL(deps.configuredOrigin() ?? "");
        if (!["https:", "http:"].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) throw new Error();
      } catch { return failure(503, "AUTH_UNAVAILABLE", "Account services are unavailable. Try again shortly.", true); }
      if ((request.headers.has("origin") && request.headers.get("origin") !== origin.origin) || request.headers.get("sec-fetch-site") === "cross-site") {
        return failure(403, "UNAUTHORIZED", "This request origin is not allowed.");
      }
      const session = await deps.getSession(request.headers);
      if (!session) return failure(401, "UNAUTHORIZED", "Sign in to use live suggestions.");
      if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
        return failure(415, "VALIDATION_ERROR", "Send a JSON transcript, not microphone audio.");
      }
      // Bound actual bytes, including chunked requests with no Content-Length header.
      const reader = request.body?.getReader();
      if (!reader) return failure(400, "VALIDATION_ERROR", "Expected a JSON transcript.");
      let bytes = 0;
      const chunks: Uint8Array[] = [];
      let bodyStopped: "timeout" | "abort" | undefined;
      const cancelBody = (reason: "timeout" | "abort") => {
        bodyStopped = reason;
        void reader.cancel().catch(() => {});
      };
      const bodyAbort = () => cancelBody("abort");
      request.signal.addEventListener("abort", bodyAbort, { once: true });
      const bodyTimer = setTimeout(() => cancelBody("timeout"), deps.bodyDeadlineMs ?? 5_000);
      try {
        if (request.signal.aborted) bodyAbort();
        while (true) {
          const item = await reader.read();
          if (item.done) break;
          bytes += item.value.byteLength;
          if (bytes > 8_192) { void reader.cancel().catch(() => {}); return failure(413, "VALIDATION_ERROR", "Live requests must be at most 8 KiB."); }
          chunks.push(item.value);
        }
      } finally {
        clearTimeout(bodyTimer);
        request.signal.removeEventListener("abort", bodyAbort);
        reader.releaseLock();
      }
      if (bodyStopped) return failure(bodyStopped === "timeout" ? 408 : 499, "LIVE_CANCELLED", "Transcript upload timed out or was cancelled.", true);
      let json: unknown;
      try {
        const body = new Uint8Array(bytes);
        let offset = 0;
        for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
        json = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body));
      } catch { return failure(400, "VALIDATION_ERROR", "Expected valid JSON."); }
      const parsed = liveRequestSchema.safeParse(json);
      if (!parsed.success) return failure(400, "VALIDATION_ERROR", "Send a deck ID, 2–1600 characters of transcript, and an optional nonnegative revision.");
      const { deckId, transcript, revision, generate } = parsed.data;
      const admitted = admit(session.user.id);
      if (!admitted) return failure(429, "LIVE_RATE_LIMIT", "Live suggestions are busy. Cancel older requests and retry shortly.", true);
      release = admitted;
      // Scope comes only from the verified session; never from the request body.
      const repository = deps.repositoryForUser(session.user.id);
      const deck = await repository.decks.get(deckId);
      if (!deck) return failure(404, "NOT_FOUND", "Deck not found.");
      if (deck.status !== "completed" || !deck.cards.length) return failure(409, "DECK_NOT_READY", "Open a completed prep deck before starting live suggestions.");
      const snapshot = await repository.decks.getSnapshot(deckId);
      if (!snapshot || snapshot.context.person.id !== deck.personId) return failure(409, "SNAPSHOT_UNAVAILABLE", "This deck's saved context is unavailable. Build a new deck.");
      if (request.signal.aborted) return failure(499, "LIVE_CANCELLED", "Live request cancelled.");
      const cards = matchLiveCards(deck.cards, transcript);
      const abort = new AbortController();
      const encoder = new TextEncoder();
      const releaseStream = release;
      release = undefined;
      let closed = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let iterator: AsyncIterator<string> | undefined;
      let closeStream: (cancelled?: boolean) => void = () => {};
      let abortRequest: () => void = () => {};
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          const send = (event: LiveEvent) => { if (!closed) controller.enqueue(encoder.encode(JSON.stringify(event) + "\n")); };
          closeStream = (cancelled = false) => {
            if (closed) return;
            closed = true;
            clearTimeout(timer);
            request.signal.removeEventListener("abort", abortRequest);
            abort.abort();
            releaseStream();
            if (!cancelled) controller.close();
            void iterator?.return?.().catch(() => {});
          };
          abortRequest = () => closeStream();
          request.signal.addEventListener("abort", abortRequest, { once: true });
          timer = setTimeout(() => {
            send({ type: "error", revision, error: { code: "LIVE_TIMEOUT", message: "Live suggestion timed out. Keep using the matched cards and retry.", retryable: true } });
            closeStream();
          }, deps.deadlineMs ?? 20_000);
          // This reaches the client before waiting for the model's first token.
          send({ type: "matches", revision, cards, warnings: deck.warnings, researchSince: deck.researchSince });
          if (request.signal.aborted) { closeStream(); return; }
          if (!generate) {
            send({ type: "done", revision });
            closeStream();
            return;
          }
          void (async () => {
            let chars = 0, events = 0;
            try {
              iterator = deps.provider.stream({ transcript, snapshot, cards }, abort.signal)[Symbol.asyncIterator]();
              while (!closed) {
                const part = await iterator.next();
                if (part.done) break;
                if (closed) return;
                chars += part.value.length;
                if (chars > 6_000 || ++events > 1_024) throw new Error("Live output limit.");
                send({ type: "delta", revision, text: part.value });
              }
              if (!closed) send({ type: "done", revision });
            } catch (error) {
              if (!closed) send({ type: "error", revision, error: liveFailure(error) });
            } finally { closeStream(); }
          })();
        },
        cancel() { closeStream(true); },
      });
      return new Response(stream, { headers: {
        ...privateHeaders, "Content-Type": "application/x-ndjson; charset=utf-8",
        "X-Content-Type-Options": "nosniff", "X-Accel-Buffering": "no",
      } });
    } catch {
      return failure(503, "LIVE_UNAVAILABLE", "Live suggestions are unavailable. Use the saved cards and retry shortly.", true);
    } finally { release?.(); }
  };
}

/** Reuse safe provider codes, without deck-specific recovery copy or raw exception text. */
function liveFailure(error: unknown): Failure {
  const mapped = deckGenerationFailure(error);
  const messages: Record<string, string> = {
    AI_MISSING_KEY: "Live generation needs FEATHERLESS_API_KEY on the server.",
    AI_MISSING_MODEL: "Live generation needs FEATHERLESS_MODEL on the server.",
    AI_INPUT_TOO_LARGE: "The selected context is too large for a live suggestion. Use the matched cards.",
    AI_OUTPUT_TRUNCATED: "The suggestion reached its output limit. Treat it as incomplete and use the matched cards.",
    AI_EMPTY_OUTPUT: "The model returned no live suggestion. Use the matched cards and retry.",
    AI_OUTPUT_REFUSED: "The model declined this live suggestion. Use the matched cards.",
    UPSTREAM_ERROR: "Live generation failed. Use the matched cards and retry.",
  };
  return { ...mapped, message: messages[mapped.code] ?? mapped.message };
}
