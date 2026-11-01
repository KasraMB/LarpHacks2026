"use client";

import { BackLink } from "@/components/ui";
import { useCallback, useMemo, useState } from "react";
import type { Deck } from "@/contracts";
import { api } from "@/lib/api";
import { isTerminal, usePolling, useResource } from "@/lib/use-resource";
import { DeckEvidenceProvider } from "@/components/DeckEvidence";
import { PrepMode } from "@/components/PrepMode";

export function sortDeck(deck: Deck | null): Deck | null {
  return deck ? { ...deck, cards: [...deck.cards].sort((a, b) => a.position - b.position) } : null;
}

export function DeckPrepController({ deckId }: { deckId: string }) {
  const resource = useResource(deckId, () => api.getDeck({ id: deckId }));
  const [activeIndex, setActiveIndex] = useState(0);
  const [revealedFor, setRevealedFor] = useState<string | null>(null);

  const deck = useMemo(() => sortDeck(resource.data), [resource.data]);
  const cards = deck?.cards ?? [];
  const index = Math.min(activeIndex, Math.max(cards.length - 1, 0));
  const activeCard = cards[index] ?? null;

  usePolling(deck !== null && !isTerminal(deck.status), resource.reload);

  // Reveal state is keyed to the card so it resets whenever the card changes.
  const answerRevealed = activeCard !== null && revealedFor === activeCard.id;
  const onRevealChange = useCallback(
    (revealed: boolean) => setRevealedFor(revealed && activeCard ? activeCard.id : null),
    [activeCard],
  );
  const onPrevious = useCallback(async () => { setRevealedFor(null); setActiveIndex(Math.max(index - 1, 0)); }, [index]);
  const onNext = useCallback(async () => { setRevealedFor(null); setActiveIndex(Math.min(index + 1, cards.length - 1)); }, [index, cards.length]);

  return (
    <DeckEvidenceProvider deck={deck}>
      <div className="space-y-4">
        {deck ? <BackLink href={`/people/${deck.personId}`}>Back to person</BackLink> : null}
        <PrepMode
          state={{ data: deck, loading: resource.loading, error: resource.error }}
          activeCard={activeCard}
          answerRevealed={answerRevealed}
          onRevealChange={onRevealChange}
          onPrevious={onPrevious}
          onNext={onNext}
        />
      </div>
    </DeckEvidenceProvider>
  );
}
