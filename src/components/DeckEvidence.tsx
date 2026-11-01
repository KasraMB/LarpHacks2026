"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { Claim, Deck, Person, ResearchFact } from "@/contracts";
import { api } from "@/lib/api";
import { listAll, useResource } from "@/lib/use-resource";

type EvidenceData = {
  claims: Record<string, Claim | null>;
  facts: Record<string, ResearchFact | null>;
  person: Person | null;
};

type DeckEvidenceState = {
  data: EvidenceData | null;
  loading: boolean;
  researchSince: string | null;
  hasDeck: boolean;
};

const DeckEvidenceContext = createContext<DeckEvidenceState>({ data: null, loading: false, researchSince: null, hasDeck: false });

function resourceKey(deck: Deck | null) {
  if (!deck || deck.status !== "completed") return null;
  const interestIds = [...new Set(deck.cards.flatMap((card) => card.interestIds))].sort();
  return [
    deck.id,
    deck.personId,
    deck.researchSince ?? "no-cutoff",
    [...deck.claimIds].sort().join(","),
    [...deck.factIds].sort().join(","),
    interestIds.join(","),
  ].join("|");
}

async function loadDeckEvidence(deck: Deck): Promise<EvidenceData> {
  const [person, claims] = await Promise.all([
    api.getPerson({ id: deck.personId }).catch(() => null),
    Promise.all(deck.claimIds.map(async (id) => [id, await api.getClaim({ id }).catch(() => null)] as const)),
  ]);
  const claimMap = Object.fromEntries(claims) as Record<string, Claim | null>;
  const interestIds = new Set(deck.cards.flatMap((card) => card.interestIds));
  for (const claim of Object.values(claimMap)) {
    if (claim?.interestId) interestIds.add(claim.interestId);
  }

  const factsByInterest = await Promise.all([...interestIds].map(async (interestId) => {
    const facts = await listAll((cursor) =>
      api.listResearchFacts({ interestId, since: deck.researchSince, cursor, limit: 100 }),
    ).catch(() => [] as ResearchFact[]);
    return facts;
  }));
  const selectedFactIds = new Set(deck.factIds);
  const facts = Object.fromEntries(
    factsByInterest.flat().filter((fact) => selectedFactIds.has(fact.id)).map((fact) => [fact.id, fact]),
  ) as Record<string, ResearchFact | null>;

  return {
    claims: Object.fromEntries(deck.claimIds.map((id) => [id, claimMap[id] ?? null])) as Record<string, Claim | null>,
    facts: Object.fromEntries(deck.factIds.map((id) => [id, facts[id] ?? null])) as Record<string, ResearchFact | null>,
    person,
  };
}

export function DeckEvidenceProvider({ deck, children }: { deck: Deck | null; children: ReactNode }) {
  const key = resourceKey(deck);
  const evidence = useResource(key, async () => {
    if (!deck) return { claims: {}, facts: {}, person: null };
    return loadDeckEvidence(deck);
  });
  const value = useMemo(
    () => ({ data: evidence.data, loading: evidence.loading, researchSince: deck?.researchSince ?? null, hasDeck: deck !== null }),
    [deck, evidence.data, evidence.loading],
  );

  return <DeckEvidenceContext.Provider value={value}>{children}</DeckEvidenceContext.Provider>;
}

export function useDeckEvidence() {
  return useContext(DeckEvidenceContext);
}
