import assert from "node:assert/strict";
import { test } from "node:test";
import { createLiveSuggestionProvider, LIVE_SUGGESTION_LIMITS } from "@/server/ai/live";
import type { LiveSuggestionContext } from "@/server/ai/live";
import { deckGenerationFailure } from "@/server/ai/errors";

const env = { FEATHERLESS_API_KEY: "test-key", FEATHERLESS_MODEL: "configured/live-model" };
const now = "2026-11-01T00:00:00Z";
function context(): LiveSuggestionContext {
  return {
    transcript: "what about baske",
    snapshot: { model: "old/deck-model", promptVersion: "old", context: {
      identity: { id: "i", name: "Alex", background: "Beginner", createdAt: now, updatedAt: now },
      person: { id: "p", identityId: "i", name: "Dana", notes: "", interestIds: [], lastConversationAt: null, createdAt: now, updatedAt: now },
      claims: [{ id: "c", personId: "p", conversationId: null, text: "I watch basketball", interestId: null, saidAt: now, createdAt: now, checkStatus: "completed", contradictions: [{ earlierClaimId: "earlier", explanation: "Previously said never watches" }], checkFailure: null }],
      interests: [{ id: "topic", identityId: "i", name: "Basketball", searchTerms: [], feedUrls: [], visibility: "private", createdAt: now, updatedAt: now }], researchSince: null,
      facts: [{ id: "f", interestId: "topic", runId: "run", text: "A team won", kind: "reported_fact", source: { url: "https://example.com/exact", title: "Recap", kind: "rss", publishedAt: null, retrievedAt: now }, createdAt: now }],
    } },
    cards: [{ id: "card", deckId: "deck", type: "if_she_asks", interestIds: [], prompt: "What happened?", answer: "Ask about the match", evidence: [{ kind: "claim", claimId: "c" }, { kind: "research", factId: "f", sourceUrl: "https://example.com/exact" }], position: 0 }],
  };
}
const encoder = new TextEncoder();
function chunk(content: string | null, finish_reason: string | null = null) {
  return `data: ${JSON.stringify({ id: "live", object: "chat.completion.chunk", created: 1, model: env.FEATHERLESS_MODEL, choices: [{ index: 0, delta: { content }, finish_reason }] })}\n\n`;
}
function transport(events: string[], capture?: (body: Record<string, unknown>, signal: AbortSignal) => void): typeof fetch {
  return async (_url, init) => {
    capture?.(JSON.parse(String(init?.body)), init!.signal!);
    return new Response(new ReadableStream<Uint8Array>({ start(controller) {
      for (const event of events) controller.enqueue(encoder.encode(event));
      controller.close();
    } }), { headers: { "content-type": "text/event-stream" } });
  };
}
async function collect(provider: ReturnType<typeof createLiveSuggestionProvider>, data = context(), signal?: AbortSignal) {
  const result: string[] = [];
  for await (const delta of provider.stream(data, signal)) result.push(delta);
  return result;
}

test("streams partial speech immediately using configured model and snapshot evidence", async () => {
  let body: Record<string, unknown> = {};
  const provider = createLiveSuggestionProvider({ env, fetch: transport([chunk("Try asking "), chunk("about the match."), chunk(null, "stop"), "data: [DONE]\n\n"], request => { body = request; }) });
  assert.deepEqual(await collect(provider), ["Try asking ", "about the match."]);
  assert.equal(body.model, env.FEATHERLESS_MODEL);
  assert.equal(body.stream, true);
  assert.equal(body.max_tokens, LIVE_SUGGESTION_LIMITS.maxTokens);
  const messages = body.messages as { content: string }[];
  assert.match(messages[1].content, /what about baske/);
  assert.match(messages[1].content, /Previously said never watches/);
  assert.match(messages[0].content, /untrusted data/);
  assert.match(messages[0].content, /Never invent personal history/);
});

