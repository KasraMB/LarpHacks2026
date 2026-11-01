import "server-only";
import { notImplemented } from "@/lib/not-implemented";
import type { ClaimCheckWorker, DeckWorker, ResearchScheduler, ResearchWorker } from "./ports";

export const researchWorker: ResearchWorker = { execute: async (_runId) => notImplemented("Research worker") };
export const deckWorker: DeckWorker = { execute: async (_deckId) => notImplemented("Deck worker") };
export const claimCheckWorker: ClaimCheckWorker = { execute: async (_claimId) => notImplemented("Claim check worker") };
export const researchScheduler: ResearchScheduler = { enqueueDaily: async () => notImplemented("Daily research scheduler") };
