"use client";

import Link from "next/link";
import { useState } from "react";
import type { ApiError } from "@/contracts";
import type { DeckBuilderProps } from "./contracts";
import { ArrowIcon, Button, ErrorMessage, formatDate, Loading } from "./ui";
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
    <section
      aria-labelledby="deck-builder-title"
      className="overflow-hidden rounded-sm border border-night-line bg-night text-night-ink"
    >
      <div className="space-y-4 p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3 border-b border-night-line pb-3.5">
          <h2 id="deck-builder-title" className="text-lg font-bold tracking-[-0.015em] text-night-ink">
            Prep deck
          </h2>
          {!deck ? (
            <span className="rounded-sm bg-night-raised px-2 py-0.5 font-mono text-[11px] font-semibold text-night-muted">
              UNBUILT
            </span>
          ) : null}
        </div>

        {state.loading && !deck ? (
          <div className="[&_.skeleton]:!bg-night-raised [&_div]:!border-night-line [&_div]:!bg-night-raised/50 [&_span]:!text-night-muted">
            <Loading label="Loading deck..." />
          </div>
        ) : null}

        {!deck && !state.loading && !state.error ? (
          <p className="text-sm leading-relaxed text-night-muted">
            Build a deck from what you have said and the research for your shared interests.
          </p>
        ) : null}

        {deck ? (
          <div className="space-y-3.5 text-sm">
            {deck.status === "completed" ? (
              <div className="flex items-baseline justify-between gap-2 rounded-sm bg-night-raised px-4 py-3">
                <p role="status" className="flex items-baseline gap-2">
                  <span className="tnum font-mono text-[36px] font-bold leading-none tracking-[-0.03em] text-night-ink">
                    {String(deck.cards.length).padStart(2, "0")}
                  </span>
                  <span className="text-sm font-medium text-night-muted">cards ready for your conversation</span>
                </p>
              </div>
            ) : null}
            {inFlight ? (
              <p role="status" className="flex items-center gap-2 rounded-sm bg-night-raised px-3.5 py-2.5 text-night-muted">
                <span aria-hidden="true" className="pulse-dot size-1.5 rounded-full bg-signal" />
                {deck.status === "queued" ? "Waiting to build your deck…" : "Building your deck…"}
              </p>
            ) : null}
            {deck.status === "failed" ? (
              <p role="status" className="font-medium text-night-ink">
                Your deck could not be built
              </p>
            ) : null}
            {deck.warnings.length > 0 ? (
              <ul className="list-disc space-y-1 rounded-sm border border-warn-line bg-warn-bg py-2.5 pl-7 pr-3 text-xs text-warn-ink">
                {deck.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            ) : null}
            {deck.failure ? (
              <p
                role="alert"
                className="rounded-sm border border-neg-line bg-neg-bg px-3 py-2.5 text-xs text-neg-ink"
              >
                {deck.failure.message}
              </p>
            ) : null}
            {deck.status === "completed" ? (
              <div className="grid gap-2 pt-1">
                <Link
                  href={`/decks/${deck.id}/prep`}
                  className="group inline-flex h-11 items-center justify-between gap-2 rounded-sm bg-night-ink px-3.5 text-sm font-bold text-night transition-opacity hover:opacity-90 focus-visible:outline-night-ink"
                >
                  <span>Open prep</span>
                  <ArrowIcon className="transition-transform duration-150 group-hover:translate-x-0.5" />
                </Link>
                <Link
                  href={`/decks/${deck.id}/live`}
                  className="group inline-flex h-11 items-center justify-between gap-2 rounded-sm border border-night-line bg-night-raised px-3.5 text-sm font-bold text-night-ink transition-colors hover:bg-night-line focus-visible:outline-night-ink"
                >
                  <span>Go live</span>
                  <ArrowIcon className="transition-transform duration-150 group-hover:translate-x-0.5" />
                </Link>
              </div>
            ) : null}
            {deck.status === "completed" ? (
              <p className="text-xs text-night-muted">
                Built {formatDate(deck.createdAt)}.{" "}
                {deck.researchSince
                  ? `Uses research newer than ${formatDate(deck.researchSince)}.`
                  : "Uses all research available when built."}{" "}
                Rebuild to include later changes.
              </p>
            ) : null}
          </div>
        ) : null}

        <ErrorMessage error={error} />
        <ErrorMessage error={state.error} />
        <div className="border-t border-night-line pt-3">
          {deck ? (
            <Button
              variant="secondary"
              busy={busy}
              disabled={inFlight}
              onClick={() => build(true)}
              className="w-full border-night-line! bg-night-raised! text-night-ink! hover:bg-night-line! active:bg-night-line!"
            >
              {deck.status === "failed" ? "Try building again" : "Rebuild deck"}
            </Button>
          ) : (
            <Button
              busy={busy}
              disabled={state.loading}
              onClick={() => build(false)}
              className="w-full border-night-ink! bg-night-ink! text-night! hover:opacity-90!"
            >
              Build prep deck
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
