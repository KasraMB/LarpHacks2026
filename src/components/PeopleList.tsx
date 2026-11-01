"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import type { ApiError } from "@/contracts";
import type { PeopleListProps } from "./contracts";
import { ArrowIcon, Button, EmptyState, ErrorMessage, formatDate, Loading, SectionTitle, TextArea, TextField } from "./ui";
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

  const initialsOf = (value: string) => value.trim().split(/s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("");

  return (
    <section aria-labelledby="people-list-title" className="grid items-start gap-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-10">
      <div className="space-y-4">
        <SectionTitle aside={state.data ? <span className="tnum text-sm text-muted">{people.length} on file</span> : null}>
          <span id="people-list-title">Contacts</span>
        </SectionTitle>
        <ErrorMessage error={actionError} />
        <ErrorMessage error={state.error} />
        {state.loading && !state.data ? <Loading label="Loading people..." /> : null}
        {!state.loading && state.data && people.length === 0 ? <EmptyState>No people yet. Add the first person you talk to with the form.</EmptyState> : null}
        {people.length > 0 ? (
          <ul className="divide-y divide-rule overflow-hidden rounded-lg border border-line bg-surface">
            {people.map((person) => (
              <li key={person.id} className="flex flex-col gap-3 p-4 transition-colors hover:bg-[#fafaf8] sm:flex-row sm:items-center sm:gap-4 sm:px-5">
                <div className="flex min-w-0 flex-1 items-center gap-3.5">
                  <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-md bg-raised text-sm font-semibold text-ink">
                    {initialsOf(person.name) || "?"}
                  </span>
                  <div className="min-w-0 space-y-0.5">
                    <Link href={`/people/${person.id}`} className="group/link inline-flex max-w-full items-center gap-1.5 rounded font-semibold tracking-[-0.01em] hover:underline hover:decoration-control hover:underline-offset-4">
                      <span className="truncate">{person.name}</span>
                      <ArrowIcon className="shrink-0 text-faint transition-[transform,color] duration-150 group-hover/link:translate-x-0.5 group-hover/link:text-ink" />
                    </Link>
                    {person.notes ? <p className="truncate text-sm text-muted">{person.notes}</p> : null}
                    <p className="tnum text-[13px] text-muted">Last conversation: {formatDate(person.lastConversationAt)}</p>
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                  {confirmId === person.id ? (
                    <div role="group" aria-label={`Confirm deleting ${person.name}`} className="flex flex-wrap items-center gap-2 rounded-md bg-neg-bg py-1 pl-3 pr-1">
                      <span className="text-sm font-medium text-neg-ink">Delete {person.name}?</span>
                      <Button variant="danger" busy={deletingId === person.id} onClick={() => remove(person.id)} className="bg-white! hover:bg-white/70!">Confirm delete</Button>
                      <Button variant="secondary" onClick={() => setConfirmId(null)} className="bg-transparent! hover:bg-white/50!">Cancel</Button>
                    </div>
                  ) : (
                    <Button variant="secondary" onClick={() => setConfirmId(person.id)} aria-label={`Delete ${person.name}`} className="text-neg-ink! hover:bg-neg-bg!">Delete</Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <div className="rounded-lg bg-raised/70 p-5 sm:p-6 lg:sticky lg:top-20">
        <form onSubmit={submit} className="space-y-4">
          <div>
            <h3 className="mb-1 text-base font-semibold tracking-[-0.01em]">Add a person</h3>
            <p className="text-sm text-muted">Anyone who knows you by your cover. Alias keeps a separate ledger of what you told each of them.</p>
          </div>
          <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
          <TextArea label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          <Button type="submit" busy={creating} disabled={!name.trim()}>Add person</Button>
        </form>
      </div>
    </section>
  );
}
