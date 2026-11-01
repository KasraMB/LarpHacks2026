import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import postgres from "postgres";
import { createPostgresRepository, type PostgresRepository } from "../src/server/db/repository";
import { migrate } from "../src/server/db/migrate";
import type { Deck, ResearchFact, ResearchRun } from "../src/contracts";
import type { DeckRecord } from "../src/server/ports";

const integration = { skip: !process.env.DATABASE_URL_TEST };
const page = { limit: 100, cursor: null };
const date = "2026-02-01T00:00:00.000Z";
const topicInput = (name: string, visibility: "private" | "public" = "private") => ({ name, visibility, searchTerms: [name], feedUrls: [] });
const notFound = { status: 404 };

async function fixture(run: (system: PostgresRepository, sql: postgres.Sql, databaseUrl: string) => Promise<void>, upgrade = false) {
  const connection = process.env.DATABASE_URL_TEST!;
  const schema = `alias_tenant_test_${randomUUID().replaceAll("-", "")}`;
  const admin = postgres(connection, { max: 1 });
  await admin.unsafe(`CREATE SCHEMA ${schema}`);
  const url = new URL(connection);
  url.searchParams.set("options", `-c search_path=${schema}`);
  const databaseUrl = url.toString();
  const sql = postgres(databaseUrl, { max: 1 });
  const system = createPostgresRepository(databaseUrl, { system: true });
  try {
    if (upgrade) {
      await sql.unsafe(await readFile("src/server/db/migrations/0001_initial.sql", "utf8"));
      await sql`CREATE TABLE alias_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`;
      await sql`INSERT INTO alias_migrations(name) VALUES ('0001_initial.sql')`;
      const identity = { id: "legacy", name: "Legacy private identity", background: "Private", createdAt: date, updatedAt: date };
      const skill = { id: "legacy-topic", identityId: identity.id, name: "Legacy private skill", searchTerms: [], feedUrls: [], createdAt: date, updatedAt: date };
      await sql`INSERT INTO identities(id,payload) VALUES (${identity.id},${sql.json(identity)})`;
      await sql`INSERT INTO interests(id,identity_id,created_at,payload) VALUES (${skill.id},${identity.id},${date},${sql.json(skill)})`;
    }
    await migrate(databaseUrl);
    await migrate(databaseUrl);
    await sql`INSERT INTO auth_user(id,name,email) VALUES ('alice','Alice','alice@example.test'),('bob','Bob','bob@example.test')`;
    await run(system, sql, databaseUrl);
  } finally {
    await system.close();
    await sql.end();
    await admin.unsafe(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  }
}

const makeRun = (interestId: string): ResearchRun => ({ id: randomUUID(), interestId, status: "queued", trigger: "manual", createdAt: date, startedAt: null, finishedAt: null, factCount: 0, sourceErrors: [], failure: null });

test("tenant identity saves are isolated and concurrent saves keep one persona per user", integration, async () => {
  await fixture(async (system, sql) => {
    const alice = system.forUser("alice");
    const bob = system.forUser("bob");
    assert.equal(await alice.identity.get(), null);
    assert.equal(await bob.identity.get(), null);
    const saves = await Promise.all(Array.from({ length: 5 }, (_, index) => alice.identity.save({ name: `Alice ${index}`, background: "Alice secret" })));
    assert.equal(new Set(saves.map(identity => identity.id)).size, 1);
    const other = await bob.identity.save({ name: "Bob", background: "Bob secret" });
    assert.notEqual(other.id, saves[0].id);
    assert.equal((await sql`SELECT count(*)::int AS count FROM identities WHERE owner_user_id='alice'`)[0].count, 1);
    assert.equal((await bob.identity.get())?.background, "Bob secret");
    assert.equal((await alice.identity.get())?.background, "Alice secret");
    await alice.close(); // A request scope does not close the shared pool.
    assert.equal((await bob.identity.get())?.id, other.id);
    assert.throws(() => system.forUser(" "), /nonempty user ID/);
  });
});

test("catalog permits public reads and linking while skill edits remain owner-only", integration, async () => {
  await fixture(async system => {
    const alice = system.forUser("alice");
    const bob = system.forUser("bob");
    await alice.identity.save({ name: "Alice", background: "" });
    await bob.identity.save({ name: "Bob", background: "" });
    const privateSkill = await alice.interests.create(topicInput("Private"));
    const shared = await alice.interests.create(topicInput("Shared", "public"));
    const own = await bob.interests.create(topicInput("Bob private"));
    assert.equal(privateSkill.ownerUserId, "alice");
    assert.equal(privateSkill.visibility, "private");
    assert.equal(await bob.interests.get(privateSkill.id), null);
    assert.equal((await bob.interests.get(shared.id))?.ownerUserId, "alice");
    assert.deepEqual(new Set((await bob.interests.list(page)).items.map(skill => skill.id)), new Set([shared.id, own.id]));
    await assert.rejects(bob.interests.update(shared.id, topicInput("Hijack")), notFound);
    await assert.rejects(bob.interests.delete(shared.id), notFound);
    await assert.rejects(bob.interests.update(privateSkill.id, topicInput("Hijack")), notFound);
    await assert.rejects(bob.people.create({ name: "Invalid", notes: "", interestIds: [privateSkill.id] }), notFound);
    const person = await bob.people.create({ name: "Private Bob contact", notes: "Hidden", interestIds: [shared.id, own.id] });
    assert.equal(await alice.people.get(person.id), null);
    await assert.rejects(alice.interests.delete(shared.id), /skill is still in use/);
    const run = await bob.research.createOrReuseRun(makeRun(shared.id));
    assert.equal((await alice.research.getRun(run.id))?.id, run.id);
    await assert.rejects(bob.research.createOrReuseRun(makeRun(privateSkill.id)), notFound);
    const first = await alice.interests.list({ limit: 1, cursor: null });
    assert.ok(first.nextCursor);
    await assert.rejects(bob.interests.list({ limit: 1, cursor: first.nextCursor }), /Invalid pagination cursor/);
    await assert.rejects(alice.interests.update(shared.id, topicInput("Now private")), /cannot be made private while it is in use/);
    await bob.people.update(person.id, { name: person.name, notes: person.notes, interestIds: [own.id] });
    await alice.interests.update(shared.id, topicInput("Now private"));
    assert.equal(await bob.interests.get(shared.id), null);
    assert.equal(await bob.research.getRun(run.id), null);
    await assert.rejects(bob.research.listRuns(shared.id, page), notFound);
    await assert.rejects(bob.research.findActiveRun(shared.id), notFound);
    // The contact and previously linked public topic never reveal Bob's data to Alice.
    assert.deepEqual((await alice.people.list(page)).items, []);
    await bob.people.delete(person.id);
    await alice.interests.delete(shared.id);
    assert.equal(await system.research.getRun(run.id), null);
  });
});

test("private people, conversations, claims, decks and immutable snapshots reject other tenants", integration, async () => {
  await fixture(async (system, sql) => {
    const alice = system.forUser("alice");
    const bob = system.forUser("bob");
    const identity = await alice.identity.save({ name: "Alice", background: "Secret identity" });
    await bob.identity.save({ name: "Bob", background: "" });
    const skill = await alice.interests.create(topicInput("Private skill"));
    const person = await alice.people.create({ name: "Secret contact", notes: "Private notes", interestIds: [skill.id] });
    const otherPerson = await bob.people.create({ name: "Bob contact", notes: "", interestIds: [] });
    const claimInput = { text: "Secret claim", saidAt: date, interestId: skill.id };
    const { claims } = await alice.conversations.record({ personId: person.id, data: { happenedAt: date, notes: "Secret conversation", claims: [claimInput] } });
    const claim = claims[0];
    const run = await alice.research.createOrReuseRun(makeRun(skill.id));
    const fact: ResearchFact = { id: randomUUID(), interestId: skill.id, runId: run.id, createdAt: date, text: "Private research", kind: "reported_fact", source: { url: "https://example.test/source", title: "Source", kind: "rss", publishedAt: date, retrievedAt: date } };
    await alice.research.upsertFacts([fact]);
    const deck: Deck = { id: randomUUID(), personId: person.id, status: "queued", createdAt: date, finishedAt: null, researchSince: null, claimIds: [claim.id], factIds: [fact.id], cards: [], warnings: [], failure: null };
    const record: DeckRecord = { deck, fingerprint: "private", snapshot: { context: { identity, person, interests: [skill], claims: [claim], facts: [fact], researchSince: null }, model: "test", promptVersion: "v1" } };
    await alice.decks.createOrReuse(record, false);
    assert.deepEqual((await bob.people.list(page)).items.map(item => item.id), [otherPerson.id]);
    assert.equal(await bob.people.get(person.id), null);
    assert.equal(await bob.claims.get(claim.id), null);
    assert.equal(await bob.decks.get(deck.id), null);
    assert.equal(await bob.decks.getSnapshot(deck.id), null);
    assert.equal(await bob.research.getRun(run.id), null);
    await assert.rejects(bob.people.update(person.id, { name: "Hijacked", notes: "", interestIds: [] }), notFound);
    await assert.rejects(bob.people.delete(person.id), notFound);
    await assert.rejects(bob.claims.list(person.id, page), notFound);
    await assert.rejects(bob.claims.create(person.id, claimInput), notFound);
    await assert.rejects(bob.claims.saveCheck(claim.id, { checkStatus: "completed", contradictions: [], checkFailure: null }), notFound);
    await assert.rejects(bob.conversations.list(person.id, page), notFound);
    await assert.rejects(bob.conversations.record({ personId: person.id, data: { happenedAt: date, notes: "Hijack", claims: [] } }), notFound);
    await assert.rejects(bob.decks.list(person.id, page), notFound);
    await assert.rejects(bob.decks.findReusable(person.id, record.fingerprint), notFound);
    await assert.rejects(bob.decks.save(record), notFound);
    await assert.rejects(bob.decks.save({ ...record, deck: { ...deck, personId: otherPerson.id } }), notFound);
    await assert.rejects(bob.decks.createOrReuse({ ...record, deck: { ...deck, personId: otherPerson.id } }, true), notFound);
    await assert.rejects(bob.research.listFacts(skill.id, null, page), notFound);
    await assert.rejects(bob.research.saveRun({ ...run, status: "completed" }), notFound);
    await assert.rejects(bob.research.upsertFacts([{ ...fact, id: randomUUID() }]), notFound);
    await assert.rejects(bob.jobs.enqueue({ kind: "claim_check", claimId: claim.id }), notFound);
    await assert.rejects(bob.jobs.claim("forbidden-browser-worker"), notFound);
    await assert.rejects(bob.jobs.complete("any-job", "any-worker"), notFound);
    await assert.rejects(bob.jobs.fail("any-job", "any-worker", "failure"), notFound);
    assert.equal((await alice.people.get(person.id))?.name, "Secret contact");
    assert.equal((await alice.claims.get(claim.id))?.text, "Secret claim");
    assert.equal((await alice.decks.getSnapshot(deck.id))?.context.identity.background, "Secret identity");
    assert.equal((await sql`SELECT count(*)::int AS count FROM conversations WHERE person_id=${person.id}`)[0].count, 1);
    // The explicit worker repository still sees all queued work.
    assert.ok(await system.jobs.claim("system-worker"));
  });
});

test("upgrading a singleton database keeps legacy private data unowned and invisible", integration, async () => {
  await fixture(async (system, sql) => {
    const alice = system.forUser("alice");
    assert.equal((await system.identity.get())?.id, "legacy");
    assert.equal(await alice.identity.get(), null);
    assert.equal(await alice.interests.get("legacy-topic"), null);
    assert.deepEqual((await alice.interests.list(page)).items, []);
    const identity = await alice.identity.save({ name: "Alice", background: "Own identity" });
    assert.notEqual(identity.id, "legacy");
    assert.equal((await sql`SELECT owner_user_id FROM identities WHERE id='legacy'`)[0].owner_user_id, null);
    assert.equal((await system.interests.get("legacy-topic"))?.visibility, "private");
    assert.equal((await system.interests.get("legacy-topic"))?.ownerUserId, null);
  }, true);
});
