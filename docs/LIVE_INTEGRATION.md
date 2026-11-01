# Live conversation backend

The backend accepts **partial text transcripts** and streams useful saved cards before model output. The microphone, speech-to-text capture, and presentation remain frontend work. No frontend components were changed for this endpoint.

## Request

`POST /api/live/suggest`, same-origin, with the existing signed-in session cookie and `Content-Type: application/json`:

```json
{
  "deckId": "a-completed-private-deck-id",
  "transcript": "what do you think about C++ templates and",
  "revision": 17,
  "generate": true
}
```

`transcript` is 2–1600 trimmed characters. Send a rolling recent phrase, not the entire call. `revision` is an optional nonnegative safe integer, default 0, echoed on every event so the caller can ignore an obsolete response. `generate` defaults to true; false returns only saved-card matches without calling Featherless. Requests are limited to 8 KiB of actual UTF-8 bytes, including chunked uploads, and a five-second upload deadline. Unknown fields, including user IDs or caller-supplied evidence, are rejected.

The deck and its saved inputs must belong to the verified account. Completed decks only; the backend reads the immutable snapshot and does not substitute another account's data or the person's current conversation cutoff. Nothing is saved: transcripts, suggestions, claims, and last-conversation times are not written by this endpoint.

## Response

Success is HTTP 200 with `Content-Type: application/x-ndjson; charset=utf-8`, `Cache-Control: private, no-store`, and buffering disabled where supported. Each complete line is a JSON event; a network chunk can contain half a line or several lines. Validate using `liveEventSchema` from `src/contracts/live.ts`.

```json
{"type":"matches","revision":17,"cards":[],"warnings":[],"researchSince":null}
{"type":"delta","revision":17,"text":"Try asking "}
{"type":"delta","revision":17,"text":"which part they use most."}
{"type":"done","revision":17}
```

- `matches` arrives first, before awaiting any model token. `cards` contains up to three relevant canonical saved cards, including their existing evidence references. Retrieval uses literal word overlap, preserving C++ and C#. It can return no matches; it is not semantic search. `warnings` and `researchSince` come from the saved deck.
- Append `delta.text` to the current generated suggestion. This is provisional model advice, distinct from saved, source-linked cards; it does not create a verified fact. The prompt asks for one natural response or clarifying question, a short plain-English explanation for a beginner, and a relevant contradiction warning. It treats transcripts and research as untrusted data and asks for uncertainty when evidence is insufficient. Model compliance is not guaranteed.
- `done` means generation ended normally. For `generate: false`, the sequence is just `matches`, then `done`.
- `error` is terminal, with `{ "type": "error", "revision": 17, "error": { "code": "AI_RATE_LIMIT", "message": "...", "retryable": true } }`. Keep the matched cards available; mark any accumulated generated text incomplete. Do not show an error stream as a completed answer. No `done` follows an error.
- An unexpected end of connection without `done` or `error` is also incomplete.

Before streaming starts, failures use normal JSON `{ "ok": false, "error": { "code", "message", "retryable" } }`: 400 invalid input, 401 sign-in required, 403 foreign origin, 404 missing/foreign deck, 408 slow upload, 409 incomplete deck or unavailable snapshot, 413 oversized body, 415 wrong content type, 429 busy, or 503 unavailable service. Cancellation can return 499 before streaming. Check HTTP status before trying to parse NDJSON.

## Microphone integration for the frontend owner

1. Start listening only through the user's explicit control. Browser `SpeechRecognition` / `webkitSpeechRecognition` can supply `continuous = true` and `interimResults = true`; consume interim results without waiting for `isFinal`. Feature-detect and provide a typed transcript fallback. Some browsers use a remote speech service; explain that audio processing before enabling it. Browser support is limited. See [MDN speech recognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition) and [interim results](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/interimResults).
2. Microphone audio captured by a tab is not automatically the remote side of a video call or the computer's output. Select/capture the intended audio source explicitly if that is required. This endpoint does not receive audio, perform transcription, identify speakers, or record a call.
3. Keep only the latest phrase, capped at 1600 characters, and increment a revision as it changes. For quick card updates, throttle retrieval-only requests (`generate: false`) to at most once every 500–750 ms. Use a cadence while speech continues; a silence-only debounce can postpone every update until the sentence ends.
4. Run at most one generation request at a time. Start from an early meaningful phrase, not a completed sentence. Let that request stream while later retrieval-only updates continue. Refresh from the newest phrase when it completes, or cancel and replace it after a material topic change. Aborting on every interim recognition event can starve the model so that no response ever appears. Track the latest retrieval and generation revisions separately.
5. Use `AbortController` for generation replacement, Stop, deck changes, sign-out, and unmount. Abort cancels upstream generation and releases its admission slot. Stop the speech recognizer as well. Do not automatically turn spoken text into saved claims or a recorded conversation.
6. Respect 429 `Retry-After: 1`. The server permits two concurrent requests per account, at least 350 ms between admitted requests, 32 active requests per process, and a bounded account admission map. These are process-local overload guards, not a distributed account quota. A generation plus short retrieval requests fits the two-slot limit. Do not retry rejected work in a tight loop.

To consume NDJSON using browser fetch, keep a `TextDecoder` and a line buffer between `reader.read()` calls; decode with `{ stream: true }`, split on newlines, parse only complete lines, and flush the decoder at EOF. Dispatch by `type` and `revision`. Never render transcript or generated text as HTML.

## Deployment and limits

Uses the existing server-only `FEATHERLESS_API_KEY` and `FEATHERLESS_MODEL`. No new environment variables, database migration, paid speech service, or queue worker is needed for this endpoint. It runs in the web request process; the model and server support streaming independently of the background deck worker.

Model generation has no automatic retries, a 15-second full-stream deadline, a 320-token output budget, bounded snapshot selection, and an 18,000-character input budget. The HTTP stream has a 20-second generation deadline, an additional 6000-character / 1024-event output cap, and request/consumer cancellation. Errors are sanitized; raw provider messages, credentials, and prompts are not returned. A timeout or output truncation is a terminal error, even if some text has already streamed.

Fast card retrieval avoids waiting for an AI response, but latency includes authentication, database access, network, speech recognition, and any Render cold start. Responding before someone finishes a sentence is an intended interaction, not a timing guarantee. No live microphone, live Featherless latency, or deployed proxy buffering has been verified by backend unit tests. Existing research limitations still apply: this feature does not turn obscure source material into a complete course or add missing foundational evidence.
