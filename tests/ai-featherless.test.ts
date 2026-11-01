import assert from "node:assert/strict";
import { test } from "node:test";
import { createFeatherlessProvider, FEATHERLESS_LIMITS } from "@/server/ai";
import { deckGenerationFailure } from "@/server/ai/errors";
import type { DeckContext, ReadArticle } from "@/server/ports";
import type { Claim, Interest } from "@/contracts";

const env = { FEATHERLESS_API_KEY: "test-key", FEATHERLESS_MODEL: "test/model" };
const interest: Interest = {
  id: "interest-1", identityId: "identity-1", name: "Basketball", searchTerms: ["basketball"], feedUrls: [], visibility: "private",
  createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
};
const claim: Claim = {
  id: "claim-1", personId: "person-1", conversationId: null, text: "I like basketball", interestId: interest.id,
  saidAt: "2026-01-01T00:00:00Z", createdAt: "2026-01-01T00:00:00Z", checkStatus: "completed", contradictions: [], checkFailure: null,
};
const context: DeckContext = {
  identity: { id: "identity-1", name: "Alex", background: "", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
  person: { id: "person-1", identityId: "identity-1", name: "Dana", notes: "", interestIds: [interest.id], lastConversationAt: null, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
  interests: [interest], claims: [claim], facts: [], researchSince: null,
};
const article: ReadArticle = {
  source: { url: "https://example.com/story", title: "Game recap", kind: "rss", publishedAt: null, retrievedAt: "2026-01-01T00:00:00Z" },
  text: "The home team won. Fans celebrated the finish.",
};

function mockFetch(content: string, capture?: (body: Record<string, unknown>) => void, finishReason = "stop"): typeof fetch {
  return async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    capture?.(body);
    return new Response(JSON.stringify({
      id: "completion-1", object: "chat.completion", created: 1, model: "test/model",
      choices: [{ index: 0, finish_reason: finishReason, message: { role: "assistant", content } }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
}

test("provider is lazy and extracts reaction separately from facts and context", async () => {
  const provider = createFeatherlessProvider({ env });
  const bodyCapture: Record<string, unknown>[] = [];
  const configured = createFeatherlessProvider({ env, fetch: mockFetch(JSON.stringify({ facts: [
    { text: "The home team won.", kind: "reported_fact" },
    { text: "Fans celebrated the finish.", kind: "fan_reaction" },
    { text: "The match was played at home.", kind: "context" },
  ] }), (body) => bodyCapture.push(body)) });
  assert.deepEqual(await configured.extractFacts(article, interest), [
    { text: "The home team won.", kind: "reported_fact" },
    { text: "Fans celebrated the finish.", kind: "fan_reaction" },
    { text: "The match was played at home.", kind: "context" },
  ]);
  assert.equal(bodyCapture.length, 1);
  assert.equal(bodyCapture[0].model, "test/model");
  assert.equal(bodyCapture[0].max_tokens, 700);
  assert.ok(provider);
});

test("malformed structured output is rejected", async () => {
  const provider = createFeatherlessProvider({ env, fetch: mockFetch("not json") });
  await assert.rejects(provider.extractFacts(article, interest));
});

test("deck references must point to supplied evidence", async () => {
  const cards = ["back_story", "what_changed", "if_she_asks", "dont_say"].map(type => ({
    type, prompt: "What did you say?", answer: "You like basketball.", evidenceRefs: ["invented-claim"],
  }));
  const provider = createFeatherlessProvider({ env, fetch: mockFetch(JSON.stringify({ cards, warnings: [] })) });
  await assert.rejects(provider.generateDeck(context), error => deckGenerationFailure(error).code === "AI_UNKNOWN_EVIDENCE");
});

test("contradictions cannot cite claims from another person or unknown IDs", async () => {
  const prior: Claim = { ...claim, id: "prior-claim", text: "I dislike basketball", saidAt: "2025-12-01T00:00:00Z" };
  const provider = createFeatherlessProvider({ env, fetch: mockFetch(JSON.stringify({ contradictions: [{ earlierClaimId: "other-person-claim", explanation: "Different." }] })) });
  await assert.rejects(provider.checkContradictions(claim, [{ ...prior, personId: "someone-else" }]), /outside this person's prior claims/);
});

test("request timeout aborts a stalled transport", async () => {
  const fetch: typeof globalThis.fetch = (_input, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
  });
  const provider = createFeatherlessProvider({ env, fetch, timeoutMs: 20 });
  await assert.rejects(provider.extractFacts(article, interest));
});

test("deck success requires all four card types and preserves valid supplied evidence", async () => {
  const cards = ["back_story", "what_changed", "if_she_asks", "dont_say"].map(type => ({
    type, prompt: "What did you say?", answer: "You like basketball.", evidenceRefs: ["C1"],
  }));
  const provider = createFeatherlessProvider({ env, fetch: mockFetch(JSON.stringify({ cards, warnings: [] })) });
  const result = await provider.generateDeck(context);
  assert.equal(result.cards.length, 4);
  assert.equal(result.cards[3].type, "dont_say");
  assert.deepEqual(result.cards[0].evidence, [{ kind: "claim", claimId: claim.id }]);
  assert.deepEqual(result.cards.map(card => card.position), [0, 1, 2, 3]);
});

test("research-only decks preserve exact evidence and receive a larger bounded output budget", async () => {
  const fact = { id: "fact-" + "a".repeat(64), interestId: interest.id, runId: "run-1", text: "The home team won.", kind: "reported_fact" as const, source: article.source, createdAt: claim.createdAt };
  const cards = ["back_story", "what_changed", "if_she_asks", "dont_say"].map(type => ({
    type, prompt: "What can you discuss?", answer: "The home team won.", evidenceRefs: ["F1"],
  }));
  let budget: unknown;
  const provider = createFeatherlessProvider({ env, fetch: mockFetch(JSON.stringify({ cards, warnings: [] }), body => {
    budget = body.max_tokens;
    const messages = JSON.stringify(body.messages);
    assert.doesNotMatch(messages, /fact-aaaa|https:\/\/example.com|interest-1|person-1|identity-1/);
  }) });
  const result = await provider.generateDeck({ ...context, claims: [], facts: [fact] });
  assert.equal(result.cards.length, 4);
  assert.deepEqual(result.cards[0].evidence, [{ kind: "research", factId: fact.id, sourceUrl: fact.source.url }]);
  assert.deepEqual(result.cards[0].interestIds, [interest.id]);
  assert.equal(budget, 3000);
  assert.ok(FEATHERLESS_LIMITS.deckTimeoutMs < 220_000);
});

test("truncation, input bounds, missing configuration and malformed JSON have safe distinct failure reasons", async () => {
  const cases = [
    { provider: createFeatherlessProvider({ env, fetch: mockFetch('{"cards":[', undefined, "length") }), input: context, code: "AI_OUTPUT_TRUNCATED" },
    { provider: createFeatherlessProvider({ env, fetch: mockFetch("not JSON with private-input") }), input: context, code: "AI_INVALID_JSON" },
    { provider: createFeatherlessProvider({ env, fetch: mockFetch("{}") }), input: context, code: "AI_INVALID_DECK" },
    { provider: createFeatherlessProvider({ env: { FEATHERLESS_API_KEY: undefined, FEATHERLESS_MODEL: undefined } }), input: context, code: "AI_MISSING_KEY" },
    { provider: createFeatherlessProvider({ env: { FEATHERLESS_API_KEY: "private-input", FEATHERLESS_MODEL: undefined } }), input: context, code: "AI_MISSING_MODEL" },
    { provider: createFeatherlessProvider({ env, fetch: mockFetch("{}") }), input: { ...context, identity: { ...context.identity, background: "private-input".repeat(4000) } }, code: "AI_INPUT_TOO_LARGE" },
  ];
  for (const item of cases) {
    await assert.rejects(item.provider.generateDeck(item.input), (error: unknown) => {
      const failure = deckGenerationFailure(error);
      assert.equal(failure.code, item.code);
      assert.doesNotMatch(JSON.stringify(failure), /private-input/);
      return true;
    });
  }
});

test("HTTP provider failures expose bounded categories without response bodies or credentials", async () => {
  for (const [status, code] of [[401, "AI_AUTHENTICATION"], [403, "AI_ACCESS_DENIED"], [402, "AI_PAYMENT_REQUIRED"], [404, "AI_MODEL_UNAVAILABLE"], [429, "AI_RATE_LIMIT"], [400, "AI_REQUEST_REJECTED"], [503, "AI_PROVIDER_ERROR"]] as const) {
    const provider = createFeatherlessProvider({ env, fetch: async () => new Response(JSON.stringify({ error: { message: "private-input test-key person-secret" } }), { status, headers: { "content-type": "application/json" } }) });
    await assert.rejects(provider.generateDeck(context), (error: unknown) => {
      const failure = deckGenerationFailure(error);
      assert.equal(failure.code, code);
      assert.doesNotMatch(JSON.stringify(failure), /private-input|test-key|person-secret/);
      return true;
    });
  }
});

function draft(evidenceRefs = ["C1"]) {
  return { cards: ["back_story", "what_changed", "if_she_asks", "dont_say"].map(type => ({
    type, prompt: "What can you discuss?", answer: "Use only the saved evidence.", evidenceRefs,
  })) };
}

test("one corrective attempt repairs malformed JSON, wrong format, missing types and unknown citations", async () => {
  for (const invalid of ["not-json private-input", "{}", JSON.stringify({ cards: draft().cards.map(card => ({ ...card, type: "back_story" })) }), JSON.stringify(draft(["F999"]))]) {
    let calls = 0;
    const provider = createFeatherlessProvider({ env, fetch: async (input, init) => {
      const body = JSON.parse(String(init?.body));
      const systemMessage = body.messages[0].content as string;
      if (calls) {
        assert.match(systemMessage, /previous response failed validation/);
        assert.doesNotMatch(systemMessage, /private-input/);
      }
      return mockFetch(calls++ ? JSON.stringify(draft()) : invalid)(input, init);
    } });
    const result = await provider.generateDeck(context);
    assert.equal(calls, 2);
    assert.deepEqual(result.cards[0].evidence, [{ kind: "claim", claimId: claim.id }]);
  }
});

test("invalid evidence is never guessed and corrective retries are bounded", async () => {
  for (const refs of [["F1"], ["c1"], [claim.id], ["C1", "F999"], []]) {
    let calls = 0;
    const provider = createFeatherlessProvider({ env, fetch: mockFetch(JSON.stringify(draft(refs)), () => calls++) });
    await assert.rejects(provider.generateDeck(context), error =>
      ["AI_UNKNOWN_EVIDENCE", "AI_INVALID_DECK"].includes(deckGenerationFailure(error).code));
    assert.equal(calls, 2);
  }
});

test("correction keeps evidence unchanged even at the exact input limit", async () => {
  let baseLength = 0;
  const baseline = createFeatherlessProvider({ env, fetch: mockFetch(JSON.stringify(draft()), body => {
    const message = (body.messages as Array<{ content: string }>)[1].content;
    baseLength = message.slice(message.indexOf("\n") + 1).length;
  }) });
  await baseline.generateDeck(context);
  let calls = 0;
  let originalInput = "";
  const provider = createFeatherlessProvider({ env, fetch: async (input, init) => {
    const body = JSON.parse(String(init?.body));
    const message = body.messages[1].content as string;
    if (calls === 0) originalInput = message;
    else assert.equal(message, originalInput);
    assert.equal(message.slice(message.indexOf("\n") + 1).length, FEATHERLESS_LIMITS.maxInputChars);
    return mockFetch(calls++ ? JSON.stringify(draft()) : "{}")(input, init);
  } });
  const result = await provider.generateDeck({ ...context, identity: {
    ...context.identity, background: "x".repeat(FEATHERLESS_LIMITS.maxInputChars - baseLength),
  } });
  assert.equal(calls, 2);
  assert.equal(result.cards.length, 4);
});

test("server resolves mixed evidence, dedupes topics and preserves unassigned claim evidence", async () => {
  const fact = { id: "snapshot-fact", interestId: interest.id, runId: "run-1", text: "The home team won.", kind: "reported_fact" as const, source: article.source, createdAt: claim.createdAt };
  const provider = createFeatherlessProvider({ env, fetch: mockFetch(JSON.stringify(draft(["C1", "F1", "C1"]))) });
  const result = await provider.generateDeck({ ...context, facts: [fact] });
  assert.deepEqual(result.cards[0].interestIds, [interest.id]);
  assert.deepEqual(result.cards[0].evidence, [
    { kind: "claim", claimId: claim.id }, { kind: "research", factId: fact.id, sourceUrl: fact.source.url },
  ]);
  const claimOnly = createFeatherlessProvider({ env, fetch: mockFetch("```json\n" + JSON.stringify(draft()) + "\n```") });
  const unassigned = await claimOnly.generateDeck({ ...context, interests: [], claims: [{ ...claim, interestId: null }] });
  assert.deepEqual(unassigned.cards[0].interestIds, []);
  assert.deepEqual(unassigned.cards[0].evidence, [{ kind: "claim", claimId: claim.id }]);
});

test("references resolve independently for each snapshot and do not retry transport failures", async () => {
  const provider = createFeatherlessProvider({ env, fetch: mockFetch(JSON.stringify(draft())) });
  await provider.generateDeck(context);
  const other = await provider.generateDeck({ ...context, claims: [{ ...claim, id: "different-snapshot-claim" }] });
  assert.deepEqual(other.cards[0].evidence, [{ kind: "claim", claimId: "different-snapshot-claim" }]);
  for (const status of [401, 429, 503]) {
    let calls = 0;
    const failed = createFeatherlessProvider({ env, fetch: async () => {
      calls++;
      return new Response(JSON.stringify({ error: { message: "private-provider-body" } }), { status, headers: { "content-type": "application/json" } });
    } });
    await assert.rejects(failed.generateDeck(context));
    assert.equal(calls, 1);
  }
  let truncatedCalls = 0;
  const truncated = createFeatherlessProvider({ env, fetch: mockFetch("{}", () => truncatedCalls++, "length") });
  await assert.rejects(truncated.generateDeck(context));
  assert.equal(truncatedCalls, 1);
});
