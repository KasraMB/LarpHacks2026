"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import type { ApiError } from "@/contracts";
import type { PeopleListProps } from "./contracts";
import { Button, Card, EmptyState, ErrorMessage, formatDate, Loading, TextArea, TextField } from "./ui";
import { toApiError } from "@/lib/use-resource";

export function PeopleList({ state, onCreate, onDelete }: PeopleListProps) {
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [creating, setCreating] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<ApiError | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setCreating(true);
    setActionError(null);
    try {
      await onCreate({ name, notes, interestIds: [] });
      setName("");
      setNotes("");
    } catch (e) {
      setActionError(toApiError(e));
    } finally {
      setCreating(false);
    }
  }

  async function remove(id: string) {
    setDeletingId(id);
    setActionError(null);
    try {
      await onDelete({ id });
      setConfirmId(null);
    } catch (e) {
      setActionError(toApiError(e));
    } finally {
      setDeletingId(null);
    }
  }

  const people = state.data ?? [];

  return (
    <section aria-labelledby="people-list-title" className="space-y-6">
      <h2 id="people-list-title" className="text-xl font-semibold">People</h2>
      <Card>
        <form onSubmit={submit} className="space-y-3">
          <h3 className="text-base font-medium">Add a person</h3>
          <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
          <TextArea label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          <Button type="submit" busy={creating} disabled={!name.trim()}>Add person</Button>
        </form>
      </Card>
      <ErrorMessage error={actionError} />
      <ErrorMessage error={state.error} />
      {state.loading && !state.data ? <Loading label="Loading people..." /> : null}
      {!state.loading && state.data && people.length === 0 ? <EmptyState>No people yet. Add someone above.</EmptyState> : null}
      <ul className="space-y-3">
        {people.map((person) => (
          <li key={person.id}>
            <Card className="flex items-start justify-between gap-4">
              <div className="min-w-0 space-y-1">
                <Link href={`/people/${person.id}`} className="font-medium underline">{person.name}</Link>
                {person.notes ? <p className="truncate text-sm text-slate-600">{person.notes}</p> : null}
                <p className="text-xs text-slate-500">Last conversation: {formatDate(person.lastConversationAt)}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {confirmId === person.id ? (
                  <>
                    <span className="text-sm">Delete {person.name}?</span>
                    <Button variant="danger" busy={deletingId === person.id} onClick={() => remove(person.id)}>Confirm delete</Button>
                    <Button variant="secondary" onClick={() => setConfirmId(null)}>Cancel</Button>
                  </>
                ) : (
                  <Button variant="danger" onClick={() => setConfirmId(person.id)} aria-label={`Delete ${person.name}`}>Delete</Button>
                )}
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}
