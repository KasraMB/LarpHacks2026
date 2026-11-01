"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import type { LiveModeProps } from "./contracts";
import { CardTypeLabel, EvidenceList } from "./Flashcard";
import { isInteractiveTarget } from "./PrepMode";
import { ArrowIcon, Button, ErrorMessage } from "./ui";

export function LiveMode({ state, activeCard, topics, activeInterestId, onPrevious, onNext, onJumpToInterest }: LiveModeProps) {
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
    <section className="flex min-h-full flex-col bg-night text-white" aria-labelledby="live-heading">
      <div className="flex items-center justify-between gap-3 border-b border-night-line px-4 py-2 sm:px-5">
        <h1 id="live-heading" className="flex items-center gap-2 text-base font-semibold">
          <span aria-hidden="true" className="pulse-dot size-2 rounded-full bg-[#ff6b5e]" />
          Live
        </h1>
        {deck ? (
          <Link href={`/decks/${deck.id}/prep`} className="inline-flex min-h-11 items-center rounded-sm text-sm text-night-muted underline decoration-night-line underline-offset-4 hover:text-white hover:decoration-white focus-visible:outline-white">
            Switch to prep mode
          </Link>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-4 p-4 sm:p-5">
        {error ? <div className="text-ink"><ErrorMessage error={error} /></div> : null}
        {loading && !deck ? <p role="status" className="text-night-muted">Loading deck...</p> : null}
        {deck && deck.status !== "completed" && deck.status !== "failed" ? (
          <p role="status" className="flex items-center gap-2 text-night-muted">
            <span aria-hidden="true" className="pulse-dot size-1.5 rounded-full bg-[#7fa8e6]" />
            Deck is still building. Use prep mode to watch progress.
          </p>
        ) : null}
        {deck?.status === "failed" ? (
          <p role="alert" className="rounded-md bg-neg-bg px-3 py-2.5 text-neg-ink">{deck.failure?.message ?? "The deck could not be built."}</p>
        ) : null}
        {deck?.status === "completed" && cards.length === 0 ? (
          <p className="rounded-md border border-dashed border-night-line px-4 py-6 text-center text-night-muted">This deck has no cards.</p>
        ) : null}

        {topics.length > 0 ? (
          <ul className="-mx-1 flex flex-wrap gap-1.5" aria-label="Topics">
            {topics.map((topic) => {
              const active = topic.id === activeInterestId;
              return (
                <li key={topic.id}>
                  <button
                    type="button"
                    aria-pressed={active}
                    onClick={() => void onJumpToInterest(topic.id)}
                    className={`min-h-11 rounded-full px-4 text-[15px] font-medium transition-colors focus-visible:outline-white ${active ? "bg-white text-ink" : "bg-night-raised text-white hover:bg-night-line"}`}
                  >
                    {topic.name}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}

        {activeCard ? (
          <div aria-live="polite" key={activeCard.id} className="card-in space-y-3 rounded-md bg-night-raised p-4 sm:p-5">
            <CardTypeLabel type={activeCard.type} large />
            <h2 className="text-[22px] font-semibold leading-[1.25] tracking-[-0.015em] sm:text-[26px]">{activeCard.prompt}</h2>
            <p className="text-[24px] font-medium leading-[1.3] tracking-[-0.01em] text-white sm:text-[30px]">{activeCard.answer}</p>
            <div className="border-t border-night-line pt-3 [&_.text-muted]:text-night-muted [&_a]:text-night-muted [&_a:hover]:text-white">
              <EvidenceList evidence={activeCard.evidence} />
            </div>
          </div>
        ) : null}

        {cards.length > 0 ? (
          <div className="mt-auto space-y-2.5 pt-2">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <Button
              variant="secondary"
              className="min-h-12 bg-night-raised! text-[17px] text-white! hover:bg-night-line! active:bg-night-line! disabled:text-night-muted!"
              disabled={index <= 0}
              onClick={() => void onPrevious()}
            >
              <ArrowIcon direction="left" />
              Previous
            </Button>
            <span className="tnum text-center text-[15px] text-night-muted">{index + 1} / {cards.length}</span>
            <Button
              className="min-h-12 bg-white! text-[17px] text-ink! hover:bg-[#e9e8e4]! active:bg-[#dcdbd6]! disabled:bg-night-raised! disabled:text-night-muted!"
              disabled={index < 0 || index >= cards.length - 1}
              onClick={() => void onNext()}
            >
              Next
              <ArrowIcon />
            </Button>
          </div>
          <p className="flex items-center justify-center gap-1.5 text-[13px] text-night-muted">
            <kbd className="kbd bg-night-raised! text-white!" aria-label="Left arrow">&larr;</kbd>
            <kbd className="kbd bg-night-raised! text-white!" aria-label="Right arrow">&rarr;</kbd>
            <span>arrow keys move between cards</span>
          </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
