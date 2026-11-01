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

type FormValues = { name: string; searchTerms: string[]; feedUrls: string[] };

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
      await onSubmit({ name: name.trim(), searchTerms: splitList(terms, true), feedUrls });
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
      <TextField label="Name" placeholder="e.g. NBA — Toronto Raptors" value={name} onChange={(e) => setName(e.target.value)} required />
      <TextArea
        label="Search terms"
        hint="Separate with commas or new lines."
        value={terms}
        onChange={(e) => setTerms(e.target.value)}
      />
      <TextArea
        label="Feed URLs"
        hint="One RSS or Atom URL per line."
        value={feeds}
        onChange={(e) => setFeeds(e.target.value)}
      />
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
}: {
  interest: Interest;
  index: number;
} & Pick<InterestManagerProps, "onUpdate" | "onDelete">) {
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
            <span className="text-sm font-semibold text-neg-ink">Delete this interest?</span>
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
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/interests/${interest.id}`}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-sm border border-ink bg-ink px-3 text-xs font-semibold text-ground transition-opacity hover:opacity-90"
            >
              Timeline
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
        )}
      </div>

      <div className="space-y-3 p-5">
        <dl className="grid gap-3 text-sm sm:grid-cols-[7.5rem_1fr] sm:gap-x-4 sm:gap-y-2.5">
          <dt className="font-mono text-xs font-semibold text-muted">SEARCH TERMS</dt>
          <dd>
            {interest.searchTerms.length ? (
              <ul className="flex flex-wrap gap-1.5" aria-label="Search terms">
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
          <dt className="font-mono text-xs font-semibold text-muted">FEEDS</dt>
          <dd className="min-w-0">
            {interest.feedUrls.length ? (
              <ul className="flex flex-wrap gap-2">
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
        <ErrorMessage error={error} />
      </div>
    </article>
  );
}

export function InterestManager({ state, onCreate, onUpdate, onDelete }: InterestManagerProps) {
  return (
    <section
      aria-labelledby="interest-manager-title"
      className="grid items-start gap-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-10"
    >
      <div className="space-y-4">
        <SectionTitle
          aside={
            state.data ? (
              <span className="serial-tag">
                {String(state.data.length).padStart(2, "0")} TRACKED
              </span>
            ) : null
          }
        >
          <span id="interest-manager-title">Tracked topics</span>
        </SectionTitle>
        {state.loading && !state.data ? <Loading label="Loading research sectors..." /> : null}
        {state.error ? <ErrorMessage error={state.error} /> : null}
        {state.data && state.data.length === 0 ? (
          <EmptyState>No interests yet. Add your first topic sector with the form.</EmptyState>
        ) : null}
        {state.data && state.data.length > 0 ? (
          <ul className="space-y-3.5">
            {state.data.map((interest, idx) => (
              <li key={interest.id}>
                <InterestRow interest={interest} index={idx} onUpdate={onUpdate} onDelete={onDelete} />
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="rounded-sm border border-line bg-raised/75 p-5 sm:p-6 lg:sticky lg:top-20">
        <div className="mb-4 flex items-center justify-between gap-2 border-b border-line pb-3">
          <h3 className="text-base font-bold tracking-[-0.01em] text-ink">Add an interest</h3>
          <span className="serial-tag">NEW SECTOR</span>
        </div>
        <p className="mb-5 text-sm leading-relaxed text-muted">
          A team, show, or hobby your cover follows. Alias researches it in the news and on Reddit.
        </p>
        <InterestForm
          submitLabel="Add interest"
          onSubmit={async (data) => {
            await onCreate(data);
          }}
        />
      </div>
    </section>
  );
}
