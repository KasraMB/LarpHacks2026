"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import type { LiveModeProps } from "./contracts";
import { cardTypeLabels, CardTypeLabel, EvidenceList } from "./Flashcard";
import { LiveAssistant } from "./LiveAssistant";
import { isInteractiveTarget } from "./PrepMode";
import { ArrowIcon, Button, ErrorMessage, formatSerial } from "./ui";

export function LiveMode({
  state,
  activeCard,
  topics,
  activeInterestId,
  onPrevious,
  onNext,
  onJumpToInterest,
  onJumpToType,
}: LiveModeProps) {
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
    <section className="flex min-h-full flex-col bg-night text-ground" aria-labelledby="live-heading">
      <div className="flex items-center justify-between gap-3 border-b border-night-line px-4 py-2.5 sm:px-5">
        <h1 id="live-heading" className="flex items-center gap-2.5 text-base font-bold tracking-[-0.01em]">
          <span aria-hidden="true" className="pulse-dot size-2 rounded-full bg-stamp" />
          <span>Live</span>
          <span className="rounded-sm bg-night-raised px-2 py-0.5 font-mono text-[11px] font-semibold text-night-muted">
            BESIDE-CALL TELEPROMPTER
          </span>
        </h1>
        {deck ? (
          <Link
            href={`/decks/${deck.id}/prep`}
            className="inline-flex min-h-11 items-center rounded-sm font-mono text-xs font-semibold text-night-muted underline decoration-night-line underline-offset-4 hover:text-ground hover:decoration-ground focus-visible:outline-ground"
          >
            Switch to prep mode
          </Link>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-4 p-4 sm:p-5">
        {error ? (
          <div className="text-ink">
            <ErrorMessage error={error} />
          </div>
        ) : null}
        {loading && !deck ? (
          <p role="status" className="font-mono text-xs text-night-muted">
            Loading deck...
          </p>
        ) : null}
        {deck && deck.status !== "completed" && deck.status !== "failed" ? (
          <p role="status" className="flex items-center gap-2 text-sm text-night-muted">
            <span aria-hidden="true" className="pulse-dot size-1.5 rounded-full bg-signal" />
            Deck is still building. Use prep mode to watch progress.
          </p>
        ) : null}
        {deck?.status === "failed" ? (
          <p
            role="alert"
            className="rounded-sm border border-neg-line bg-neg-bg px-3.5 py-2.5 text-sm text-neg-ink"
          >
            {deck.failure?.message ?? "The deck could not be built."}
          </p>
        ) : null}
        {deck?.status === "completed" && cards.length === 0 ? (
          <p className="rounded-sm border border-dashed border-night-line px-4 py-6 text-center text-sm text-night-muted">
            This deck has no cards.
          </p>
        ) : null}

        {deck?.status === "completed" && cards.length > 0 ? <LiveAssistant key={deck.id} deck={deck} /> : null}

        {cards.length > 0 ? (
          <h2 className="font-mono text-xs font-semibold text-night-muted">BROWSE SAVED CARDS</h2>
        ) : null}

        {cards.length > 0 ? (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Card types">
            {(Object.keys(cardTypeLabels) as Array<keyof typeof cardTypeLabels>).map((type) => {
              const available = cards.some(
                (card) => card.type === type && (!activeInterestId || card.interestIds.includes(activeInterestId)),
              );
              const selected = activeCard?.type === type;
              return (
                <button
                  key={type}
                  type="button"
                  aria-pressed={selected}
                  disabled={!available}
                  onClick={() => void onJumpToType(type)}
                  className={`min-h-10 rounded-sm border px-3.5 text-sm font-semibold transition-colors focus-visible:outline-ground disabled:cursor-not-allowed disabled:opacity-50 ${
                    selected
                      ? "border-ground bg-ground text-ink"
                      : "border-night-line bg-night-raised text-ground hover:border-night-muted"
                  }`}
                >
                  {cardTypeLabels[type].name}
                </button>
              );
            })}
          </div>
        ) : null}

        {topics.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5" aria-label="Topics">
            {topics.map((topic) => {
              const active = topic.id === activeInterestId;
              return (
                <li key={topic.id}>
                  <button
                    type="button"
                    aria-pressed={active}
                    onClick={() => void onJumpToInterest(topic.id)}
                    className={`min-h-10 rounded-sm border px-3.5 text-sm font-semibold transition-colors focus-visible:outline-ground ${
                      active
                        ? "border-ground bg-ground text-ink"
                        : "border-night-line bg-night-raised text-ground hover:border-night-muted"
                    }`}
                  >
                    {topic.name}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}

        {activeCard ? (
          <article
            aria-live="polite"
            key={activeCard.id}
            className="card-in flex flex-col justify-between gap-5 rounded-sm border border-night-line bg-night-raised p-5 sm:p-6"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-night-line pb-3">
              <CardTypeLabel type={activeCard.type} large />
              <span className="font-mono text-xs font-semibold text-night-muted">
                {formatSerial("CRD", index + 1)} // {index + 1} OF {cards.length}
              </span>
            </div>

            <div className="space-y-4">
              <h2 className="break-words text-[22px] font-bold leading-[1.25] tracking-[-0.02em] text-night-muted sm:text-[26px]">
                {activeCard.prompt}
              </h2>
              <p className="break-words text-[24px] font-semibold leading-[1.3] tracking-[-0.015em] text-ground sm:text-[30px]">
                {activeCard.answer}
              </p>
            </div>

            <div className="border-t border-night-line pt-3.5">
              <EvidenceList evidence={activeCard.evidence} />
            </div>
          </article>
        ) : null}

        {cards.length > 0 ? (
          <div className="mt-auto space-y-2.5 pt-2">
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
              <Button
                variant="secondary"
                className="min-h-12 border-night-line! bg-night-raised! text-base text-ground! hover:bg-night-line! active:bg-night-line! disabled:text-night-muted!"
                disabled={index <= 0}
                onClick={() => void onPrevious()}
              >
                <ArrowIcon direction="left" />
                Previous
              </Button>
              <span className="tnum px-2 text-center font-mono text-sm font-bold text-night-muted">
                {String(index + 1).padStart(2, "0")} / {String(cards.length).padStart(2, "0")}
              </span>
              <Button
                className="min-h-12 border-ground! bg-ground! text-base text-ink! hover:bg-raised! active:bg-line! disabled:border-night-line! disabled:bg-night-raised! disabled:text-night-muted!"
                disabled={index < 0 || index >= cards.length - 1}
                onClick={() => void onNext()}
              >
                Next
                <ArrowIcon />
              </Button>
            </div>
            <p className="flex items-center justify-center gap-1.5 font-mono text-xs text-night-muted">
              <kbd className="kbd border-night-line! bg-night-raised! text-ground!">Left</kbd>
              <kbd className="kbd border-night-line! bg-night-raised! text-ground!">Right</kbd>
              <span>Use left and right arrow keys to move between cards.</span>
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
