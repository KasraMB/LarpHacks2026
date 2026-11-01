import postgres from "postgres";
import { randomUUID, createHash } from "node:crypto";
import type { Claim, Conversation, Deck, Identity, Interest, Person, ResearchFact, ResearchRun } from "@/contracts";
import { claimSchema, deckSchema, researchFactSchema, researchRunSchema } from "@/contracts";
import type { DeckRecord, DeckSnapshot, Job, Page, PageRequest, Repository } from "@/server/ports";
import { ServiceError } from "@/server/http";

type Db = postgres.Sql | postgres.TransactionSql;
type Entity = { id: string; createdAt: string };
const now = () => new Date().toISOString();
const missing = () => new ServiceError({ code: "NOT_FOUND", message: "Entity not found.", retryable: false }, 404);
const conflict = (message: string) => new ServiceError({ code: "CONFLICT", message, retryable: false }, 409);
const invalid = () => new ServiceError({ code: "VALIDATION_ERROR", message: "Invalid pagination cursor.", retryable: false }, 400);

export function encodeCursor(scope: string, item: Entity): string {
  return Buffer.from(JSON.stringify([scope, item.createdAt, item.id])).toString("base64url");
}
export function decodeCursor(cursor: string, scope: string): [string, string] {
  try {
    const value: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString());
    if (!Array.isArray(value) || value.length !== 3 || value[0] !== scope || typeof value[1] !== "string" || !Number.isFinite(Date.parse(value[1])) || typeof value[2] !== "string" || !value[2]) throw invalid();
    return [value[1], value[2]];
  } catch { throw invalid(); }
}
async function get<T>(db: Db, table: string, id: string, lock = false): Promise<T | null> {
  const rows = await db.unsafe(`SELECT payload FROM ${table} WHERE id=$1${lock ? " FOR UPDATE" : ""}`, [id]);
  return rows[0]?.payload as T ?? null;
}
async function requireEntity<T>(db: Db, table: string, id: string, lock = false): Promise<T> {
  const result = await get<T>(db, table, id, lock);
  if (!result) throw missing();
  return result;
}
async function page<T extends Entity>(db: Db, table: string, request: PageRequest, scope: string, ascending: boolean, filter = "TRUE", parameters: string[] = []): Promise<Page<T>> {
  if (!Number.isInteger(request.limit) || request.limit < 1 || request.limit > 100) throw invalid();
  const values = [...parameters];
  let condition = filter;
  if (request.cursor) {
    const [date, id] = decodeCursor(request.cursor, scope);
    values.push(date, id);
    condition += ` AND (created_at,id) ${ascending ? ">" : "<"} ($${values.length - 1}::timestamptz,$${values.length})`;
  }
  values.push(String(request.limit + 1));
  const rows = await db.unsafe(`SELECT payload FROM ${table} WHERE ${condition} ORDER BY created_at ${ascending ? "ASC" : "DESC"},id ${ascending ? "ASC" : "DESC"} LIMIT $${values.length}`, values);
  const all = rows.map(row => row.payload as T);
  const items = all.slice(0, request.limit);
  return { items, nextCursor: all.length > request.limit ? encodeCursor(scope, items[items.length - 1]) : null };
}
async function enqueue(db: Db, job: Job): Promise<void> {
  const entityId = job.kind === "research" ? job.runId : job.kind === "deck" ? job.deckId : job.claimId;
  await db`INSERT INTO jobs(id,kind,entity_id,payload) VALUES (${randomUUID()},${job.kind},${entityId},${db.json(job)}) ON CONFLICT(kind,entity_id) DO NOTHING`;
}
async function writeDeck(db: Db, record: DeckRecord): Promise<Deck> {
  const { fingerprint, snapshot } = record;
  const previous = await get<Deck>(db, "decks", record.deck.id, true);
  const deck = deckSchema.parse(previous ? { ...record.deck, personId: previous.personId, createdAt: previous.createdAt, researchSince: previous.researchSince, claimIds: previous.claimIds, factIds: previous.factIds } : record.deck);
  // A worker may change lifecycle/results but never replace the original snapshot.
  await db`INSERT INTO decks(id,person_id,fingerprint,status,created_at,snapshot,payload) VALUES (${deck.id},${deck.personId},${fingerprint},${deck.status},${deck.createdAt},${db.json(snapshot as unknown as postgres.JSONValue)},${db.json(deck)}) ON CONFLICT(id) DO UPDATE SET status=excluded.status,payload=excluded.payload`;
  await db`DELETE FROM cards WHERE deck_id=${deck.id}`;
  for (const card of deck.cards) await db`INSERT INTO cards(id,deck_id,position,payload) VALUES (${card.id},${deck.id},${card.position},${db.json(card)})`;
  return deck;
}
export interface PostgresRepository extends Repository { close(): Promise<void> }
export function createPostgresRepository(databaseUrl: string): PostgresRepository {
  const sql = postgres(databaseUrl, { max: 10 });
  const identityGet = async (db: Db): Promise<Identity | null> => (await db`SELECT payload FROM identities WHERE singleton=1`)[0]?.payload as Identity ?? null;
  const requireIdentity = async (db: Db) => { const identity = await identityGet(db); if (!identity) throw missing(); return identity; };
  const validateInterests = async (db: Db, identityId: string, ids: string[]) => {
    for (const id of new Set(ids)) {
      const interest = await requireEntity<Interest>(db, "interests", id, true);
      if (interest.identityId !== identityId) throw conflict("Interest belongs to a different identity.");
    }
  };
  const writePerson = async (db: Db, person: Person) => {
    await db`INSERT INTO people(id,identity_id,created_at,payload) VALUES (${person.id},${person.identityId},${person.createdAt},${db.json(person)}) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload`;
    await db`DELETE FROM person_interests WHERE person_id=${person.id}`;
    for (const id of new Set(person.interestIds)) await db`INSERT INTO person_interests(person_id,interest_id) VALUES (${person.id},${id})`;
    return person;
  };
  const writeClaim = async (db: Db, person: Person, input: Parameters<Repository["claims"]["create"]>[1], conversationId: string | null): Promise<Claim> => {
    if (input.interestId && !person.interestIds.includes(input.interestId)) throw conflict("Claim topic must be linked to the person.");
    const claim: Claim = { ...input, saidAt: new Date(input.saidAt).toISOString(), id: randomUUID(), personId: person.id, conversationId, createdAt: now(), checkStatus: "queued", contradictions: [], checkFailure: null };
    await db`INSERT INTO claims(id,person_id,conversation_id,interest_id,created_at,payload) VALUES (${claim.id},${person.id},${conversationId},${claim.interestId},${claim.createdAt},${db.json(claim)})`;
    await enqueue(db, { kind: "claim_check", claimId: claim.id });
    return claim;
  };
  const saveRun = async (db: Db, run: ResearchRun) => {
    run = researchRunSchema.parse(run);
    await db`INSERT INTO research_runs(id,interest_id,status,created_at,payload) VALUES (${run.id},${run.interestId},${run.status},${run.createdAt},${db.json(run)}) ON CONFLICT(id) DO UPDATE SET status=excluded.status,payload=excluded.payload`;
    return run;
  };
  const repository: PostgresRepository = {
    close: () => sql.end(),
    identity: {
      get: () => identityGet(sql),
      save: input => sql.begin(async tx => {
        await tx`SELECT pg_advisory_xact_lock(281924613)`;
        const existing = await identityGet(tx); const date = now();
        const identity: Identity = { ...input, id: existing?.id ?? randomUUID(), createdAt: existing?.createdAt ?? date, updatedAt: date };
        await tx`INSERT INTO identities(id,payload) VALUES (${identity.id},${tx.json(identity)}) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload`;
        return identity;
      }),
    },
    interests: {
      get: id => get<Interest>(sql, "interests", id),
      list: request => page<Interest>(sql, "interests", request, "interests", true),
      create: input => sql.begin(async tx => {
        const identity = await requireIdentity(tx); const date = now();
        const interest: Interest = { ...input, id: randomUUID(), identityId: identity.id, createdAt: date, updatedAt: date };
        await tx`INSERT INTO interests(id,identity_id,created_at,payload) VALUES (${interest.id},${identity.id},${date},${tx.json(interest)})`;
        return interest;
      }),
      update: (id, input) => sql.begin(async tx => {
        const previous = await requireEntity<Interest>(tx, "interests", id, true);
        const interest: Interest = { ...previous, ...input, updatedAt: now() };
        await tx`UPDATE interests SET payload=${tx.json(interest)} WHERE id=${id}`; return interest;
      }),
      delete: id => sql.begin(async tx => {
        await requireEntity(tx, "interests", id, true);
        if ((await tx`SELECT person_id FROM person_interests WHERE interest_id=${id} LIMIT 1`).length) throw conflict("Unlink the interest from people before deleting it.");
        // Historical claims retain their text; deleted topic references are cleared.
        await tx`UPDATE claims SET payload=jsonb_set(payload,'{interestId}','null'::jsonb) WHERE interest_id=${id}`;
        await tx`DELETE FROM jobs WHERE kind='research' AND entity_id IN (SELECT id FROM research_runs WHERE interest_id=${id})`;
        await tx`DELETE FROM interests WHERE id=${id}`;
      }),
    },
    people: {
      get: id => get<Person>(sql, "people", id),
      list: request => page<Person>(sql, "people", request, "people", true),
      create: input => sql.begin(async tx => {
        const identity = await requireIdentity(tx); await validateInterests(tx, identity.id, input.interestIds); const date = now();
        return writePerson(tx, { ...input, interestIds: [...new Set(input.interestIds)], id: randomUUID(), identityId: identity.id, createdAt: date, updatedAt: date, lastConversationAt: null });
      }),
      update: (id, input) => sql.begin(async tx => {
        const person = await requireEntity<Person>(tx, "people", id, true); await validateInterests(tx, person.identityId, input.interestIds);
        return writePerson(tx, { ...person, ...input, interestIds: [...new Set(input.interestIds)], updatedAt: now() });
      }),
      delete: id => sql.begin(async tx => {
        await requireEntity(tx, "people", id, true);
        await tx`DELETE FROM jobs WHERE (kind='deck' AND entity_id IN (SELECT id FROM decks WHERE person_id=${id})) OR (kind='claim_check' AND entity_id IN (SELECT id FROM claims WHERE person_id=${id}))`;
        await tx`DELETE FROM people WHERE id=${id}`;
      }),
    },
    claims: {
      get: id => get<Claim>(sql, "claims", id),
      list: async (id, request) => { await requireEntity(sql, "people", id); return page<Claim>(sql, "claims", request, `claims:${id}`, false, "person_id=$1", [id]); },
      create: (id, input) => sql.begin(async tx => writeClaim(tx, await requireEntity<Person>(tx, "people", id, true), input, null)),
      saveCheck: (id, result) => sql.begin(async tx => {
        const claim = await requireEntity<Claim>(tx, "claims", id, true);
        for (const contradiction of result.contradictions) {
          const earlier = await requireEntity<Claim>(tx, "claims", contradiction.earlierClaimId);
          const earlierSaid = Date.parse(earlier.saidAt); const claimSaid = Date.parse(claim.saidAt);
          if (earlier.personId !== claim.personId || earlier.id === claim.id || earlierSaid > claimSaid || (earlierSaid === claimSaid && Date.parse(earlier.createdAt) >= Date.parse(claim.createdAt))) throw conflict("Contradictions must reference earlier claims for the same person.");
        }
        const updated = claimSchema.parse({ ...claim, ...result }); await tx`UPDATE claims SET payload=${tx.json(updated)} WHERE id=${id}`; return updated;
      }),
    },
    conversations: {
      list: async (id, request) => { await requireEntity(sql, "people", id); return page<Conversation>(sql, "conversations", request, `conversations:${id}`, false, "person_id=$1", [id]); },
      record: input => sql.begin(async tx => {
        const person = await requireEntity<Person>(tx, "people", input.personId, true);
        const conversation: Conversation = { id: randomUUID(), personId: person.id, happenedAt: new Date(input.data.happenedAt).toISOString(), notes: input.data.notes, createdAt: now() };
        await tx`INSERT INTO conversations(id,person_id,created_at,payload) VALUES (${conversation.id},${person.id},${conversation.createdAt},${tx.json(conversation)})`;
        const claims: Claim[] = [];
        for (const claim of input.data.claims) claims.push(await writeClaim(tx, person, claim, conversation.id));
        const updated: Person = { ...person, updatedAt: now(), lastConversationAt: !person.lastConversationAt || Date.parse(conversation.happenedAt) > Date.parse(person.lastConversationAt) ? conversation.happenedAt : person.lastConversationAt };
        await tx`UPDATE people SET payload=${tx.json(updated)} WHERE id=${person.id}`;
        return { conversation, claims, person: updated };
      }),
    },
    research: {
      getRun: id => get<ResearchRun>(sql, "research_runs", id),
      saveRun: run => saveRun(sql, run),
      listRuns: async (id, request) => { await requireEntity(sql, "interests", id); return page<ResearchRun>(sql, "research_runs", request, `runs:${id}`, false, "interest_id=$1", [id]); },
      listFacts: async (id, since, request) => { await requireEntity(sql, "interests", id); return page<ResearchFact>(sql, "research_facts", request, `facts:${id}:${since}`, false, `interest_id=$1${since ? " AND effective_at > $2::timestamptz" : ""}`, since ? [id, since] : [id]); },
      upsertFacts: facts => sql.begin(async tx => {
        let inserted = 0;
        for (const fact of facts) {
          researchFactSchema.parse(fact);
          const run = await requireEntity<ResearchRun>(tx, "research_runs", fact.runId);
          if (run.interestId !== fact.interestId) throw conflict("Fact and run must belong to the same interest.");
          const key = createHash("sha256").update(JSON.stringify([fact.source.url, fact.text.trim().replace(/\s+/g, " ").toLowerCase()])).digest("hex");
          const rows = await tx`INSERT INTO research_facts(id,interest_id,run_id,dedup_key,effective_at,created_at,payload) VALUES (${fact.id},${fact.interestId},${fact.runId},${key},${fact.source.publishedAt ?? fact.source.retrievedAt},${fact.createdAt},${tx.json(fact)}) ON CONFLICT(interest_id,dedup_key) DO NOTHING RETURNING id`;
          inserted += rows.length;
        }
        return inserted;
      }),
      findActiveRun: async id => (await sql`SELECT payload FROM research_runs WHERE interest_id=${id} AND status IN ('queued','running') LIMIT 1`)[0]?.payload as ResearchRun ?? null,
      createOrReuseRun: run => sql.begin(async tx => {
        await requireEntity(tx, "interests", run.interestId, true);
        const active = (await tx`SELECT payload FROM research_runs WHERE interest_id=${run.interestId} AND status IN ('queued','running') LIMIT 1`)[0]?.payload as ResearchRun | undefined;
        if (active) return active;
        await saveRun(tx, run); await enqueue(tx, { kind: "research", runId: run.id }); return run;
      }),
    },
    decks: {
      get: id => get<Deck>(sql, "decks", id),
      list: async (id, request) => { await requireEntity(sql, "people", id); return page<Deck>(sql, "decks", request, `decks:${id}`, false, "person_id=$1", [id]); },
      save: record => sql.begin(async tx => writeDeck(tx, record)),
      getSnapshot: async id => (await sql`SELECT snapshot FROM decks WHERE id=${id}`)[0]?.snapshot as DeckSnapshot ?? null,
      findReusable: async (id, fingerprint) => (await sql`SELECT payload FROM decks WHERE person_id=${id} AND fingerprint=${fingerprint} AND status IN ('queued','running','completed') ORDER BY created_at DESC,id DESC LIMIT 1`)[0]?.payload as Deck ?? null,
      createOrReuse: (record, force) => sql.begin(async tx => {
        await requireEntity(tx, "people", record.deck.personId, true);
        const existing = (await tx`SELECT payload FROM decks WHERE person_id=${record.deck.personId} AND fingerprint=${record.fingerprint} AND (status IN ('queued','running') OR (${!force} AND status='completed')) ORDER BY created_at DESC,id DESC LIMIT 1`)[0]?.payload as Deck | undefined;
        if (existing) return existing;
        await writeDeck(tx, record); await enqueue(tx, { kind: "deck", deckId: record.deck.id }); return record.deck;
      }),
    },
    jobs: {
      enqueue: job => enqueue(sql, job),
      claim: (workerId, leaseSeconds = 300) => sql.begin(async tx => {
        // Exhausted leases become terminal rather than being silently abandoned.
        const exhausted = await tx`UPDATE jobs SET status='failed',worker_id=NULL,lease_until=NULL,last_error='Worker lease expired after final attempt' WHERE status='running' AND lease_until < now() AND attempts >= 3 RETURNING kind,entity_id`;
        const failure = { code: "INTERNAL_ERROR", message: "Worker lease expired after final attempt.", retryable: true };
        for (const job of exhausted) {
          if (job.kind === "claim_check") {
            const claim = await get<Claim>(tx, "claims", job.entity_id as string, true);
            if (claim && (claim.checkStatus === "queued" || claim.checkStatus === "running")) await tx`UPDATE claims SET payload=${tx.json({ ...claim, checkStatus: "failed", contradictions: [], checkFailure: failure })} WHERE id=${claim.id}`;
          } else if (job.kind === "research") {
            const run = await get<ResearchRun>(tx, "research_runs", job.entity_id as string, true);
            if (run && (run.status === "queued" || run.status === "running")) await tx`UPDATE research_runs SET status='failed',payload=${tx.json({ ...run, status: "failed", finishedAt: now(), failure })} WHERE id=${run.id}`;
          } else if (job.kind === "deck") {
            const deck = await get<Deck>(tx, "decks", job.entity_id as string, true);
            if (deck && (deck.status === "queued" || deck.status === "running")) await tx`UPDATE decks SET status='failed',payload=${tx.json({ ...deck, status: "failed", finishedAt: now(), cards: [], failure })} WHERE id=${deck.id}`;
          }
        }
        for (;;) {
          const rows = await tx`WITH candidate AS (SELECT id FROM jobs WHERE attempts < 3 AND ((status='queued' AND available_at <= now()) OR (status='running' AND lease_until < now())) ORDER BY available_at,id FOR UPDATE SKIP LOCKED LIMIT 1) UPDATE jobs SET status='running',attempts=attempts+1,worker_id=${workerId},lease_until=now()+${leaseSeconds}*interval '1 second' FROM candidate WHERE jobs.id=candidate.id RETURNING jobs.id,jobs.payload,jobs.attempts`;
          if (!rows[0]) return null;
          const leased = { id: rows[0].id as string, job: rows[0].payload as Job, attempts: rows[0].attempts as number };
          let superseded = false;
          if (leased.job.kind === "research") {
            const run = await get<ResearchRun>(tx, "research_runs", leased.job.runId);
            if (!run) superseded = true;
            else if (run.status === "failed") {
              await requireEntity(tx, "interests", run.interestId, true);
              superseded = (await tx`SELECT id FROM research_runs WHERE interest_id=${run.interestId} AND id<>${run.id} AND status IN ('queued','running') LIMIT 1`).length > 0;
              if (!superseded) await saveRun(tx, { ...run, status: "queued", failure: null, finishedAt: null });
            }
          } else if (leased.job.kind === "deck") {
            const deck = await get<Deck>(tx, "decks", leased.job.deckId);
            if (!deck) superseded = true;
            else if (deck.status === "failed") {
              await requireEntity(tx, "people", deck.personId, true);
              const own = (await tx`SELECT fingerprint FROM decks WHERE id=${deck.id}`)[0];
              superseded = (await tx`SELECT id FROM decks WHERE person_id=${deck.personId} AND fingerprint=${own.fingerprint as string} AND id<>${deck.id} AND status IN ('queued','running') LIMIT 1`).length > 0;
              if (!superseded) await tx`UPDATE decks SET status='queued',payload=${tx.json({ ...deck, status: "queued", finishedAt: null, failure: null, cards: [] })} WHERE id=${deck.id}`;
            }
          }
          if (!superseded) return leased;
          await tx`UPDATE jobs SET status='completed',worker_id=NULL,lease_until=NULL,last_error='Superseded by a newer active job' WHERE id=${leased.id}`;
        }
      }),
      complete: async (id, workerId) => { await sql`UPDATE jobs SET status='completed',worker_id=NULL,lease_until=NULL WHERE id=${id} AND worker_id=${workerId} AND status='running'`; },
      fail: async (id, workerId, error) => { await sql`UPDATE jobs SET status=CASE WHEN attempts >= 3 THEN 'failed' ELSE 'queued' END,available_at=now()+least(300,power(2,attempts)*5)*interval '1 second',worker_id=NULL,lease_until=NULL,last_error=${error.slice(0,2000)} WHERE id=${id} AND worker_id=${workerId} AND status='running'`; },
    },
  };
  return repository;
}
