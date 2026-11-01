"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { ApiError } from "@/contracts";
import type { ClaimsLedgerProps } from "./contracts";
import {
  AlertIcon,
  Button,
  EmptyState,
  ErrorMessage,
  formatCoordDate,
  formatDate,
  formatSerial,
  fromLocalInput,
  Loading,
  PlusIcon,
  StatusBadge,
  TextArea,
  TextField,
  toLocalInput,
} from "./ui";
import { toApiError } from "@/lib/use-resource";

export function ClaimsLedger({ personId, state, onCreate }: ClaimsLedgerProps) {
  const [text, setText] = useState("");
  const [saidAt, setSaidAt] = useState(() => toLocalInput(new Date().toISOString()));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onCreate({ personId, data: { text, interestId: null, saidAt: fromLocalInput(saidAt) } });
      setText("");
      setSaidAt(toLocalInput(new Date().toISOString()));
    } catch (e) {
      setError(toApiError(e));
    } finally {
      setSaving(false);
    }
  }

  const claims = [...(state.data ?? [])].sort(
    (a, b) => Date.parse(b.saidAt) - Date.parse(a.saidAt) || Date.parse(b.createdAt) - Date.parse(a.createdAt),
  );
  const byId = new Map(claims.map((c) => [c.id, c]));

  // Assign stable chronological serial numbers (CLM-01 is oldest claim, CLM-N is newest).
  const serialById = new Map<string, string>();
  const chronological = [...claims].reverse();
  chronological.forEach((c, idx) => {
    serialById.set(c.id, formatSerial("CLM", idx + 1));
  });

  const flagged = claims.filter((c) => c.contradictions.length > 0);
  const flaggedCount = flagged.length;
  const contradictedBy = new Map<string, string[]>();
  for (const c of flagged) {
    for (const x of c.contradictions) {
      contradictedBy.set(x.earlierClaimId, [...(contradictedBy.get(x.earlierClaimId) ?? []), c.id]);
    }
  }

  // Flags present on first load are history; only a flag that appears afterwards pulls the page to it.
  const seenFlags = useRef<Set<string> | null>(null);
  const [freshId, setFreshId] = useState<string | null>(null);
  const flaggedKey = flagged.map((c) => c.id).join(",");
  useEffect(() => {
    if (!state.data) return;
    const ids = flaggedKey ? flaggedKey.split(",") : [];
    if (seenFlags.current === null) {
      seenFlags.current = new Set(ids);
      return;
    }
    const fresh = ids.find((id) => !seenFlags.current!.has(id));
    ids.forEach((id) => seenFlags.current!.add(id));
    if (!fresh) return;
    setFreshId(fresh);
    document.getElementById(`claim-${fresh}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [flaggedKey, state.data]);

  const jumpTo = (id: string) => {
    const el = document.getElementById(`claim-${id}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    el?.focus({ preventScroll: true });
    setFreshId(id);
  };

  return (
    <section aria-labelledby="claims-ledger-title" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line pb-3.5">
        <div>
          <h2 id="claims-ledger-title" className="text-xl font-bold tracking-[-0.02em] text-ink">
            Claim history
          </h2>
          <p className="mt-1 text-sm text-muted">
            Everything you have told this person, newest first. New claims are checked against the old ones.
          </p>
        </div>
        {state.data ? (
          <div className="tnum flex flex-wrap items-center gap-2 font-mono text-xs text-muted">
            <span className="serial-tag">
              {String(claims.length).padStart(2, "0")} {claims.length === 1 ? "CLAIM" : "CLAIMS"}
            </span>
            {flaggedCount > 0 ? (
              <span className="inline-flex items-center gap-1.5 rounded-sm border border-neg-line bg-neg-bg px-2.5 py-0.5 text-xs font-semibold text-neg-ink">
                <span aria-hidden="true" className="size-1.5 rounded-full bg-stamp" />
                {flaggedCount} in conflict
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      {flaggedCount > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-stamp bg-stamp px-4 py-3.5 text-white sm:px-5">
          <p className="flex items-center gap-2.5 text-[15px] font-semibold">
            <AlertIcon className="shrink-0" />
            <span>
              {flaggedCount === 1
                ? "Your story has a conflict."
                : `Your story has ${flaggedCount} conflicts.`}{" "}
              Fix it before you talk to them again.
            </span>
          </p>
          <Button
            variant="secondary"
            onClick={() => jumpTo(flagged[0].id)}
            className="border-night-ink! bg-night-ink! text-header! hover:opacity-90!"
          >
            Show {flaggedCount === 1 ? "conflict" : "latest conflict"} (
            {serialById.get(flagged[0].id) ?? "CLM"})
          </Button>
        </div>
      ) : null}

      <details className="group rounded-sm border border-line bg-surface">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-sm px-4 text-sm font-semibold text-ink transition-colors hover:bg-raised/60 sm:px-5 [&::-webkit-details-marker]:hidden">
          <span>Add a past claim</span>
          <span className="inline-flex items-center gap-2 font-mono text-xs text-muted">
            <span>QUICK LOG</span>
            <PlusIcon className="transition-transform duration-150 group-open:rotate-45" />
          </span>
        </summary>
        <form
          onSubmit={submit}
          className="grid gap-3.5 border-t border-line bg-ground/50 p-4 sm:grid-cols-[minmax(0,1fr)_14rem] sm:p-5"
        >
          <p className="text-sm text-muted sm:col-span-2">
            Add something you said earlier. This checks for contradictions without changing the last-conversation date
            or research cutoff.
          </p>
          <div className="sm:col-span-2">
            <TextArea
              label="What you said"
              value={text}
              onChange={(e) => setText(e.target.value)}
              required
              rows={2}
              placeholder="What did you tell them?"
            />
          </div>
          <TextField
            label="When you said it"
            type="datetime-local"
            value={saidAt}
            onChange={(e) => setSaidAt(e.target.value)}
            required
          />
          <div className="flex items-end">
            <Button type="submit" busy={saving} disabled={!text.trim() || !saidAt} className="h-10 w-full">
              Save past claim
            </Button>
          </div>
          <div className="sm:col-span-2">
            <ErrorMessage error={error} />
          </div>
        </form>
      </details>

      <ErrorMessage error={state.error} />
      {state.loading && !state.data ? <Loading label="Loading claims..." /> : null}
      {!state.loading && state.data && claims.length === 0 ? (
        <EmptyState>No claims recorded for this person.</EmptyState>
      ) : null}

      {claims.length > 0 ? (
        <ol
          className="relative space-y-3 before:absolute before:bottom-3 before:left-[7px] before:top-3 before:w-px before:bg-line"
          aria-label="Claims, newest first"
        >
          {claims.map((claim) => {
            const isFlagged = claim.contradictions.length > 0;
            const laterIds = contradictedBy.get(claim.id);
            const pending = claim.checkStatus === "running" || claim.checkStatus === "queued";
            const serial = serialById.get(claim.id) ?? "CLM";

            return (
              <li
                key={claim.id}
                id={`claim-${claim.id}`}
                tabIndex={-1}
                className="card-in relative scroll-mt-24 pl-7 focus:outline-none"
              >
                <span
                  aria-hidden="true"
                  className={`absolute left-0 top-4 size-[15px] rounded-full border-[3px] border-ground ${
                    isFlagged ? "bg-stamp" : pending ? "bg-signal" : "bg-pos-ink"
                  }`}
                />
                <article
                  className={`overflow-hidden rounded-sm border bg-surface ${
                    isFlagged ? "border-stamp" : "border-line"
                  } ${freshId === claim.id ? "flag-in" : ""}`}
                >
                  {/* Coordinate & Serial Header Row */}
                  <div
                    className={`flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2 sm:px-5 ${
                      isFlagged
                        ? "border-neg-line bg-neg-bg/65"
                        : "border-rule bg-raised/45"
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="serial-tag">{serial}</span>
                      <span
                        className="tnum font-mono text-xs text-muted"
                        title={`Said ${formatDate(claim.saidAt)}`}
                      >
                        SAID: <strong className="text-ink">{formatCoordDate(claim.saidAt)}</strong>
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {laterIds ? (
                        <button
                          type="button"
                          onClick={() => jumpTo(laterIds[0])}
                          className="stamp rounded-sm border border-stamp bg-neg-bg px-2 py-0.5 font-mono text-[11px] font-bold uppercase tracking-[0.06em] text-stamp transition-colors hover:bg-stamp hover:text-white"
                          aria-label="Contradicted by a later claim. Show it."
                        >
                          Contradicted by {serialById.get(laterIds[0]) ?? "later claim"}
                        </button>
                      ) : null}
                      {claim.checkStatus !== "completed" ? <StatusBadge status={claim.checkStatus} /> : null}
                    </div>
                  </div>

                  {/* Claim Statement Body */}
                  <div className="p-4 sm:px-5 sm:py-4">
                    <p className="max-w-[70ch] text-[16px] font-semibold leading-snug text-ink">
                      {claim.text}
                    </p>
                  </div>

                  {claim.checkStatus === "completed" && !isFlagged ? (
                    <p className="border-t border-rule px-4 py-2 text-xs text-pos-ink sm:px-5">
                      Checked — no contradictions found
                    </p>
                  ) : null}

                  {/* Contradiction Alert Vector */}
                  {isFlagged ? (
                    <div
                      role="alert"
                      className="space-y-3 border-t border-neg-line bg-neg-bg px-4 py-3.5 text-sm text-neg-ink sm:px-5"
                    >
                      <p className="flex items-center gap-2 font-bold">
                        <AlertIcon className="shrink-0" />
                        <span>
                          Contradicts{" "}
                          {claim.contradictions.length === 1 ? "an earlier claim" : "earlier claims"}
                        </span>
                      </p>
                      <ul className="space-y-3">
                        {claim.contradictions.map((c) => {
                          const earlierSerial = serialById.get(c.earlierClaimId) ?? "CLM";
                          const earlierText = byId.get(c.earlierClaimId)?.text ?? "not available";
                          return (
                            <li key={c.earlierClaimId} className="space-y-2">
                              <p className="max-w-[68ch] leading-relaxed">{c.explanation}</p>
                              <div className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-neg-line bg-surface px-3.5 py-2.5 text-[13px] text-ink">
                                <p className="min-w-0 flex-1">
                                  <span className="mr-2 font-mono text-xs font-bold text-neg-ink">
                                    [{earlierSerial}]
                                  </span>
                                  <span>Earlier claim: &quot;{earlierText}&quot;</span>
                                </p>
                                {byId.has(c.earlierClaimId) ? (
                                  <button
                                    type="button"
                                    onClick={() => jumpTo(c.earlierClaimId)}
                                    className="shrink-0 rounded-sm border border-line bg-raised px-2.5 py-1 font-mono text-[11px] font-semibold text-ink hover:border-ink"
                                  >
                                    Jump to {earlierSerial}
                                  </button>
                                ) : null}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ) : null}

                  {claim.checkFailure ? (
                    <p
                      role="alert"
                      className="flex items-start gap-2 border-t border-warn-line bg-warn-bg px-4 py-2.5 text-sm text-warn-ink sm:px-5"
                    >
                      <AlertIcon className="mt-0.5 shrink-0" />
                      <span>Check failed: {claim.checkFailure.message}</span>
                    </p>
                  ) : null}
                </article>
              </li>
            );
          })}
        </ol>
      ) : null}
    </section>
  );
}
