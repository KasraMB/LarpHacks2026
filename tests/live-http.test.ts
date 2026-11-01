import assert from "node:assert/strict";
import test from "node:test";
import { liveEventSchema, liveRequestSchema, type LiveEvent } from "../src/contracts/live";
import { createLiveOperationHandler } from "../src/server/live-http";
import { liveTerms, matchLiveCards } from "../src/server/live-matching";
import { FeatherlessGenerationError } from "../src/server/ai/errors";
import type { LiveSuggestionProvider, LiveSuggestionContext } from "../src/server/ai/live";
import type { DeckSnapshot, Repository } from "../src/server/ports";
import { cards, claim, deck, identity, interest, person, researchFact } from "../src/fixtures/demo";

const origin = "https://alias.example";
const snapshot: DeckSnapshot = { context: { identity, person, interests: [interest], claims: [claim], facts: [researchFact], researchSince: deck.researchSince }, model: "test/model", promptVersion: "saved" };
const repository = { decks: { get: async (id: string) => id === deck.id ? deck : null, getSnapshot: async () => snapshot } } as unknown as Repository;
const provider: LiveSuggestionProvider = { async *stream() { yield "I follow "; yield "the Raptors."; } };
function setup(options: Partial<Parameters<typeof createLiveOperationHandler>[0]> = {}) {
  return createLiveOperationHandler({
    configuredOrigin: () => origin,
    getSession: async headers => headers.get("cookie") ? { user: { id: headers.get("cookie")! } } : null,
    repositoryForUser: () => repository,
    provider,
    ...options,
  });
}
function request(body: unknown = { deckId: deck.id, transcript: "Which team do you follow", revision: 12 }, user: string | null = "a", extraHeaders: Record<string, string> = {}, signal?: AbortSignal) {
  return new Request(`${origin}/api/live/suggest`, {
    method: "POST", headers: { "content-type": "application/json", origin, ...(user ? { cookie: user } : {}), ...extraHeaders },
    body: typeof body === "string" ? body : JSON.stringify(body), signal,
  });
}
async function events(response: Response): Promise<LiveEvent[]> {
  return (await response.text()).trim().split("\n").filter(Boolean).map(line => liveEventSchema.parse(JSON.parse(line)));
}

test("live auth and origin failures never construct a scoped repository or model", async () => {
  for (const [user, headers, status] of [[null, {}, 401], ["a", { origin: "https://attacker.example" }, 403], ["a", { "sec-fetch-site": "cross-site" }, 403]] as const) {
    const post = setup({ repositoryForUser: () => assert.fail("not authorized"), provider: { stream: () => assert.fail("not authorized") } });
    const response = await post(request(undefined, user, headers));
    assert.equal(response.status, status);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
  }
  const post = setup({ configuredOrigin: () => "invalid", getSession: async () => assert.fail("invalid config") });
  assert.equal((await post(request())).status, 503);
});

test("live validation bounds actual bytes, transcript and revision; rejects owner/snapshot injection", async () => {
  for (const [body, status] of [
    ["invalid json", 400], [{ deckId: deck.id, transcript: "a" }, 400],
    [{ deckId: deck.id, transcript: "x".repeat(1_601) }, 400],
    [{ deckId: deck.id, transcript: "C++", revision: -1 }, 400],
    [{ deckId: deck.id, transcript: "C++", userId: "b" }, 400],
    [" ".repeat(8_193), 413],
  ] as const) {
    assert.equal((await setup({ repositoryForUser: () => assert.fail("invalid input") })(request(body))).status, status);
  }
  assert.equal((await setup()(request(undefined, "a", { "content-type": "audio/webm" }))).status, 415);
  assert.equal(liveRequestSchema.parse({ deckId: deck.id, transcript: " C++ " }).transcript, "C++");
  const chunks = new ReadableStream({ start(c) { c.enqueue(new Uint8Array(4_500)); c.enqueue(new Uint8Array(4_000)); c.close(); } });
  const chunked = new Request(`${origin}/api/live/suggest`, { method: "POST", body: chunks, duplex: "half", headers: { "content-type": "application/json", cookie: "a", origin } } as RequestInit);
  assert.equal((await setup()(chunked)).status, 413);
});

test("unfinished speech gets saved card matches before model output, followed by correlated text deltas", async () => {
  let allow!: () => void;
  const wait = new Promise<void>(resolve => { allow = resolve; });
  let received: LiveSuggestionContext | undefined;
  const post = setup({ provider: { async *stream(context) { received = context; await wait; yield "The Raptors"; yield " are my team."; } } });
  const response = await post(request());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.match(response.headers.get("content-type")!, /application\/x-ndjson/);
  const reader = response.body!.getReader();
  const first = liveEventSchema.parse(JSON.parse(new TextDecoder().decode((await reader.read()).value)));
  assert.equal(first.type, "matches");
  assert.equal(first.revision, 12);
  if (first.type === "matches") {
    assert.equal(first.cards[0].id, "card_ask");
    assert.equal(first.researchSince, deck.researchSince);
  }
  assert.equal(received!.snapshot, snapshot);
  assert.equal(received!.transcript, "Which team do you follow");
  allow();
  let rest = "";
  while (true) { const part = await reader.read(); if (part.done) break; rest += new TextDecoder().decode(part.value); }
  const remaining = rest.trim().split("\n").map(line => liveEventSchema.parse(JSON.parse(line)));
  assert.deepEqual(remaining.map(e => e.type), ["delta", "delta", "done"]);
  assert.ok(remaining.every(e => e.revision === 12));
});

