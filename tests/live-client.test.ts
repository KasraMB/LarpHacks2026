import assert from "node:assert/strict";
import test from "node:test";
import { consumeLiveResponse, createLiveSession, type LiveEvent } from "../src/lib/live-session";

const encode = new TextEncoder();
const line = (event: LiveEvent) => JSON.stringify(event) + "\n";
const matches = (revision: number): LiveEvent => ({ type: "matches", revision, cards: [], warnings: [], researchSince: null });
function response(text: string) {
  return new Response(text, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8" } });
}
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

test("live transport decodes fragmented multibyte UTF-8 and multiple lines", async () => {
  const events: LiveEvent[] = [matches(1), { type: "delta", revision: 1, text: "café 日本 🎤" }, { type: "done", revision: 1 }];
  const bytes = encode.encode(events.map(line).join(""));
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
      controller.close();
    },
  });
  const actual: LiveEvent[] = [];
  await consumeLiveResponse(new Response(stream, { headers: { "Content-Type": "application/x-ndjson" } }), (event) => actual.push(event));
  assert.deepEqual(actual, events);
});

test("live transport reads safe HTTP errors and does not expose HTML bodies", async () => {
  await assert.rejects(consumeLiveResponse(new Response(JSON.stringify({ ok: false, error: {
    code: "AUTH_REQUIRED", message: "Sign in to continue.", retryable: false,
  } }), { status: 401 }), () => assert.fail("HTTP error must not dispatch")), /Sign in to continue/);
  await assert.rejects(consumeLiveResponse(new Response("<html>secret server trace</html>", { status: 503 }), () => undefined), /unavailable \(503\)/);
});

test("a terminal stream error is delivered and cancels its reader", async () => {
  let cancelled = false;
  const terminal: LiveEvent = { type: "error", revision: 1, error: { code: "AI_TIMEOUT", message: "Try again later.", retryable: true } };
  const stream = new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(encode.encode(line(matches(1)) + line(terminal))); },
    cancel() { cancelled = true; },
  });
  const actual: LiveEvent[] = [];
  await consumeLiveResponse(new Response(stream, { headers: { "Content-Type": "application/x-ndjson" } }), (event) => actual.push(event));
  assert.deepEqual(actual, [matches(1), terminal]);
  assert.equal(cancelled, true);
  assert.equal(stream.locked, false);
});

test("premature EOF, invalid events and oversized lines fail clearly", async () => {
  await assert.rejects(consumeLiveResponse(response(line(matches(1))), () => undefined), /before the suggestion was complete/);
  await assert.rejects(consumeLiveResponse(response('{"type":"done","revision":"bad"}\n'), () => undefined), /invalid event/);
  await assert.rejects(consumeLiveResponse(response("x".repeat(131_073)), () => undefined), /event limit/);
});

test("aborting a pending read cancels and releases the stream", async () => {
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({ cancel() { cancelled = true; } });
  const controller = new AbortController();
  const pending = consumeLiveResponse(new Response(stream, { headers: { "Content-Type": "application/x-ndjson" } }), () => undefined, controller.signal);
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(cancelled, true);
  assert.equal(stream.locked, false);
});

function clock() {
  let time = 0;
  let tick: (() => void) | undefined;
  return {
    now: () => time,
    scheduler: {
      setInterval(callback: () => void) { tick = callback; return 1; },
      clearInterval() { tick = undefined; },
    },
    async advance(milliseconds: number) {
      for (let elapsed = 0; elapsed < milliseconds; elapsed += 50) {
        time += 50;
        tick?.();
        await flush();
      }
    },
  };
}

