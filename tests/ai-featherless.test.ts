import assert from "node:assert/strict";
import { test } from "node:test";
import { createFeatherlessProvider } from "@/server/ai";
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

function mockFetch(content: string, capture?: (body: Record<string, unknown>) => void): typeof fetch {
  return async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    capture?.(body);
    return new Response(JSON.stringify({
      id: "completion-1", object: "chat.completion", created: 1, model: "test/model",
      choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content } }],
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

test("deck references must point to supplied claims and fact URLs", async () => {
  const cards = ["back_story", "what_changed", "if_she_asks", "dont_say"].map((type, position) => ({
    type, interestIds: [interest.id], prompt: "What did you say?", answer: "You like basketball.", position,
    evidence: [{ kind: "claim", claimId: "invented-claim" }],
  }));
  const provider = createFeatherlessProvider({ env, fetch: mockFetch(JSON.stringify({ cards, warnings: [] })) });
  await assert.rejects(provider.generateDeck(context), /unknown claim/);
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
  const cards = ["back_story", "what_changed", "if_she_asks", "dont_say"].map((type, position) => ({
    type, interestIds: [interest.id], prompt: "What did you say?", answer: "You like basketball.", position,
    evidence: [{ kind: "claim", claimId: claim.id }],
  }));
  const provider = createFeatherlessProvider({ env, fetch: mockFetch(JSON.stringify({ cards, warnings: [] })) });
  const result = await provider.generateDeck(context);
  assert.equal(result.cards.length, 4);
  assert.equal(result.cards[3].type, "dont_say");
});
