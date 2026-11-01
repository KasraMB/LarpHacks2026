import assert from "node:assert/strict";
import { test } from "node:test";
import { createService } from "@/server/use-cases";
import { createWorkers } from "@/server/workers";
import { FEATHERLESS_PROMPT_VERSION } from "@/server/ai";
import type { Claim, Deck, Identity, Interest, Person, ResearchFact, ResearchRun } from "@/contracts";
import type { Repository, ServerDependencies } from "@/server/ports";

const now = "2026-11-01T12:00:00Z";
const cutoff = "2026-10-31T12:00:00Z";
const identity: Identity = { id: "identity-1", name: "Alex", background: "A cover", createdAt: now, updatedAt: now };
const interestA: Interest = { id: "interest-a", identityId: identity.id, name: "Basketball", searchTerms: ["basketball"], feedUrls: [], createdAt: now, updatedAt: now };
const interestB: Interest = { ...interestA, id: "interest-b", name: "Wine" };
const person: Person = { id: "person-1", identityId: identity.id, name: "Dana", notes: "", interestIds: [interestB.id, interestA.id], lastConversationAt: cutoff, createdAt: now, updatedAt: now };
const claim: Claim = { id: "claim-1", personId: person.id, conversationId: null, text: "I like basketball", interestId: interestA.id, saidAt: now, createdAt: now, checkStatus: "queued", contradictions: [], checkFailure: null };
const run: ResearchRun = { id: "run-1", interestId: interestA.id, trigger: "manual", status: "queued", createdAt: now, startedAt: null, finishedAt: null, factCount: 0, sourceErrors: [], failure: null };
const fact: ResearchFact = {
  id: "fact-1", interestId: interestA.id, runId: run.id, text: "Home team won", kind: "reported_fact",
  source: { url: "https://example.com/story", title: "Game recap", kind: "rss", publishedAt: null, retrievedAt: now }, createdAt: now,
};
const deck: Deck = { id: "deck-1", personId: person.id, status: "queued", createdAt: now, finishedAt: null, researchSince: cutoff,
  claimIds: [claim.id], factIds: [fact.id], cards: [], warnings: [], failure: null };

function page<T>(items: T[]) { return { items, nextCursor: null }; }
function dependencies(repository: unknown, overrides: Partial<ServerDependencies> = {}): ServerDependencies {
  let generatedId = 0;
  return {
    repository: repository as Repository,
    ai: { extractFacts: async () => [], checkContradictions: async () => [], generateDeck: async () => ({ cards: [], warnings: [] }) },
    discovery: [], reader: { read: async () => ({ source: fact.source, text: "" }) },
    queue: { enqueue: async () => {} }, scheduler: { enqueueDaily: async () => ({ runIds: [] }) },
    clock: { now: () => now }, ids: { next: () => `generated-${++generatedId}` },
    ...overrides,
  };
}