test("bounds prompt and only resolves references against exact snapshot facts and source URLs", async () => {
  const data = context();
  data.transcript = "x".repeat(40_000);
  data.snapshot.context.identity.background = "\u0001".repeat(30_000);
  data.cards[0].answer = "x".repeat(20_000);
  data.cards[0].evidence = [{ kind: "research", factId: "f", sourceUrl: "https://example.com/wrong" }, { kind: "claim", claimId: "unknown" }];
  let prompt = "";
  const provider = createLiveSuggestionProvider({ env, fetch: transport([chunk("Ask a question", "stop")], body => { prompt = (body.messages as { content: string }[])[1].content; }) });
  await collect(provider, data);
  assert.ok(prompt.length < LIVE_SUGGESTION_LIMITS.maxInputChars + 100);
  assert.ok(!prompt.includes("https://example.com/wrong"));
  assert.ok(!prompt.includes("unknown"));
  const parsed = JSON.parse(prompt.slice(prompt.indexOf("\n") + 1));
  assert.equal(parsed.evidence.length, 2);
  assert.deepEqual(parsed.cards, []);
});

test("keeps snapshot untouched and caps selected cards and evidence", async () => {
  const data = context();
  data.cards = Array.from({ length: 30 }, (_, index) => ({ ...data.cards[0], id: `card-${index}` }));
  const fact = data.snapshot.context.facts[0];
  data.snapshot.context.facts = Array.from({ length: 40 }, (_, index) => ({ ...fact, id: `fact-${index}`, text: "\u0001".repeat(10_000) }));
  for (const [index, card] of data.cards.entries()) card.evidence = Array.from({ length: 10 }, (_, offset) => ({ kind: "research", factId: `fact-${index * 10 + offset}`, sourceUrl: fact.source.url }));
  const before = JSON.stringify(data);
  let input: { cards: unknown[]; evidence: unknown[] } | undefined;
  const provider = createLiveSuggestionProvider({ env, fetch: transport([chunk("A question", "stop")], body => {
    const prompt = (body.messages as { content: string }[])[1].content;
    input = JSON.parse(prompt.slice(prompt.indexOf("\n") + 1));
  }) });
  await collect(provider, data);
  assert.ok(input!.cards.length <= 4);
  assert.equal(input!.evidence.length, LIVE_SUGGESTION_LIMITS.maxEvidence);
  assert.equal(JSON.stringify(data), before);
});

test("missing configuration fails lazily without any request", async () => {
  for (const [configured, code] of [[{ FEATHERLESS_API_KEY: undefined, FEATHERLESS_MODEL: undefined }, "AI_MISSING_KEY"], [{ FEATHERLESS_API_KEY: "key", FEATHERLESS_MODEL: undefined }, "AI_MISSING_MODEL"]] as const) {
    const provider = createLiveSuggestionProvider({ env: configured, fetch: async () => { throw new Error("must not fetch"); } });
    await assert.rejects(collect(provider), error => deckGenerationFailure(error).code === code);
  }
});

test("retrieves relevant snapshot evidence without any matching card, including incomplete words", async () => {
  const data = context();
  data.cards = [];
  data.transcript = "what does pick and rol";
  const saved = data.snapshot.context;
  const fact = saved.facts[0];
  saved.facts = Array.from({ length: 20 }, (_, index) => ({ ...fact, id: `unrelated-${index}`, text: "A team won a championship" }));
  saved.facts.push({ ...fact, id: "definition", text: "A pick and roll uses a screen followed by a run toward the basket", kind: "context" });
  saved.facts.push({ ...fact, id: "foreign", interestId: "unselected", text: "pick roll forged off-topic fact" });
  let input: { evidence: { ref: string; text: string }[] } | undefined;
  const provider = createLiveSuggestionProvider({ env, fetch: transport([chunk("It is a screen then a run.", "stop")], body => {
    const prompt = (body.messages as { content: string }[])[1].content;
    input = JSON.parse(prompt.slice(prompt.indexOf("\n") + 1));
  }) });
  await collect(provider, data);
  assert.equal(input!.evidence[0].ref, "fact:definition");
  assert.equal(input!.evidence.length, 1);
});

