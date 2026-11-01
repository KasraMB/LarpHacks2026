"use client";

import { useState, type FormEvent } from "react";
import type { ConversationFormProps } from "./contracts";
import { Button, Card, ErrorMessage, fromLocalInput, TextArea, TextField, toLocalInput } from "./ui";

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
    <section aria-labelledby="conversation-form-title">
      <Card>
        <form onSubmit={submit} className="space-y-3">
          <h3 id="conversation-form-title" className="text-base font-medium">Record a conversation</h3>
          <p className="text-sm text-slate-600">Save what you discussed and any claims you made. The most recent conversation sets the research cutoff for your next deck; an older entry keeps the current cutoff.</p>
          <TextField label="When it happened" type="datetime-local" value={happenedAt} onChange={(e) => setHappenedAt(e.target.value)} required />
          <TextArea label="Conversation notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">What you said in this conversation (optional)</legend>
            {claims.length === 0 ? <p className="text-sm text-slate-500">No claims added.</p> : null}
            {claims.map((claim, index) => (
              <div key={claim.key} className="space-y-2 rounded-md border border-slate-200 p-3">
                <TextArea
                  label={`Claim ${index + 1}`}
                  value={claim.text}
                  onChange={(e) => setClaims((all) => all.map((c) => (c.key === claim.key ? { ...c, text: e.target.value } : c)))}
                />
                <TextField
                  label={`Claim ${index + 1} said at`}
                  type="datetime-local"
                  value={claim.saidAt || happenedAt}
                  onChange={(e) => setClaims((all) => all.map((c) => (c.key === claim.key ? { ...c, saidAt: e.target.value } : c)))}
                />
                <Button variant="secondary" onClick={() => setClaims((all) => all.filter((c) => c.key !== claim.key))}>
                  Remove claim {index + 1}
                </Button>
              </div>
            ))}
            <Button variant="secondary" onClick={addClaim}>Add claim</Button>
          </fieldset>
          {localError ? <p role="alert" className="text-sm text-red-700">{localError}</p> : null}
          <ErrorMessage error={error} />
          <Button type="submit" busy={loading}>Save conversation</Button>
        </form>
      </Card>
    </section>
  );
}
