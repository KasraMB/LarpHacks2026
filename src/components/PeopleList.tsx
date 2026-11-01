"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import type { ApiError } from "@/contracts";
import type { PeopleListProps } from "./contracts";
import {
  ArrowIcon,
  Button,
  EmptyState,
  ErrorMessage,
  formatCoordDate,
  formatDate,
  formatSerial,
  Loading,
  SectionTitle,
  TextArea,
  TextField,
} from "./ui";
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

  const initialsOf = (value: string) =>
    value
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("");

  return (
    <section
      aria-labelledby="people-list-title"
      className="grid items-start gap-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-10"
    >
      <div className="space-y-4">
        <SectionTitle
          aside={
            state.data ? (
              <span className="serial-tag">
                {String(people.length).padStart(2, "0")} ON FILE
              </span>
            ) : null
          }
        >
          <span id="people-list-title">Contacts</span>
        </SectionTitle>
        <ErrorMessage error={actionError} />
        <ErrorMessage error={state.error} />
        {state.loading && !state.data ? <Loading label="Loading contacts register..." /> : null}
        {!state.loading && state.data && people.length === 0 ? (
          <EmptyState>No people yet. Add the first person you talk to with the form.</EmptyState>
        ) : null}
        {people.length > 0 ? (
          <ul className="divide-y divide-rule overflow-hidden rounded-sm border border-line bg-surface">
            {people.map((person, idx) => (
              <li
                key={person.id}
                className="flex flex-col gap-3 p-4 transition-colors hover:bg-ground/55 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-5 sm:py-4"
              >
                <div className="flex min-w-0 flex-1 items-start gap-3.5">
                  <span
                    aria-hidden="true"
                    className="grid size-11 shrink-0 place-items-center rounded-sm bg-ink font-mono text-sm font-bold text-ground"
                  >
                    {initialsOf(person.name) || "?"}
                  </span>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/people/${person.id}`}
                        className="group/link inline-flex max-w-full items-center gap-1.5 rounded-sm text-[17px] font-bold tracking-[-0.015em] text-ink hover:text-stamp"
                      >
                        <span className="truncate">{person.name}</span>
                        <ArrowIcon className="shrink-0 text-faint transition-[transform,color] duration-150 group-hover/link:translate-x-0.5 group-hover/link:text-stamp" />
                      </Link>
                      <span className="serial-tag">{formatSerial("CNT", idx + 1)}</span>
                    </div>
                    {person.notes ? <p className="truncate text-sm text-muted">{person.notes}</p> : null}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-0.5 font-mono text-xs text-muted">
                      <span className="tnum" title={formatDate(person.lastConversationAt)}>
                        Last conversation: <strong className="text-ink">{formatCoordDate(person.lastConversationAt)}</strong>
                      </span>
                      <span className="tnum">
                        Topics: <strong className="text-ink">{person.interestIds.length}</strong>
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                  {confirmId === person.id ? (
                    <div
                      role="group"
                      aria-label={`Confirm deleting ${person.name}`}
                      className="flex flex-wrap items-center gap-2 rounded-sm border border-neg-line bg-neg-bg py-1 pl-3 pr-1"
                    >
                      <span className="text-sm font-semibold text-neg-ink">Delete {person.name}?</span>
                      <Button
                        variant="danger"
                        busy={deletingId === person.id}
                        onClick={() => remove(person.id)}
                        className="bg-surface! hover:bg-surface/80!"
                      >
                        Confirm delete
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => setConfirmId(null)}
                        className="bg-transparent! hover:bg-surface/60!"
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <>
                      <Link
                        href={`/people/${person.id}`}
                        className="inline-flex min-h-9 items-center rounded-sm border border-ink bg-ink px-3 text-xs font-semibold text-ground transition-opacity hover:opacity-90"
                      >
                        Open dossier
                      </Link>
                      <Button
                        variant="secondary"
                        onClick={() => setConfirmId(person.id)}
                        aria-label={`Delete ${person.name}`}
                        className="text-neg-ink! hover:bg-neg-bg!"
                      >
                        Delete
                      </Button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="rounded-sm border border-line bg-raised/75 p-5 sm:p-6 lg:sticky lg:top-20">
        <form onSubmit={submit} className="space-y-4">
          <div className="flex items-center justify-between gap-2 border-b border-line pb-3">
            <h3 className="text-base font-bold tracking-[-0.01em] text-ink">Add a person</h3>
            <span className="serial-tag">NEW CONTACT</span>
          </div>
          <p className="text-sm leading-relaxed text-muted">
            Anyone who knows you by your cover. Alias keeps a separate ledger of what you told each of them.
          </p>
          <TextField label="Name" placeholder="e.g. Dana" value={name} onChange={(e) => setName(e.target.value)} required />
          <TextArea
            label="Notes"
            placeholder="Role, context, where you talk..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <Button type="submit" busy={creating} disabled={!name.trim()}>
            Add person
          </Button>
        </form>
      </div>
    </section>
  );
}
