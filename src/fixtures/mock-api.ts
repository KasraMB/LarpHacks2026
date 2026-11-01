import type { AliasApi } from "@/contracts";
import { notImplemented } from "@/lib/not-implemented";
import * as f from "./demo";

/** Explicit opt-in for UI development. Static reads, no persistence/pagination/filtering.
 * Writes reject instead of pretending to save. Never import this in server composition.
 */
export const mockApi: AliasApi = {
  getIdentity: async () => structuredClone(f.identity),
  saveIdentity: async () => notImplemented("Mock saveIdentity"),
  listInterests: async () => ({ items: [structuredClone(f.interest)], nextCursor: null }),
  createInterest: async () => notImplemented("Mock createInterest"),
  updateInterest: async () => notImplemented("Mock updateInterest"),
  deleteInterest: async () => notImplemented("Mock deleteInterest"),
  listPeople: async () => ({ items: [structuredClone(f.person)], nextCursor: null }),
  getPerson: async () => structuredClone(f.person),
  createPerson: async () => notImplemented("Mock createPerson"),
  updatePerson: async () => notImplemented("Mock updatePerson"),
  deletePerson: async () => notImplemented("Mock deletePerson"),
  listClaims: async () => ({ items: [structuredClone(f.claim)], nextCursor: null }),
  createClaim: async () => notImplemented("Mock createClaim"),
  getClaim: async () => structuredClone(f.claim),
  recordConversation: async () => notImplemented("Mock recordConversation"),
  listConversations: async () => ({ items: [structuredClone(f.conversation)], nextCursor: null }),
  startResearch: async () => notImplemented("Mock startResearch"),
  getResearchRun: async () => structuredClone(f.researchRun),
  listResearchRuns: async () => ({ items: [structuredClone(f.researchRun)], nextCursor: null }),
  listResearchFacts: async () => ({ items: [structuredClone(f.researchFact)], nextCursor: null }),
  buildDeck: async () => notImplemented("Mock buildDeck"),
  getDeck: async () => structuredClone(f.deck),
  listDecks: async () => ({ items: [structuredClone(f.deck)], nextCursor: null }),
};
