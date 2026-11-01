"use client";

import { useState, type FormEvent } from "react";
import type { ApiError, Person } from "@/contracts";
import type { PersonDetailProps } from "./contracts";
import { Button, Card, ErrorMessage, formatDate, Loading, TextArea, TextField } from "./ui";
import { toApiError } from "@/lib/use-resource";

export function PersonDetail({ state, onUpdate, onDelete }: PersonDetailProps) {
  const person = state.data;
  if (!person) {
    return (
      <section aria-labelledby="person-detail-title" className="space-y-3">
        <h2 id="person-detail-title" className="text-xl font-semibold">Person</h2>
        {state.loading ? <Loading label="Loading person..." /> : null}
        <ErrorMessage error={state.error} />
      </section>
    );
  }
  // Keyed so the draft resets when the saved person changes.
  return <PersonForm key={person.updatedAt} person={person} loadError={state.error} onUpdate={onUpdate} onDelete={onDelete} />;
}

function PersonForm({ person, loadError, onUpdate, onDelete }: {
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

  return (
    <section aria-labelledby="person-detail-title" className="space-y-4">
      <h2 id="person-detail-title" className="text-xl font-semibold">{person.name}</h2>
      <p className="text-sm text-slate-500">Last conversation: {formatDate(person.lastConversationAt)}</p>
      <Card>
        <form onSubmit={save} className="space-y-3">
          <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
          <TextArea label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          <div className="flex items-center gap-3">
            <Button type="submit" busy={saving} disabled={!name.trim()}>Save changes</Button>
            {saved ? <span role="status" className="text-sm text-emerald-700">Saved.</span> : null}
          </div>
        </form>
      </Card>
      <ErrorMessage error={error} />
      <ErrorMessage error={loadError} />
      <div className="flex items-center gap-2">
        {confirming ? (
          <>
            <span className="text-sm">Delete {person.name} and their history?</span>
            <Button variant="danger" busy={deleting} onClick={remove}>Confirm delete</Button>
            <Button variant="secondary" onClick={() => setConfirming(false)}>Cancel</Button>
          </>
        ) : (
          <Button variant="danger" onClick={() => setConfirming(true)}>Delete person</Button>
        )}
      </div>
    </section>
  );
}
