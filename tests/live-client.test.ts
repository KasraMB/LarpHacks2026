import assert from "node:assert/strict";
import test from "node:test";
import { capPhrase, createLineBuffer, readNdjson, retryAfterMs } from "../src/lib/ndjson";
import { LiveSuggestSession } from "../src/lib/use-live-suggest";
import type { LiveSuggestState } from "../src/components/contracts";
import { cards } from "../src/fixtures/demo";

function streamOf(chunks: Uint8Array[]) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
}

test("line buffer keeps partial lines and drops blanks and CR", () => {
  const lines = createLineBuffer();
  assert.deepEqual(lines.push('{"a":1}\r\n{"b"'), ['{"a":1}']);
  assert.deepEqual(lines.push(':2}\n\n{"c":3}\n{"d"'), ['{"b":2}', '{"c":3}']);
  assert.deepEqual(lines.flush(), ['{"d"']);
  assert.deepEqual(lines.flush(), []);
});

test("readNdjson decodes multi-byte characters split across chunks and flushes the last line", async () => {
  const bytes = new TextEncoder().encode('{"t":"café 🎉"}\n{"t":"end"}');
  const split = bytes.indexOf(0xc3) + 1; // inside "é"
  const emoji = bytes.indexOf(0xf0) + 2; // inside the emoji
  const values: unknown[] = [];
  const end = await readNdjson(streamOf([bytes.slice(0, split), bytes.slice(split, emoji), bytes.slice(emoji)]), (value) => {
    values.push(value);
    return false;
  });
  assert.equal(end, "eof");
  assert.deepEqual(values, [{ t: "café 🎉" }, { t: "end" }]);
});

test("readNdjson stops on a terminal value and reports invalid JSON", async () => {
  const encode = (s: string) => new TextEncoder().encode(s);
  const seen: unknown[] = [];
  assert.equal(await readNdjson(streamOf([encode('{"n":1}\n{"n":2}\n{"n":3}\n')]), (v) => (seen.push(v), seen.length === 2)), "stopped");
  assert.equal(seen.length, 2);
  assert.equal(await readNdjson(streamOf([encode('{"n":1}\nnot json\n')]), () => false), "invalid");
});

test("capPhrase keeps the newest text within the limit at a word boundary", () => {
  assert.equal(capPhrase("  hello   there \n"), "hello there");
  const long = Array.from({ length: 400 }, (_, i) => `word${i}`).join(" ");
  const capped = capPhrase(long);
  assert.ok(capped.length <= 1600);
  assert.ok(capped.endsWith("word399"));
  assert.match(capped, /^word\d+ /);
  assert.equal(retryAfterMs("1"), 1000);
  assert.equal(retryAfterMs(null), 1000);
  assert.equal(retryAfterMs("3"), 3000);
});

/** Fake clock, timers and fetch so scheduling is deterministic. */
function harness() {
  let now = 0;
  let timers: Array<{ at: number; fn: () => void; id: number }> = [];
  let nextId = 1;
  const requests: Array<{ at: number; body: { transcript: string; revision: number; generate: boolean }; signal: AbortSignal; respond: (r: Response) => void }> = [];
  const states: LiveSuggestState[] = [];
  const session = new LiveSuggestSession("deck-1", (s) => states.push(s), {
    now: () => now,
    setTimeout: (fn, ms) => {
      const id = nextId++;
      timers.push({ at: now + ms, fn, id });
      return id;
    },
    clearTimeout: (id) => {
      timers = timers.filter((t) => t.id !== id);
    },
    fetch: (_url, init) =>
      new Promise<Response>((resolve, reject) => {
        const signal = init!.signal!;
        signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        requests.push({ at: now, body: JSON.parse(String(init!.body)), signal, respond: resolve });
      }),
  });
  const flush = () => new Promise((resolve) => setImmediate(resolve));
  async function advance(ms: number) {
    const end = now + ms;
    for (;;) {
      timers.sort((a, b) => a.at - b.at);
      const next = timers[0];
      if (!next || next.at > end) break;
      timers.shift();
      now = next.at;
      next.fn();
      await flush();
    }
    now = end;
    await flush();
  }
  const latest = () => states.at(-1)!;
  return { session, requests, advance, flush, latest };
}

function ndjson(events: object[], close = true) {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({ start: (c) => { controller = c; } });
  const push = (event: object) => controller.enqueue(new TextEncoder().encode(JSON.stringify(event) + "\n"));
  events.forEach(push);
  if (close) controller.close();
  return { response: new Response(body, { status: 200, headers: { "Content-Type": "application/x-ndjson" } }), push, close: () => controller.close() };
}

