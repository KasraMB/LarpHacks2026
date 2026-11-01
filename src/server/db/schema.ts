import { sql } from "drizzle-orm";
import { pgTable, text, jsonb, timestamp, boolean, bigint, integer, uniqueIndex, index, check, unique } from "drizzle-orm/pg-core";
const createdAt = () => timestamp("created_at", { withTimezone: true, mode: "string" }).notNull();
const payload = () => jsonb("payload").notNull();
// Better Auth uses Date-valued timestamps; domain payloads keep ISO strings.
const authTimestamp = (name: string) => timestamp(name, { withTimezone: true, mode: "date" }).notNull();
export const authUser = pgTable("auth_user", {
  id: text("id").primaryKey(), name: text("name").notNull(), email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false), image: text("image"),
  createdAt: authTimestamp("created_at").defaultNow(), updatedAt: authTimestamp("updated_at").defaultNow(),
});
export const authSession = pgTable("auth_session", {
  id: text("id").primaryKey(), expiresAt: authTimestamp("expires_at"), token: text("token").notNull().unique(),
  createdAt: authTimestamp("created_at").defaultNow(), updatedAt: authTimestamp("updated_at").defaultNow(),
  ipAddress: text("ip_address"), userAgent: text("user_agent"), userId: text("user_id").notNull().references(() => authUser.id, { onDelete: "cascade" }),
}, t => [index("auth_session_user").on(t.userId)]);
export const authAccount = pgTable("auth_account", {
  id: text("id").primaryKey(), accountId: text("account_id").notNull(), providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => authUser.id, { onDelete: "cascade" }),
  accessToken: text("access_token"), refreshToken: text("refresh_token"), idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true, mode: "date" }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true, mode: "date" }),
  scope: text("scope"), password: text("password"),
  createdAt: authTimestamp("created_at").defaultNow(), updatedAt: authTimestamp("updated_at").defaultNow(),
}, t => [index("auth_account_user").on(t.userId), unique("auth_account_provider_account").on(t.providerId, t.accountId)]);
export const authVerification = pgTable("auth_verification", {
  id: text("id").primaryKey(), identifier: text("identifier").notNull(), value: text("value").notNull(),
  expiresAt: authTimestamp("expires_at"), createdAt: authTimestamp("created_at").defaultNow(), updatedAt: authTimestamp("updated_at").defaultNow(),
}, t => [index("auth_verification_identifier").on(t.identifier)]);
export const authRateLimit = pgTable("auth_rate_limit", {
  id: text("id").primaryKey(), key: text("key").notNull().unique(), count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});
export const identities = pgTable("identities", { id: text("id").primaryKey(), singleton: integer("singleton").notNull().default(1), ownerUserId: text("owner_user_id").references(() => authUser.id), payload: payload() }, t => [uniqueIndex("identity_owner_user").on(t.ownerUserId), uniqueIndex("identity_unowned_singleton").on(t.singleton).where(sql`${t.ownerUserId} IS NULL`), check("identities_singleton_check", sql`${t.singleton} = 1`)]);
export const interests = pgTable("interests", { id: text("id").primaryKey(), identityId: text("identity_id").notNull().references(() => identities.id), visibility: text("visibility").notNull().default("private"), createdAt: createdAt(), payload: payload() }, t => [index("interests_page").on(t.createdAt, t.id), check("interests_visibility_check", sql`${t.visibility} IN ('public','private')`)]);
export const people = pgTable("people", { id: text("id").primaryKey(), identityId: text("identity_id").notNull().references(() => identities.id), createdAt: createdAt(), payload: payload() }, t => [index("people_page").on(t.createdAt, t.id)]);
export const personInterests = pgTable("person_interests", { personId: text("person_id").notNull().references(() => people.id, { onDelete: "cascade" }), interestId: text("interest_id").notNull().references(() => interests.id) }, t => [unique("person_interests_person_id_interest_id_key").on(t.personId, t.interestId)]);
export const conversations = pgTable("conversations", { id: text("id").primaryKey(), personId: text("person_id").notNull().references(() => people.id, { onDelete: "cascade" }), createdAt: createdAt(), payload: payload() }, t => [index("conversations_page").on(t.personId, t.createdAt, t.id)]);
export const claims = pgTable("claims", { id: text("id").primaryKey(), personId: text("person_id").notNull().references(() => people.id, { onDelete: "cascade" }), conversationId: text("conversation_id").references(() => conversations.id, { onDelete: "cascade" }), interestId: text("interest_id").references(() => interests.id, { onDelete: "set null" }), createdAt: createdAt(), payload: payload() }, t => [index("claims_page").on(t.personId, t.createdAt, t.id)]);
export const researchRuns = pgTable("research_runs", { id: text("id").primaryKey(), interestId: text("interest_id").notNull().references(() => interests.id, { onDelete: "cascade" }), status: text("status").notNull(), createdAt: createdAt(), payload: payload() }, t => [uniqueIndex("active_research_run").on(t.interestId).where(sql`${t.status} in ('queued', 'running')`), check("research_runs_status_check", sql`${t.status} IN ('queued','running','completed','failed')`), index("runs_page").on(t.interestId, t.createdAt, t.id)]);
export const researchFacts = pgTable("research_facts", { id: text("id").primaryKey(), interestId: text("interest_id").notNull().references(() => interests.id, { onDelete: "cascade" }), runId: text("run_id").notNull().references(() => researchRuns.id, { onDelete: "cascade" }), dedupKey: text("dedup_key").notNull(), effectiveAt: timestamp("effective_at", { withTimezone: true, mode: "string" }).notNull(), createdAt: createdAt(), payload: payload() }, t => [unique("research_facts_interest_id_dedup_key_key").on(t.interestId, t.dedupKey), index("facts_page").on(t.interestId, t.createdAt, t.id)]);
export const decks = pgTable("decks", { id: text("id").primaryKey(), personId: text("person_id").notNull().references(() => people.id, { onDelete: "cascade" }), fingerprint: text("fingerprint").notNull(), status: text("status").notNull(), createdAt: createdAt(), snapshot: jsonb("snapshot").notNull(), payload: payload() }, t => [uniqueIndex("active_deck").on(t.personId, t.fingerprint).where(sql`${t.status} in ('queued', 'running')`), check("decks_status_check", sql`${t.status} IN ('queued','running','completed','failed')`), index("decks_page").on(t.personId, t.createdAt, t.id)]);
export const cards = pgTable("cards", { id: text("id").primaryKey(), deckId: text("deck_id").notNull().references(() => decks.id, { onDelete: "cascade" }), position: integer("position").notNull(), payload: payload() }, t => [unique("cards_deck_id_position_key").on(t.deckId, t.position), check("cards_position_check", sql`${t.position} >= 0`)]);
export const jobs = pgTable("jobs", { id: text("id").primaryKey(), kind: text("kind").notNull(), entityId: text("entity_id").notNull(), payload: payload(), status: text("status").notNull().default("queued"), attempts: integer("attempts").notNull().default(0), availableAt: timestamp("available_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(), leaseUntil: timestamp("lease_until", { withTimezone: true, mode: "string" }), workerId: text("worker_id"), lastError: text("last_error") }, t => [unique("jobs_kind_entity_id_key").on(t.kind, t.entityId), index("job_poll").on(t.status, t.availableAt), check("jobs_kind_check", sql`${t.kind} IN ('research','deck','claim_check')`), check("jobs_status_check", sql`${t.status} IN ('queued','running','completed','failed')`)]);