test("continuous interim speech retrieves while one generation streams, then generates newest phrase", async () => {
  const timer = clock();
  const requests: { at: number; transcript: string; generate: boolean; revision: number; signal: AbortSignal }[] = [];
  const streams: ReadableStreamDefaultController<Uint8Array>[] = [];
  const events: LiveEvent[] = [];
  const session = createLiveSession({
    deckId: "deck", ...timer, onEvent: (event) => events.push(event), onError: (message) => assert.fail(message),
    fetchImpl: async (_url, init) => {
      assert.equal(init?.credentials, "same-origin");
      const body = JSON.parse(init!.body as string);
      requests.push({ ...body, at: timer.now(), signal: init!.signal as AbortSignal });
      if (!body.generate) return response(line(matches(body.revision)) + line({ type: "done", revision: body.revision }));
      return new Response(new ReadableStream<Uint8Array>({ start(controller) { streams.push(controller); } }), {
        headers: { "Content-Type": "application/x-ndjson" },
      });
    },
  });
  session.update("?!");
  assert.equal(requests.length, 0);
  session.update("an early phrase");
  for (let index = 0; index < 24; index++) {
    session.update(`continuous phrase ${index}`);
    await timer.advance(100);
  }
  assert.equal(requests.filter((request) => request.generate).length, 1);
  assert.ok(requests.filter((request) => !request.generate).length >= 2);
  assert.ok(events.some((event) => event.type === "matches" && event.revision > requests[0].revision));
  streams[0].enqueue(encode.encode(line(matches(requests[0].revision)) + line({ type: "delta", revision: requests[0].revision, text: "A useful early response" }) + line({ type: "done", revision: requests[0].revision })));
  await flush();
  assert.equal(events.some((event) => event.type === "matches" && event.revision === requests[0].revision), false);
  assert.equal(events.some((event) => event.type === "delta"), true);
  await timer.advance(400);
  const generated = requests.filter((request) => request.generate);
  assert.equal(generated.length, 2);
  assert.equal(generated[1].transcript, "continuous phrase 23");
  requests.slice(1).forEach((request, index) => assert.ok(request.at - requests[index].at >= 350));
  session.stop();
  assert.ok(requests.at(-1)!.signal.aborted);
  const count = requests.length;
  session.update("ignored");
  await timer.advance(5_000);
  assert.equal(requests.length, count);
});

test("a completed generation does not repeat an unchanged rolling transcript", async () => {
  const timer = clock();
  const texts: string[] = [];
  const session = createLiveSession({
    deckId: "deck", ...timer, onEvent: () => undefined, onError: (message) => assert.fail(message),
    fetchImpl: async (_url, init) => {
      const body = JSON.parse(init!.body as string);
      texts.push(body.transcript);
      return response(line({ type: "done", revision: body.revision }));
    },
  });
  session.update("x".repeat(2_000));
  await timer.advance(10_000);
  assert.deepEqual(texts, ["x".repeat(1_600)]);
  session.stop();
});

test("429 respects Retry-After and retries only the newest pending transcript", async () => {
  const timer = clock();
  const requests: { at: number; transcript: string }[] = [];
  const errors: string[] = [];
  const session = createLiveSession({
    deckId: "deck", ...timer, onEvent: () => undefined, onError: (message) => errors.push(message),
    fetchImpl: async (_url, init) => {
      const body = JSON.parse(init!.body as string);
      requests.push({ at: timer.now(), transcript: body.transcript });
      if (requests.length === 1) return new Response('{"ok":false,"error":{"code":"BUSY","message":"Busy","retryable":true}}', { status: 429, headers: { "Retry-After": "3" } });
      return response(line({ type: "done", revision: body.revision }));
    },
  });
  session.update("first phrase");
  await flush();
  session.update("latest phrase");
  await timer.advance(2_900);
  assert.equal(requests.length, 1);
  await timer.advance(200);
  assert.equal(requests.length, 2);
  assert.equal(requests[1].transcript, "latest phrase");
  assert.ok(requests[1].at >= 3_000);
  assert.deepEqual(errors, ["Busy"]);
  session.stop();
});