test("session throttles retrieval, runs one generation at a time, and refreshes from the newest phrase", async () => {
  const h = harness();
  h.session.update("what do you think", "speech");
  await h.advance(0);
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].body.generate, false);
  h.requests[0].respond(ndjson([{ type: "matches", revision: 1, cards: [cards[0]], warnings: [], researchSince: null }, { type: "done", revision: 1 }]).response);
  await h.flush();
  assert.equal(h.latest().matches?.cards[0].id, cards[0].id);

  // Generation waits for the request spacing slot.
  await h.advance(399);
  assert.equal(h.requests.length, 1);
  await h.advance(1);
  assert.equal(h.requests[1].body.generate, true);
  const generation = ndjson([{ type: "matches", revision: 1, cards: [], warnings: [], researchSince: null }], false);
  h.requests[1].respond(generation.response);
  await h.flush();

  // Speech keeps arriving every 100ms; retrieval follows a cadence, generation does not restart.
  for (let i = 0; i < 12; i++) {
    h.session.update(`what do you think about templates ${i}`, "speech");
    await h.advance(100);
  }
  const retrievals = h.requests.filter((r) => !r.body.generate);
  for (let i = 1; i < h.requests.length; i++) assert.ok(h.requests[i].at - h.requests[i - 1].at >= 400);
  assert.equal(h.requests.filter((r) => r.body.generate).length, 1);
  assert.ok(retrievals.length >= 2);
  // Retrievals answered after the generation's matches are newer and win.
  for (const r of retrievals.slice(1)) {
    r.respond(ndjson([{ type: "matches", revision: r.body.revision, cards: [cards[1]], warnings: [], researchSince: null }, { type: "done", revision: r.body.revision }]).response);
  }
  await h.flush();
  assert.equal(h.latest().matches?.cards[0].id, cards[1].id);

  // Obsolete revisions are ignored; matching ones stream in.
  generation.push({ type: "delta", revision: 99, text: "ignored" });
  generation.push({ type: "delta", revision: 1, text: "Ask which " });
  generation.push({ type: "delta", revision: 1, text: "part they use." });
  generation.push({ type: "done", revision: 1 });
  await h.flush();
  await h.flush();
  assert.equal(h.latest().suggestion?.text, "Ask which part they use.");
  assert.equal(h.latest().suggestion?.status, "done");

  await h.advance(1000);
  const refreshed = h.requests.filter((r) => r.body.generate);
  assert.equal(refreshed.length, 2);
  assert.match(refreshed[1].body.transcript, /templates 11$/);
  h.session.dispose();
  assert.ok(refreshed[1].signal.aborted);
});

test("session marks errored and truncated streams incomplete, keeps matches, and backs off on 429", async () => {
  const h = harness();
  h.session.update("Explain C++ templates", "submit");
  await h.advance(0);
  h.requests[0].respond(new Response(JSON.stringify({ ok: false, error: { code: "LIVE_RATE_LIMIT", message: "busy", retryable: true } }), { status: 429, headers: { "Retry-After": "1" } }));
  await h.flush();
  await h.advance(999);
  assert.equal(h.requests.length, 1);
  await h.advance(1);
  assert.equal(h.requests.length, 2);
  h.requests[1].respond(ndjson([{ type: "matches", revision: 1, cards: [cards[0]], warnings: [], researchSince: null }, { type: "done", revision: 1 }]).response);
  await h.advance(400);
  const gen = h.requests[2];
  assert.equal(gen.body.generate, true);
  gen.respond(ndjson([
    { type: "matches", revision: 1, cards: [cards[0]], warnings: [], researchSince: null },
    { type: "delta", revision: 1, text: "Partial" },
    { type: "error", revision: 1, error: { code: "AI_OUTPUT_TRUNCATED", message: "Stopped early.", retryable: false } },
  ]).response);
  await h.flush();
  await h.flush();
  assert.equal(h.latest().suggestion?.status, "incomplete");
  assert.equal(h.latest().suggestion?.error?.message, "Stopped early.");
  assert.equal(h.latest().matches?.cards.length, 1);
  // A phrase-specific error does not stop the refresh once the phrase changes.
  h.session.update("Explain C++ templates more please", "speech");
  await h.advance(2000);
  const gens = h.requests.filter((r) => r.body.generate);
  assert.equal(gens.length, 2);
  // A configuration error pauses generation until Retry; matching continues.
  gens[1].respond(ndjson([{ type: "error", revision: 2, error: { code: "AI_MISSING_KEY", message: "No key.", retryable: false } }]).response);
  await h.flush();
  await h.flush();
  assert.equal(h.latest().generationPaused, true);
  for (const r of h.requests.filter((r) => !r.body.generate && !r.signal.aborted).slice(1)) {
    r.respond(ndjson([{ type: "done", revision: r.body.revision }]).response);
  }
  await h.flush();
  const before = h.requests.length;
  h.session.update("Explain C++ templates more please now", "speech");
  await h.advance(2000);
  assert.equal(h.requests.filter((r) => r.body.generate).length, 2);
  assert.ok(h.requests.length > before);
  h.session.retry();
  await h.advance(2000);
  assert.equal(h.requests.filter((r) => r.body.generate).length, 3);
  h.session.dispose();

  const h2 = harness();
  h2.session.update("hello there friend", "submit");
  await h2.advance(400);
  const g = h2.requests.find((r) => r.body.generate)!;
  g.respond(ndjson([{ type: "delta", revision: 1, text: "Half" }]).response);
  await h2.flush();
  await h2.flush();
  assert.equal(h2.latest().suggestion?.status, "incomplete");
  assert.equal(h2.latest().suggestion?.text, "Half");

  const h3 = harness();
  h3.session.update("hello there friend", "typing");
  await h3.advance(0);
  h3.requests[0].respond(new Response(JSON.stringify({ ok: false, error: { code: "NOT_FOUND", message: "Deck not found.", retryable: false } }), { status: 404 }));
  await h3.flush();
  await h3.flush();
  assert.equal(h3.latest().halted, true);
  assert.equal(h3.latest().error?.message, "Deck not found.");
  h3.session.update("hello there friend again", "typing");
  await h3.advance(2000);
  assert.equal(h3.requests.length, 1);
});
