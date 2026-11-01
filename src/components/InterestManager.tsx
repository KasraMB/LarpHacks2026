"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import type { ApiError, Interest } from "@/contracts";
import { toApiError } from "@/lib/use-resource";
import type { InterestManagerProps } from "./contracts";
import { Button, Card, EmptyState, ErrorMessage, Loading, TextArea, TextField } from "./ui";

const splitList = (value: string, commas: boolean) =>
  value.split(commas ? /[,\n]/ : /\n/).map((s) => s.trim()).filter(Boolean);

type FormValues = { name: string; searchTerms: string[]; feedUrls: string[] };

function InterestForm({
  initial, submitLabel, onSubmit, onCancel,
}: {
  initial?: Interest;
  submitLabel: string;
  onSubmit: (values: FormValues) => Promise<void>;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [terms, setTerms] = useState(initial?.searchTerms.join("\n") ?? "");
  const [feeds, setFeeds] = useState(initial?.feedUrls.join("\n") ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const feedUrls = splitList(feeds, false);
    const bad = feedUrls.find((u) => !URL.canParse(u));
    if (!name.trim()) return setError({ code: "VALIDATION_ERROR", message: "Name is required.", retryable: false });
    if (bad) return setError({ code: "VALIDATION_ERROR", message: `Not a valid URL: ${bad}`, retryable: false });
    setBusy(true);
    setError(null);
    try {
      await onSubmit({ name: name.trim(), searchTerms: splitList(terms, true), feedUrls });
      if (!initial) { setName(""); setTerms(""); setFeeds(""); }
    } catch (e) {
      setError(toApiError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
      <TextArea label="Search terms" hint="Separate with commas or new lines." value={terms} onChange={(e) => setTerms(e.target.value)} />
      <TextArea label="Feed URLs" hint="One URL per line." value={feeds} onChange={(e) => setFeeds(e.target.value)} />
      <ErrorMessage error={error} />
      <div className="flex gap-2">
        <Button type="submit" busy={busy}>{submitLabel}</Button>
        {onCancel ? <Button variant="secondary" onClick={onCancel} disabled={busy}>Cancel</Button> : null}
      </div>
    </form>
  );
}

function InterestRow({
  interest, onUpdate, onDelete,
}: { interest: Interest } & Pick<InterestManagerProps, "onUpdate" | "onDelete">) {
  const [mode, setMode] = useState<"view" | "edit" | "confirm">("view");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  async function remove() {
    setDeleting(true);
    setError(null);
    try {
      await onDelete({ id: interest.id });
    } catch (e) {
      setError(toApiError(e));
      setDeleting(false);
    }
  }

  if (mode === "edit") {
    return (
      <Card>
        <InterestForm
          initial={interest}
          submitLabel="Save"
          onCancel={() => setMode("view")}
          onSubmit={async (data) => { await onUpdate({ id: interest.id, data }); setMode("view"); }}
        />
      </Card>
    );
  }

  return (
    <Card className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium">
          <Link href={`/interests/${interest.id}`} className="underline hover:text-slate-600">{interest.name}</Link>
        </h3>
        {mode === "confirm" ? (
          <div className="flex items-center gap-2" role="group" aria-label={`Confirm deleting ${interest.name}`}>
            <span className="text-sm">Delete this interest?</span>
            <Button variant="danger" busy={deleting} onClick={remove}>Yes, delete</Button>
            <Button variant="secondary" disabled={deleting} onClick={() => setMode("view")}>Keep</Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setMode("edit")}>Edit</Button>
            <Button variant="danger" onClick={() => setMode("confirm")}>Delete</Button>
          </div>
        )}
      </div>
      <p className="text-sm text-slate-600">
        Search terms: {interest.searchTerms.length ? interest.searchTerms.join(", ") : "none"}
      </p>
      <p className="text-sm text-slate-600">Feeds: {interest.feedUrls.length ? interest.feedUrls.join(", ") : "none"}</p>
      <ErrorMessage error={error} />
    </Card>
  );
}

export function InterestManager({ state, onCreate, onUpdate, onDelete }: InterestManagerProps) {
  return (
    <section aria-labelledby="interest-manager-title" className="space-y-6">
      <h2 id="interest-manager-title" className="text-lg font-semibold">Interests</h2>
      {state.loading && !state.data ? <Loading /> : null}
      {state.error ? <ErrorMessage error={state.error} /> : null}
      {state.data && state.data.length === 0 ? <EmptyState>No interests yet. Add one below.</EmptyState> : null}
      {state.data && state.data.length > 0 ? (
        <ul className="space-y-3">
          {state.data.map((interest) => (
            <li key={interest.id}><InterestRow interest={interest} onUpdate={onUpdate} onDelete={onDelete} /></li>
          ))}
        </ul>
      ) : null}
      <Card>
        <h3 className="mb-3 font-medium">Add an interest</h3>
        <InterestForm submitLabel="Add interest" onSubmit={async (data) => { await onCreate(data); }} />
      </Card>
    </section>
  );
}
