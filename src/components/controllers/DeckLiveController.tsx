"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { isTerminal, listAll, usePolling, useResource } from "@/lib/use-resource";
import { LiveMode } from "@/components/LiveMode";
import { sortDeck } from "./DeckPrepController";

export function DeckLiveController({ deckId }: { deckId: string }) {
  const resource = useResource(deckId, () => api.getDeck({ id: deckId }));
  const deck = useMemo(() => sortDeck(resource.data), [resource.data]);
  const interests = useResource(deckId, () => listAll((cursor) => api.listInterests({ cursor, limit: 100 })));

  const [activeIndex, setActiveIndex] = useState(0);
  const [pinned, setPinned] = useState<{ cardId: string; interestId: string } | null>(null);

  const cards = deck?.cards ?? [];
  const index = Math.min(activeIndex, Math.max(cards.length - 1, 0));
  const activeCard = cards[index] ?? null;

  usePolling(deck !== null && !isTerminal(deck.status), resource.reload);

  const topics = useMemo(() => {
    const used = new Set(cards.flatMap((c) => c.interestIds));
    return (interests.data ?? []).filter((i) => used.has(i.id));
  }, [cards, interests.data]);

  // A jump pins the chosen topic only while its target card is showing.
  const activeInterestId =
    pinned && activeCard && pinned.cardId === activeCard.id ? pinned.interestId : (activeCard?.interestIds[0] ?? null);

  const onPrevious = useCallback(async () => setActiveIndex(Math.max(index - 1, 0)), [index]);
  const onNext = useCallback(async () => setActiveIndex(Math.min(index + 1, cards.length - 1)), [index, cards.length]);
  const onJumpToInterest = useCallback(
    async (interestId: string) => {
      const target = cards.findIndex((c) => c.interestIds.includes(interestId));
      if (target < 0) return;
      setActiveIndex(target);
      setPinned({ cardId: cards[target].id, interestId });
    },
    [cards],
  );

  const error = resource.error ?? interests.error;

  return (
    <div className="space-y-4">
      {deck ? <Link href={`/people/${deck.personId}`} className="text-sm text-blue-700 underline">Back to person</Link> : null}
      <LiveMode
        state={{ data: deck, loading: resource.loading || interests.loading, error }}
        activeCard={activeCard}
        topics={topics}
        activeInterestId={activeInterestId}
        onPrevious={onPrevious}
        onNext={onNext}
        onJumpToInterest={onJumpToInterest}
      />
    </div>
  );
}