test("unknown phrasing includes only a tiny snapshot foundation", async () => {
  const data = context();
  data.cards = [];
  data.transcript = "can you explain more";
  const fact = data.snapshot.context.facts[0];
  data.snapshot.context.facts = Array.from({ length: 30 }, (_, index) => ({ ...fact, id: `fact-${index}`, text: "Basic basketball background", kind: index === 29 ? "context" : "reported_fact" }));
  let refs: string[] = [];
  const provider = createLiveSuggestionProvider({ env, fetch: transport([chunk("Which part do you mean?", "stop")], body => {
    const prompt = (body.messages as { content: string }[])[1].content;
    refs = JSON.parse(prompt.slice(prompt.indexOf("\n") + 1)).evidence.map((item: { ref: string }) => item.ref);
  }) });
  await collect(provider, data);
  assert.equal(refs.length, 3);
  assert.ok(refs.includes("claim:c"));
  assert.ok(refs.includes("fact:fact-29"));
});

test("empty, refused, and truncated streams have typed errors", async () => {
  for (const [events, code] of [
    [[chunk("  ", "stop")], "AI_EMPTY_OUTPUT"],
    [[chunk("partial", "length")], "AI_OUTPUT_TRUNCATED"],
    [[chunk("partial")], "AI_OUTPUT_TRUNCATED"],
    [[chunk(null, "content_filter")], "AI_OUTPUT_REFUSED"],
  ] as [string[], string][]) {
    const provider = createLiveSuggestionProvider({ env, fetch: transport(events) });
    await assert.rejects(collect(provider), error => deckGenerationFailure(error).code === code);
  }
});

test("transport failures are not retried and can be safely mapped", async () => {
  let calls = 0;
  const provider = createLiveSuggestionProvider({ env, fetch: async () => {
    calls++;
    return new Response(JSON.stringify({ error: { message: "private provider detail test-key" } }), { status: 429, headers: { "content-type": "application/json" } });
  } });
  await assert.rejects(collect(provider), error => {
    const failure = deckGenerationFailure(error);
    assert.equal(failure.code, "AI_RATE_LIMIT");
    assert.ok(!failure.message.includes("private"));
    return true;
  });
  assert.equal(calls, 1);
});

function stalled(capture: (signal: AbortSignal) => void): typeof fetch {
  return async (_url, init) => {
    capture(init!.signal!);
    return new Response(new ReadableStream<Uint8Array>({ start(controller) {
      controller.enqueue(encoder.encode(chunk("First")));
      init?.signal?.addEventListener("abort", () => controller.error(new Error("transport aborted")), { once: true });
    } }), { headers: { "content-type": "text/event-stream" } });
  };
}

test("deadline covers streaming body after headers and first delta", async () => {
  let upstream: AbortSignal | undefined;
  const provider = createLiveSuggestionProvider({ env, timeoutMs: 40, fetch: stalled(signal => { upstream = signal; }) });
  await assert.rejects(collect(provider), { name: "TimeoutError" });
  assert.ok(upstream?.aborted);
});

test("caller abort stops a pending body read and consumer cancellation aborts upstream", async () => {
  const controller = new AbortController();
  let upstream: AbortSignal | undefined;
  const provider = createLiveSuggestionProvider({ env, fetch: stalled(signal => { upstream = signal; }) });
  const iterator = provider.stream(context(), controller.signal)[Symbol.asyncIterator]();
  assert.equal((await iterator.next()).value, "First");
  const pending = iterator.next();
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
  assert.ok(upstream?.aborted);
  const second = provider.stream(context())[Symbol.asyncIterator]();
  await second.next();
  const pendingSecond = second.next();
  const rejected = assert.rejects(pendingSecond, { name: "AbortError" });
  await second.return?.();
  await rejected;
  assert.ok(upstream?.aborted);
});

test("already aborted caller makes no upstream request", async () => {
  const controller = new AbortController();
  controller.abort();
  let calls = 0;
  const provider = createLiveSuggestionProvider({ env, fetch: async () => { calls++; throw new Error("unexpected"); } });
  await assert.rejects(collect(provider, context(), controller.signal), { name: "AbortError" });
  assert.equal(calls, 0);
});
