import { createHash } from "node:crypto";
import type { AliasService, Interest, ResearchRun } from "@/contracts";
import { ServiceError } from "./http";
import type { DeckSnapshot, Page, PageRequest, ServerDependencies } from "./ports";

export function missing(label: string): never {
  throw new ServiceError({ code: "NOT_FOUND", message: `${label} not found.`, retryable: false }, 404);
}
export async function collectPages<T>(load: (page: PageRequest) => Promise<Page<T>>): Promise<T[]> {
  const items: T[] = [];
  let cursor: string | null = null;
  const seen = new Set<string>();
  do {
    const page = await load({ cursor, limit: 100 });
    items.push(...page.items);
    cursor = page.nextCursor;
    if (cursor && seen.has(cursor)) throw new Error("Repeated pagination cursor.");
    if (cursor) seen.add(cursor);
    if (items.length > 20_000) throw new ServiceError({ code: "CONFLICT", message: "Too much history for one snapshot.", retryable: false }, 409);
  } while (cursor);
  return items;
}
export function newResearchRun(interestId: string, trigger: ResearchRun["trigger"], deps: Pick<ServerDependencies, "clock" | "ids">): ResearchRun {
  return { id: deps.ids.next(), interestId, trigger, status: "queued", createdAt: deps.clock.now(), startedAt: null, finishedAt: null, factCount: 0, sourceErrors: [], failure: null };
}
export function createResearchScheduler(deps: Pick<ServerDependencies, "repository" | "clock" | "ids">) {
  return { async enqueueDaily() {
    const interests = await collectPages(deps.repository.interests.list);
    const runIds: string[] = [];
    for (const interest of interests) runIds.push((await deps.repository.research.createOrReuseRun(newResearchRun(interest.id, "cron", deps))).id);
    return { runIds };
  } };
}
export function createService(deps: Pick<ServerDependencies, "repository" | "clock" | "ids">, config: { model: string; promptVersion: string }): AliasService {
  const r = deps.repository;
  const person = async (id: string) => await r.people.get(id) ?? missing("Person");
  const interest = async (id: string) => await r.interests.get(id) ?? missing("Interest");
  return {
    getIdentity: () => r.identity.get(), saveIdentity: input => r.identity.save(input),
    listInterests: input => r.interests.list(input), createInterest: input => r.interests.create(input),
    updateInterest: ({ id, data }) => r.interests.update(id, data),
    deleteInterest: async ({ id }) => { await r.interests.delete(id); return null; },
    listPeople: input => r.people.list(input), getPerson: ({ id }) => person(id),
    createPerson: input => r.people.create(input), updatePerson: ({ id, data }) => r.people.update(id, data),
    deletePerson: async ({ id }) => { await r.people.delete(id); return null; },
    listClaims: async ({ personId, ...page }) => { await person(personId); return r.claims.list(personId, page); },
    createClaim: ({ personId, data }) => r.claims.create(personId, data),
    getClaim: async ({ id }) => await r.claims.get(id) ?? missing("Claim"),
    recordConversation: input => r.conversations.record(input),
    listConversations: async ({ personId, ...page }) => { await person(personId); return r.conversations.list(personId, page); },
    startResearch: async ({ interestId }) => { await interest(interestId); return r.research.createOrReuseRun(newResearchRun(interestId, "manual", deps)); },
    getResearchRun: async ({ id }) => await r.research.getRun(id) ?? missing("Research run"),
    listResearchRuns: async ({ interestId, ...page }) => { await interest(interestId); return r.research.listRuns(interestId, page); },
    listResearchFacts: async ({ interestId, since, ...page }) => { await interest(interestId); return r.research.listFacts(interestId, since, page); },
    buildDeck: async ({ personId, force }) => {
      const identity = await r.identity.get() ?? missing("Identity");
      const selectedPerson = await person(personId);
      const interests: Interest[] = [];
      for (const id of [...selectedPerson.interestIds].sort()) interests.push(await interest(id));
      const claims = await collectPages(page => r.claims.list(personId, page));
      const facts = [];
      for (const topic of interests) facts.push(...await collectPages(page => r.research.listFacts(topic.id, selectedPerson.lastConversationAt, page)));
      const snapshot: DeckSnapshot = { context: { identity, person: selectedPerson, interests, claims, facts, researchSince: selectedPerson.lastConversationAt }, ...config };
      const fingerprint = createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
      const deck = { id: deps.ids.next(), personId, status: "queued" as const, createdAt: deps.clock.now(), finishedAt: null,
        researchSince: selectedPerson.lastConversationAt, claimIds: claims.map(c => c.id), factIds: facts.map(f => f.id), cards: [],
        warnings: facts.length ? [] : ["No new research is available; cards can only use saved claims."], failure: null };
      return r.decks.createOrReuse({ deck, snapshot, fingerprint }, force);
    },
    getDeck: async ({ id }) => await r.decks.get(id) ?? missing("Deck"),
    listDecks: async ({ personId, ...page }) => { await person(personId); return r.decks.list(personId, page); },
  };
}
