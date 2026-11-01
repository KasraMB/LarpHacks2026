"use client";

import { useState, type FormEvent } from "react";
import type { ApiError, Identity } from "@/contracts";
import { toApiError } from "@/lib/use-resource";
import type { IdentityEditorProps } from "./contracts";
import { Button, Card, ErrorMessage, Loading, TextArea, TextField } from "./ui";

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

  return (
    <form onSubmit={submit} className="space-y-4">
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
      />
      <ErrorMessage error={error} />
      <div className="flex items-center gap-3">
        <Button type="submit" busy={saving}>{identity ? "Save changes" : "Create identity"}</Button>
        {saved ? <span role="status" className="text-sm text-emerald-700">Saved.</span> : null}
      </div>
    </form>
  );
}

export function IdentityEditor({ state, onSave }: IdentityEditorProps) {
  return (
    <section aria-labelledby="identity-editor-title" className="space-y-4">
      <h2 id="identity-editor-title" className="text-lg font-semibold">Cover identity</h2>
      {state.loading && !state.data ? <Loading /> : null}
      {state.error ? <ErrorMessage error={state.error} /> : null}
      {!state.loading || state.data ? (
        <Card>
          {/* key resets the form when the saved record first appears */}
          <IdentityForm key={state.data?.id ?? "new"} identity={state.data} onSave={onSave} />
        </Card>
      ) : null}
    </section>
  );
}
