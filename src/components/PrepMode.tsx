"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { PrepModeProps } from "./contracts";
import { Flashcard } from "./Flashcard";
import { ArrowIcon, Button, CheckIcon, EmptyState, ErrorMessage, formatSerial, Loading, StatusBadge } from "./ui";

/** True when a key event came from something that handles keys itself. */
export function isInteractiveTarget(target: EventTarget | null, includeButtons: boolean) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tags = includeButtons ? ["INPUT", "TEXTAREA", "SELECT", "BUTTON", "A"] : ["INPUT", "TEXTAREA", "SELECT"];
  return tags.includes(target.tagName);
}

export function PrepMode({
  state,
  activeCard,
  answerRevealed,
  onRevealChange,
  onPrevious,
  onNext,
}: PrepModeProps) {
  const { data: deck, loading, error } = state;
  const cards = deck?.cards ?? [];
  const index = activeCard ? cards.findIndex((c) => c.id === activeCard.id) : -1;
  const isBuilding = deck?.status === "queued" || deck?.status === "running";
  const ready = deck?.status === "completed" && cards.length > 0;

  // Track rehearsed cards in this prep session (auto-marked when answer is revealed).
  const [rehearsedIds, setRehearsedIds] = useState<Set<string>>(() => new Set());

  const handleRevealChange = (revealed: boolean) => {
    if (revealed && activeCard) {
      setRehearsedIds((prev) => {
        const next = new Set(prev);
        next.add(activeCard.id);
        return next;
      });
    }
    onRevealChange(revealed);
  };

  const latest = useRef({
    onPrevious,
    onNext,
    onRevealChange: handleRevealChange,
    answerRevealed,
    ready,
  });
  latest.current = {
    onPrevious,
    onNext,
    onRevealChange: handleRevealChange,
    answerRevealed,
    ready,
  };

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
  const isCurrentRehearsed = activeCard ? rehearsedIds.has(activeCard.id) : false;

  return (
    <section className="space-y-6" aria-labelledby="prep-heading">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-5">
        <div>
          <h1
            id="prep-heading"
            className="text-[28px] font-bold leading-tight tracking-[-0.03em] text-ink sm:text-[34px]"
          >
            Prep
          </h1>
          <p className="mt-1.5 text-[15px] text-muted">
            Study before the call. Say each answer out loud before you reveal the verified receipt.
          </p>
        </div>
        {deck ? (
          <Link
            href={`/decks/${deck.id}/live`}
            className="group inline-flex h-11 items-center gap-2 rounded-sm border border-ink bg-ink px-4 text-sm font-semibold text-ground transition-opacity hover:opacity-90 sm:h-10"
          >
            <span>Switch to live mode</span>
            <ArrowIcon className="transition-transform duration-150 group-hover:translate-x-0.5" />
          </Link>
        ) : null}
      </div>

      <ErrorMessage error={error} />
      {loading && !deck ? <Loading label="Loading prep deck..." /> : null}

      {deck && isBuilding ? (
        <div
          className="flex items-center gap-3 rounded-sm border border-info-line bg-info-bg px-4 py-3.5 text-sm text-info-ink"
          role="status"
        >
          <span>Building deck...</span>
          <StatusBadge status={deck.status} />
        </div>
      ) : null}

      {deck?.status === "failed" ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-sm border border-neg-line bg-neg-bg px-4 py-3.5 text-sm text-neg-ink"
        >
          <StatusBadge status="failed" /> {deck.failure?.message ?? "The deck could not be built."}
        </div>
      ) : null}

      {deck && deck.warnings.length > 0 ? (
        <ul
          className="list-disc space-y-1 rounded-sm border border-warn-line bg-warn-bg py-3 pl-8 pr-4 text-sm text-warn-ink"
          aria-label="Deck warnings"
        >
          {deck.warnings.map((warning, i) => (
            <li key={i}>{warning}</li>
          ))}
        </ul>
      ) : null}

      {deck?.status === "completed" && cards.length === 0 ? (
        <EmptyState>This deck has no cards.</EmptyState>
      ) : null}

      {ready ? (
        <>
          <div className="space-y-2.5 rounded-sm border border-line bg-raised/70 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="tnum font-mono text-xs font-bold text-ink">
                Card {index + 1} of {cards.length} ({formatSerial("CRD", index + 1)})
              </p>
              <div className="flex items-center gap-3">
                <span className="tnum inline-flex items-center gap-1.5 font-mono text-xs font-semibold text-pos-ink">
                  <CheckIcon className="size-3.5" />
                  {rehearsedIds.size} of {cards.length} rehearsed
                </span>
                {isCurrentRehearsed ? (
                  <span className="rounded-sm border border-pos-line bg-pos-bg px-2 py-0.5 font-mono text-[11px] font-semibold text-pos-ink">
                    CHECKED
                  </span>
                ) : null}
              </div>
            </div>
            <span aria-hidden="true" className="block h-1.5 w-full overflow-hidden rounded-sm bg-surface">
              <span
                className="block h-full bg-ink transition-[width] duration-300"
                style={{ width: `${progress}%` }}
              />
            </span>
          </div>

          <div aria-live="polite">
            <Flashcard
              state={{ data: activeCard, loading: false, error: null }}
              answerRevealed={answerRevealed}
              onRevealChange={handleRevealChange}
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            <Button
              variant="secondary"
              disabled={index <= 0}
              onClick={() => void onPrevious()}
              className="min-h-11 px-4"
            >
              <ArrowIcon direction="left" />
              Previous
            </Button>
            <Button
              disabled={index < 0 || index >= cards.length - 1}
              onClick={() => void onNext()}
              className="min-h-11 px-4"
            >
              Next
              <ArrowIcon />
            </Button>
          </div>

          <p className="hidden font-mono text-xs text-muted sm:block">
            Shortcuts: <kbd className="kbd">Left</kbd> and <kbd className="kbd">Right</kbd> arrows to move,{" "}
            <kbd className="kbd">Space</kbd> or <kbd className="kbd">Enter</kbd> to show the answer.
          </p>
        </>
      ) : null}
    </section>
  );
}
