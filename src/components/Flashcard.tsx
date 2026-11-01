"use client";

import type { Card as CardModel } from "@/contracts";
import type { FlashcardProps } from "./contracts";
import {
  Button,
  CheckIcon,
  ErrorMessage,
  ExternalLinkIcon,
  formatSerial,
  Loading,
} from "./ui";

export const cardTypeLabels: Record<CardModel["type"], { name: string; code: string; style: string }> = {
  back_story: {
    name: "Back story",
    code: "TYPE // BACKSTORY",
    style: "border border-line bg-raised text-ink",
  },
  what_changed: {
    name: "What changed",
    code: "TYPE // DELTA INTEL",
    style: "border border-info-line bg-info-bg text-info-ink",
  },
  if_she_asks: {
    name: "If she asks",
    code: "TYPE // RESPONSE CUE",
    style: "border border-pos-line bg-pos-bg text-pos-ink",
  },
  dont_say: {
    name: "Don't say",
    code: "TYPE // TRAP WARNING",
    style: "border border-neg-line bg-neg-bg text-neg-ink",
  },
};

export function CardTypeLabel({ type, large = false }: { type: CardModel["type"]; large?: boolean }) {
  const label = cardTypeLabels[type];
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm font-mono font-bold uppercase tracking-[0.04em] ${
        large ? "px-3 py-1 text-xs" : "px-2.5 py-0.5 text-[11px]"
      } ${label.style}`}
    >
      {label.name}
    </span>
  );
}

export function EvidenceList({ evidence }: { evidence: CardModel["evidence"] }) {
  return (
    <ul className="flex flex-wrap gap-2 text-xs text-muted" aria-label="Supporting receipts">
      {evidence.map((item, index) => (
        <li key={index}>
          {item.kind === "research" ? (
            <a
              href={item.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-sm border border-night-line bg-night-raised px-2.5 py-1 font-mono text-[11px] font-medium text-night-muted transition-colors hover:border-night-ink hover:text-night-ink"
            >
              <span>SRC-{String(index + 1).padStart(2, "0")}: {hostname(item.sourceUrl)}</span>
              <ExternalLinkIcon />
            </a>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-sm border border-night-line bg-night-raised px-2.5 py-1 font-mono text-[11px] font-medium text-night-muted">
              <CheckIcon className="size-3" />
              <span>RECEIPT: FROM LOGGED CLAIM</span>
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

function hostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
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
  const serial = formatSerial("CRD", card.position + 1);

  return (
    <article
      key={card.id}
      className="card-in flex min-h-[21rem] flex-col overflow-hidden rounded-sm border border-line bg-surface"
    >
      {/* Top Datum Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule bg-raised/60 px-5 py-3 sm:px-8">
        <div className="flex flex-wrap items-center gap-2">
          <span className="serial-tag">{serial}</span>
          <CardTypeLabel type={card.type} />
        </div>
        <span className="font-mono text-[11px] font-semibold text-muted">
          {answerRevealed ? "ANSWER REVEALED" : "PROMPT // SPEAK FIRST"}
        </span>
      </div>

      {/* Prompt Zone */}
      <div className="flex flex-1 flex-col justify-between gap-6 p-6 sm:p-8">
        <h2 className="max-w-[54ch] text-[24px] font-bold leading-[1.2] tracking-[-0.025em] text-balance text-ink sm:text-[31px]">
          {card.prompt}
        </h2>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-rule pt-4">
          <Button
            variant={answerRevealed ? "secondary" : "primary"}
            aria-expanded={answerRevealed}
            aria-controls={answerId}
            onClick={() => onRevealChange(!answerRevealed)}
          >
            {answerRevealed ? "Hide answer" : "Show answer"}
          </Button>
          <span className="font-mono text-xs text-muted">
            {card.evidence.length} {card.evidence.length === 1 ? "receipt attached" : "receipts attached"}
          </span>
        </div>
      </div>

      {/* Revealed Answer & Receipts Zone */}
      <div
        id={answerId}
        hidden={!answerRevealed}
        className="card-in space-y-4 border-t border-night-line bg-night px-6 py-6 text-night-ink sm:px-8"
      >
        <p className="max-w-[65ch] text-[19px] font-medium leading-relaxed text-night-ink">{card.answer}</p>
        <div className="border-t border-night-line pt-3.5">
          <EvidenceList evidence={card.evidence} />
        </div>
      </div>
    </article>
  );
}
