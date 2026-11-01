"use client";

import Link from "next/link";
import { ArrowIcon } from "@/components/ui";
import { useCallback, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { isTerminal, listAll, usePolling, useResource } from "@/lib/use-resource";
import { LiveMode } from "@/components/LiveMode";
import { sortDeck } from "./DeckPrepController";

export function DeckLiveController({ deckId }: { deckId: string }) {
  const resource = useResource(deckId, () => api.getDeck({ id: deckId }));
  const deck = useMemo(() => sortDeck(resource.data), [resource.data]);
  const personId = deck?.personId ?? null;
  const person = useResource(personId, () => api.getPerson({ id: personId! }));
  const interests = useResource(personId, () => listAll((cursor) => api.listInterests({ cursor, limit: 100 })));

  const [activeIndex, setActiveIndex] = useState(0);
  const [pinned, setPinned] = useState<{ cardId: string; interestId: string } | null>(null);

  const cards = deck?.cards ?? [];
  const index = Math.min(activeIndex, Math.max(cards.length - 1, 0));
  const activeCard = cards[index] ?? null;

  const { setData } = resource;
  usePolling(deck !== null && !isTerminal(deck.status), async () => {
    try {
      setData(await api.getDeck({ id: deckId }));
    } catch {
      // Keep the last good deck; the next tick retries.
    }
  });

  const topics = useMemo(() => {
    const used = new Set(cards.flatMap((c) => c.interestIds));
    const mine = new Set(person.data?.interestIds ?? []);
    return (interests.data ?? []).filter((i) => mine.has(i.id) && used.has(i.id));
  }, [cards, person.data, interests.data]);

  // A jump pins the chosen topic only while its target card is showing.
  const activeInterestId =
    pinned && activeCard && pinned.cardId === activeCard.id
      ? pinned.interestId
      : (activeCard?.interestIds[0] ?? null);

  const onPrevious = useCallback(async () => setActiveIndex(Math.max(index - 1, 0)), [index]);
  const onNext = useCallback(
    async () => setActiveIndex(Math.min(index + 1, cards.length - 1)),
    [index, cards.length],
  );
  const onJumpToInterest = useCallback(
    async (interestId: string) => {
      const target = cards.findIndex((c) => c.interestIds.includes(interestId));
      if (target < 0) return;
      setActiveIndex(target);
      setPinned({ cardId: cards[target].id, interestId });
    },
    [cards],
  );

  const error = resource.error ?? person.error ?? interests.error;

  return (
    <div data-live-route className="fixed inset-0 z-50 overflow-y-auto bg-night text-ground">
      <div className="mx-auto flex min-h-full max-w-2xl flex-col">
        {deck ? (
          <Link
            href={`/people/${deck.personId}`}
            className="mx-4 mt-1.5 inline-flex min-h-10 w-fit items-center gap-1.5 rounded-sm font-mono text-xs font-semibold text-night-muted hover:text-ground focus-visible:outline-ground sm:mx-5"
          >
            <ArrowIcon direction="left" /> Back to person
          </Link>
        ) : null}
        <div className="flex flex-1 flex-col">
          <LiveMode
            state={{
              data: deck,
              loading: resource.loading || person.loading || interests.loading,
              error,
            }}
            activeCard={activeCard}
            topics={topics}
            activeInterestId={activeInterestId}
            onPrevious={onPrevious}
            onNext={onNext}
            onJumpToInterest={onJumpToInterest}
          />
        </div>
      </div>
    </div>
  );
}
