"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import type { ApiError, Interest } from "@/contracts";
import { toApiError } from "@/lib/use-resource";
import type { InterestManagerProps } from "./contracts";
import { ArrowIcon, Button, Card, EmptyState, ErrorMessage, Loading, SectionTitle, TextArea, TextField } from "./ui";

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
    <form onSubmit={submit} className="space-y-4">
      <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
      <TextArea label="Search terms" hint="Separate with commas or new lines." value={terms} onChange={(e) => setTerms(e.target.value)} />
      <TextArea label="Feed URLs" hint="One URL per line." value={feeds} onChange={(e) => setFeeds(e.target.value)} />
      <ErrorMessage error={error} />
      <div className="flex flex-wrap gap-2 pt-1">
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

  const hostOf = (url: string) => {
    try { return new URL(url).hostname.replace(/^www./, ""); } catch { return url; }
  };

  return (
    <article className="group/row space-y-4 rounded-lg border border-line bg-surface p-5 transition-colors hover:border-control">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h3 className="min-w-0 text-lg font-semibold tracking-[-0.015em]">
          <Link href={`/interests/${interest.id}`} className="group/link inline-flex items-center gap-2 rounded hover:underline hover:decoration-control hover:underline-offset-4">
            <span className="break-words">{interest.name}</span>
            <ArrowIcon className="shrink-0 text-faint transition-[transform,color] duration-150 group-hover/link:translate-x-0.5 group-hover/link:text-ink" />
          </Link>
        </h3>
        {mode === "confirm" ? (
          <div className="flex flex-wrap items-center gap-2 rounded-md bg-neg-bg py-1 pl-3 pr-1" role="group" aria-label={`Confirm deleting ${interest.name}`}>
            <span className="text-sm font-medium text-neg-ink">Delete this interest?</span>
            <Button variant="danger" busy={deleting} onClick={remove} className="bg-white! hover:bg-white/70!">Yes, delete</Button>
            <Button variant="secondary" disabled={deleting} onClick={() => setMode("view")} className="bg-transparent! hover:bg-white/50!">Keep</Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setMode("edit")}>Edit</Button>
            <Button variant="secondary" onClick={() => setMode("confirm")} className="text-neg-ink! hover:bg-neg-bg!">Delete</Button>
          </div>
        )}
      </div>
      <dl className="grid gap-3 text-sm sm:grid-cols-[7rem_1fr] sm:gap-x-4 sm:gap-y-2.5">
        <dt className="text-muted">Search terms</dt>
        <dd>
          {interest.searchTerms.length ? (
            <ul className="flex flex-wrap gap-1.5" aria-label="Search terms">
              {interest.searchTerms.map((term) => (
                <li key={term} className="rounded bg-raised px-2 py-0.5 text-[13px]">{term}</li>
              ))}
            </ul>
          ) : <span className="text-muted">none</span>}
        </dd>
        <dt className="text-muted">Feeds</dt>
        <dd className="min-w-0">
          {interest.feedUrls.length ? (
            <ul className="space-y-0.5">
              {interest.feedUrls.map((url) => (
                <li key={url} className="truncate" title={url}>{hostOf(url)}</li>
              ))}
            </ul>
          ) : <span className="text-muted">none</span>}
        </dd>
      </dl>
      <ErrorMessage error={error} />
    </article>
  );
}

export function InterestManager({ state, onCreate, onUpdate, onDelete }: InterestManagerProps) {
  return (
    <section aria-labelledby="interest-manager-title" className="grid items-start gap-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-10">
      <div className="space-y-4">
      <SectionTitle aside={state.data ? <span className="tnum text-sm text-muted">{state.data.length} tracked</span> : null}>
        <span id="interest-manager-title">Tracked topics</span>
      </SectionTitle>
      {state.loading && !state.data ? <Loading /> : null}
      {state.error ? <ErrorMessage error={state.error} /> : null}
      {state.data && state.data.length === 0 ? <EmptyState>No interests yet. Add your first one with the form.</EmptyState> : null}
      {state.data && state.data.length > 0 ? (
        <ul className="space-y-3">
          {state.data.map((interest) => (
            <li key={interest.id}><InterestRow interest={interest} onUpdate={onUpdate} onDelete={onDelete} /></li>
          ))}
        </ul>
      ) : null}
      </div>
      <div className="rounded-lg bg-raised/70 p-5 sm:p-6 lg:sticky lg:top-20">
        <h3 className="mb-1 text-base font-semibold tracking-[-0.01em]">Add an interest</h3>
        <p className="mb-5 text-sm text-muted">A team, show or hobby your cover follows. Alias researches it in the news and on Reddit.</p>
        <InterestForm submitLabel="Add interest" onSubmit={async (data) => { await onCreate(data); }} />
      </div>
    </section>
  );
}
