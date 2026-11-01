import "server-only";
import type { AliasService } from "@/contracts";
import { notImplemented } from "@/lib/not-implemented";

// Composition root: replace individual stubs with use cases; retain these signatures.
export const service: AliasService = {
  getIdentity: async () => notImplemented("identity.get"),
  saveIdentity: async (_input) => notImplemented("identity.save"),
  listInterests: async (_input) => notImplemented("interests.list"),
  createInterest: async (_input) => notImplemented("interests.create"),
  updateInterest: async (_input) => notImplemented("interests.update"),
  deleteInterest: async (_input) => notImplemented("interests.delete"),
  listPeople: async (_input) => notImplemented("people.list"),
  getPerson: async (_input) => notImplemented("people.get"),
  createPerson: async (_input) => notImplemented("people.create"),
  updatePerson: async (_input) => notImplemented("people.update"),
  deletePerson: async (_input) => notImplemented("people.delete"),
  listClaims: async (_input) => notImplemented("claims.list"),
  createClaim: async (_input) => notImplemented("claims.create"),
  getClaim: async (_input) => notImplemented("claims.get"),
  recordConversation: async (_input) => notImplemented("conversations.record"),
  listConversations: async (_input) => notImplemented("conversations.list"),
  startResearch: async (_input) => notImplemented("research.start"),
  getResearchRun: async (_input) => notImplemented("research.getRun"),
  listResearchRuns: async (_input) => notImplemented("research.listRuns"),
  listResearchFacts: async (_input) => notImplemented("research.listFacts"),
  buildDeck: async (_input) => notImplemented("decks.build"),
  getDeck: async (_input) => notImplemented("decks.get"),
  listDecks: async (_input) => notImplemented("decks.list"),
};
