"use client";

import Link from "next/link";
import { ArrowIcon } from "@/components/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Card } from "@/contracts";
import type { LiveSuggestPanelProps } from "@/components/contracts";
import { api, apiMode } from "@/lib/api";
import { useLiveSuggest } from "@/lib/use-live-suggest";
import { useSpeechRecognition } from "@/lib/use-speech-recognition";
import { isTerminal, listAll, usePolling, useResource } from "@/lib/use-resource";
import { LiveMode } from "@/components/LiveMode";
import { DeckEvidenceProvider } from "@/components/DeckEvidence";
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

  const error = resource.error ?? interests.error;
  const onJumpToType = useCallback(async (type: Card["type"]) => {
    const target = cards.findIndex((card) => card.type === type && (!activeInterestId || card.interestIds.includes(activeInterestId)));
    if (target < 0) return;
    setActiveIndex(target);
    if (activeInterestId) setPinned({ cardId: cards[target].id, interestId: activeInterestId });
  }, [cards, activeInterestId]);

  // Suggestions only run against the real backend for a finished deck; nothing here is saved.
  const available = apiMode === "real";
  const live = useLiveSuggest(available && deck?.status === "completed" && cards.length > 0 ? deck.id : null);
  const { update: updatePhrase, stop: stopSuggest, resume: resumeSuggest, retry: retrySuggest } = live;
  const speech = useSpeechRecognition(useCallback((text: string) => updatePhrase(text, "speech"), [updatePhrase]));
  const { start: startListening, stop: stopListening } = speech;

  // A different deck must not keep listening into the old session.
  useEffect(() => stopListening, [deckId, stopListening]);
  // Once requests halt, nothing consumes the audio, so stop sending it to the speech service.
  const halted = live.state.halted;
  useEffect(() => {
    if (halted) stopListening();
  }, [halted, stopListening]);

  const onOpenCard = useCallback(
    (cardId: string) => {
      const target = cards.findIndex((card) => card.id === cardId);
      if (target >= 0) setActiveIndex(target);
    },
    [cards],
  );

  const suggest: LiveSuggestPanelProps = {
    available,
    speech: speech.state,
    state: live.state,
    onListenChange: (listen) => {
      if (listen) {
        resumeSuggest();
        startListening();
      } else {
        stopListening();
        stopSuggest();
      }
    },
    onTypedChange: (text) => updatePhrase(text, "typing"),
    onTypedSubmit: (text) => updatePhrase(text, "submit"),
    onStop: () => {
      stopListening();
      stopSuggest();
    },
    onRetry: retrySuggest,
    onOpenCard,
  };

  return (
    <DeckEvidenceProvider deck={deck}>
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
              state={{ data: deck, loading: resource.loading || interests.loading, error }}
              activeCard={activeCard}
              topics={topics}
              activeInterestId={activeInterestId}
              onPrevious={onPrevious}
              onNext={onNext}
              onJumpToInterest={onJumpToInterest}
              onJumpToType={onJumpToType}
              suggest={suggest}
            />
          </div>
        </div>
      </div>
    </DeckEvidenceProvider>
  );
}
