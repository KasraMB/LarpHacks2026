"use client";

import Link from "next/link";
import { useState } from "react";
import type { ApiError } from "@/contracts";
import type { DeckBuilderProps } from "./contracts";
import { ArrowIcon, Button, ErrorMessage, formatDate, Loading, StatusBadge } from "./ui";
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
    <section aria-labelledby="deck-builder-title" className="overflow-hidden rounded-lg bg-ink text-white">
      <div className="space-y-4 p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <h3 id="deck-builder-title" className="text-lg font-semibold tracking-[-0.015em]">Prep deck</h3>
          {deck ? <StatusBadge status={deck.status} /> : null}
        </div>
        {state.loading && !deck ? (
          <div className="[&_.skeleton]:!bg-night-raised [&_span]:!text-night-muted">
            <Loading label="Loading deck..." />
          </div>
        ) : null}
        {!deck && !state.loading ? (
          <p className="text-sm leading-relaxed text-night-muted">No deck built yet. Build one to get flashcards on your backstory, what changed, and what not to say.</p>
        ) : null}
        {deck ? (
          <div className="space-y-3 text-sm">
            {deck.status === "completed" ? (
              <p className="flex items-baseline gap-2">
                <span className="tnum text-[40px] font-semibold leading-none tracking-[-0.03em]">{deck.cards.length}</span>
                <span className="text-night-muted">cards ready</span>
              </p>
            ) : null}
            {inFlight ? (
              <p className="flex items-center gap-2 text-night-muted">
                <span aria-hidden="true" className="pulse-dot size-1.5 rounded-full bg-[#7fa8e6]" />
                Building your cards. This updates on its own.
              </p>
            ) : null}
            <p className="tnum text-[13px] text-night-muted">Created {formatDate(deck.createdAt)}</p>
            {deck.warnings.length > 0 ? (
              <ul className="list-disc space-y-1 rounded-md bg-warn-bg py-2.5 pl-7 pr-3 text-warn-ink">
                {deck.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            ) : null}
            {deck.failure ? <p role="alert" className="rounded-md bg-neg-bg px-3 py-2.5 text-neg-ink">{deck.failure.message}</p> : null}
            {deck.status === "completed" ? (
              <div className="grid gap-2 pt-1">
                <Link href={`/decks/${deck.id}/prep`} className="group inline-flex h-11 items-center justify-between gap-2 rounded-md bg-white px-3.5 text-sm font-medium text-ink transition-colors hover:bg-[#e9e8e4] focus-visible:outline-white">
                  Open prep mode
                  <ArrowIcon className="transition-transform duration-150 group-hover:translate-x-0.5" />
                </Link>
                <Link href={`/decks/${deck.id}/live`} className="group inline-flex h-11 items-center justify-between gap-2 rounded-md bg-night-raised px-3.5 text-sm font-medium text-white transition-colors hover:bg-night-line focus-visible:outline-white">
                  Open live mode
                  <ArrowIcon className="transition-transform duration-150 group-hover:translate-x-0.5" />
                </Link>
              </div>
            ) : null}
          </div>
        ) : null}
        <ErrorMessage error={error} />
        <ErrorMessage error={state.error} />
        <div>
          {deck ? (
            <Button variant="secondary" busy={busy} disabled={inFlight} onClick={() => build(true)} className="bg-night-raised! text-white! hover:bg-night-line! active:bg-night-line!">Rebuild</Button>
          ) : (
            <Button busy={busy} onClick={() => build(false)} className="bg-white! text-ink! hover:bg-[#e9e8e4]! active:bg-[#dcdbd6]!">Build deck</Button>
          )}
        </div>
      </div>
    </section>
  );
}
