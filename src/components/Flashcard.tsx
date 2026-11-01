"use client";

import type { Card as CardModel } from "@/contracts";
import type { FlashcardProps } from "./contracts";
import { Button, Card, ErrorMessage, Loading } from "./ui";

export const cardTypeLabels: Record<CardModel["type"], { name: string; style: string }> = {
  back_story: { name: "Back story", style: "bg-violet-100 text-violet-800" },
  what_changed: { name: "What changed", style: "bg-blue-100 text-blue-800" },
  if_she_asks: { name: "If she asks", style: "bg-emerald-100 text-emerald-800" },
  dont_say: { name: "Don't say", style: "bg-red-100 text-red-800" },
};

export function CardTypeLabel({ type, large = false }: { type: CardModel["type"]; large?: boolean }) {
  const label = cardTypeLabels[type];
  return (
    <span className={`inline-block rounded-full font-semibold ${large ? "px-3 py-1 text-base" : "px-2 py-0.5 text-xs"} ${label.style}`}>
      {label.name}
    </span>
  );
}

export function EvidenceList({ evidence }: { evidence: CardModel["evidence"] }) {
  return (
    <ul className="space-y-1 text-sm text-slate-600">
      {evidence.map((item, index) => (
        <li key={index}>
          {item.kind === "research" ? (
            <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline">
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
  if (!card) return <p className="text-sm text-slate-500">No card selected.</p>;

  const answerId = `answer-${card.id}`;
  return (
    <Card className="space-y-4">
      <CardTypeLabel type={card.type} />
      <h2 className="text-xl font-semibold text-slate-900">{card.prompt}</h2>
      <Button
        variant="secondary"
        aria-expanded={answerRevealed}
        aria-controls={answerId}
        onClick={() => onRevealChange(!answerRevealed)}
      >
        {answerRevealed ? "Hide answer" : "Show answer"}
      </Button>
      <div id={answerId} hidden={!answerRevealed} className="space-y-3 border-t border-slate-200 pt-4">
        <p className="text-lg text-slate-900">{card.answer}</p>
        <EvidenceList evidence={card.evidence} />
      </div>
    </Card>
  );
}
