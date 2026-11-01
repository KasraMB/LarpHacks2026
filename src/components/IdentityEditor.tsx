"use client";

import { useState, type FormEvent } from "react";
import type { ApiError, Identity } from "@/contracts";
import { toApiError } from "@/lib/use-resource";
import type { IdentityEditorProps } from "./contracts";
import {
  Button,
  CheckIcon,
  ErrorMessage,
  formatCoordDate,
  Loading,
  TextArea,
  TextField,
} from "./ui";

function IdentityForm({
  identity,
  onSave,
}: {
  identity: Identity | null;
  onSave: IdentityEditorProps["onSave"];
}) {
  const [name, setName] = useState(identity?.name ?? "");
  const [background, setBackground] = useState(identity?.background ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setError({ code: "VALIDATION_ERROR", message: "Name is required.", retryable: false });
      return;
    }
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      await onSave({ name: name.trim(), background });
      setSaved(true);
    } catch (e) {
      setError(toApiError(e));
    } finally {
      setSaving(false);
    }
  }

  const initials = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-8">
      <figure
        aria-label="Cover preview"
        className="flex min-h-72 flex-col justify-between overflow-hidden rounded-sm border border-night-line bg-night p-6 text-night-ink sm:p-7"
      >
        <div className="flex items-center justify-between gap-4 border-b border-night-line pb-4">
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className="grid size-10 place-items-center rounded-sm bg-stamp font-mono text-sm font-bold text-white"
            >
              {initials || "?"}
            </span>
            <span className="font-mono text-xs font-semibold text-night-muted">
              COVER DOSSIER // ID-01
            </span>
          </div>
          <span className="rounded-sm bg-night-raised px-2.5 py-1 font-mono text-[11px] font-semibold text-night-muted">
            {name.trim() ? "ACTIVE" : "DRAFT"}
          </span>
        </div>

        <div className="my-8 space-y-3">
          <p className="break-words text-[32px] font-bold leading-[1.05] tracking-[-0.03em] text-night-ink sm:text-[38px]">
            {name.trim() || <span className="redact h-8 w-48 bg-night-line align-middle" />}
          </p>
          {background.trim() ? (
            <p className="max-w-[60ch] whitespace-pre-line text-[15px] leading-relaxed text-night-muted">
              {background}
            </p>
          ) : (
            <span aria-hidden="true" className="block space-y-2 pt-1">
              <span className="redact block h-2.5 w-11/12 bg-night-line" />
              <span className="redact block h-2.5 w-3/4 bg-night-line" />
              <span className="redact block h-2.5 w-5/6 bg-night-line" />
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-night-line pt-3.5 font-mono text-[11px] text-night-muted">
          <span>UPDATED: {identity ? formatCoordDate(identity.updatedAt) : "UNSAVED"}</span>
          <span>BASELINE REFERENCE</span>
        </div>
        <figcaption className="sr-only">How your cover reads to others</figcaption>
      </figure>

      <form
        onSubmit={submit}
        className="space-y-5 rounded-sm border border-line bg-surface p-5 sm:p-6"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule pb-3">
          <h2 className="text-lg font-bold tracking-[-0.015em] text-ink">Identity specification</h2>
          <span className="serial-tag">FORM // ID-SPEC</span>
        </div>
        <TextField
          label="Name"
          placeholder="e.g. Alex Mercer"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setSaved(false);
          }}
          required
        />
        <TextArea
          label="Background"
          hint="Who this identity is: job, hometown, history, and anchor facts you must keep consistent."
          value={background}
          onChange={(e) => {
            setBackground(e.target.value);
            setSaved(false);
          }}
          rows={7}
        />
        <ErrorMessage error={error} />
        <div className="flex flex-wrap items-center gap-3 border-t border-rule pt-3">
          <Button type="submit" busy={saving}>
            {identity ? "Save changes" : "Create identity"}
          </Button>
          {saved ? (
            <span
              role="status"
              className="inline-flex items-center gap-1.5 rounded-sm border border-pos-line bg-pos-bg px-2.5 py-1 font-mono text-xs font-semibold text-pos-ink"
            >
              <CheckIcon />
              Saved to register
            </span>
          ) : null}
        </div>
      </form>
    </div>
  );
}

export function IdentityEditor({ state, onSave }: IdentityEditorProps) {
  return (
    <section aria-labelledby="identity-editor-title" className="space-y-4">
      <h2 id="identity-editor-title" className="sr-only">
        Cover identity
      </h2>
      {state.loading && !state.data ? <Loading label="Loading identity dossier..." /> : null}
      {state.error ? <ErrorMessage error={state.error} /> : null}
      {!state.loading || state.data ? (
        <IdentityForm key={state.data?.id ?? "new"} identity={state.data} onSave={onSave} />
      ) : null}
    </section>
  );
}
