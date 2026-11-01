import { ZodError } from "zod";
import {
  operations,
  type AliasApi,
  type ApiError,
  type Card,
  type Claim,
  type Conversation,
  type Deck,
  type Identity,
  type Input,
  type Interest,
  type OperationName,
  type Output,
  type ParsedInput,
  type Person,
  type ResearchFact,
  type ResearchRun,
} from "@/contracts";
import { AliasApiError } from "@/lib/api-client";
import * as f from "./demo";

/** In-memory, writable API for UI development and demos. Opt in explicitly; never use in server composition.
 * Jobs (research runs, deck builds, claim checks) move queued -> running -> completed on timers.
 * Include the word "fail" in an interest name, person name, or claim text to force a failed job.
 */

type State = {
  identity: Identity | null;
  interests: Interest[];
  people: Person[];
  claims: Claim[];
  conversations: Conversation[];
  runs: ResearchRun[];
  facts: ResearchFact[];
  decks: Deck[];
};

const QUEUE_MS = 500;
const RUN_MS = 1500;

let counter = 0;
const newId = (prefix: string) => `${prefix}_${Date.now().toString(36)}${(counter++).toString(36)}`;
const now = () => new Date().toISOString();
const shouldFail = (text: string) => /\bfail/i.test(text);

function seed(): State {
  return {
    identity: structuredClone(f.identity),
    interests: [structuredClone(f.interest)],
    people: [structuredClone(f.person)],
    claims: [structuredClone(f.claim)],
    conversations: [structuredClone(f.conversation)],
    runs: [structuredClone(f.researchRun)],
    facts: [structuredClone(f.researchFact)],
    decks: [structuredClone(f.deck)],
  };
}

let state = seed();

export function resetMemoryApi() {
  state = seed();
}

function fail(code: ApiError["code"], message: string, status: number): never {
  throw new AliasApiError({ code, message, retryable: false }, status);
}

function find<T extends { id: string }>(items: T[], id: string, label: string): T {
  return items.find((item) => item.id === id) ?? fail("NOT_FOUND", `${label} ${id} was not found.`, 404);
}

function page<T>(items: T[], input: { cursor: string | null; limit: number }) {
  const start = input.cursor ? Number(input.cursor) : 0;
  if (!Number.isInteger(start) || start < 0) fail("VALIDATION_ERROR", "Invalid cursor.", 400);
  const end = start + input.limit;
  return { items: structuredClone(items.slice(start, end)), nextCursor: end < items.length ? String(end) : null };
}

