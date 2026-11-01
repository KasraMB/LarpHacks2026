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
async function rawGet<T>(db: Db, table: string, id: string, lock = false): Promise<T | null> {
  const rows = await db.unsafe(`SELECT payload FROM ${table} WHERE id=$1${lock ? " FOR UPDATE" : ""}`, [id]);
  return rows[0]?.payload as T ?? null;
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
  const previous = await rawGet<Deck>(db, "decks", record.deck.id, true);
  const deck = deckSchema.parse(previous ? { ...record.deck, personId: previous.personId, createdAt: previous.createdAt, researchSince: previous.researchSince, claimIds: previous.claimIds, factIds: previous.factIds } : record.deck);
  // A worker may change lifecycle/results but never replace the original snapshot.
  const written = await db`INSERT INTO decks(id,person_id,fingerprint,status,created_at,snapshot,payload) VALUES (${deck.id},${deck.personId},${fingerprint},${deck.status},${deck.createdAt},${db.json(snapshot as unknown as postgres.JSONValue)},${db.json(deck)}) ON CONFLICT(id) DO UPDATE SET status=excluded.status,payload=excluded.payload WHERE decks.person_id=excluded.person_id RETURNING id`;
  if (!written.length) throw missing();
  await db`DELETE FROM cards WHERE deck_id=${deck.id}`;
  for (const card of deck.cards) await db`INSERT INTO cards(id,deck_id,position,payload) VALUES (${card.id},${deck.id},${card.position},${db.json(card)})`;
  return deck;
}
export type RepositoryScope = { userId: string } | { system: true };
export interface PostgresRepository extends Repository {
  close(): Promise<void>;
  /** An immutable request scope sharing this repository's connection pool. */
  forUser(userId: string): PostgresRepository;
}
export function createPostgresRepository(databaseUrl: string, scope: RepositoryScope = { system: true }): PostgresRepository {
  return scopedRepository(postgres(databaseUrl, { max: 10 }), scope, true);
}
function scopedRepository(sql: postgres.Sql, scope: RepositoryScope, ownsPool: boolean): PostgresRepository {
  const userId = "userId" in scope ? scope.userId : null;
  if (userId !== null && !userId.trim()) throw new Error("A repository user scope requires a nonempty user ID.");
  const cursorScope = (value: string) => JSON.stringify([userId === null ? "system" : "user", userId, value]);
  const identityOwner = (identity: string, position: number) => `EXISTS (SELECT 1 FROM identities tenant_identity WHERE tenant_identity.id=${identity} AND tenant_identity.owner_user_id=$${position})`;
  const readable = (table: string, position: number): string => {
    if (userId === null) return "TRUE";
    if (table === "identities") return `${table}.owner_user_id=$${position}`;
    if (table === "people") return identityOwner(`${table}.identity_id`, position);
    if (table === "interests") return `(${table}.visibility='public' OR ${identityOwner(`${table}.identity_id`, position)})`;
    if (table === "research_runs" || table === "research_facts") return `EXISTS (SELECT 1 FROM interests WHERE interests.id=${table}.interest_id AND ${readable("interests", position)})`;
    if (table === "claims" || table === "conversations" || table === "decks") return `EXISTS (SELECT 1 FROM people WHERE people.id=${table}.person_id AND ${identityOwner("people.identity_id", position)})`;
    throw new Error(`No tenant scope is defined for ${table}.`);
  };
  const get = async <T>(db: Db, table: string, id: string, lock = false): Promise<T | null> => {
    const values = userId === null ? [id] : [id, userId];
    const rows = await db.unsafe(`SELECT payload FROM ${table} WHERE id=$1 AND ${readable(table, 2)}${lock ? " FOR UPDATE" : ""}`, values);
    return rows[0]?.payload as T ?? null;
  };
  const requireEntity = async <T>(db: Db, table: string, id: string, lock = false): Promise<T> => {
    const entity = await get<T>(db, table, id, lock);
    if (!entity) throw missing();
    return entity;
  };
  const requireOwnedInterest = async (db: Db, id: string): Promise<Interest> => {
    const interest = await requireEntity<Interest>(db, "interests", id, true);
    if (userId !== null && !(await db`SELECT id FROM identities WHERE id=${interest.identityId} AND owner_user_id=${userId}`).length) throw missing();
    return interest;
  };
  const scopedPage = <T extends Entity>(db: Db, table: string, request: PageRequest, name: string, ascending: boolean, filter = "TRUE", parameters: string[] = []): Promise<Page<T>> => {
    const values = userId === null ? parameters : [...parameters, userId];
    return page<T>(db, table, request, cursorScope(name), ascending, `(${filter}) AND ${readable(table, values.length)}`, values);
  };
  const identityGet = async (db: Db): Promise<Identity | null> => {
    const rows = userId === null
      ? await db`SELECT payload FROM identities WHERE owner_user_id IS NULL ORDER BY id LIMIT 1`
      : await db`SELECT payload FROM identities WHERE owner_user_id=${userId}`;
    return rows[0]?.payload as Identity ?? null;
  };
  const requireIdentity = async (db: Db) => { const identity = await identityGet(db); if (!identity) throw missing(); return identity; };
  const validateInterests = async (db: Db, ids: string[]) => {
    for (const id of new Set(ids)) await requireEntity<Interest>(db, "interests", id, true);
  };
  const requireSystem = () => { if (userId !== null) throw missing(); };
  const writePerson = async (db: Db, person: Person) => {
    const written = await db`INSERT INTO people(id,identity_id,created_at,payload) VALUES (${person.id},${person.identityId},${person.createdAt},${db.json(person)}) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload WHERE people.identity_id=excluded.identity_id RETURNING id`;
    if (!written.length) throw missing();
    await db`DELETE FROM person_interests WHERE person_id=${person.id}`;
    for (const id of new Set(person.interestIds)) await db`INSERT INTO person_interests(person_id,interest_id) VALUES (${person.id},${id})`;
    return person;
  };
  const writeClaim = async (db: Db, person: Person, input: Parameters<Repository["claims"]["create"]>[1], conversationId: string | null): Promise<Claim> => {
    if (input.interestId && !person.interestIds.includes(input.interestId)) throw conflict("Claim topic must be linked to the person.");
    if (input.interestId) await requireEntity(db, "interests", input.interestId, true);
    const claim: Claim = { ...input, saidAt: new Date(input.saidAt).toISOString(), id: randomUUID(), personId: person.id, conversationId, createdAt: now(), checkStatus: "queued", contradictions: [], checkFailure: null };
    await db`INSERT INTO claims(id,person_id,conversation_id,interest_id,created_at,payload) VALUES (${claim.id},${person.id},${conversationId},${claim.interestId},${claim.createdAt},${db.json(claim)})`;
    await enqueue(db, { kind: "claim_check", claimId: claim.id });
    return claim;
  };
  const saveRun = async (db: Db, run: ResearchRun) => {
    run = researchRunSchema.parse(run);
    const written = await db`INSERT INTO research_runs(id,interest_id,status,created_at,payload) VALUES (${run.id},${run.interestId},${run.status},${run.createdAt},${db.json(run)}) ON CONFLICT(id) DO UPDATE SET status=excluded.status,payload=excluded.payload WHERE research_runs.interest_id=excluded.interest_id RETURNING id`;
    if (!written.length) throw missing();
    return run;
  };
  const repository: PostgresRepository = {
    close: () => ownsPool ? sql.end() : Promise.resolve(),
    forUser: id => scopedRepository(sql, { userId: id }, false),
    identity: {
      get: () => identityGet(sql),
      save: input => sql.begin(async tx => {
        if (userId === null) await tx`SELECT pg_advisory_xact_lock(281924613)`;
        else await tx`SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 281924613))`;
        const existing = await identityGet(tx); const date = now();
        const identity: Identity = { ...input, id: existing?.id ?? randomUUID(), createdAt: existing?.createdAt ?? date, updatedAt: date };
        const written = await tx`INSERT INTO identities(id,owner_user_id,payload) VALUES (${identity.id},${userId},${tx.json(identity)}) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload WHERE identities.owner_user_id IS NOT DISTINCT FROM excluded.owner_user_id RETURNING id`;
        if (!written.length) throw missing();
        return identity;
      }),
    },
    interests: {
      get: id => get<Interest>(sql, "interests", id),
      list: request => scopedPage<Interest>(sql, "interests", request, "interests", true),
      create: input => sql.begin(async tx => {
        const identity = await requireIdentity(tx); const date = now();
        const interest: Interest = { ...input, visibility: input.visibility ?? "private", ownerUserId: userId, id: randomUUID(), identityId: identity.id, createdAt: date, updatedAt: date };
        await tx`INSERT INTO interests(id,identity_id,visibility,created_at,payload) VALUES (${interest.id},${identity.id},${interest.visibility},${date},${tx.json(interest)})`;
        return interest;
      }),
      update: (id, input) => sql.begin(async tx => {
        const previous = await requireOwnedInterest(tx, id);
        if (previous.visibility === "public" && input.visibility !== "public" && (await tx`
          SELECT 1 FROM person_interests
          JOIN people ON people.id=person_interests.person_id
          WHERE person_interests.interest_id=${id} AND people.identity_id<>${previous.identityId} LIMIT 1
        `).length) throw conflict("A shared skill cannot be made private while it is in use.");
        const interest: Interest = { ...previous, ...input, visibility: input.visibility ?? "private", ownerUserId: previous.ownerUserId ?? null, updatedAt: now() };
        await tx`UPDATE interests SET visibility=${interest.visibility},payload=${tx.json(interest)} WHERE id=${id}`; return interest;
      }),
      delete: id => sql.begin(async tx => {
        await requireOwnedInterest(tx, id);
        if ((await tx`SELECT person_id FROM person_interests WHERE interest_id=${id} LIMIT 1`).length) throw conflict("Unlink the skill before deleting it; the skill is still in use.");
        // Historical claims retain their text; deleted topic references are cleared.
        await tx`UPDATE claims SET payload=jsonb_set(payload,'{interestId}','null'::jsonb) WHERE interest_id=${id}`;
        await tx`DELETE FROM jobs WHERE kind='research' AND entity_id IN (SELECT id FROM research_runs WHERE interest_id=${id})`;
        await tx`DELETE FROM interests WHERE id=${id}`;
      }),
    },
    people: {
      get: id => get<Person>(sql, "people", id),
      list: request => scopedPage<Person>(sql, "people", request, "people", true),
      create: input => sql.begin(async tx => {
        const identity = await requireIdentity(tx); await validateInterests(tx, input.interestIds); const date = now();
        return writePerson(tx, { ...input, interestIds: [...new Set(input.interestIds)], id: randomUUID(), identityId: identity.id, createdAt: date, updatedAt: date, lastConversationAt: null });
      }),
      update: (id, input) => sql.begin(async tx => {
        const person = await requireEntity<Person>(tx, "people", id, true); await validateInterests(tx, input.interestIds);
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
      list: async (id, request) => { await requireEntity(sql, "people", id); return scopedPage<Claim>(sql, "claims", request, `claims:${id}`, false, "person_id=$1", [id]); },
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
      list: async (id, request) => { await requireEntity(sql, "people", id); return scopedPage<Conversation>(sql, "conversations", request, `conversations:${id}`, false, "person_id=$1", [id]); },
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
      saveRun: run => sql.begin(async tx => {
        await requireEntity(tx, "interests", run.interestId, true);
        const previous = await rawGet<ResearchRun>(tx, "research_runs", run.id, true);
        if (previous && previous.interestId !== run.interestId) throw missing();
        return saveRun(tx, run);
      }),
      listRuns: async (id, request) => { await requireEntity(sql, "interests", id); return scopedPage<ResearchRun>(sql, "research_runs", request, `runs:${id}`, false, "interest_id=$1", [id]); },
      listFacts: async (id, since, request) => { await requireEntity(sql, "interests", id); return scopedPage<ResearchFact>(sql, "research_facts", request, `facts:${id}:${since}`, false, `interest_id=$1${since ? " AND effective_at > $2::timestamptz" : ""}`, since ? [id, since] : [id]); },
      upsertFacts: facts => sql.begin(async tx => {
        let inserted = 0;
        for (const fact of facts) {
          researchFactSchema.parse(fact);
          await requireEntity(tx, "interests", fact.interestId, true);
          const run = await requireEntity<ResearchRun>(tx, "research_runs", fact.runId);
          if (run.interestId !== fact.interestId) throw conflict("Fact and run must belong to the same interest.");
          const key = createHash("sha256").update(JSON.stringify([fact.source.url, fact.text.trim().replace(/\s+/g, " ").toLowerCase()])).digest("hex");
          const rows = await tx`INSERT INTO research_facts(id,interest_id,run_id,dedup_key,effective_at,created_at,payload) VALUES (${fact.id},${fact.interestId},${fact.runId},${key},${fact.source.publishedAt ?? fact.source.retrievedAt},${fact.createdAt},${tx.json(fact)}) ON CONFLICT(interest_id,dedup_key) DO NOTHING RETURNING id`;
          inserted += rows.length;
        }
        return inserted;
      }),
      findActiveRun: async id => { await requireEntity(sql, "interests", id); return (await sql`SELECT payload FROM research_runs WHERE interest_id=${id} AND status IN ('queued','running') LIMIT 1`)[0]?.payload as ResearchRun ?? null; },
      createOrReuseRun: run => sql.begin(async tx => {
        await requireEntity(tx, "interests", run.interestId, true);
        const previous = await rawGet<ResearchRun>(tx, "research_runs", run.id, true);
        if (previous && previous.interestId !== run.interestId) throw missing();
        const active = (await tx`SELECT payload FROM research_runs WHERE interest_id=${run.interestId} AND status IN ('queued','running') LIMIT 1`)[0]?.payload as ResearchRun | undefined;
        if (active) return active;
        await saveRun(tx, run); await enqueue(tx, { kind: "research", runId: run.id }); return run;
      }),
    },
    decks: {
      get: id => get<Deck>(sql, "decks", id),
      list: async (id, request) => { await requireEntity(sql, "people", id); return scopedPage<Deck>(sql, "decks", request, `decks:${id}`, false, "person_id=$1", [id]); },
      save: record => sql.begin(async tx => {
        await requireEntity(tx, "people", record.deck.personId, true);
        const previous = await rawGet<Deck>(tx, "decks", record.deck.id, true);
        if (previous && previous.personId !== record.deck.personId) throw missing();
        return writeDeck(tx, record);
      }),
      getSnapshot: async id => { if (!await get<Deck>(sql, "decks", id)) return null; return (await sql`SELECT snapshot FROM decks WHERE id=${id}`)[0]?.snapshot as DeckSnapshot ?? null; },
      findReusable: async (id, fingerprint) => { await requireEntity(sql, "people", id); return (await sql`SELECT payload FROM decks WHERE person_id=${id} AND fingerprint=${fingerprint} AND status IN ('queued','running','completed') ORDER BY created_at DESC,id DESC LIMIT 1`)[0]?.payload as Deck ?? null; },
      createOrReuse: (record, force) => sql.begin(async tx => {
        await requireEntity(tx, "people", record.deck.personId, true);
        const previous = await rawGet<Deck>(tx, "decks", record.deck.id, true);
        if (previous && previous.personId !== record.deck.personId) throw missing();
        const existing = (await tx`SELECT payload FROM decks WHERE person_id=${record.deck.personId} AND fingerprint=${record.fingerprint} AND (status IN ('queued','running') OR (${!force} AND status='completed')) ORDER BY created_at DESC,id DESC LIMIT 1`)[0]?.payload as Deck | undefined;
        if (existing) return existing;
        await writeDeck(tx, record); await enqueue(tx, { kind: "deck", deckId: record.deck.id }); return record.deck;
      }),
    },
    jobs: {
      enqueue: job => sql.begin(async tx => {
        if (job.kind === "research") await requireEntity(tx, "research_runs", job.runId, true);
        else if (job.kind === "deck") await requireEntity(tx, "decks", job.deckId, true);
        else await requireEntity(tx, "claims", job.claimId, true);
        await enqueue(tx, job);
      }),
      claim: (workerId, leaseSeconds = 300) => sql.begin(async tx => {
        requireSystem();
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
      complete: async (id, workerId) => { requireSystem(); await sql`UPDATE jobs SET status='completed',worker_id=NULL,lease_until=NULL WHERE id=${id} AND worker_id=${workerId} AND status='running'`; },
      fail: async (id, workerId, error) => { requireSystem(); await sql`UPDATE jobs SET status=CASE WHEN attempts >= 3 THEN 'failed' ELSE 'queued' END,available_at=now()+least(300,power(2,attempts)*5)*interval '1 second',worker_id=NULL,lease_until=NULL,last_error=${error.slice(0,2000)} WHERE id=${id} AND worker_id=${workerId} AND status='running'`; },
    },
  };
  return repository;
}
