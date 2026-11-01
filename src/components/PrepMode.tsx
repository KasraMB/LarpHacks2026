"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import type { PrepModeProps } from "./contracts";
import { Flashcard } from "./Flashcard";
import { Button, EmptyState, ErrorMessage, Loading, StatusBadge } from "./ui";

/** True when a key event came from something that handles keys itself. */
export function isInteractiveTarget(target: EventTarget | null, includeButtons: boolean) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tags = includeButtons ? ["INPUT", "TEXTAREA", "SELECT", "BUTTON", "A", "SUMMARY"] : ["INPUT", "TEXTAREA", "SELECT"];
  return tags.includes(target.tagName);
}

export function PrepMode({ state, activeCard, answerRevealed, onRevealChange, onPrevious, onNext }: PrepModeProps) {
  const { data: deck, loading, error } = state;
  const cards = deck?.cards ?? [];
  const index = activeCard ? cards.findIndex((c) => c.id === activeCard.id) : -1;
  const isBuilding = deck?.status === "queued" || deck?.status === "running";
  const ready = deck?.status === "completed" && cards.length > 0;

  const latest = useRef({ onPrevious, onNext, onRevealChange, answerRevealed, ready });
  latest.current = { onPrevious, onNext, onRevealChange, answerRevealed, ready };

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const current = latest.current;
      if (!current.ready || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        if (isInteractiveTarget(event.target, false)) return;
        event.preventDefault();
        void (event.key === "ArrowLeft" ? current.onPrevious() : current.onNext());
      } else if (event.key === " " || event.key === "Enter") {
        // Buttons and links already activate themselves on these keys.
        if (isInteractiveTarget(event.target, true)) return;
        event.preventDefault();
        current.onRevealChange(!current.answerRevealed);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <section className="space-y-4" aria-labelledby="prep-heading">
      <div className="flex items-center justify-between gap-3">
        <h1 id="prep-heading" className="text-2xl font-semibold">Prep</h1>
        {deck ? <Link href={`/decks/${deck.id}/live`} className="text-sm text-blue-700 underline">Switch to live mode</Link> : null}
      </div>

      <ErrorMessage error={error} />
      {loading && !deck ? <Loading label="Loading deck..." /> : null}

      {deck && isBuilding ? (
        <div className="flex items-center gap-2" role="status">
          <span>Building deck...</span>
          <StatusBadge status={deck.status} />
        </div>
      ) : null}

      {deck?.status === "failed" ? (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          <StatusBadge status="failed" /> {deck.failure?.message ?? "The deck could not be built."}
        </div>
      ) : null}

      {deck && deck.warnings.length > 0 ? (
        <ul className="space-y-1 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900" aria-label="Deck warnings">
          {deck.warnings.map((warning, i) => <li key={i}>{warning}</li>)}
        </ul>
      ) : null}

      {deck?.status === "completed" && cards.length === 0 ? <EmptyState>This deck has no cards.</EmptyState> : null}

      {ready ? (
        <>
          <p className="text-sm text-slate-600">Card {index + 1} of {cards.length}</p>
          <div aria-live="polite">
            <Flashcard
              state={{ data: activeCard, loading: false, error: null }}
              answerRevealed={answerRevealed}
              onRevealChange={onRevealChange}
            />
          </div>
          <div className="flex justify-between gap-3">
            <Button variant="secondary" disabled={index <= 0} onClick={() => void onPrevious()}>Previous</Button>
            {index === cards.length - 1 && answerRevealed && deck ? <Link href={`/decks/${deck.id}/live`} className="inline-flex min-h-11 items-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">Ready? Go live</Link> : <Button disabled={index < 0 || index >= cards.length - 1} onClick={() => void onNext()}>Next</Button>}
          </div>
          <p className="text-xs text-slate-500">Shortcuts: left and right arrows to move, space or enter to show the answer.</p>
        </>
      ) : null}
    </section>
  );
}