const newest = <T extends { createdAt: string }>(items: T[]) =>
  [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

function requireIdentity(): Identity {
  return state.identity ?? fail("CONFLICT", "Save an identity first.", 409);
}

function schedule(steps: Array<() => void>) {
  steps.forEach((step, index) => setTimeout(step, index === 0 ? QUEUE_MS : QUEUE_MS + RUN_MS * index));
}

const NEGATION = /\b(never|not|don't|dont|no longer|hate|didn't)\b/i;

function checkClaim(claim: Claim) {
  schedule([
    () => { claim.checkStatus = "running"; },
    () => {
      if (shouldFail(claim.text)) {
        claim.checkStatus = "failed";
        claim.checkFailure = { code: "UPSTREAM_ERROR", message: "Simulated contradiction check failure.", retryable: true };
        return;
      }
      const earlier = state.claims.filter((other) =>
        other.id !== claim.id && other.personId === claim.personId &&
        other.saidAt <= claim.saidAt && (claim.interestId === null || other.interestId === null || other.interestId === claim.interestId) &&
        NEGATION.test(other.text) !== NEGATION.test(claim.text));
      claim.contradictions = earlier.map((other) => ({
        earlierClaimId: other.id,
        explanation: `This conflicts with what you said earlier: "${other.text}".`,
      }));
      claim.checkStatus = "completed";
    },
  ]);
}

function startRun(interest: Interest, trigger: ResearchRun["trigger"]): ResearchRun {
  const run: ResearchRun = {
    id: newId("run"), interestId: interest.id, status: "queued", trigger, createdAt: now(),
    startedAt: null, finishedAt: null, factCount: 0, sourceErrors: [], failure: null,
  };
  state.runs.push(run);
  schedule([
    () => { run.status = "running"; run.startedAt = now(); },
    () => {
      run.finishedAt = now();
      if (shouldFail(interest.name)) {
        run.status = "failed";
        run.failure = { code: "UPSTREAM_ERROR", message: "Simulated research failure.", retryable: true };
        return;
      }
      const term = interest.searchTerms[0] ?? interest.name;
      const at = now();
      const facts: ResearchFact[] = [
        {
          id: newId("fact"), interestId: interest.id, runId: run.id, kind: "reported_fact", createdAt: at,
          text: `Fictional update: a notable ${term} headline broke this week.`,
          source: { url: `https://example.com/news/${encodeURIComponent(term)}/${run.id}`, title: `${term} weekly roundup`, kind: "google_news", publishedAt: at, retrievedAt: at },
        },
        {
          id: newId("fact"), interestId: interest.id, runId: run.id, kind: "fan_reaction", createdAt: at,
          text: `Fictional reaction: ${interest.name} fans are split on the latest news.`,
          source: { url: `https://example.com/forum/${encodeURIComponent(term)}/${run.id}`, title: `${interest.name} discussion thread`, kind: "reddit", publishedAt: at, retrievedAt: at },
        },
      ];
      state.facts.push(...facts);
      run.factCount = facts.length;
      run.status = "completed";
    },
  ]);
  return run;
}

function composeCards(deck: Deck, person: Person, claims: Claim[], facts: ResearchFact[]): Card[] {
  const interestName = (id: string | null) => state.interests.find((i) => i.id === id)?.name ?? "that";
  const cards: Omit<Card, "position">[] = [];
  const base = { deckId: deck.id };
  for (const claim of claims.slice(0, 5)) {
    cards.push({
      ...base, id: newId("card"), type: "back_story", interestIds: claim.interestId ? [claim.interestId] : [],
      prompt: `What did you tell ${person.name} about ${interestName(claim.interestId)}?`,
      answer: claim.text, evidence: [{ kind: "claim", claimId: claim.id }],
    });
  }
  for (const fact of facts.slice(0, 5)) {
    cards.push({
      ...base, id: newId("card"), type: "what_changed", interestIds: [fact.interestId],
      prompt: `What's new with ${interestName(fact.interestId)}?`,
      answer: fact.text, evidence: [{ kind: "research", factId: fact.id, sourceUrl: fact.source.url }],
    });
  }
  for (const fact of facts.filter((x) => x.kind === "fan_reaction").slice(0, 2)) {
    cards.push({
      ...base, id: newId("card"), type: "if_she_asks", interestIds: [fact.interestId],
      prompt: `If ${person.name} asks how fans are taking the ${interestName(fact.interestId)} news?`,
      answer: fact.text, evidence: [{ kind: "research", factId: fact.id, sourceUrl: fact.source.url }],
    });
  }
  for (const claim of claims.filter((c) => c.contradictions.length > 0 || NEGATION.test(c.text)).slice(0, 3)) {
    cards.push({
      ...base, id: newId("card"), type: "dont_say", interestIds: claim.interestId ? [claim.interestId] : [],
      prompt: `What should you avoid saying about ${interestName(claim.interestId)}?`,
      answer: `Anything that contradicts "${claim.text}".`, evidence: [{ kind: "claim", claimId: claim.id }],
    });
  }
  return cards.map((card, position) => ({ ...card, position }));
}

function startDeck(person: Person): Deck {
  const deck: Deck = {
    id: newId("deck"), personId: person.id, status: "queued", createdAt: now(), finishedAt: null,
    researchSince: person.lastConversationAt, claimIds: [], factIds: [], cards: [], warnings: [], failure: null,
  };
  state.decks.push(deck);
  schedule([
    () => { deck.status = "running"; },
    () => {
      deck.finishedAt = now();
      if (shouldFail(person.name)) {
        deck.status = "failed";
        deck.failure = { code: "UPSTREAM_ERROR", message: "Simulated deck build failure.", retryable: true };
        return;
      }
      const claims = state.claims.filter((c) => c.personId === person.id);
      const facts = newest(state.facts.filter((x) =>
        person.interestIds.includes(x.interestId) && (deck.researchSince === null || x.createdAt >= deck.researchSince)));
      deck.claimIds = claims.map((c) => c.id);
      deck.factIds = facts.map((x) => x.id);
      deck.cards = composeCards(deck, person, claims, facts);
      if (claims.length === 0) deck.warnings.push(`No claims recorded for ${person.name} yet.`);
      if (facts.length === 0) deck.warnings.push("No new research since your last conversation.");
      deck.status = "completed";
    },
  ]);
  return deck;
}

function newClaim(personId: string, conversationId: string | null, data: ParsedInput<"createClaim">["data"]): Claim {
  if (data.interestId !== null) find(state.interests, data.interestId, "Interest");
  const claim: Claim = {
    ...data, id: newId("claim"), personId, conversationId, createdAt: now(),
    checkStatus: "queued", contradictions: [], checkFailure: null,
  };
  state.claims.push(claim);
  checkClaim(claim);
  return claim;
}

const handlers: { [K in OperationName]: (input: ParsedInput<K>) => Output<K> } = {
  getIdentity: () => state.identity,
  saveIdentity: (data) => {
    const at = now();
    state.identity = state.identity
      ? { ...state.identity, ...data, updatedAt: at }
      : { ...data, id: newId("identity"), createdAt: at, updatedAt: at };
    return state.identity;
  },
  listInterests: (input) => page(state.interests, input),
  createInterest: (data) => {
    const at = now();
    const interest: Interest = { ...data, id: newId("interest"), identityId: requireIdentity().id, createdAt: at, updatedAt: at };
    state.interests.push(interest);
    return interest;
  },
  updateInterest: ({ id, data }) => Object.assign(find(state.interests, id, "Interest"), data, { updatedAt: now() }),
  deleteInterest: ({ id }) => {
    find(state.interests, id, "Interest");
    state.interests = state.interests.filter((i) => i.id !== id);
    for (const person of state.people) person.interestIds = person.interestIds.filter((x) => x !== id);
    return null;
  },
  listPeople: (input) => page(state.people, input),
  getPerson: ({ id }) => find(state.people, id, "Person"),
  createPerson: (data) => {
    data.interestIds.forEach((id) => find(state.interests, id, "Interest"));
    const at = now();
    const person: Person = { ...data, id: newId("person"), identityId: requireIdentity().id, lastConversationAt: null, createdAt: at, updatedAt: at };
    state.people.push(person);
    return person;
  },
  updatePerson: ({ id, data }) => {
    data.interestIds.forEach((x) => find(state.interests, x, "Interest"));
    return Object.assign(find(state.people, id, "Person"), data, { updatedAt: now() });
  },
  deletePerson: ({ id }) => {
    find(state.people, id, "Person");
    state.people = state.people.filter((p) => p.id !== id);
    state.claims = state.claims.filter((c) => c.personId !== id);
    state.conversations = state.conversations.filter((c) => c.personId !== id);
    state.decks = state.decks.filter((d) => d.personId !== id);
    return null;
  },
  listClaims: ({ personId, ...input }) => page(state.claims.filter((c) => c.personId === personId), input),
  createClaim: ({ personId, data }) => {
    find(state.people, personId, "Person");
    return newClaim(personId, null, data);
  },
  getClaim: ({ id }) => find(state.claims, id, "Claim"),
  recordConversation: ({ personId, data }) => {
    const person = find(state.people, personId, "Person");
    const conversation: Conversation = { id: newId("conversation"), personId, happenedAt: data.happenedAt, notes: data.notes, createdAt: now() };
    state.conversations.push(conversation);
    const claims = data.claims.map((claim) => newClaim(personId, conversation.id, claim));
    if (person.lastConversationAt === null || data.happenedAt > person.lastConversationAt) person.lastConversationAt = data.happenedAt;
    person.updatedAt = now();
    return { conversation, claims, person };
  },
  listConversations: ({ personId, ...input }) => page(newest(state.conversations.filter((c) => c.personId === personId)), input),
  startResearch: ({ interestId }) => startRun(find(state.interests, interestId, "Interest"), "manual"),
  getResearchRun: ({ id }) => find(state.runs, id, "Research run"),
  listResearchRuns: ({ interestId, ...input }) => page(newest(state.runs.filter((r) => r.interestId === interestId)), input),
  listResearchFacts: ({ interestId, since, ...input }) =>
    page(newest(state.facts.filter((x) => x.interestId === interestId && (since === null || x.createdAt >= since))), input),
  buildDeck: ({ personId, force }) => {
    const person = find(state.people, personId, "Person");
    const pending = state.decks.find((d) => d.personId === personId && (d.status === "queued" || d.status === "running"));
    return pending && !force ? pending : startDeck(person);
  },
  getDeck: ({ id }) => find(state.decks, id, "Deck"),
  listDecks: ({ personId, ...input }) => page(newest(state.decks.filter((d) => d.personId === personId)), input),
};

async function call<K extends OperationName>(name: K, raw: Input<K>): Promise<Output<K>> {
  await new Promise((resolve) => setTimeout(resolve, 150));
  let input: ParsedInput<K>;
  try {
    input = operations[name].input.parse(raw) as ParsedInput<K>;
  } catch (error) {
    if (error instanceof ZodError) fail("VALIDATION_ERROR", error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "), 400);
    throw error;
  }
  const result = (handlers[name] as (input: ParsedInput<K>) => Output<K>)(structuredClone(input));
  // Parse the output so the UI never relies on shapes the real backend would reject.
  return operations[name].output.parse(structuredClone(result)) as Output<K>;
}

export const memoryApi = Object.fromEntries(
  (Object.keys(operations) as OperationName[]).map((name) => [name, (input: Input<typeof name>) => call(name, input)]),
) as AliasApi;
