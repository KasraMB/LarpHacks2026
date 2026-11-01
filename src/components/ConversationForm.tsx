"use client";

import { useState, type FormEvent } from "react";
import type { ConversationFormProps } from "./contracts";
import {
  Button,
  ErrorMessage,
  formatSerial,
  fromLocalInput,
  PlusIcon,
  TextArea,
  TextField,
  toLocalInput,
} from "./ui";

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
    <section
      aria-labelledby="conversation-form-title"
      className="rounded-sm border border-line bg-raised/75 p-5 sm:p-6"
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
          <h3 id="conversation-form-title" className="text-lg font-bold tracking-[-0.015em] text-ink">
            Record a conversation
          </h3>
          <span className="serial-tag">DEBRIEF // CUTOFF UPDATE</span>
        </div>
        <p className="text-sm leading-relaxed text-muted">
          Log a call or chat and the claims you made in it. Updating the conversation timestamp advances this contact’s
          research cutoff, and each claim gets checked against earlier ones.
        </p>
        <div className="grid gap-4 sm:grid-cols-[14rem_minmax(0,1fr)]">
          <TextField
            label="When it happened"
            type="datetime-local"
            value={happenedAt}
            onChange={(e) => setHappenedAt(e.target.value)}
            required
          />
          <TextArea
            label="Conversation notes"
            placeholder="Context from the call..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
          />
        </div>
        <fieldset className="space-y-3 border-t border-line pt-4">
          <legend className="mb-2 text-sm font-bold text-ink">Claims you made</legend>
          {claims.length === 0 ? (
            <p className="text-sm text-muted">No claims added to this conversation entry yet.</p>
          ) : null}
          {claims.map((claim, index) => (
            <div
              key={claim.key}
              className="card-in grid gap-3 rounded-sm border border-line bg-surface p-4 sm:grid-cols-[minmax(0,1fr)_14rem]"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="serial-tag">{formatSerial("DRAFT", index + 1)}</span>
                </div>
                <TextArea
                  label={`Claim ${index + 1}`}
                  value={claim.text}
                  rows={2}
                  onChange={(e) =>
                    setClaims((all) =>
                      all.map((c) => (c.key === claim.key ? { ...c, text: e.target.value } : c)),
                    )
                  }
                />
              </div>
              <div className="flex flex-col justify-between gap-3">
                <TextField
                  label={`Claim ${index + 1} said at`}
                  type="datetime-local"
                  value={claim.saidAt || happenedAt}
                  onChange={(e) =>
                    setClaims((all) =>
                      all.map((c) => (c.key === claim.key ? { ...c, saidAt: e.target.value } : c)),
                    )
                  }
                />
                <Button
                  variant="secondary"
                  onClick={() => setClaims((all) => all.filter((c) => c.key !== claim.key))}
                  className="self-start text-neg-ink! hover:bg-neg-bg!"
                >
                  Remove claim {index + 1}
                </Button>
              </div>
            </div>
          ))}
          <Button variant="secondary" onClick={addClaim} className="bg-surface! hover:bg-surface/80!">
            <PlusIcon className="size-4" />
            Add claim
          </Button>
        </fieldset>
        {localError ? (
          <p role="alert" className="rounded-sm border border-neg-line bg-neg-bg px-3 py-2 text-sm text-neg-ink">
            {localError}
          </p>
        ) : null}
        <ErrorMessage error={error} />
        <div className="border-t border-line pt-3">
          <Button type="submit" busy={loading}>
            Save conversation
          </Button>
        </div>
      </form>
    </section>
  );
}