test("authentication or inaccessible deck failures stop automatic requests", async () => {
  for (const status of [401, 403, 404]) {
    const timer = clock();
    let requests = 0;
    const starts: { revision: number; transcript: string }[] = [];
    const errors: string[] = [];
    const session = createLiveSession({
      deckId: "deck", ...timer, onEvent: () => assert.fail("no events expected"), onError: (message) => errors.push(message),
      onGenerationStart: (revision, transcript) => starts.push({ revision, transcript }),
      fetchImpl: async () => { requests++; return new Response(null, { status }); },
    });
    session.update("heard phrase");
    await flush();
    session.update("new phrase after failed authorization");
    await timer.advance(10_000);
    assert.equal(requests, 1);
    assert.equal(errors.length, 1);
    assert.deepEqual(starts, [{ revision: 1, transcript: "heard phrase" }]);
    session.stop();
  }
});

test("stop drops late fetch results and all callbacks", async () => {
  const timer = clock();
  let finish: ((response: Response) => void) | undefined;
  const events: LiveEvent[] = [];
  const errors: string[] = [];
  const session = createLiveSession({
    deckId: "deck", ...timer, onEvent: (event) => events.push(event), onError: (message) => errors.push(message),
    fetchImpl: async () => new Promise<Response>((resolve) => { finish = resolve; }),
  });
  session.update("heard phrase");
  session.stop();
  finish!(response(line(matches(1)) + line({ type: "done", revision: 1 })));
  await flush();
  assert.deepEqual(events, []);
  assert.deepEqual(errors, []);
});

test("retrieval can be disabled while generation still refreshes changed phrases", async () => {
  const timer = clock();
  const requests: { generate: boolean; revision: number }[] = [];
  const streams: ReadableStreamDefaultController<Uint8Array>[] = [];
  const session = createLiveSession({
    deckId: "deck", ...timer, retrieve: false,
    onEvent: () => undefined, onError: (message) => assert.fail(message),
    fetchImpl: async (_url, init) => {
      const body = JSON.parse(init!.body as string);
      requests.push(body);
      return new Response(new ReadableStream<Uint8Array>({ start(controller) { streams.push(controller); } }), {
        headers: { "Content-Type": "application/x-ndjson" },
      });
    },
  });
  session.update("first phrase");
  await flush();
  session.update("new phrase while generation streams");
  await timer.advance(2_000);
  assert.equal(requests.length, 1);
  streams[0].enqueue(encode.encode(line({ type: "done", revision: requests[0].revision })));
  await flush();
  await timer.advance(50);
  assert.equal(requests.length, 2);
  assert.ok(requests.every((request) => request.generate));
  session.stop();
});

test("the request deadline releases a stalled fetch and does not repeat the unchanged phrase", async () => {
  const timer = clock();
  const errors: string[] = [];
  const signals: AbortSignal[] = [];
  const session = createLiveSession({
    deckId: "deck", ...timer, retrieve: false, requestTimeoutMs: 10,
    onEvent: () => undefined, onError: (message) => errors.push(message),
    fetchImpl: async (_url, init) => {
      signals.push(init!.signal as AbortSignal);
      if (signals.length === 1) return new Promise<Response>(() => undefined);
      const body = JSON.parse(init!.body as string);
      return response(line({ type: "done", revision: body.revision }));
    },
  });
  session.update("first phrase");
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(signals[0].aborted, true);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /took too long.*new phrase/);
  await timer.advance(2_000);
  assert.equal(signals.length, 1);
  session.update("a new phrase");
  await flush();
  assert.equal(signals.length, 2);
  assert.equal(errors.length, 1);
  session.stop();
});

test("a stalled stream times out, but stopping suppresses timeout errors", async () => {
  for (const shouldStop of [false, true]) {
    const errors: string[] = [];
    let cancelled = false;
    const session = createLiveSession({
      deckId: "deck", retrieve: false, requestTimeoutMs: 10,
      onEvent: () => assert.fail("no events expected"), onError: (message) => errors.push(message),
      fetchImpl: async () => new Response(new ReadableStream<Uint8Array>({ cancel() { cancelled = true; } }), {
        headers: { "Content-Type": "application/x-ndjson" },
      }),
    });
    session.update("heard phrase");
    if (shouldStop) session.stop();
    await flush();
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(cancelled, true);
    assert.equal(errors.length, shouldStop ? 0 : 1);
    session.stop();
  }
});