test("deck build snapshots only selected interests, applies conversation cutoff, and reuses stable cache fingerprints", async () => {
  const factRequests: Array<{ interestId: string; since: string | null }> = [];
  const records: Array<{ fingerprint: string; force: boolean; snapshot: unknown }> = [];
  const repository = {
    identity: { get: async () => identity },
    people: { get: async () => person },
    interests: { get: async (id: string) => id === interestA.id ? interestA : id === interestB.id ? interestB : null },
    claims: { list: async (_personId: string, _page: unknown) => page([claim]) },
    research: { listFacts: async (interestId: string, since: string | null) => {
      factRequests.push({ interestId, since });
      return page(interestId === interestA.id ? [fact] : []);
    } },
    decks: { createOrReuse: async (record: { deck: Deck; fingerprint: string; snapshot: unknown }, force: boolean) => {
      records.push({ fingerprint: record.fingerprint, force, snapshot: record.snapshot });
      return record.deck;
    } },
  };
  const service = createService(dependencies(repository), { model: "test/model", promptVersion: "prompt-v1" });

  await service.buildDeck({ personId: person.id, force: false });
  await service.buildDeck({ personId: person.id, force: false });
  await service.buildDeck({ personId: person.id, force: true });

  assert.deepEqual(factRequests, [
    { interestId: interestA.id, since: cutoff }, { interestId: interestB.id, since: cutoff },
    { interestId: interestA.id, since: cutoff }, { interestId: interestB.id, since: cutoff },
    { interestId: interestA.id, since: cutoff }, { interestId: interestB.id, since: cutoff },
  ]);
  const snapshot = records[0].snapshot as { context: { interests: Interest[]; claims: Claim[]; facts: ResearchFact[]; researchSince: string | null }; model: string; promptVersion: string };
  assert.deepEqual(snapshot.context.interests.map((item) => item.id), [interestA.id, interestB.id]);
  assert.deepEqual(snapshot.context.claims.map((item) => item.id), [claim.id]);
  assert.deepEqual(snapshot.context.facts.map((item) => item.id), [fact.id]);
  assert.equal(snapshot.context.researchSince, cutoff);
  assert.equal(snapshot.model, "test/model");
  assert.equal(snapshot.promptVersion, "prompt-v1");
  assert.equal(records[0].fingerprint, records[1].fingerprint);
  assert.deepEqual(records.map((record) => record.force), [false, false, true]);
});

test("claim check failure is recorded while the claim remains persisted", async () => {
  const savedChecks: Array<{ checkStatus: string; checkFailure: Claim["checkFailure"] }> = [];
  const repository = {
    claims: {
      get: async () => claim,
      list: async () => page([{ ...claim, id: "prior", saidAt: "2026-10-31T10:00:00Z" }]),
      saveCheck: async (_id: string, result: Pick<Claim, "checkStatus" | "contradictions" | "checkFailure">) => {
        savedChecks.push({ checkStatus: result.checkStatus, checkFailure: result.checkFailure });
        return claim;
      },
    },
  };
  const worker = createWorkers(dependencies(repository, { ai: { extractFacts: async () => [], checkContradictions: async () => { throw new Error("provider down"); }, generateDeck: async () => ({ cards: [], warnings: [] }) } })).claimCheck;

  await assert.rejects(worker.execute(claim.id), /provider down/);
  assert.deepEqual(savedChecks.map(({ checkStatus }) => checkStatus), ["running", "failed"]);
  assert.equal(savedChecks[1].checkFailure?.message, "Contradiction check failed; the claim remains saved.");
  assert.equal((await repository.claims.get())?.id, claim.id);
});

test("research completes with source errors when another source yields a usable article", async () => {
  const savedRuns: ResearchRun[] = [];
  const upserted: ResearchFact[][] = [];
  const repository = {
    research: {
      getRun: async () => run,
      saveRun: async (saved: ResearchRun) => { savedRuns.push(saved); return saved; },
      upsertFacts: async (facts: ResearchFact[]) => { upserted.push(facts); return facts.length; },
    },
    interests: { get: async () => interestA },
  };
  const article = { url: "https://example.com/story", title: "Game recap", kind: "rss" as const, publishedAt: null };
  const worker = createWorkers(dependencies(repository, {
    discovery: [
      { kind: "rss", discover: async () => { throw new Error("feed unavailable"); } },
      { kind: "google_news", discover: async () => [article] },
    ],
    reader: { read: async () => ({ source: fact.source, text: "The home team won." }) },
    ai: { extractFacts: async () => [{ text: "Home team won", kind: "reported_fact" }], checkContradictions: async () => [], generateDeck: async () => ({ cards: [], warnings: [] }) },
  })).research;

  await worker.execute(run.id);
  const completed = savedRuns.find((saved) => saved.status === "completed");
  assert.ok(completed);
  assert.equal(completed.factCount, 1);
  assert.equal(completed.sourceErrors.length, 1);
  assert.equal(completed.sourceErrors[0].url, null);
  assert.equal(upserted[0][0].text, "Home team won");
});

