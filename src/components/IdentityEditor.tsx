"use client";

import { useState, type FormEvent } from "react";
import type { ApiError, Identity } from "@/contracts";
import { toApiError } from "@/lib/use-resource";
import type { IdentityEditorProps } from "./contracts";
import { Button, ErrorMessage, Loading, TextArea, TextField } from "./ui";

function IdentityForm({ identity, onSave }: { identity: Identity | null; onSave: IdentityEditorProps["onSave"] }) {
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

  const initials = name.trim().split(/s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-8">
      <figure aria-label="Cover preview" className="relative flex min-h-64 flex-col justify-between overflow-hidden rounded-lg bg-ink p-6 text-white sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <span className="font-mono text-xs text-night-muted">Cover file</span>
          <span aria-hidden="true" className="grid size-12 place-items-center rounded-md bg-night-raised font-mono text-base text-white">
            {initials || "?"}
          </span>
        </div>
        <div className="mt-10 space-y-3">
          <p className="break-words text-[30px] font-semibold leading-[1.05] tracking-[-0.03em] sm:text-[36px]">
            {name.trim() || <span className="redact h-8 w-48 bg-night-line align-middle" />}
          </p>
          {background.trim() ? (
            <p className="line-clamp-4 max-w-md whitespace-pre-line text-sm leading-relaxed text-night-muted">{background}</p>
          ) : (
            <span aria-hidden="true" className="block space-y-2 pt-1">
              <span className="redact block h-2.5 w-11/12 bg-night-line" />
              <span className="redact block h-2.5 w-3/4 bg-night-line" />
              <span className="redact block h-2.5 w-5/6 bg-night-line" />
            </span>
          )}
        </div>
        <figcaption className="sr-only">How your cover reads to others</figcaption>
      </figure>

      <form onSubmit={submit} className="space-y-5 rounded-lg border border-line bg-surface p-5 sm:p-6">
        <TextField
          label="Name"
          value={name}
          onChange={(e) => { setName(e.target.value); setSaved(false); }}
          required
        />
        <TextArea
          label="Background"
          hint="Who this identity is: job, hometown, history, anything you need to stay consistent about."
          value={background}
          onChange={(e) => { setBackground(e.target.value); setSaved(false); }}
          rows={7}
        />
        <ErrorMessage error={error} />
        <div className="flex items-center gap-3">
          <Button type="submit" busy={saving}>{identity ? "Save changes" : "Create identity"}</Button>
          {saved ? <span role="status" className="text-sm font-medium text-[#2e7d32]">Saved.</span> : null}
        </div>
      </form>
    </div>
  );
}

export function IdentityEditor({ state, onSave }: IdentityEditorProps) {
  return (
    <section aria-labelledby="identity-editor-title" className="space-y-4">
      <h2 id="identity-editor-title" className="sr-only">Cover identity</h2>
      {state.loading && !state.data ? <Loading /> : null}
      {state.error ? <ErrorMessage error={state.error} /> : null}
      {!state.loading || state.data ? (
        <>
          {/* key resets the form when the saved record first appears */}
          <IdentityForm key={state.data?.id ?? "new"} identity={state.data} onSave={onSave} />
        </>
      ) : null}
    </section>
  );
}
