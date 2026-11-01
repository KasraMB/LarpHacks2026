"use client";

import { useState, type FormEvent } from "react";
import type { ApiError } from "@/contracts";
import type { ClaimsLedgerProps } from "./contracts";
import { Button, Card, EmptyState, ErrorMessage, formatDate, fromLocalInput, Loading, StatusBadge, TextArea, TextField, toLocalInput } from "./ui";
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

  const claims = [...(state.data ?? [])].sort((a, b) => Date.parse(b.saidAt) - Date.parse(a.saidAt));
  const byId = new Map(claims.map((c) => [c.id, c]));

  return (
    <section aria-labelledby="claims-ledger-title" className="space-y-4">
      <h3 id="claims-ledger-title" className="text-lg font-semibold">Claims ledger</h3>
      <Card>
        <form onSubmit={submit} className="space-y-3">
          <TextArea label="New claim" value={text} onChange={(e) => setText(e.target.value)} required />
          <TextField label="Said at" type="datetime-local" value={saidAt} onChange={(e) => setSaidAt(e.target.value)} required />
          <Button type="submit" busy={saving} disabled={!text.trim() || !saidAt}>Add claim</Button>
        </form>
      </Card>
      <ErrorMessage error={error} />
      <ErrorMessage error={state.error} />
      {state.loading && !state.data ? <Loading label="Loading claims..." /> : null}
      {!state.loading && state.data && claims.length === 0 ? <EmptyState>No claims recorded for this person.</EmptyState> : null}
      <ul className="space-y-3">
        {claims.map((claim) => {
          const flagged = claim.contradictions.length > 0;
          return (
            <li key={claim.id}>
              <Card className={flagged ? "border-red-400 bg-red-50" : ""}>
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-medium">{claim.text}</p>
                  <StatusBadge status={claim.checkStatus} />
                </div>
                <p className="mt-1 text-xs text-slate-500">Said {formatDate(claim.saidAt)}</p>
                {flagged ? (
                  <div role="alert" className="mt-3 space-y-2 rounded-md border border-red-300 bg-red-100 p-3 text-sm text-red-900">
                    <p className="font-semibold">Contradicts {claim.contradictions.length === 1 ? "an earlier claim" : "earlier claims"}</p>
                    <ul className="list-disc space-y-2 pl-5">
                      {claim.contradictions.map((c) => (
                        <li key={c.earlierClaimId}>
                          <p>{c.explanation}</p>
                          <p className="text-xs">Earlier claim: &quot;{byId.get(c.earlierClaimId)?.text ?? "not available"}&quot;</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {claim.checkFailure ? (
                  <p role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                    Check failed: {claim.checkFailure.message}
                  </p>
                ) : null}
              </Card>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
