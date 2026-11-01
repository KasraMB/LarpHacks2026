import type { z } from "zod";
import type { AliasService, Claim, Conversation, Deck, Identity, Interest, Person, ResearchFact, ResearchRun } from "@/contracts";
import type { cardSchema, claimInputSchema, contradictionSchema, identityInputSchema, interestInputSchema, personInputSchema, sourceKindSchema, sourceSchema } from "@/contracts";

export interface PageRequest { cursor: string | null; limit: number }
export interface Page<T> { items: T[]; nextCursor: string | null }
type IdentityInput = z.infer<typeof identityInputSchema>;
type InterestInput = z.infer<typeof interestInputSchema>;
type PersonInput = z.infer<typeof personInputSchema>;
type ClaimInput = z.infer<typeof claimInputSchema>;

/** Persistence port. IDs and UTC timestamps are created by the repository. */
export interface Repository {
  identity: { get(): Promise<Identity | null>; save(input: IdentityInput): Promise<Identity> };
  interests: {
    list(page: PageRequest): Promise<Page<Interest>>;
    get(id: string): Promise<Interest | null>;
    create(input: InterestInput): Promise<Interest>;
    update(id: string, input: InterestInput): Promise<Interest>;
    delete(id: string): Promise<void>;
  };
  people: {
    list(page: PageRequest): Promise<Page<Person>>;
    get(id: string): Promise<Person | null>;
    create(input: PersonInput): Promise<Person>;
    update(id: string, input: PersonInput): Promise<Person>;
    delete(id: string): Promise<void>;
  };
  claims: {
    get(id: string): Promise<Claim | null>;
    list(personId: string, page: PageRequest): Promise<Page<Claim>>;
    create(personId: string, input: ClaimInput): Promise<Claim>;
    saveCheck(id: string, result: Pick<Claim, "checkStatus" | "contradictions" | "checkFailure">): Promise<Claim>;
  };
  conversations: {
    /** Atomic: save conversation + claims and advance cutoff to max(existing, happenedAt). */
    record(input: Parameters<AliasService["recordConversation"]>[0]): ReturnType<AliasService["recordConversation"]>;
    list(personId: string, page: PageRequest): Promise<Page<Conversation>>;
  };
  research: {
    /** Atomically reuse active run or insert run and durable job. */
    createOrReuseRun(run: ResearchRun): Promise<ResearchRun>;
    getRun(id: string): Promise<ResearchRun | null>;
    saveRun(run: ResearchRun): Promise<ResearchRun>;
    listRuns(interestId: string, page: PageRequest): Promise<Page<ResearchRun>>;
    listFacts(interestId: string, since: string | null, page: PageRequest): Promise<Page<ResearchFact>>;
    /** Returns newly inserted rows; repeated facts count as zero. */
    upsertFacts(facts: ResearchFact[]): Promise<number>;
    findActiveRun(interestId: string): Promise<ResearchRun | null>;
  };
  decks: {
    /** Atomically reuse matching work or insert snapshot and durable job. */
    createOrReuse(record: DeckRecord, force: boolean): Promise<Deck>;
    get(id: string): Promise<Deck | null>;
    list(personId: string, page: PageRequest): Promise<Page<Deck>>;
    /** Persist public deck and private immutable inputs/cache key atomically. */
    save(record: DeckRecord): Promise<Deck>;
    getSnapshot(id: string): Promise<DeckSnapshot | null>;
    findReusable(personId: string, fingerprint: string): Promise<Deck | null>;
  };
  jobs: {
    enqueue(job: Job): Promise<void>;
    claim(workerId: string, leaseSeconds?: number): Promise<QueuedJob | null>;
    complete(id: string, workerId: string): Promise<void>;
    fail(id: string, workerId: string, error: string): Promise<void>;
  };
}

export interface DiscoveredArticle {
  url: string; title: string; kind: z.infer<typeof sourceKindSchema>; publishedAt: string | null;
}
export interface ReadArticle { source: z.infer<typeof sourceSchema>; text: string }
export interface DiscoverySource {
  kind: DiscoveredArticle["kind"];
  discover(interest: Interest, signal?: AbortSignal): Promise<DiscoveredArticle[]>;
}
export interface ArticleReader {
  read(article: DiscoveredArticle, signal?: AbortSignal): Promise<ReadArticle>;
}
export interface DeckContext {
  identity: Identity; person: Person; interests: Interest[]; claims: Claim[];
  facts: ResearchFact[]; researchSince: string | null;
}
export interface DeckSnapshot {
  context: DeckContext;
  model: string;
  promptVersion: string;
}
export interface DeckRecord {
  deck: Deck;
  fingerprint: string;
  snapshot: DeckSnapshot;
}
export interface AiProvider {
  extractFacts(article: ReadArticle, interest: Interest, signal?: AbortSignal): Promise<Array<Pick<ResearchFact, "text" | "kind">>>;
  checkContradictions(claim: Claim, previous: Claim[], signal?: AbortSignal): Promise<Array<z.infer<typeof contradictionSchema>>>;
  generateDeck(context: DeckContext, signal?: AbortSignal): Promise<{ cards: Array<Omit<z.infer<typeof cardSchema>, "id" | "deckId">>; warnings: string[] }>;
  // Debrief is intentionally excluded until its product behavior is specified.
}
export type Job = { kind: "research"; runId: string } | { kind: "deck"; deckId: string } | { kind: "claim_check"; claimId: string };
export interface QueuedJob { id: string; job: Job; attempts: number }
export interface JobQueue { enqueue(job: Job): Promise<void> }
/** Direct execution is a final attempt unless the durable queue schedules a retry. */
export interface WorkerAttempt { willRetry: boolean }
export interface ResearchWorker { execute(runId: string, attempt?: WorkerAttempt): Promise<void> }
export interface DeckWorker { execute(deckId: string, attempt?: WorkerAttempt): Promise<void> }
export interface ClaimCheckWorker { execute(claimId: string, attempt?: WorkerAttempt): Promise<void> }
export interface ResearchScheduler { enqueueDaily(): Promise<{ runIds: string[] }> }
export interface ServerDependencies {
  repository: Repository; ai: AiProvider; discovery: DiscoverySource[];
  reader: ArticleReader; queue: JobQueue; scheduler: ResearchScheduler;
  clock: { now(): string }; ids: { next(): string };
}