function deckCards(evidence: { kind: "research"; factId: string; sourceUrl: string }[]) {
  return (["back_story", "what_changed", "if_she_asks", "dont_say"] as const).map((type, position) => ({
    type, interestIds: [interestA.id], prompt: "What changed?", answer: "The home team won.", evidence, position,
  }));
}

test("deck workers sort snapshot cards and reject obsolete prompts before calling AI", async () => {
  for (const promptVersion of [FEATHERLESS_PROMPT_VERSION, "obsolete-prompt"]) {
    const saves: Deck[] = [];
    let generated = false;
    const snapshot = { context: { identity, person, interests: [interestA], claims: [claim], facts: [fact], researchSince: cutoff }, model: process.env.FEATHERLESS_MODEL ?? "test/model", promptVersion };
    const repository = { decks: {
      get: async () => deck, getSnapshot: async () => snapshot,
      save: async (record: { deck: Deck }) => { saves.push(record.deck); return record.deck; },
    } };
    const deps = dependencies(repository);
    deps.ai.generateDeck = async context => {
      generated = true;
      assert.equal(context, snapshot.context);
      return { cards: deckCards([{ kind: "research", factId: fact.id, sourceUrl: fact.source.url }]).reverse(), warnings: [] };
    };
    const worker = createWorkers(deps).deck;
    if (promptVersion === FEATHERLESS_PROMPT_VERSION) {
      await worker.execute(deck.id);
      assert.equal(generated, true);
      assert.deepEqual(saves.at(-1)?.cards.map(card => card.position), [0, 1, 2, 3]);
    } else {
      await assert.rejects(worker.execute(deck.id), /Snapshot prompt version/);
      assert.equal(generated, false);
      assert.equal(saves.at(-1)?.status, "failed");
    }
  }
});

test("invalid deck evidence URL persists failed deck", async () => {
  const saves: Deck[] = [];
  const snapshot = { context: { identity, person, interests: [interestA], claims: [claim], facts: [fact], researchSince: cutoff }, model: "test/model", promptVersion: FEATHERLESS_PROMPT_VERSION };
  const repository = {
    decks: {
      get: async () => deck,
      getSnapshot: async () => snapshot,
      save: async (record: { deck: Deck }) => { saves.push(record.deck); return record.deck; },
    },
  };
  const worker = createWorkers(dependencies(repository, { ai: { extractFacts: async () => [], checkContradictions: async () => [], generateDeck: async () => ({
    cards: deckCards([{ kind: "research", factId: fact.id, sourceUrl: "https://example.com/other" }]), warnings: [],
  }) } })).deck;

  await assert.rejects(worker.execute(deck.id), /Invalid evidence URL/);
  assert.equal(saves.at(-1)?.status, "failed");
  assert.equal(saves.at(-1)?.cards.length, 0);
  assert.equal(saves.at(-1)?.failure?.code, "UPSTREAM_ERROR");
});

test("deck with no claim or research evidence fails with NO_EVIDENCE", async () => {
  const saves: Deck[] = [];
  const emptyDeck: Deck = { ...deck, claimIds: [], factIds: [] };
  const snapshot = { context: { identity, person, interests: [interestA], claims: [], facts: [], researchSince: cutoff }, model: "test/model", promptVersion: "v1" };
  const repository = {
    decks: {
      get: async () => emptyDeck,
      getSnapshot: async () => snapshot,
      save: async (record: { deck: Deck }) => { saves.push(record.deck); return record.deck; },
    },
  };
  let generated = false;
  const worker = createWorkers(dependencies(repository, { ai: { extractFacts: async () => [], checkContradictions: async () => [], generateDeck: async () => { generated = true; return { cards: [], warnings: [] }; } } })).deck;

  await assert.rejects(worker.execute(emptyDeck.id), /No evidence available/);
  assert.equal(generated, false);
  assert.equal(saves.at(-1)?.status, "failed");
  assert.equal(saves.at(-1)?.failure?.code, "NO_EVIDENCE");
});
