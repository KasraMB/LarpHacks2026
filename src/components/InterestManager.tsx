"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import type { ApiError, Interest } from "@/contracts";
import { toApiError } from "@/lib/use-resource";
import type { InterestManagerProps } from "./contracts";
import {
  ArrowIcon,
  Button,
  Card,
  EmptyState,
  ErrorMessage,
  formatCoordDate,
  formatSerial,
  Loading,
  SectionTitle,
  TextArea,
  TextField,
} from "./ui";

const splitList = (value: string, commas: boolean) =>
  value
    .split(commas ? /[,\n]/ : /\n/)
    .map((s) => s.trim())
    .filter(Boolean);

const selectClass =
  "block h-11 w-full max-w-full rounded-sm border border-control bg-surface px-3 text-[15px] text-ink transition-colors hover:border-muted focus:border-ink focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-signal sm:h-10";

type FormValues = { name: string; searchTerms: string[]; feedUrls: string[]; visibility: "private" | "public" };

function InterestForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
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
    if (!name.trim()) {
      return setError({ code: "VALIDATION_ERROR", message: "Name is required.", retryable: false });
    }
    if (bad) {
      return setError({ code: "VALIDATION_ERROR", message: `Not a valid URL: ${bad}`, retryable: false });
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit({ name: name.trim(), searchTerms: splitList(terms, true), feedUrls, visibility });
      if (!initial) {
        setName("");
        setTerms("");
        setFeeds("");
      }
    } catch (e) {
      setError(toApiError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <TextField
        label="Topic name"
        hint="This is all Alias needs to find sources automatically."
        placeholder="e.g. NBA — Toronto Raptors"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
      />
      <label className="block space-y-1.5">
        <span className="block text-sm font-semibold text-ink">Who can use this skill?</span>
        <select
          className={selectClass}
          value={visibility}
          onChange={(e) => setVisibility(e.target.value as "private" | "public")}
        >
          <option value="private">Only me</option>
          <option value="public">Everyone — public library</option>
        </select>
      </label>
      <p className="text-sm leading-relaxed text-muted">
        Public skills share their topic, search terms, feeds and research. Your persona, people, claims and decks stay
        private. A public skill in use by someone else must remain public.
      </p>
      <TextArea
        label="Search terms (optional)"
        hint="Guide discovery with extra terms, separated by commas or new lines."
        value={terms}
        onChange={(e) => setTerms(e.target.value)}
      />
      <details open={initial?.feedUrls.length ? true : undefined} className="space-y-2">
        <summary className="min-h-9 cursor-pointer text-sm font-semibold text-ink">
          Add custom feeds (optional)
        </summary>
        <TextArea
          label="RSS or Atom feed URLs"
          hint="Extra sources alongside automatic discovery. Use feed URLs rather than website homepages, one per line."
          value={feeds}
          onChange={(e) => setFeeds(e.target.value)}
        />
      </details>
      <ErrorMessage error={error} />
      <div className="flex flex-wrap gap-2 pt-1">
        <Button type="submit" busy={busy}>
          {submitLabel}
        </Button>
        {onCancel ? (
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}

function InterestRow({
  interest,
  index,
  onUpdate,
  onDelete,
  currentUserId,
  people,
  onSelect,
}: {
  interest: Interest;
  index: number;
} & Omit<InterestManagerProps, "state" | "onCreate" | "identityConfigured">) {
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
        <div className="mb-4 flex items-center justify-between border-b border-rule pb-2.5">
          <h3 className="text-base font-bold text-ink">Edit {interest.name}</h3>
          <span className="serial-tag">{formatSerial("SEC", index + 1)}</span>
        </div>
        <InterestForm
          initial={interest}
          submitLabel="Save"
          onCancel={() => setMode("view")}
          onSubmit={async (data) => {
            await onUpdate({ id: interest.id, data });
            setMode("view");
          }}
        />
      </Card>
    );
  }

  const hostOf = (url: string) => {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return url;
    }
  };

  return (
    <article className="group/row rounded-sm border border-line bg-surface transition-colors hover:border-control">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule bg-raised/55 px-5 py-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <h3 className="min-w-0 text-lg font-bold tracking-[-0.015em] text-ink">
            <Link
              href={`/interests/${interest.id}`}
              className="group/link inline-flex items-center gap-2 rounded-sm hover:text-stamp"
            >
              <span className="break-words">{interest.name}</span>
              <ArrowIcon className="shrink-0 text-faint transition-[transform,color] duration-150 group-hover/link:translate-x-0.5 group-hover/link:text-stamp" />
            </Link>
          </h3>
          <span className="serial-tag">{formatSerial("SEC", index + 1)}</span>
        </div>

        {mode === "confirm" ? (
          <div
            className="flex flex-wrap items-center gap-2 rounded-sm border border-neg-line bg-neg-bg py-1 pl-3 pr-1"
            role="group"
            aria-label={`Confirm deleting ${interest.name}`}
          >
            <span className="text-sm font-semibold text-neg-ink">Delete this skill?</span>
            <Button variant="danger" busy={deleting} onClick={remove} className="bg-surface! hover:bg-surface/80!">
              Yes, delete
            </Button>
            <Button
              variant="secondary"
              disabled={deleting}
              onClick={() => setMode("view")}
              className="bg-transparent! hover:bg-surface/60!"
            >
              Keep
            </Button>
          </div>
        ) : owned ? (
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/interests/${interest.id}`}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-sm border border-ink bg-ink px-3 text-xs font-semibold text-ground transition-opacity hover:opacity-90"
            >
              View research / run now
              <ArrowIcon className="size-3.5" />
            </Link>
            <Button variant="secondary" onClick={() => setMode("edit")}>
              Edit
            </Button>
            <Button
              variant="secondary"
              onClick={() => setMode("confirm")}
              className="text-neg-ink! hover:bg-neg-bg!"
            >
              Delete
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/interests/${interest.id}`}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-sm border border-ink bg-ink px-3 text-xs font-semibold text-ground transition-opacity hover:opacity-90"
            >
              View research / run now
              <ArrowIcon className="size-3.5" />
            </Link>
            <span className="text-sm text-muted">Shared by another account</span>
          </div>
        )}
      </div>

      <div className="space-y-3 p-5">
        <dl className="grid gap-3 text-sm sm:grid-cols-[7.5rem_1fr] sm:gap-x-4 sm:gap-y-2.5">
          <dt className="font-mono text-xs font-semibold text-muted">VISIBILITY</dt>
          <dd className="font-medium text-ink">
            {interest.visibility === "public" ? "Public skill" : "Private skill"}
            {owned ? " · Yours" : ""}
          </dd>
          <dt className="font-mono text-xs font-semibold text-muted">SOURCES</dt>
          <dd className="text-muted">Sources are found automatically from {interest.name}.</dd>
          <dt className="font-mono text-xs font-semibold text-muted">EXTRA TERMS</dt>
          <dd>
            {interest.searchTerms.length ? (
              <ul className="flex flex-wrap gap-1.5" aria-label="Extra search terms">
                {interest.searchTerms.map((term) => (
                  <li
                    key={term}
                    className="rounded-sm border border-line bg-ground px-2 py-0.5 font-mono text-xs text-ink"
                  >
                    {term}
                  </li>
                ))}
              </ul>
            ) : (
              <span className="text-muted">none</span>
            )}
          </dd>
          <dt className="font-mono text-xs font-semibold text-muted">CUSTOM FEEDS</dt>
          <dd className="min-w-0">
            {interest.feedUrls.length ? (
              <ul className="flex flex-wrap gap-2" aria-label="Additional custom feeds">
                {interest.feedUrls.map((url) => (
                  <li
                    key={url}
                    className="max-w-xs truncate rounded-sm border border-rule bg-ground/70 px-2 py-0.5 font-mono text-xs text-muted"
                    title={url}
                  >
                    {hostOf(url)}
                  </li>
                ))}
              </ul>
            ) : (
              <span className="text-muted">none</span>
            )}
          </dd>
        </dl>
        <div className="flex items-center justify-between border-t border-rule pt-2.5 font-mono text-[11px] text-muted">
          <span className="tnum">CREATED: {formatCoordDate(interest.createdAt)}</span>
          <span className="tnum">FEEDS: {String(interest.feedUrls.length).padStart(2, "0")}</span>
        </div>
        {people.loading ? (
          <Loading label="Loading your people…" />
        ) : people.error ? (
          <ErrorMessage error={people.error} />
        ) : people.data?.length ? (
          <form
            className="flex flex-wrap items-end gap-2 border-t border-rule pt-3"
            onSubmit={async (event) => {
              event.preventDefault();
              setSelecting(true);
              setError(null);
              setSelected(false);
              try {
                await onSelect(interest.id, personId);
                setSelected(true);
              } catch (e) {
                setError(toApiError(e));
              } finally {
                setSelecting(false);
              }
            }}
          >
            <label className="min-w-0 flex-1 space-y-1.5 sm:max-w-xs">
              <span className="block text-sm font-semibold text-ink">Use with a person</span>
              <select
                required
                className={selectClass}
                value={personId}
                onChange={(e) => {
                  setPersonId(e.target.value);
                  setSelected(false);
                }}
              >
                <option value="">Choose a person</option>
                {people.data.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </select>
            </label>
            <Button type="submit" busy={selecting} disabled={!personId}>
              Use skill
            </Button>
            {selected ? (
              <p role="status" className="text-sm text-pos-ink">
                Skill added.{" "}
                <Link className="font-semibold underline" href={`/people/${personId}`}>
                  Open briefing
                </Link>
              </p>
            ) : null}
          </form>
        ) : (
          <p className="border-t border-rule pt-3 text-sm text-muted">
            <Link href="/people" className="font-semibold text-ink underline">
              Add a person
            </Link>{" "}
            to use this skill in a briefing.
          </p>
        )}
        <ErrorMessage error={error} />
      </div>
    </article>
  );
}