test("private deck lookup uses session ownership and never falls back to system scope", async () => {
  const selected: string[] = [];
  const post = setup({ repositoryForUser: userId => {
    selected.push(userId);
    return userId === "a" ? repository : { decks: { get: async () => null, getSnapshot: async () => assert.fail("foreign snapshot") } } as unknown as Repository;
  } });
  const [a, b] = await Promise.all([post(request(undefined, "a")), post(request(undefined, "b"))]);
  assert.equal(a.status, 200); assert.equal(b.status, 404);
  assert.deepEqual(selected, ["a", "b"]);
  assert.equal((await events(a)).at(-1)!.type, "done");
  const pending = setup({ repositoryForUser: () => ({ decks: { get: async () => ({ ...deck, status: "running", cards: [] }), getSnapshot: async () => assert.fail("not ready") } }) as unknown as Repository });
  assert.equal((await pending(request())).status, 409);
});

test("provider failures preserve immediate matches and return sanitized terminal errors", async () => {
  for (const error of [new Error("SECRET_KEY provider raw body"), new FeatherlessGenerationError("AI_MISSING_MODEL")]) {
    const post = setup({ provider: { async *stream() { throw error; } } });
    const received = await events(await post(request()));
    assert.deepEqual(received.map(e => e.type), ["matches", "error"]);
    const last = received.at(-1)!;
    if (last.type === "error") {
      assert.doesNotMatch(last.error.message, /SECRET_KEY|raw body|deck/i);
      assert.equal(last.error.code, error instanceof FeatherlessGenerationError ? "AI_MISSING_MODEL" : "UPSTREAM_ERROR");
    }
  }
});

test("response cancellation and request abort cancel model work and release per-user slots", async () => {
  let at = 0;
  const signals: AbortSignal[] = [];
  const post = setup({ now: () => at, provider: { async *stream(_context, signal) {
    signals.push(signal!);
    await new Promise<void>(resolve => signal!.addEventListener("abort", () => resolve(), { once: true }));
  } } });
  const first = await post(request());
  at += 500;
  const secondAbort = new AbortController();
  const second = await post(request(undefined, "a", {}, secondAbort.signal));
  at += 500;
  assert.equal((await post(request())).status, 429);
  await first.body!.cancel();
  assert.equal(signals[0].aborted, true);
  secondAbort.abort();
  assert.equal(signals[1].aborted, true);
  at += 500;
  const third = await post(request());
  assert.equal(third.status, 200);
  await third.body!.cancel();
  assert.equal(signals[2].aborted, true);
  // The already-aborted response still allows its queued match event to be drained.
  await second.text();
});

test("server deadline closes a stalled model stream and request bursts return retry guidance", async () => {
  let aborted = false;
  const post = setup({ deadlineMs: 20, provider: { async *stream(_context, signal) {
    await new Promise<void>(resolve => signal!.addEventListener("abort", () => { aborted = true; resolve(); }, { once: true }));
  } } });
  const received = await events(await post(request()));
  assert.equal(aborted, true);
  assert.deepEqual(received.map(e => e.type), ["matches", "error"]);
  const last = received.at(-1)!;
  if (last.type === "error") assert.equal(last.error.code, "LIVE_TIMEOUT");
  const response = await post(request());
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "1");
});

test("matches are bounded, stable, literal and never manufacture evidence on unrelated phrases", () => {
  assert.deepEqual(matchLiveCards(cards, "tell me about quantum entanglement"), []);
  assert.deepEqual(matchLiveCards(cards, "which team do you follow").map(c => c.id), ["card_ask", "card_back"]);
  assert.deepEqual(liveTerms("C++ C# C++"), ["c++", "c#"]);
  const cpp = { ...cards[0], prompt: "C++ templates", answer: "Compile-time generic code" };
  const c = { ...cards[1], prompt: "C basics", answer: "Pointers" };
  assert.deepEqual(matchLiveCards([c, cpp], "C++"), [cpp]);
});

test("retrieval-only updates avoid the AI provider while another generation continues", async () => {
  const post = setup({ provider: { stream: () => assert.fail("retrieval must not call AI") } });
  const received = await events(await post(request({ deckId: deck.id, transcript: "Raptors", revision: 4, generate: false })));
  assert.deepEqual(received.map(e => e.type), ["matches", "done"]);
  assert.ok(received[0].type === "matches" && received[0].cards.length > 0);
});

test("slow transcript uploads time out before repository or provider work", async () => {
  let cancelled = false;
  const body = new ReadableStream({ cancel() { cancelled = true; } });
  const req = new Request(`${origin}/api/live/suggest`, { method: "POST", body, duplex: "half", headers: { "content-type": "application/json", cookie: "a", origin } } as RequestInit);
  const post = setup({ bodyDeadlineMs: 20, repositoryForUser: () => assert.fail("no body") });
  assert.equal((await post(req)).status, 408);
  assert.equal(cancelled, true);
});
