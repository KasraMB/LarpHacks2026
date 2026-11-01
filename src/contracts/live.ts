import { z } from "zod";
import { cardSchema, failureSchema, timestampSchema } from "./domain";

/** Separate streaming transport; existing /api/v1 operations remain unchanged. */
export const liveRequestSchema = z.object({
  deckId: z.string().min(1).max(200),
  transcript: z.string().trim().min(2).max(1_600),
  revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).default(0),
  /** Fast retrieval-only updates can continue while a slower generation is in flight. */
  generate: z.boolean().default(true),
}).strict();

export const liveEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("matches"), revision: z.number().int().nonnegative(),
    cards: z.array(cardSchema).max(3), warnings: z.array(z.string()),
    researchSince: timestampSchema.nullable(),
  }),
  z.object({ type: z.literal("delta"), revision: z.number().int().nonnegative(), text: z.string() }),
  z.object({ type: z.literal("done"), revision: z.number().int().nonnegative() }),
  z.object({ type: z.literal("error"), revision: z.number().int().nonnegative(), error: failureSchema }),
]);

export type LiveRequest = z.input<typeof liveRequestSchema>;
export type LiveEvent = z.infer<typeof liveEventSchema>;