const scopes = [
  ["all", "All available"],
  ["public", "Public library"],
  ["mine", "My skills"],
] as const;

export function InterestManager({
  state,
  identityConfigured,
  onCreate,
  onUpdate,
  onDelete,
  ...selection
}: InterestManagerProps) {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<string>("all");
  const filtered = state.data?.filter(
    (interest) =>
      (scope !== "public" || interest.visibility === "public") &&
      (scope !== "mine" || (interest.ownerUserId ?? null) === selection.currentUserId) &&
      interest.name.toLowerCase().includes(query.toLowerCase().trim()),
  );

  return (
    <section
      aria-labelledby="interest-manager-title"
      className="grid items-start gap-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-10"
    >
      <div className="space-y-4">
        <SectionTitle
          aside={
            state.data ? (
              <span className="serial-tag">{String(state.data.length).padStart(2, "0")} SKILLS</span>
            ) : null
          }
        >
          <span id="interest-manager-title">Browse skills</span>
        </SectionTitle>
        <TextField
          label="Search skills"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="For example, C++"
        />
        <div className="flex flex-wrap gap-2" role="group" aria-label="Skill library filter">
          {scopes.map(([value, label]) => (
            <Button
              key={value}
              variant={scope === value ? "primary" : "secondary"}
              aria-pressed={scope === value}
              onClick={() => setScope(value)}
            >
              {label}
            </Button>
          ))}
        </div>
        {state.loading && !state.data ? <Loading /> : null}
        {state.error ? <ErrorMessage error={state.error} /> : null}
        {state.data && state.data.length === 0 ? <EmptyState>No interests yet. Add one below.</EmptyState> : null}
        {state.data && state.data.length > 0 ? (
          <ul className="space-y-3.5">
            {filtered?.map((interest, idx) => (
              <li key={interest.id}>
                <InterestRow
                  interest={interest}
                  index={idx}
                  onUpdate={onUpdate}
                  onDelete={onDelete}
                  {...selection}
                />
              </li>
            ))}
          </ul>
        ) : null}
        {state.data?.length && !filtered?.length ? (
          <EmptyState>No matching skills. Try another search or create one below.</EmptyState>
        ) : null}
      </div>

      <div className="rounded-sm border border-line bg-raised/75 p-5 sm:p-6 lg:sticky lg:top-20">
        <div className="mb-4 flex items-center justify-between gap-2 border-b border-line pb-3">
          <h3 className="text-base font-bold tracking-[-0.01em] text-ink">Create a skill</h3>
          <span className="serial-tag">NEW SKILL</span>
        </div>
        {identityConfigured === true ? (
          <InterestForm
            submitLabel="Create skill"
            onSubmit={async (data) => {
              await onCreate(data);
            }}
          />
        ) : identityConfigured === false ? (
          <p className="text-sm leading-relaxed text-muted">
            <Link href="/identity" className="font-semibold text-ink underline">
              Set up your private persona
            </Link>{" "}
            before creating a skill. You can browse the public library now.
          </p>
        ) : (
          <p className="text-sm leading-relaxed text-muted">
            Your persona could not be confirmed yet.{" "}
            <Link href="/identity" className="font-semibold text-ink underline">
              Open identity setup
            </Link>{" "}
            to continue.
          </p>
        )}
      </div>
    </section>
  );
}
