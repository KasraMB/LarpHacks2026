import type { Card, Claim, Conversation, Deck, Identity, Interest, Person, ResearchFact, ResearchRun } from "@/contracts";

// Static contract examples only. These are not seeded into a DB or used by live APIs.
const at = "2026-11-01T12:00:00.000Z";
const before = "2026-10-25T12:00:00.000Z";
export const identity = { id: "identity_demo", name: "Alex", background: "A basketball fan", createdAt: before, updatedAt: at } satisfies Identity;
export const interest = { id: "interest_nba", identityId: identity.id, name: "NBA", searchTerms: ["NBA"], feedUrls: [], createdAt: before, updatedAt: at } satisfies Interest;
export const person = { id: "person_dana", identityId: identity.id, name: "Dana", notes: "Colleague", interestIds: [interest.id], lastConversationAt: before, createdAt: before, updatedAt: at } satisfies Person;
export const conversation = { id: "conversation_demo", personId: person.id, happenedAt: before, notes: "Basketball chat", createdAt: before } satisfies Conversation;
export const claim = {
  id: "claim_demo", personId: person.id, conversationId: conversation.id, text: "I follow the Raptors",
  interestId: interest.id, saidAt: before, createdAt: before, checkStatus: "completed", contradictions: [], checkFailure: null,
} satisfies Claim;
export const researchRun = {
  id: "run_demo", interestId: interest.id, status: "completed", trigger: "manual", createdAt: at,
  startedAt: at, finishedAt: at, factCount: 1, sourceErrors: [], failure: null,
} satisfies ResearchRun;
export const researchFact = {
  id: "fact_demo", interestId: interest.id, runId: researchRun.id, text: "Fictional fixture: the Raptors announced a lineup change.",
  kind: "reported_fact", source: { url: "https://example.com/demo-news", title: "Fictional demo article", kind: "rss", publishedAt: at, retrievedAt: at }, createdAt: at,
} satisfies ResearchFact;
export const cards: Card[] = [
  { id: "card_back", deckId: "deck_demo", type: "back_story", interestIds: [interest.id], prompt: "What did you tell Dana?", answer: claim.text, evidence: [{ kind: "claim", claimId: claim.id }], position: 0 },
  { id: "card_news", deckId: "deck_demo", type: "what_changed", interestIds: [interest.id], prompt: "What changed?", answer: researchFact.text, evidence: [{ kind: "research", factId: researchFact.id, sourceUrl: researchFact.source.url }], position: 1 },
  { id: "card_ask", deckId: "deck_demo", type: "if_she_asks", interestIds: [interest.id], prompt: "Which team do you follow?", answer: "The Raptors", evidence: [{ kind: "claim", claimId: claim.id }], position: 2 },
  { id: "card_trap", deckId: "deck_demo", type: "dont_say", interestIds: [interest.id], prompt: "Which claim would conflict?", answer: "Saying you have never followed basketball", evidence: [{ kind: "claim", claimId: claim.id }], position: 3 },
];
export const deck = {
  id: "deck_demo", personId: person.id, status: "completed", createdAt: at, finishedAt: at,
  researchSince: before, claimIds: [claim.id], factIds: [researchFact.id], cards, warnings: [], failure: null,
} satisfies Deck;
