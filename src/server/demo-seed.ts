import postgres from "postgres";
import { createHash } from "node:crypto";
import { claimSchema, deckSchema, researchFactSchema, researchRunSchema, type Claim, type Deck, type Identity, type Interest, type Person } from "@/contracts";
import type { DeckSnapshot } from "./ports";
import { FEATHERLESS_PROMPT_VERSION } from "./ai";

/** Explicit offline demo; every research item is labelled fictional. No live AI calls. */
export async function seedDemo(databaseUrl: string): Promise<void> {
  const sql = postgres(databaseUrl, { max: 1 });
  const now = new Date();
  const ago = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();
  try { await sql.begin(async tx => {
    await tx`SELECT pg_advisory_xact_lock(281924613)`;
    const existing = await tx`SELECT id FROM identities WHERE singleton=1`;
    if (existing.length) {
      if (existing[0].id !== "identity_seed_demo") throw new Error("Demo seed needs an empty database; existing identity was preserved.");
      return; // Idempotent: leave the saved demo and any subsequent edits in place.
    }
    const identity: Identity = { id: "identity_seed_demo", name: "Alex (demo)", background: "Fictional demo: a basketball fan who follows Toronto.", createdAt: ago(8), updatedAt: ago(0) };
    const interest: Interest = { id: "interest_seed_nba", identityId: identity.id, name: "NBA", searchTerms: ["NBA", "Toronto Raptors"], feedUrls: [], createdAt: ago(8), updatedAt: ago(0) };
    const person: Person = { id: "person_seed_dana", identityId: identity.id, name: "Dana", notes: "Fictional colleague for the demo.", interestIds: [interest.id], lastConversationAt: ago(4), createdAt: ago(8), updatedAt: ago(4) };
    const first: Claim = claimSchema.parse({ id: "claim_seed_raptors", personId: person.id, conversationId: null, interestId: interest.id, text: "I have followed the Raptors for years.", saidAt: ago(7), createdAt: ago(7), checkStatus: "completed", contradictions: [], checkFailure: null });
    const second: Claim = claimSchema.parse({ ...first, id: "claim_seed_conflict", conversationId: "conversation_seed", text: "I have never followed the Raptors.", saidAt: ago(4), createdAt: ago(4), contradictions: [{ earlierClaimId: first.id, explanation: "Never following the Raptors conflicts with following them for years." }] });
    const run = researchRunSchema.parse({ id: "run_seed_week", interestId: interest.id, status: "completed", trigger: "manual", createdAt: ago(7), startedAt: ago(7), finishedAt: ago(0), factCount: 7, sourceErrors: [], failure: null });
    const facts = Array.from({ length: 7 }, (_, i) => researchFactSchema.parse({ id: `fact_seed_${i}`, interestId: interest.id, runId: run.id, text: `Fictional demo day ${i + 1}: Toronto's practice recap highlighted teamwork and lineup adjustments.`, kind: i === 6 ? "fan_reaction" : "reported_fact", source: { url: `https://example.com/fictional-nba/day-${i + 1}`, title: "Fictional cached demo research", kind: "rss", publishedAt: ago(6 - i), retrievedAt: ago(6 - i) }, createdAt: ago(6 - i) }));
    const selected = facts.filter(f => Date.parse(f.source.publishedAt!) > Date.parse(person.lastConversationAt!));
    const context = { identity, person, interests: [interest], claims: [second, first], facts: selected, researchSince: person.lastConversationAt };
    const snapshot: DeckSnapshot = { context, model: "offline-demo", promptVersion: FEATHERLESS_PROMPT_VERSION };
    const deckId = "deck_seed_dana";
    const common = { deckId, interestIds: [interest.id] };
    const deck: Deck = deckSchema.parse({ id: deckId, personId: person.id, status: "completed", createdAt: ago(0), finishedAt: ago(0), researchSince: person.lastConversationAt, claimIds: [second.id, first.id], factIds: selected.map(f => f.id), warnings: ["Offline fictional demo. Research is illustrative and must not be presented as real news."], failure: null,
      cards: [
        { ...common, id: "card_seed_back", type: "back_story", position: 0, prompt: "What have you told Dana?", answer: first.text, evidence: [{ kind: "claim", claimId: first.id }] },
        { ...common, id: "card_seed_changed", type: "what_changed", position: 1, prompt: "What is new in this fictional demo?", answer: selected[0].text, evidence: [{ kind: "research", factId: selected[0].id, sourceUrl: selected[0].source.url }] },
        { ...common, id: "card_seed_asks", type: "if_she_asks", position: 2, prompt: "If Dana asks which team you follow?", answer: "You previously said you follow the Raptors. Clarify your conflicting statement honestly.", evidence: [{ kind: "claim", claimId: first.id }] },
        { ...common, id: "card_seed_trap", type: "dont_say", position: 3, prompt: "What contradiction needs clarification?", answer: "You said both that you have followed the Raptors for years and that you never followed them. Explain the discrepancy.", evidence: [{ kind: "claim", claimId: first.id }, { kind: "claim", claimId: second.id }] },
      ] });
    await tx`INSERT INTO identities(id,payload) VALUES (${identity.id},${tx.json(identity)})`;
    await tx`INSERT INTO interests(id,identity_id,created_at,payload) VALUES (${interest.id},${identity.id},${interest.createdAt},${tx.json(interest)})`;
    await tx`INSERT INTO people(id,identity_id,created_at,payload) VALUES (${person.id},${identity.id},${person.createdAt},${tx.json(person)})`;
    await tx`INSERT INTO person_interests(person_id,interest_id) VALUES (${person.id},${interest.id})`;
    const conversation = { id: "conversation_seed", personId: person.id, happenedAt: ago(4), createdAt: ago(4), notes: "Fictional demo conversation." };
    await tx`INSERT INTO conversations(id,person_id,created_at,payload) VALUES (${conversation.id},${person.id},${conversation.createdAt},${tx.json(conversation)})`;
    for (const claim of [first, second]) await tx`INSERT INTO claims(id,person_id,conversation_id,interest_id,created_at,payload) VALUES (${claim.id},${person.id},${claim.conversationId},${interest.id},${claim.createdAt},${tx.json(claim)})`;
    await tx`INSERT INTO research_runs(id,interest_id,status,created_at,payload) VALUES (${run.id},${interest.id},${run.status},${run.createdAt},${tx.json(run)})`;
    for (const fact of facts) await tx`INSERT INTO research_facts(id,interest_id,run_id,dedup_key,effective_at,created_at,payload) VALUES (${fact.id},${interest.id},${run.id},${createHash("sha256").update(JSON.stringify([fact.source.url, fact.text.toLowerCase()])).digest("hex")},${fact.source.publishedAt},${fact.createdAt},${tx.json(fact)})`;
    await tx`INSERT INTO decks(id,person_id,fingerprint,status,created_at,snapshot,payload) VALUES (${deck.id},${person.id},${createHash("sha256").update(JSON.stringify(snapshot)).digest("hex")},${deck.status},${deck.createdAt},${tx.json(snapshot as unknown as postgres.JSONValue)},${tx.json(deck)})`;
    for (const card of deck.cards) await tx`INSERT INTO cards(id,deck_id,position,payload) VALUES (${card.id},${deck.id},${card.position},${tx.json(card)})`;
  }); } finally { await sql.end(); }
}
