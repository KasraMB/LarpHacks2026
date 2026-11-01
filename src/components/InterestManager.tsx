"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import type { ApiError, Interest } from "@/contracts";
import { toApiError } from "@/lib/use-resource";
import type { InterestManagerProps } from "./contracts";
import { Button, Card, EmptyState, ErrorMessage, Loading, TextArea, TextField } from "./ui";

const splitList = (value: string, commas: boolean) =>
  value.split(commas ? /[,\n]/ : /\n/).map((s) => s.trim()).filter(Boolean);

type FormValues = { name: string; searchTerms: string[]; feedUrls: string[]; visibility: "private" | "public" };

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
  const [visibility, setVisibility] = useState<"private" | "public">(initial?.visibility ?? "private");
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
      await onSubmit({ name: name.trim(), searchTerms: splitList(terms, true), feedUrls, visibility });
      if (!initial) { setName(""); setTerms(""); setFeeds(""); }
    } catch (e) {
      setError(toApiError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <TextField label="Topic name" hint="This is all Alias needs to find sources automatically." value={name} onChange={(e) => setName(e.target.value)} required />
      <label className="block space-y-1 text-sm font-medium">Who can use this skill?
        <select className="block min-h-11 w-full rounded-md border border-slate-300 bg-white px-3" value={visibility} onChange={(e) => setVisibility(e.target.value as "private" | "public")}>
          <option value="private">Only me</option><option value="public">Everyone — public library</option>
        </select>
      </label>
      <p className="text-sm text-slate-600">Public skills share their topic, search terms, feeds and research. Your persona, people, claims and decks stay private. A public skill in use by someone else must remain public.</p>
      <TextArea label="Search terms (optional)" hint="Guide discovery with extra terms, separated by commas or new lines." value={terms} onChange={(e) => setTerms(e.target.value)} />
      <details open={initial?.feedUrls.length ? true : undefined} className="space-y-2">
        <summary className="cursor-pointer text-sm font-medium">Add custom feeds (optional)</summary>
        <TextArea label="RSS or Atom feed URLs" hint="Extra sources alongside automatic discovery. Use feed URLs rather than website homepages, one per line." value={feeds} onChange={(e) => setFeeds(e.target.value)} />
      </details>
      <ErrorMessage error={error} />
      <div className="flex gap-2">
        <Button type="submit" busy={busy}>{submitLabel}</Button>
        {onCancel ? <Button variant="secondary" onClick={onCancel} disabled={busy}>Cancel</Button> : null}
      </div>
    </form>
  );
}

function InterestRow({
  interest, onUpdate, onDelete, currentUserId, people, onSelect,
}: { interest: Interest } & Omit<InterestManagerProps, "state" | "onCreate" | "identityConfigured">) {
  const [mode, setMode] = useState<"view" | "edit" | "confirm">("view");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [personId, setPersonId] = useState("");
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState(false);
  const owned = (interest.ownerUserId ?? null) === currentUserId;

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
        ) : owned ? (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setMode("edit")}>Edit</Button>
            <Button variant="danger" onClick={() => setMode("confirm")}>Delete</Button>
          </div>
        ) : <span className="text-sm text-slate-600">Shared by another account</span>}
      </div>
      <p className="text-sm font-medium">{interest.visibility === "public" ? "Public skill" : "Private skill"}{owned ? " · Yours" : ""}</p>
      <p className="text-sm text-slate-600">
        Sources are found automatically from {interest.name}.
      </p>
      {interest.searchTerms.length ? <p className="break-words text-sm text-slate-600">Extra search terms: {interest.searchTerms.join(", ")}</p> : null}
      {interest.feedUrls.length ? <p className="break-words text-sm text-slate-600">Additional custom feeds: {interest.feedUrls.join(", ")}</p> : null}
      <Link href={`/interests/${interest.id}`} className="inline-flex min-h-11 items-center text-sm font-medium underline">View research / run now</Link>
      {people.loading ? <Loading label="Loading your people…" /> : people.error ? <ErrorMessage error={people.error} /> : people.data?.length ? (
        <form className="flex flex-wrap items-end gap-2" onSubmit={async (event) => {
          event.preventDefault(); setSelecting(true); setError(null); setSelected(false);
          try { await onSelect(interest.id, personId); setSelected(true); } catch (e) { setError(toApiError(e)); } finally { setSelecting(false); }
        }}>
          <label className="min-w-0 text-sm font-medium">Use with a person
            <select required className="mt-1 block min-h-11 max-w-full rounded-md border border-slate-300 bg-white px-3" value={personId} onChange={(e) => { setPersonId(e.target.value); setSelected(false); }}>
              <option value="">Choose a person</option>{people.data.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
            </select>
          </label>
          <Button type="submit" className="min-h-11" busy={selecting} disabled={!personId}>Use skill</Button>
          {selected ? <p role="status" className="text-sm">Skill added. <Link className="underline" href={`/people/${personId}`}>Open briefing</Link></p> : null}
        </form>
      ) : <p className="text-sm"><Link href="/people" className="underline">Add a person</Link> to use this skill in a briefing.</p>}
      <ErrorMessage error={error} />
    </Card>
  );
}

export function InterestManager({ state, identityConfigured, onCreate, onUpdate, onDelete, ...selection }: InterestManagerProps) {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState("all");
  const filtered = state.data?.filter((interest) => (scope !== "public" || interest.visibility === "public") && (scope !== "mine" || (interest.ownerUserId ?? null) === selection.currentUserId) && interest.name.toLowerCase().includes(query.toLowerCase().trim()));
  return (
    <section aria-labelledby="interest-manager-title" className="space-y-6">
      <h2 id="interest-manager-title" className="text-lg font-semibold">Browse skills</h2>
      <TextField label="Search skills" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="For example, C++" />
      <div className="flex flex-wrap gap-2" role="group" aria-label="Skill library filter">{[["all", "All available"], ["public", "Public library"], ["mine", "My skills"]].map(([value, label]) => <Button key={value} variant={scope === value ? "primary" : "secondary"} aria-pressed={scope === value} className="min-h-11" onClick={() => setScope(value)}>{label}</Button>)}</div>
      {state.loading && !state.data ? <Loading /> : null}
      {state.error ? <ErrorMessage error={state.error} /> : null}
      {state.data && state.data.length === 0 ? <EmptyState>No interests yet. Add one below.</EmptyState> : null}
      {state.data && state.data.length > 0 ? (
        <ul className="space-y-3">
          {filtered?.map((interest) => (
            <li key={interest.id}><InterestRow interest={interest} onUpdate={onUpdate} onDelete={onDelete} {...selection} /></li>
          ))}
        </ul>
      ) : null}
      {state.data?.length && !filtered?.length ? <EmptyState>No matching skills. Try another search or create one below.</EmptyState> : null}
      <Card>
        <h3 className="mb-3 font-medium">Create a skill</h3>
        {identityConfigured === true ? <InterestForm submitLabel="Create skill" onSubmit={async (data) => { await onCreate(data); }} />
          : identityConfigured === false ? <p className="text-sm"><Link href="/identity" className="underline">Set up your private persona</Link> before creating a skill. You can browse the public library now.</p>
          : <p className="text-sm">Your persona could not be confirmed yet. <Link href="/identity" className="underline">Open identity setup</Link> to continue.</p>}
      </Card>
    </section>
  );
}
