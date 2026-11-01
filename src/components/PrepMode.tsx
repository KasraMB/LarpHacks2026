"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import type { PrepModeProps } from "./contracts";
import { Flashcard } from "./Flashcard";
import { ArrowIcon, Button, EmptyState, ErrorMessage, Loading, StatusBadge } from "./ui";

/** True when a key event came from something that handles keys itself. */
export function isInteractiveTarget(target: EventTarget | null, includeButtons: boolean) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tags = includeButtons ? ["INPUT", "TEXTAREA", "SELECT", "BUTTON", "A"] : ["INPUT", "TEXTAREA", "SELECT"];
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

  const progress = ready && index >= 0 ? ((index + 1) / cards.length) * 100 : 0;

  return (
    <section className="space-y-5" aria-labelledby="prep-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 id="prep-heading" className="text-[28px] font-semibold leading-tight tracking-[-0.025em] sm:text-[32px]">Prep</h1>
          <p className="mt-1 text-[15px] text-muted">Study before the call. Say each answer out loud before you reveal it.</p>
        </div>
        {deck ? (
          <Link href={`/decks/${deck.id}/live`} className="group inline-flex h-11 items-center sm:h-9 gap-2 rounded-md bg-ink px-3.5 text-sm font-medium text-white transition-colors hover:bg-[#2a2a27]">
            Switch to live mode
            <ArrowIcon className="transition-transform duration-150 group-hover:translate-x-0.5" />
          </Link>
        ) : null}
      </div>

      <ErrorMessage error={error} />
      {loading && !deck ? <Loading label="Loading deck..." /> : null}

      {deck && isBuilding ? (
        <div className="flex items-center gap-3 rounded-lg bg-info-bg px-4 py-3.5 text-sm text-info-ink" role="status">
          <span>Building deck...</span>
          <StatusBadge status={deck.status} />
        </div>
      ) : null}

      {deck?.status === "failed" ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg bg-neg-bg px-4 py-3.5 text-sm text-neg-ink">
          <StatusBadge status="failed" /> {deck.failure?.message ?? "The deck could not be built."}
        </div>
      ) : null}

      {deck && deck.warnings.length > 0 ? (
        <ul className="list-disc space-y-1 rounded-lg bg-warn-bg py-3 pl-8 pr-4 text-sm text-warn-ink" aria-label="Deck warnings">
          {deck.warnings.map((warning, i) => <li key={i}>{warning}</li>)}
        </ul>
      ) : null}

      {deck?.status === "completed" && cards.length === 0 ? <EmptyState>This deck has no cards.</EmptyState> : null}

      {ready ? (
        <>
          <div className="flex items-center gap-4">
            <p className="tnum shrink-0 text-sm font-medium">Card {index + 1} of {cards.length}</p>
            <span aria-hidden="true" className="h-1 flex-1 overflow-hidden rounded-full bg-raised">
              <span className="block h-full rounded-full bg-ink transition-[width] duration-300" style={{ width: `${progress}%` }} />
            </span>
          </div>
          <div aria-live="polite">
            <Flashcard
              state={{ data: activeCard, loading: false, error: null }}
              answerRevealed={answerRevealed}
              onRevealChange={onRevealChange}
            />
          </div>
          <div className="flex justify-between gap-3">
            <Button variant="secondary" disabled={index <= 0} onClick={() => void onPrevious()} className="min-h-11 px-4">
              <ArrowIcon direction="left" />
              Previous
            </Button>
            <Button disabled={index < 0 || index >= cards.length - 1} onClick={() => void onNext()} className="min-h-11 px-4">
              Next
              <ArrowIcon />
            </Button>
          </div>
          <p className="hidden text-[13px] text-muted sm:block">
            Shortcuts: <kbd className="kbd">Left</kbd> and <kbd className="kbd">Right</kbd> arrows to move, <kbd className="kbd">Space</kbd> or <kbd className="kbd">Enter</kbd> to show the answer.
          </p>
        </>
      ) : null}
    </section>
  );
}
