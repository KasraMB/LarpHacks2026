import { z } from "zod";
import * as d from "./domain";

const empty = z.object({});
const byId = z.object({ id: d.idSchema });
const personId = z.object({ personId: d.idSchema });
const interestId = z.object({ interestId: d.idSchema });
export const pageInputSchema = z.object({ cursor: z.string().nullable().default(null), limit: z.number().int().min(1).max(100).default(25) });
const page = <T extends z.ZodType>(item: T) => z.object({ items: z.array(item), nextCursor: z.string().nullable() });
const operation = <I extends z.ZodType, O extends z.ZodType>(input: I, output: O) => ({ input, output });

// Every operation is POST /api/v1/<operationName> with JSON input, including reads.
// One registry owns transport validation, client typing, services, and mocks.
export const operations = {
  getIdentity: operation(empty, d.identitySchema.nullable()),
  saveIdentity: operation(d.identityInputSchema, d.identitySchema),
  listInterests: operation(pageInputSchema, page(d.interestSchema)),
  createInterest: operation(d.interestInputSchema, d.interestSchema),
  updateInterest: operation(byId.extend({ data: d.interestInputSchema }), d.interestSchema),
  deleteInterest: operation(byId, z.null()),
  listPeople: operation(pageInputSchema, page(d.personSchema)),
  getPerson: operation(byId, d.personSchema),
  createPerson: operation(d.personInputSchema, d.personSchema),
  updatePerson: operation(byId.extend({ data: d.personInputSchema }), d.personSchema),
  deletePerson: operation(byId, z.null()),
  listClaims: operation(pageInputSchema.extend({ personId: d.idSchema }), page(d.claimSchema)),
  createClaim: operation(personId.extend({ data: d.claimInputSchema }), d.claimSchema),
  getClaim: operation(byId, d.claimSchema),
  recordConversation: operation(personId.extend({ data: d.conversationInputSchema }), z.object({ conversation: d.conversationSchema, claims: z.array(d.claimSchema), person: d.personSchema })),
  listConversations: operation(pageInputSchema.extend({ personId: d.idSchema }), page(d.conversationSchema)),
  startResearch: operation(interestId, d.researchRunSchema),
  getResearchRun: operation(byId, d.researchRunSchema),
  listResearchRuns: operation(pageInputSchema.extend({ interestId: d.idSchema }), page(d.researchRunSchema)),
  listResearchFacts: operation(pageInputSchema.extend({ interestId: d.idSchema, since: d.timestampSchema.nullable() }), page(d.researchFactSchema)),
  buildDeck: operation(personId.extend({ force: z.boolean().default(false) }), d.deckSchema),
  getDeck: operation(byId, d.deckSchema),
  listDecks: operation(pageInputSchema.extend({ personId: d.idSchema }), page(d.deckSchema)),
} as const;

export type OperationName = keyof typeof operations;
export type Input<K extends OperationName> = z.input<(typeof operations)[K]["input"]>;
export type ParsedInput<K extends OperationName> = z.output<(typeof operations)[K]["input"]>;
export type Output<K extends OperationName> = z.output<(typeof operations)[K]["output"]>;
export type AliasApi = { [K in OperationName]: (input: Input<K>) => Promise<Output<K>> };
export type AliasService = { [K in OperationName]: (input: ParsedInput<K>) => Promise<Output<K>> };

export const apiErrorSchema = z.object({
  code: z.enum(["NOT_IMPLEMENTED", "VALIDATION_ERROR", "NOT_FOUND", "CONFLICT", "UNAUTHORIZED", "UPSTREAM_ERROR", "INTERNAL_ERROR"]),
  message: z.string(), retryable: z.boolean(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };
