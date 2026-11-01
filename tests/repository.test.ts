import assert from "node:assert/strict";
import test from "node:test";
import postgres from "postgres";
import { randomUUID } from "node:crypto";
import { createPostgresRepository, decodeCursor, encodeCursor } from "../src/server/db/repository";
import { migrate } from "../src/server/db/migrate";
import { seedDemo } from "../src/server/demo-seed";
import type { ResearchRun, ResearchFact, Deck } from "../src/contracts";
import type { DeckRecord } from "../src/server/ports";

test("repository cursors round trip and reject malformed or differently scoped cursors", () => {
  const item = { id: "opaque:id", createdAt: "2026-01-01T00:00:00.000Z" };
  const cursor = encodeCursor("facts:topic:cutoff", item);
  assert.deepEqual(decodeCursor(cursor, "facts:topic:cutoff"), [item.createdAt, item.id]);
  assert.throws(() => decodeCursor(cursor, "facts:other:cutoff"), /Invalid pagination cursor/);
  for (const bad of ["not-json", "e30", Buffer.from(JSON.stringify(["scope", "invalid", "id"])).toString("base64url")]) assert.throws(() => decodeCursor(bad, "scope"));
});

test("Postgres demo seed is idempotent and preserves valid historical snapshots", { skip: !process.env.DATABASE_URL_TEST }, async () => {
  const admin = postgres(process.env.DATABASE_URL_TEST!, { max: 1 });
  const schema = `alias_seed_test_${randomUUID().replaceAll("-", "")}`;
  await admin.unsafe(`CREATE SCHEMA ${schema}`);
  const url = new URL(process.env.DATABASE_URL_TEST!);
  url.searchParams.set("options", `-c search_path=${schema}`);
  const databaseUrl = url.toString();
  const repository = createPostgresRepository(databaseUrl);
  try {
    await migrate(databaseUrl);
    await seedDemo(databaseUrl);
    const original = await repository.decks.get("deck_seed_dana");
    assert.equal(original?.status, "completed");
    assert.deepEqual(original?.cards.map(card => card.position), [0, 1, 2, 3]);
    assert.equal((await repository.research.listFacts("interest_seed_nba", null, { limit: 100, cursor: null })).items.length, 7);
    const first = await repository.claims.get("claim_seed_raptors");
    assert.equal(first?.conversationId, null);
    const second = await repository.claims.get("claim_seed_conflict");
    const history = await repository.conversations.list("person_seed_dana", { limit: 100, cursor: null });
    assert.equal(second?.conversationId, history.items[0].id);
    assert.equal(second?.saidAt, history.items[0].happenedAt);
    await repository.people.update("person_seed_dana", { name: "Edited demo", notes: "Preserve this", interestIds: ["interest_seed_nba"] });
    await seedDemo(databaseUrl);
    assert.equal((await repository.people.get("person_seed_dana"))?.name, "Edited demo");
    assert.deepEqual(await repository.decks.get("deck_seed_dana"), original);
    assert.equal((await repository.decks.getSnapshot("deck_seed_dana"))?.context.person.name, "Dana");
  } finally {
    await repository.close();
    await admin.unsafe(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  }
});

test("Postgres repository transactions, deduplication, snapshots, pagination and durable leases", { skip: !process.env.DATABASE_URL_TEST }, async () => {
  // DATABASE_URL_TEST must point at a disposable database. A unique schema keeps
  // this suite isolated from application tables and concurrent test processes.
  const connection = process.env.DATABASE_URL_TEST!;
  const schema = `alias_test_${randomUUID().replaceAll("-", "")}`;
  const admin = postgres(connection, { max: 1 });
  await admin.unsafe(`CREATE SCHEMA ${schema}`);
  const url = new URL(connection);
  url.searchParams.set("options", `-c search_path=${schema}`);
  const repository = createPostgresRepository(url.toString());
  const inspect = postgres(url.toString(), { max: 1 });
  try {
    await migrate(url.toString()); await migrate(url.toString());
    const identity = await repository.identity.save({ name: "Cover", background: "Background" });
    assert.equal((await repository.identity.save({ name: "Edited", background: "Updated" })).id, identity.id);
    const topic = await repository.interests.create({ name: "Topic", searchTerms: ["topic"], feedUrls: [] });
    const other = await repository.interests.create({ name: "Other", searchTerms: [], feedUrls: [] });
    const person = await repository.people.create({ name: "Person", notes: "", interestIds: [topic.id] });
    await assert.rejects(repository.interests.delete(topic.id), /Unlink/);
    await assert.rejects(repository.people.create({ name: "Bad", notes: "", interestIds: ["missing"] }), /Entity not found/);
    const date = "2026-02-01T00:00:00.000Z";
    const input = { text: "Claim", interestId: topic.id, saidAt: date };
    await assert.rejects(repository.conversations.record({ personId: person.id, data: { happenedAt: date, notes: "rollback", claims: [{ ...input, interestId: other.id }] } }), /linked/);
    assert.equal((await repository.conversations.list(person.id, { limit: 10, cursor: null })).items.length, 0);
    assert.equal((await repository.people.get(person.id))?.lastConversationAt, null);
    await Promise.all([
      repository.conversations.record({ personId: person.id, data: { happenedAt: date, notes: "recent", claims: [input] } }),
      repository.conversations.record({ personId: person.id, data: { happenedAt: "2025-01-01T00:00:00Z", notes: "backfill", claims: [] } }),
    ]);
    assert.equal((await repository.people.get(person.id))?.lastConversationAt, date);
    const first = await repository.conversations.list(person.id, { limit: 1, cursor: null });
    const second = await repository.conversations.list(person.id, { limit: 1, cursor: first.nextCursor });
    assert.equal(first.items.length, 1); assert.equal(second.items.length, 1); assert.notEqual(first.items[0].id, second.items[0].id); assert.equal(second.nextCursor, null);
    const makeRun = (): ResearchRun => ({ id: randomUUID(), interestId: topic.id, status: "queued", trigger: "manual", createdAt: date, startedAt: null, finishedAt: null, factCount: 0, sourceErrors: [], failure: null });
    const runs = await Promise.all(Array.from({ length: 4 }, () => repository.research.createOrReuseRun(makeRun())));
    assert.equal(new Set(runs.map(run => run.id)).size, 1);
    const fact: ResearchFact = { id: randomUUID(), interestId: topic.id, runId: runs[0].id, createdAt: date, text: "A fact", kind: "reported_fact", source: { url: "https://example.com/article", title: "Article", kind: "rss", publishedAt: null, retrievedAt: date } };
    assert.equal(await repository.research.upsertFacts([fact, { ...fact, id: randomUUID(), text: " A   FACT " }]), 1);
    assert.equal(await repository.research.upsertFacts([fact]), 0);
    assert.equal((await repository.research.listFacts(topic.id, null, { limit: 10, cursor: null })).items.length, 1);
    assert.equal((await repository.research.listFacts(topic.id, date, { limit: 10, cursor: null })).items.length, 0);
    await assert.rejects(repository.research.upsertFacts([{ ...fact, id: randomUUID(), interestId: other.id }]), /same interest/);
    const deck: Deck = { id: randomUUID(), personId: person.id, status: "queued", createdAt: date, finishedAt: null, researchSince: date, claimIds: [], factIds: [fact.id], cards: [], warnings: [], failure: null };
    const record: DeckRecord = { deck, fingerprint: "fingerprint", snapshot: { context: { identity, person, interests: [topic], claims: [], facts: [fact], researchSince: date }, model: "test", promptVersion: "v1" } };
    const builds = await Promise.all(Array.from({ length: 4 }, () => repository.decks.createOrReuse({ ...record, deck: { ...deck, id: randomUUID() } }, true)));
    assert.equal(new Set(builds.map(build => build.id)).size, 1);
    await repository.people.update(person.id, { name: "Changed", notes: "", interestIds: [] });
    assert.equal((await repository.decks.getSnapshot(builds[0].id))?.context.person.name, "Person");
    const jobs = await Promise.all([repository.jobs.claim("worker1"), repository.jobs.claim("worker2"), repository.jobs.claim("worker3")]);
    assert.equal(new Set(jobs.filter(Boolean).map(job => job!.id)).size, 3);
    assert.deepEqual(new Set(jobs.map(job => job?.job.kind)), new Set(["claim_check", "research", "deck"]));
    const leased = jobs[0]!;
    await repository.jobs.complete(leased.id, "wrong-worker");
    assert.equal((await inspect`SELECT status FROM jobs WHERE id=${leased.id}`)[0].status, "running");
    await repository.jobs.complete(leased.id, "worker1");
    assert.equal((await inspect`SELECT status FROM jobs WHERE id=${leased.id}`)[0].status, "completed");
    const expired = jobs[1]!;
    await inspect`UPDATE jobs SET lease_until=now()-interval '1 second' WHERE id=${expired.id}`;
    const retry = await repository.jobs.claim("retry-worker");
    assert.equal(retry?.id, expired.id); assert.equal(retry?.attempts, 2);
    await repository.jobs.fail(expired.id, "retry-worker", "temporary");
    assert.equal((await inspect`SELECT status FROM jobs WHERE id=${expired.id}`)[0].status, "queued");
    await inspect`UPDATE jobs SET available_at=now()-interval '1 second' WHERE id=${expired.id}`;
    assert.equal((await repository.jobs.claim("last-worker"))?.attempts, 3);
    await inspect`UPDATE jobs SET lease_until=now()-interval '1 second' WHERE id=${expired.id}`;
    await repository.jobs.claim("reconciler");
    assert.equal((await inspect`SELECT status FROM jobs WHERE id=${expired.id}`)[0].status, "failed");
    // A user can retrigger after a worker failure but before its retry. The
    // retry must yield to the new active run rather than violate its unique key.
    await repository.research.saveRun({ ...runs[0], status: "failed", finishedAt: date, failure: { code: "UPSTREAM_ERROR", message: "temporary", retryable: true } });
    await inspect`UPDATE jobs SET status='queued',attempts=1,available_at=now()-interval '1 second',worker_id=NULL,lease_until=NULL WHERE kind='research' AND entity_id=${runs[0].id}`;
    const replacement = await repository.research.createOrReuseRun(makeRun());
    assert.notEqual(replacement.id, runs[0].id);
    const replacementJob = await repository.jobs.claim("replacement-worker");
    assert.equal(replacementJob?.job.kind, "research");
    assert.equal(replacementJob?.job.kind === "research" ? replacementJob.job.runId : null, replacement.id);
    assert.equal((await inspect`SELECT status FROM jobs WHERE kind='research' AND entity_id=${runs[0].id}`)[0].status, "completed");
    await repository.people.delete(person.id);
    assert.equal(await repository.decks.get(builds[0].id), null);
    await repository.interests.delete(topic.id);
    assert.equal(await repository.research.getRun(runs[0].id), null);
  } finally {
    await repository.close();
    await inspect.end();
    await admin.unsafe(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  }
});
