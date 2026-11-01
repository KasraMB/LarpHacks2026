"use client";

import type { Card as CardModel } from "@/contracts";
import type { FlashcardProps } from "./contracts";
import { useDeckEvidence } from "./DeckEvidence";
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
  const { data, hasDeck, loading, researchSince } = useDeckEvidence();
  if (evidence.length === 0) return null;

  return (
    <details className="text-sm text-slate-700">
      <summary className="cursor-pointer font-medium underline decoration-slate-400 underline-offset-4">Why this card?</summary>
      <div className="mt-3 space-y-3">
        {loading && !data ? <p role="status" className="text-slate-600">Loading the saved evidence for this deck...</p> : null}
        <ul className="space-y-3">
          {evidence.map((item) => {
            if (item.kind === "claim") {
              const claim = data?.claims[item.claimId];
              if (!claim) {
                return (
                  <li key={`claim-${item.claimId}`}>
                    <p className="font-medium">Conversation claim</p>
                    <p className="text-slate-600">{loading ? "Loading claim details…" : "Claim details could not be loaded. The card still reflects the claim used when the deck was built."}</p>
                  </li>
                );
              }
              const speaker = data?.person?.id === claim.personId ? data.person?.name ?? "the person in this conversation" : "the person in this conversation";
              return (
                <li key={`claim-${item.claimId}`} className="space-y-1">
                  <p className="font-medium">You told {speaker} · {formatDate(claim.saidAt)}</p>
                  <blockquote className="break-words whitespace-pre-wrap text-slate-700">“{claim.text}”</blockquote>
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
                    <p className="break-words whitespace-pre-wrap text-slate-700">{fact.text}</p>
                    <p className="text-slate-600">
                      {fact.source.publishedAt ? `Published ${formatDate(fact.source.publishedAt)}` : `Collected ${formatDate(fact.source.retrievedAt)}`}
                    </p>
                  </>
                ) : (
                  <p className="text-slate-600">{loading ? "Loading research details…" : "Research details could not be loaded. This is the source saved with the card."}</p>
                )}
                <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="break-all text-blue-700 underline">
                  {fact ? "Open source" : `Open saved source (${hostname(sourceUrl)})`}
                </a>
              </li>
            );
          })}
        </ul>
        <div className="space-y-1 border-t border-slate-200 pt-3 text-xs text-slate-600">
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
    return new URL(url).hostname;
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
