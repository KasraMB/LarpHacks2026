"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { ApiError } from "@/contracts";
import type { ClaimsLedgerProps } from "./contracts";
import { AlertIcon, Button, EmptyState, ErrorMessage, formatDate, fromLocalInput, Loading, StatusBadge, TextArea, TextField, toLocalInput } from "./ui";
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

  const claims = [...(state.data ?? [])].sort((a, b) => Date.parse(b.saidAt) - Date.parse(a.saidAt) || Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const byId = new Map(claims.map((c) => [c.id, c]));

  const flagged = claims.filter((c) => c.contradictions.length > 0);
  const flaggedCount = flagged.length;
  const contradictedBy = new Map<string, string[]>();
  for (const c of flagged) for (const x of c.contradictions) contradictedBy.set(x.earlierClaimId, [...(contradictedBy.get(x.earlierClaimId) ?? []), c.id]);

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
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 id="claims-ledger-title" className="text-xl font-semibold tracking-[-0.02em]">Claims ledger</h3>
          <p className="mt-1 text-sm text-muted">Everything you have told this person, newest first. New claims are checked against the old ones.</p>
        </div>
        {state.data ? (
          <p className="tnum flex items-center gap-3 text-sm text-muted">
            <span>{claims.length} {claims.length === 1 ? "claim" : "claims"}</span>
            {flaggedCount > 0 ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-neg-bg px-2 py-0.5 text-xs font-medium text-neg-ink">
                <span aria-hidden="true" className="size-1.5 rounded-full bg-stamp" />
                {flaggedCount} in conflict
              </span>
            ) : null}
          </p>
        ) : null}
      </div>

      {flaggedCount > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-stamp px-4 py-3 text-white sm:px-5">
          <p className="flex items-center gap-2.5 text-[15px] font-medium">
            <AlertIcon className="shrink-0" />
            {flaggedCount === 1 ? "Your story has a conflict." : `Your story has ${flaggedCount} conflicts.`} Fix it before you talk to them again.
          </p>
          <Button variant="secondary" onClick={() => jumpTo(flagged[0].id)} className="bg-white! text-neg-ink! hover:bg-white/85!">
            Show {flaggedCount === 1 ? "conflict" : "latest conflict"}
          </Button>
        </div>
      ) : null}

      <details className="group rounded-lg border border-line bg-surface">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-4 text-sm font-medium hover:bg-raised/50 sm:px-5 [&::-webkit-details-marker]:hidden">
          Add a single claim
          <span aria-hidden="true" className="text-lg leading-none text-muted transition-transform duration-150 group-open:rotate-45">+</span>
        </summary>
      <form onSubmit={submit} className="grid gap-3 border-t border-line p-4 sm:grid-cols-[minmax(0,1fr)_13rem] sm:p-5">
        <div className="sm:col-span-2">
          <TextArea label="New claim" value={text} onChange={(e) => setText(e.target.value)} required rows={2} placeholder="What did you tell them?" />
        </div>
        <TextField label="Said at" type="datetime-local" value={saidAt} onChange={(e) => setSaidAt(e.target.value)} required />
        <div className="flex items-end">
          <Button type="submit" busy={saving} disabled={!text.trim() || !saidAt} className="h-10 w-full">Add claim</Button>
        </div>
      </form>
      </details>
      <ErrorMessage error={error} />
      <ErrorMessage error={state.error} />
      {state.loading && !state.data ? <Loading label="Loading claims..." /> : null}
      {!state.loading && state.data && claims.length === 0 ? <EmptyState>No claims recorded for this person.</EmptyState> : null}
      {claims.length > 0 ? (
        <ol className="relative space-y-2.5 before:absolute before:bottom-3 before:left-[7px] before:top-3 before:w-px before:bg-line" aria-label="Claims, newest first">
          {claims.map((claim) => {
            const flagged = claim.contradictions.length > 0;
            const laterIds = contradictedBy.get(claim.id);
            const pending = claim.checkStatus === "running" || claim.checkStatus === "queued";
            return (
              <li key={claim.id} id={`claim-${claim.id}`} tabIndex={-1} className="card-in relative scroll-mt-24 pl-7 focus:outline-none">
                <span
                  aria-hidden="true"
                  className={`absolute left-0 top-5 size-[15px] rounded-full border-[3px] border-ground ${flagged ? "bg-stamp" : pending ? "bg-signal" : "bg-control"}`}
                />
                <article className={`overflow-hidden rounded-lg border bg-surface ${flagged ? "border-[#f3b8b0]" : "border-line"} ${freshId === claim.id ? "flag-in" : ""}`}>
                  <div className="space-y-2 p-4 sm:px-5">
                    <div className="flex flex-col-reverse items-start gap-2 sm:flex-row sm:justify-between sm:gap-4">
                      <p className="text-[15px] font-medium leading-snug">{claim.text}</p>
                      <StatusBadge status={claim.checkStatus} />
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="tnum text-[13px] text-muted">Said {formatDate(claim.saidAt)}</p>
                      {laterIds ? (
                        <button
                          type="button"
                          onClick={() => jumpTo(laterIds[0])}
                          className="stamp rounded-[3px] border-2 border-stamp px-2 py-0.5 text-[12px] font-bold uppercase tracking-[0.12em] text-stamp hover:bg-neg-bg"
                          aria-label={`Contradicted by a later claim. Show it.`}
                        >
                          Contradicted
                        </button>
                      ) : null}
                    </div>
                  </div>
                  {flagged ? (
                    <div role="alert" className="space-y-3 bg-neg-bg px-4 py-3.5 text-sm text-neg-ink sm:px-5">
                      <p className="flex items-center gap-2 font-semibold">
                        <AlertIcon />
                        Contradicts {claim.contradictions.length === 1 ? "an earlier claim" : "earlier claims"}
                      </p>
                      <ul className="space-y-3">
                        {claim.contradictions.map((c) => (
                          <li key={c.earlierClaimId} className="space-y-1.5">
                            <p className="leading-relaxed">{c.explanation}</p>
                            <p className="rounded-md bg-white/70 px-3 py-2 text-[13px] text-[#5c1416]">
                              Earlier claim: &quot;{byId.get(c.earlierClaimId)?.text ?? "not available"}&quot;
                            </p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {claim.checkFailure ? (
                    <p role="alert" className="flex items-start gap-2 bg-warn-bg px-4 py-2.5 text-sm text-warn-ink sm:px-5">
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
