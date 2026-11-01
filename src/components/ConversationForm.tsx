"use client";

import { useState, type FormEvent } from "react";
import type { ConversationFormProps } from "./contracts";
import { Button, ErrorMessage, fromLocalInput, TextArea, TextField, toLocalInput } from "./ui";

type Draft = { key: number; text: string; saidAt: string };

export function ConversationForm({ personId, onSubmit, loading, error }: ConversationFormProps) {
  const [happenedAt, setHappenedAt] = useState(() => toLocalInput(new Date().toISOString()));
  const [notes, setNotes] = useState("");
  const [claims, setClaims] = useState<Draft[]>([]);
  const [nextKey, setNextKey] = useState(1);
  const [localError, setLocalError] = useState<string | null>(null);

  function addClaim() {
    setClaims((c) => [...c, { key: nextKey, text: "", saidAt: "" }]);
    setNextKey((k) => k + 1);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLocalError(null);
    if (!happenedAt) {
      setLocalError("Choose when the conversation happened.");
      return;
    }
    const filled = claims.filter((c) => c.text.trim());
    try {
      await onSubmit({
        personId,
        data: {
          happenedAt: fromLocalInput(happenedAt),
          notes,
          claims: filled.map((c) => ({
            text: c.text,
            interestId: null,
            saidAt: fromLocalInput(c.saidAt || happenedAt),
          })),
        },
      });
      setNotes("");
      setClaims([]);
      setHappenedAt(toLocalInput(new Date().toISOString()));
    } catch {
      // The parent controller surfaces the failure through the error prop.
    }
  }

  return (
    <section aria-labelledby="conversation-form-title" className="rounded-lg bg-raised/70 p-5 sm:p-6">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <h3 id="conversation-form-title" className="text-lg font-semibold tracking-[-0.015em]">Record a conversation</h3>
          <p className="mt-1 text-sm text-muted">Log a call or chat and the claims you made in it. Each claim joins the ledger and gets checked.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-[13rem_minmax(0,1fr)]">
          <TextField label="When it happened" type="datetime-local" value={happenedAt} onChange={(e) => setHappenedAt(e.target.value)} required />
          <TextArea label="Conversation notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
        </div>
        <fieldset className="space-y-3">
          <legend className="mb-2 text-sm font-medium">Claims you made</legend>
          {claims.length === 0 ? <p className="text-sm text-muted">No claims added.</p> : null}
          {claims.map((claim, index) => (
            <div key={claim.key} className="card-in grid gap-3 rounded-md bg-surface p-3.5 sm:grid-cols-[minmax(0,1fr)_13rem]">
              <TextArea
                label={`Claim ${index + 1}`}
                value={claim.text}
                rows={2}
                onChange={(e) => setClaims((all) => all.map((c) => (c.key === claim.key ? { ...c, text: e.target.value } : c)))}
              />
              <div className="flex flex-col gap-3">
                <TextField
                  label={`Claim ${index + 1} said at`}
                  type="datetime-local"
                  value={claim.saidAt || happenedAt}
                  onChange={(e) => setClaims((all) => all.map((c) => (c.key === claim.key ? { ...c, saidAt: e.target.value } : c)))}
                />
                <Button variant="secondary" onClick={() => setClaims((all) => all.filter((c) => c.key !== claim.key))} className="self-start text-neg-ink! hover:bg-neg-bg!">
                  Remove claim {index + 1}
                </Button>
              </div>
            </div>
          ))}
          <Button variant="secondary" onClick={addClaim} className="bg-surface! hover:bg-white/60!">Add claim</Button>
        </fieldset>
        {localError ? <p role="alert" className="rounded-md bg-neg-bg px-3 py-2 text-sm text-neg-ink">{localError}</p> : null}
        <ErrorMessage error={error} />
        <Button type="submit" busy={loading}>Save conversation</Button>
      </form>
    </section>
  );
}
