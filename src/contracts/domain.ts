import { z } from "zod";

export const idSchema = z.string().min(1);
export const timestampSchema = z.iso.datetime({ offset: true });
const text = z.string().trim().min(1);
const timestamps = { createdAt: timestampSchema, updatedAt: timestampSchema };

export const identityInputSchema = z.object({ name: text, background: z.string() });
export const identitySchema = identityInputSchema.extend({ id: idSchema, ...timestamps });
export const interestInputSchema = z.object({ name: text, searchTerms: z.array(text), feedUrls: z.array(z.url()) });
export const interestSchema = interestInputSchema.extend({ id: idSchema, identityId: idSchema, ...timestamps });
export const personInputSchema = z.object({ name: text, notes: z.string(), interestIds: z.array(idSchema) });
export const personSchema = personInputSchema.extend({
  id: idSchema, identityId: idSchema, lastConversationAt: timestampSchema.nullable(), ...timestamps,
});
export const failureSchema = z.object({ code: z.string(), message: z.string(), retryable: z.boolean() });
export const jobStatusSchema = z.enum(["queued", "running", "completed", "failed"]);
export const contradictionSchema = z.object({ earlierClaimId: idSchema, explanation: text });
export const claimInputSchema = z.object({ text, interestId: idSchema.nullable(), saidAt: timestampSchema });
export const claimSchema = claimInputSchema.extend({
  id: idSchema, personId: idSchema, conversationId: idSchema.nullable(), createdAt: timestampSchema,
  checkStatus: jobStatusSchema, contradictions: z.array(contradictionSchema), checkFailure: failureSchema.nullable(),
}).superRefine((claim, ctx) => {
  if ((claim.checkStatus === "failed") !== (claim.checkFailure !== null)) {
    ctx.addIssue({ code: "custom", path: ["checkFailure"], message: "Only failed checks must include a failure." });
  }
  if (claim.checkStatus !== "completed" && claim.contradictions.length > 0) {
    ctx.addIssue({ code: "custom", path: ["contradictions"], message: "Only completed checks have contradiction results." });
  }
});
export const conversationInputSchema = z.object({
  happenedAt: timestampSchema, notes: z.string(), claims: z.array(claimInputSchema),
});
export const conversationSchema = conversationInputSchema.omit({ claims: true }).extend({
  id: idSchema, personId: idSchema, createdAt: timestampSchema,
});
export const sourceKindSchema = z.enum(["rss", "google_news", "hacker_news", "reddit", "wikipedia"]);
export const sourceSchema = z.object({
  url: z.url(), title: text, kind: sourceKindSchema, publishedAt: timestampSchema.nullable(), retrievedAt: timestampSchema,
});
export const researchFactSchema = z.object({
  id: idSchema, interestId: idSchema, runId: idSchema, text,
  kind: z.enum(["reported_fact", "fan_reaction", "context"]), source: sourceSchema, createdAt: timestampSchema,
});
export const researchRunSchema = z.object({
  id: idSchema, interestId: idSchema, status: jobStatusSchema,
  trigger: z.enum(["manual", "cron"]), createdAt: timestampSchema,
  startedAt: timestampSchema.nullable(), finishedAt: timestampSchema.nullable(),
  factCount: z.number().int().nonnegative(), sourceErrors: z.array(failureSchema.extend({ url: z.url().nullable() })),
  failure: failureSchema.nullable(),
}).superRefine((run, ctx) => {
  if ((run.status === "failed") !== (run.failure !== null)) {
    ctx.addIssue({ code: "custom", path: ["failure"], message: "Only failed runs must include a failure." });
  }
  if (["completed", "failed"].includes(run.status) !== (run.finishedAt !== null)) {
    ctx.addIssue({ code: "custom", path: ["finishedAt"], message: "Only terminal runs must include a finish time." });
  }
});
export const evidenceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("claim"), claimId: idSchema }),
  z.object({ kind: z.literal("research"), factId: idSchema, sourceUrl: z.url() }),
]);
export const cardTypeSchema = z.enum(["back_story", "what_changed", "if_she_asks", "dont_say"]);
export const cardSchema = z.object({
  id: idSchema, deckId: idSchema, type: cardTypeSchema, interestIds: z.array(idSchema),
  prompt: text, answer: text, evidence: z.array(evidenceSchema).min(1), position: z.number().int().nonnegative(),
});
export const deckSchema = z.object({
  id: idSchema, personId: idSchema, status: jobStatusSchema, createdAt: timestampSchema,
  finishedAt: timestampSchema.nullable(), researchSince: timestampSchema.nullable(),
  claimIds: z.array(idSchema), factIds: z.array(idSchema), cards: z.array(cardSchema),
  warnings: z.array(z.string()), failure: failureSchema.nullable(),
}).superRefine((deck, ctx) => {
  if ((deck.status === "failed") !== (deck.failure !== null)) {
    ctx.addIssue({ code: "custom", path: ["failure"], message: "Only failed decks must include a failure." });
  }
  if (["completed", "failed"].includes(deck.status) !== (deck.finishedAt !== null)) {
    ctx.addIssue({ code: "custom", path: ["finishedAt"], message: "Only terminal decks must include a finish time." });
  }
  if (deck.status !== "completed" && deck.cards.length > 0) {
    ctx.addIssue({ code: "custom", path: ["cards"], message: "Only completed decks can expose cards." });
  }
  const ids = new Set<string>();
  const positions = new Set<number>();
  deck.cards.forEach((card, index) => {
    if (card.deckId !== deck.id || ids.has(card.id) || positions.has(card.position)) {
      ctx.addIssue({ code: "custom", path: ["cards", index], message: "Cards must belong to the deck and have unique IDs and positions." });
    }
    ids.add(card.id);
    positions.add(card.position);
    for (const evidence of card.evidence) {
      if (evidence.kind === "claim" ? !deck.claimIds.includes(evidence.claimId) : !deck.factIds.includes(evidence.factId)) {
        ctx.addIssue({ code: "custom", path: ["cards", index, "evidence"], message: "Evidence must reference the deck input snapshot." });
      }
    }
  });
});

export type Identity = z.infer<typeof identitySchema>;
export type Interest = z.infer<typeof interestSchema>;
export type Person = z.infer<typeof personSchema>;
export type Claim = z.infer<typeof claimSchema>;
export type Conversation = z.infer<typeof conversationSchema>;
export type ResearchFact = z.infer<typeof researchFactSchema>;
export type ResearchRun = z.infer<typeof researchRunSchema>;
export type Card = z.infer<typeof cardSchema>;
export type Deck = z.infer<typeof deckSchema>;
export type Failure = z.infer<typeof failureSchema>;
