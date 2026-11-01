"use client";

import { useState, type FormEvent } from "react";
import type { ApiError, Person } from "@/contracts";
import type { PersonDetailProps } from "./contracts";
import {
  Button,
  CheckIcon,
  ErrorMessage,
  formatCoordDate,
  formatDate,
  Loading,
  TextArea,
  TextField,
} from "./ui";
import { toApiError } from "@/lib/use-resource";

export function PersonDetail({ state, onUpdate, onDelete }: PersonDetailProps) {
  const person = state.data;
  if (!person) {
    return (
      <section aria-labelledby="person-detail-title" className="space-y-3">
        <h2 id="person-detail-title" className="text-[28px] font-bold tracking-[-0.025em]">
          Person
        </h2>
        {state.loading ? <Loading label="Loading person dossier..." /> : null}
        <ErrorMessage error={state.error} />
      </section>
    );
  }
  // Keyed so the draft resets when the saved person changes.
  return (
    <PersonForm
      key={person.updatedAt}
      person={person}
      loadError={state.error}
      onUpdate={onUpdate}
      onDelete={onDelete}
    />
  );
}

function PersonForm({
  person,
  loadError,
  onUpdate,
  onDelete,
}: {
  person: Person;
  loadError: ApiError | null;
  onUpdate: PersonDetailProps["onUpdate"];
  onDelete: PersonDetailProps["onDelete"];
}) {
  const [name, setName] = useState(person.name);
  const [notes, setNotes] = useState(person.notes);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [saved, setSaved] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await onUpdate({ id: person.id, data: { name, notes, interestIds: person.interestIds } });
      setSaved(true);
    } catch (e) {
      setError(toApiError(e));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setDeleting(true);
    setError(null);
    try {
      await onDelete({ id: person.id });
    } catch (e) {
      setError(toApiError(e));
      setDeleting(false);
    }
  }

  const initials = person.name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <section
      aria-labelledby="person-detail-title"
      className="rounded-sm border border-line bg-surface p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-rule pb-5">
        <div className="flex items-start gap-4">
          <span
            aria-hidden="true"
            className="grid size-14 shrink-0 place-items-center rounded-sm bg-ink font-mono text-lg font-bold tracking-[-0.02em] text-ground sm:size-16 sm:text-xl"
          >
            {initials || "?"}
          </span>
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <h2
                id="person-detail-title"
                className="break-words text-[30px] font-bold leading-[1.05] tracking-[-0.03em] text-ink sm:text-[38px]"
              >
                {person.name}
              </h2>
              <span className="serial-tag">CONTACT DOSSIER</span>
            </div>
            <p className="tnum font-mono text-xs text-muted">
              Last conversation:{" "}
              <strong className="text-ink" title={formatDate(person.lastConversationAt)}>
                {formatDate(person.lastConversationAt)}
              </strong>{" "}
              <span className="text-faint">[{formatCoordDate(person.lastConversationAt)}]</span>
            </p>
          </div>
        </div>

        <details className="group">
          <summary className="inline-flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-sm border border-line bg-raised px-3.5 text-sm font-semibold text-ink transition-colors hover:border-control hover:bg-rule [&::-webkit-details-marker]:hidden">
            Edit details
          </summary>
          <form
            onSubmit={save}
            className="mt-3 w-full max-w-xl space-y-3.5 rounded-sm border border-line bg-ground p-4 sm:p-5"
          >
            <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
            <TextArea label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
            <ErrorMessage error={error} />
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Button type="submit" busy={saving} disabled={!name.trim()}>
                Save changes
              </Button>
              {saved ? (
                <span
                  role="status"
                  className="inline-flex items-center gap-1 font-mono text-xs font-semibold text-pos-ink"
                >
                  <CheckIcon />
                  Saved.
                </span>
              ) : null}
              <span className="ml-auto">
                {confirming ? (
                  <div
                    role="group"
                    aria-label="Confirm delete"
                    className="flex flex-wrap items-center gap-2 rounded-sm border border-neg-line bg-neg-bg px-3 py-2 text-neg-ink"
                  >
                    <span className="text-sm font-semibold">Delete {person.name} and their history?</span>
                    <Button variant="danger" busy={deleting} onClick={remove}>
                      Confirm delete
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => setConfirming(false)}
                      className="bg-transparent! text-neg-ink! hover:bg-surface/60!"
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="secondary"
                    onClick={() => setConfirming(true)}
                    className="text-neg-ink! hover:bg-neg-bg!"
                  >
                    Delete person
                  </Button>
                )}
              </span>
            </div>
          </form>
        </details>
      </div>

      {person.notes ? (
        <p className="mt-4 max-w-[68ch] whitespace-pre-line text-[15px] leading-relaxed text-ink">
          {person.notes}
        </p>
      ) : (
        <p className="mt-4 text-sm text-muted">No contact notes recorded yet.</p>
      )}
      <ErrorMessage error={loadError} />
    </section>
  );
}
