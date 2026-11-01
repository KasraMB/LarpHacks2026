"use client";

import type { Card as CardModel } from "@/contracts";
import type { FlashcardProps } from "./contracts";
import { useDeckEvidence } from "./DeckEvidence";
import { Button, ErrorMessage, formatSerial, Loading } from "./ui";

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
  const { data, hasDeck, loading, researchSince } = useDeckEvidence();
  if (evidence.length === 0) return null;

  return (
    <details className="text-sm text-night-ink">
      <summary className="cursor-pointer font-medium underline decoration-night-line underline-offset-4">Why this card?</summary>
      <div className="mt-3 space-y-3">
        {loading && !data ? <p role="status" className="text-night-muted">Loading the saved evidence for this deck...</p> : null}
        <ul className="space-y-3">
          {evidence.map((item) => {
            if (item.kind === "claim") {
              const claim = data?.claims[item.claimId];
              if (!claim) {
                return (
                  <li key={`claim-${item.claimId}`}>
                    <p className="font-medium">Conversation claim</p>
                    <p className="text-night-muted">{loading ? "Loading claim details…" : "Claim details could not be loaded. The card still reflects the claim used when the deck was built."}</p>
                  </li>
                );
              }
              const speaker = data?.person?.id === claim.personId ? data.person?.name ?? "the person in this conversation" : "the person in this conversation";
              return (
                <li key={`claim-${item.claimId}`} className="space-y-1">
                  <p className="font-medium">You told {speaker} · {formatDate(claim.saidAt)}</p>
                  <blockquote className="break-words whitespace-pre-wrap text-night-ink">“{claim.text}”</blockquote>
                </li>
              );
            }

            const fact = data?.facts[item.factId];
            const sourceUrl = fact?.source.url ?? item.sourceUrl;
            return (
              <li key={`research-${item.factId}`} className="space-y-1">
                {fact ? (
                  <>
                    <p className="font-medium">{fact.source.title}</p>
                    <p className="break-words whitespace-pre-wrap text-night-ink">{fact.text}</p>
                    <p className="text-night-muted">
                      {fact.source.publishedAt ? `Published ${formatDate(fact.source.publishedAt)}` : `Collected ${formatDate(fact.source.retrievedAt)}`}
                    </p>
                  </>
                ) : (
                  <p className="text-night-muted">{loading ? "Loading research details…" : "Research details could not be loaded. This is the source saved with the card."}</p>
                )}
                <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="break-all text-night-ink underline">
                  {fact ? "Open source" : `Open saved source (${hostname(sourceUrl)})`}
                </a>
              </li>
            );
          })}
        </ul>
        <div className="space-y-1 border-t border-night-line pt-3 text-xs text-night-muted">
          <p>This card uses the evidence saved with this deck. New conversations or research are not added automatically; build a new deck to use updated information.</p>
          <p>
            {hasDeck
              ? researchSince
                ? `Research cutoff: ${formatDate(researchSince)}. The deck considered research newer than this time.`
                : "This deck considered all available research, with no conversation cutoff."
              : "This evidence is not attached to a saved deck snapshot."}
          </p>
        </div>
      </div>
    </details>
  );
}

function hostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(date) + " UTC";
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
