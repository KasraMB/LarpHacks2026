import assert from "node:assert/strict";
import test from "node:test";
import { operations, deckSchema, claimSchema, researchRunSchema, type AliasService } from "../src/contracts";
import { mockApi } from "../src/fixtures/mock-api";
import * as f from "../src/fixtures/demo";
import { createApiClient, AliasApiError } from "../src/lib/api-client";
import { notImplemented } from "../src/lib/not-implemented";
import { dispatchOperation } from "../src/server/http";

test("read fixtures conform to shared response schemas", async () => {
  const samples = {
    getIdentity: f.identity, listInterests: { items: [f.interest], nextCursor: null },
    getPerson: f.person, listPeople: { items: [f.person], nextCursor: null },
    getClaim: f.claim, listClaims: { items: [f.claim], nextCursor: null },
    listConversations: { items: [f.conversation], nextCursor: null },
    getResearchRun: f.researchRun, listResearchRuns: { items: [f.researchRun], nextCursor: null },
    listResearchFacts: { items: [f.researchFact], nextCursor: null },
    getDeck: f.deck, listDecks: { items: [f.deck], nextCursor: null },
  };
  for (const [name, sample] of Object.entries(samples)) {
    operations[name as keyof typeof samples].output.parse(sample);
  }
  for (const type of ["back_story", "what_changed", "if_she_asks", "dont_say"]) {
    assert.ok(f.deck.cards.some(card => card.type === type));
  }
  assert.equal(deckSchema.safeParse({ ...f.deck, cards: [{ ...f.cards[0], evidence: [] }] }).success, false);
  assert.equal(claimSchema.safeParse({ ...f.claim, saidAt: "yesterday" }).success, false);
  assert.equal(researchRunSchema.safeParse({ ...f.researchRun, status: "done" }).success, false);
  assert.deepEqual(operations.listPeople.input.parse({}), { cursor: null, limit: 25 });
  const clone = await mockApi.getDeck({ id: f.deck.id });
  clone.cards.length = 0;
  assert.equal(f.deck.cards.length, 4);
});

function request(body: unknown) {
  return new Request("http://localhost/api/v1/getPerson", { method: "POST", body: JSON.stringify(body) });
}
const service: AliasService = { ...mockApi, getPerson: async () => notImplemented("people.get") };

test("transport rejects malformed inputs and exposes explicit unimplemented status", async () => {
  assert.equal((await dispatchOperation(service, "getPerson", request({}))).status, 400);
  assert.equal((await dispatchOperation(service, "constructor", request({}))).status, 404);
  assert.equal((await dispatchOperation(service, "getPerson", request({ id: "dana" }))).status, 501);
  const malformed = new Request("http://localhost", { method: "POST", body: "{" });
  assert.equal((await dispatchOperation(service, "getPerson", malformed)).status, 400);
});

test("lifecycle states and card evidence cannot contradict their parent snapshots", () => {
  assert.equal(claimSchema.safeParse({ ...f.claim, checkStatus: "failed", checkFailure: null }).success, false);
  assert.equal(researchRunSchema.safeParse({ ...f.researchRun, status: "running", finishedAt: f.researchRun.finishedAt }).success, false);
  assert.equal(deckSchema.safeParse({ ...f.deck, status: "queued", finishedAt: null }).success, false);
  assert.equal(deckSchema.safeParse({ ...f.deck, claimIds: [] }).success, false);
  assert.equal(deckSchema.safeParse({ ...f.deck, cards: [{ ...f.cards[0], deckId: "other_deck" }] }).success, false);
});

test("typed client and dispatcher agree on request, response, defaults, and errors", async () => {
  const fetcher: typeof fetch = async (url, init) => {
    const name = String(url).split("/").at(-1)!;
    return dispatchOperation(service, name, new Request(String(url), init));
  };
  const client = createApiClient({ baseUrl: "http://localhost", fetch: fetcher });
  assert.deepEqual(await client.listPeople({}), { items: [f.person], nextCursor: null });
  await assert.rejects(client.getPerson({ id: "dana" }), (error: unknown) =>
    error instanceof AliasApiError && error.status === 501 && error.detail.code === "NOT_IMPLEMENTED");
});

test("invalid service output is rejected and internal error details are hidden", async () => {
  const invalid = { ...service, getPerson: async () => ({}) as never };
  const response = await dispatchOperation(invalid, "getPerson", request({ id: "dana" }));
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { ok: false, error: { code: "INTERNAL_ERROR", message: "The operation failed.", retryable: false } });
});
