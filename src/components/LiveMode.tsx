"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import type { LiveModeProps } from "./contracts";
import { cardTypeLabels, CardTypeLabel, EvidenceList } from "./Flashcard";
import { isInteractiveTarget } from "./PrepMode";
import { Button, EmptyState, ErrorMessage } from "./ui";

export function LiveMode({ state, activeCard, topics, activeInterestId, onPrevious, onNext, onJumpToInterest, onJumpToType }: LiveModeProps) {
  const { data: deck, loading, error } = state;
  const cards = deck?.cards ?? [];
  const index = activeCard ? cards.findIndex((c) => c.id === activeCard.id) : -1;

  const latest = useRef({ onPrevious, onNext });
  latest.current = { onPrevious, onNext };

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      if (isInteractiveTarget(event.target, false)) return;
      event.preventDefault();
      void (event.key === "ArrowLeft" ? latest.current.onPrevious() : latest.current.onNext());
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <section className="space-y-5 rounded-lg bg-slate-950 p-4 text-white sm:p-6" aria-labelledby="live-heading">
      <div className="flex items-center justify-between gap-3">
        <h1 id="live-heading" className="text-lg font-semibold">Live</h1>
        {deck ? <Link href={`/decks/${deck.id}/prep`} className="text-sm text-sky-300 underline">Switch to prep mode</Link> : null}
      </div>

      {error ? <div className="text-slate-900"><ErrorMessage error={error} /></div> : null}
      {loading && !deck ? <p role="status" className="text-slate-300">Loading deck...</p> : null}
      {deck && deck.status !== "completed" && deck.status !== "failed" ? (
        <p role="status" className="text-slate-300">Deck is still building. Use prep mode to watch progress.</p>
      ) : null}
      {deck?.status === "failed" ? (
        <p role="alert" className="text-red-300">{deck.failure?.message ?? "The deck could not be built."}</p>
      ) : null}
      {deck?.status === "completed" && cards.length === 0 ? (
        <div className="text-slate-900"><EmptyState>This deck has no cards.</EmptyState></div>
      ) : null}

      {cards.length > 0 ? <div className="flex flex-wrap gap-2" role="group" aria-label="Card types">
        {(Object.keys(cardTypeLabels) as Array<keyof typeof cardTypeLabels>).map((type) => {
          const available = cards.some((card) => card.type === type && (!activeInterestId || card.interestIds.includes(activeInterestId)));
          const selected = activeCard?.type === type;
          return <button
            key={type}
            type="button"
            aria-pressed={selected}
            disabled={!available}
            onClick={() => void onJumpToType(type)}
            className={`min-h-11 rounded-md border px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 ${selected ? "border-white bg-white text-slate-950" : "border-slate-500 text-white hover:bg-slate-800"}`}
          >{cardTypeLabels[type].name}</button>;
        })}
      </div> : null}

      {topics.length > 0 ? (
        <ul className="flex flex-wrap gap-2" aria-label="Topics">
          {topics.map((topic) => {
            const active = topic.id === activeInterestId;
            return (
              <li key={topic.id}>
                <button
                  type="button"
                  aria-pressed={active}
                  onClick={() => void onJumpToInterest(topic.id)}
                  className={`rounded-full border px-4 py-2 text-base font-medium ${active ? "border-white bg-white text-slate-950" : "border-slate-500 text-white hover:bg-slate-800"}`}
                >
                  {topic.name}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {activeCard ? (
        <div aria-live="polite" className="space-y-4">
          <CardTypeLabel type={activeCard.type} large />
          <h2 className="break-words text-3xl font-bold leading-tight sm:text-4xl">{activeCard.prompt}</h2>
          <p className="break-words text-2xl leading-snug text-slate-100 sm:text-3xl">{activeCard.answer}</p>
          <div className="rounded-md bg-white p-3"><EvidenceList evidence={activeCard.evidence} /></div>
        </div>
      ) : null}

      {cards.length > 0 ? (
        <>
          <div className="flex items-center justify-between gap-3">
            <Button variant="secondary" className="px-5 py-3 text-lg" disabled={index <= 0} onClick={() => void onPrevious()}>Previous</Button>
            <span className="text-slate-300">{index + 1} / {cards.length}</span>
            <Button variant="secondary" className="px-5 py-3 text-lg" disabled={index < 0 || index >= cards.length - 1} onClick={() => void onNext()}>Next</Button>
          </div>
          <p className="text-xs text-slate-300">Use left and right arrow keys to move between cards.</p>
        </>
      ) : null}
    </section>
  );
}
