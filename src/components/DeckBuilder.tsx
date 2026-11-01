"use client";

import Link from "next/link";
import { useState } from "react";
import type { ApiError } from "@/contracts";
import type { DeckBuilderProps } from "./contracts";
import { Button, Card, ErrorMessage, formatDate, Loading } from "./ui";
import { toApiError } from "@/lib/use-resource";

export function DeckBuilder({ personId, state, onBuild }: DeckBuilderProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const deck = state.data;
  const inFlight = deck !== null && (deck.status === "queued" || deck.status === "running");

  async function build(force: boolean) {
    setBusy(true);
    setError(null);
    try {
      await onBuild({ personId, force });
    } catch (e) {
      setError(toApiError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="deck-builder-title" className="space-y-3">
      <h2 id="deck-builder-title" className="text-lg font-semibold">Prep deck</h2>
      <Card className="space-y-3">
        {state.loading && !deck ? <Loading label="Loading deck..." /> : null}
        {!deck && !state.loading && !state.error ? <p className="text-sm text-slate-600">Build a deck from what you have said and the research for your shared interests.</p> : null}
        {deck ? (
          <div className="space-y-2 text-sm">
            <p role="status" className="font-medium">{deck.status === "completed" ? `${deck.cards.length} cards ready for your conversation` : deck.status === "queued" ? "Waiting to build your deck…" : deck.status === "running" ? "Building your deck…" : "Your deck could not be built"}</p>
            {deck.warnings.length > 0 ? (
              <ul className="list-disc rounded-md bg-amber-50 py-2 pl-7 pr-3 text-amber-900">
                {deck.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            ) : null}
            {deck.failure ? <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-red-800">{deck.failure.message}</p> : null}
            {deck.status === "completed" ? (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-3">
                  <Link href={`/decks/${deck.id}/prep`} className="inline-flex min-h-11 items-center rounded-md bg-slate-900 px-4 py-2.5 font-medium text-white hover:bg-slate-700">Open prep</Link>
                  <Link href={`/decks/${deck.id}/live`} className="inline-flex min-h-11 items-center rounded-md border border-slate-300 px-4 py-2.5 font-medium hover:bg-slate-100">Go live</Link>
                </div>
                <p className="text-xs text-slate-600">Built {formatDate(deck.createdAt)}. {deck.researchSince ? `Uses research newer than ${formatDate(deck.researchSince)}.` : "Uses all research available when built."} Rebuild to include later changes.</p>
              </div>
            ) : null}
          </div>
        ) : null}
        <ErrorMessage error={error} />
        <ErrorMessage error={state.error} />
        <div>
          {deck ? (
            <Button variant="secondary" busy={busy} disabled={inFlight} onClick={() => build(true)}>{deck.status === "failed" ? "Try building again" : "Rebuild deck"}</Button>
          ) : (
            <Button busy={busy} disabled={state.loading} onClick={() => build(false)}>Build prep deck</Button>
          )}
        </div>
      </Card>
    </section>
  );
}
