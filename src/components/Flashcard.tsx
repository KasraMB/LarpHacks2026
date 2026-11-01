"use client";

import type { Card as CardModel } from "@/contracts";
import type { FlashcardProps } from "./contracts";
import { Button, ErrorMessage, Loading } from "./ui";

export const cardTypeLabels: Record<CardModel["type"], { name: string; style: string }> = {
  back_story: { name: "Back story", style: "bg-raised text-ink" },
  what_changed: { name: "What changed", style: "bg-info-bg text-info-ink" },
  if_she_asks: { name: "If she asks", style: "bg-pos-bg text-pos-ink" },
  dont_say: { name: "Don't say", style: "bg-neg-bg text-neg-ink" },
};

export function CardTypeLabel({ type, large = false }: { type: CardModel["type"]; large?: boolean }) {
  const label = cardTypeLabels[type];
  return (
    <span className={`inline-block whitespace-nowrap rounded-full font-medium ${large ? "px-3 py-1 text-[15px]" : "px-2.5 py-0.5 text-xs"} ${label.style}`}>
      {label.name}
    </span>
  );
}

export function EvidenceList({ evidence }: { evidence: CardModel["evidence"] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted">
      {evidence.map((item, index) => (
        <li key={index}>
          {item.kind === "research" ? (
            <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="link hover:text-ink">
              Source: {hostname(item.sourceUrl)}
            </a>
          ) : (
            <span>From your claim</span>
          )}
        </li>
      ))}
    </ul>
  );
}

function hostname(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export function Flashcard({ state, answerRevealed, onRevealChange }: FlashcardProps) {
  const { data: card, loading, error } = state;
  if (error) return <ErrorMessage error={error} />;
  if (loading && !card) return <Loading label="Loading card..." />;
  if (!card) return <p className="text-sm text-muted">No card selected.</p>;

  const answerId = `answer-${card.id}`;
  return (
    <article key={card.id} className="card-in flex min-h-[22rem] flex-col overflow-hidden rounded-lg border border-line bg-surface">
      <div className="flex flex-1 flex-col gap-6 p-6 sm:p-9">
        <div className="flex items-center justify-between gap-3">
          <CardTypeLabel type={card.type} />
        </div>
        <h2 className="max-w-3xl text-[24px] font-semibold leading-[1.2] tracking-[-0.02em] text-balance sm:text-[32px]">{card.prompt}</h2>
        <div className="mt-auto">
          <Button
            variant="secondary"
            aria-expanded={answerRevealed}
            aria-controls={answerId}
            onClick={() => onRevealChange(!answerRevealed)}
          >
            {answerRevealed ? "Hide answer" : "Show answer"}
          </Button>
        </div>
      </div>
      <div id={answerId} hidden={!answerRevealed} className="card-in space-y-3 bg-ink px-6 py-6 text-white sm:px-9 [&_.text-muted]:text-night-muted">
        <p className="max-w-3xl text-[19px] leading-relaxed">{card.answer}</p>
        <EvidenceList evidence={card.evidence} />
      </div>
    </article>
  );
}
