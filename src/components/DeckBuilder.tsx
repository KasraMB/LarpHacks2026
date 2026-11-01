"use client";

import Link from "next/link";
import { useState } from "react";
import type { ApiError } from "@/contracts";
import type { DeckBuilderProps } from "./contracts";
import { Button, Card, ErrorMessage, formatDate, Loading, StatusBadge } from "./ui";
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
      <h3 id="deck-builder-title" className="text-lg font-semibold">Prep deck</h3>
      <Card className="space-y-3">
        {state.loading && !deck ? <Loading label="Loading deck..." /> : null}
        {!deck && !state.loading ? <p className="text-sm text-slate-600">No deck built yet.</p> : null}
        {deck ? (
          <div className="space-y-2 text-sm">
            <p className="flex items-center gap-2">Status: <StatusBadge status={deck.status} /></p>
            <p className="text-slate-500">Created {formatDate(deck.createdAt)}</p>
            {deck.status === "completed" ? <p>{deck.cards.length} cards</p> : null}
            {deck.warnings.length > 0 ? (
              <ul className="list-disc rounded-md bg-amber-50 py-2 pl-7 pr-3 text-amber-900">
                {deck.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            ) : null}
            {deck.failure ? <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-red-800">{deck.failure.message}</p> : null}
            {deck.status === "completed" ? (
              <p className="flex gap-4">
                <Link href={`/decks/${deck.id}/prep`} className="underline">Open prep mode</Link>
                <Link href={`/decks/${deck.id}/live`} className="underline">Open live mode</Link>
              </p>
            ) : null}
          </div>
        ) : null}
        <ErrorMessage error={error} />
        <ErrorMessage error={state.error} />
        <div>
          {deck ? (
            <Button variant="secondary" busy={busy} disabled={inFlight} onClick={() => build(true)}>Rebuild</Button>
          ) : (
            <Button busy={busy} onClick={() => build(false)}>Build deck</Button>
          )}
        </div>
      </Card>
    </section>
  );
}
