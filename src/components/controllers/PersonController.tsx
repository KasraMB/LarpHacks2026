"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ApiError, Deck, Interest } from "@/contracts";
import { api } from "@/lib/api";
import { isTerminal, listAll, toApiError, usePolling, useResource } from "@/lib/use-resource";
import type { PersonDetailProps } from "../contracts";
import { ClaimsLedger } from "../ClaimsLedger";
import { ConversationForm } from "../ConversationForm";
import { DeckBuilder } from "../DeckBuilder";
import { PersonDetail } from "../PersonDetail";
import { BackLink, Button, CheckIcon, ErrorMessage, Loading } from "../ui";

export function PersonController({ personId }: { personId: string }) {
  const router = useRouter();
  const person = useResource(personId, () => api.getPerson({ id: personId }));
  const interests = useResource(`interests:${personId}`, () =>
    listAll((cursor) => api.listInterests({ cursor, limit: 100 })),
  );
  const claims = useResource(`claims:${personId}`, () =>
    listAll((cursor) => api.listClaims({ personId, cursor, limit: 100 })),
  );
  const deck = useResource<Deck | null>(`deck:${personId}`, async () => {
    const page = await api.listDecks({ personId, limit: 1 });
    return page.items[0] ?? null;
  });
  const [convLoading, setConvLoading] = useState(false);
  const [convError, setConvError] = useState<ApiError | null>(null);

  const claimsPending = (claims.data ?? []).some(
    (c) => c.checkStatus === "queued" || c.checkStatus === "running",
  );
  usePolling(claimsPending, claims.reload);
  const deckId = deck.data && !isTerminal(deck.data.status) ? deck.data.id : null;
  usePolling(deckId !== null, async () => {
    if (!deckId) return;
    try {
      deck.setData(await api.getDeck({ id: deckId }));
    } catch {
      // Keep the last known deck; the next tick retries.
    }
  });

  if (person.error?.code === "NOT_FOUND") {
    return (
      <section className="space-y-3 rounded-sm border border-dashed border-control bg-surface px-6 py-10">
        <h2 className="text-[24px] font-bold tracking-[-0.02em]">Person not found</h2>
        <p className="text-[15px] text-muted">This person does not exist or was deleted.</p>
        <Link href="/people" className="link text-sm font-semibold">
          Back to people
        </Link>
      </section>
    );
  }

  const updatePerson: PersonDetailProps["onUpdate"] = async (input) => {
    const updated = await api.updatePerson(input);
    person.setData(updated);
    return updated;
  };

  return (
    <div className="space-y-8">
      <BackLink href="/people">All people</BackLink>
      <PersonDetail
        state={{ data: person.data, loading: person.loading, error: person.error }}
        onUpdate={updatePerson}
        onDelete={async (input) => {
          const result = await api.deletePerson(input);
          router.push("/people");
          return result;
        }}
      />
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,8fr)_minmax(0,4fr)] lg:grid-rows-[auto_1fr] lg:gap-x-10">
        <div className="lg:col-start-2 lg:row-start-1">
          <DeckBuilder
            personId={personId}
            state={{ data: deck.data, loading: deck.loading, error: deck.error }}
            onBuild={async (input) => {
              const built = await api.buildDeck(input);
              deck.setData(built);
              return built;
            }}
          />
        </div>
        <div className="space-y-10 lg:col-start-1 lg:row-span-2 lg:row-start-1">
          <ClaimsLedger
            personId={personId}
            state={{ data: claims.data, loading: claims.loading, error: claims.error }}
            onCreate={async (input) => {
              const created = await api.createClaim(input);
              claims.setData((list) => [...(list ?? []), created]);
              return created;
            }}
          />
          <ConversationForm
            personId={personId}
            loading={convLoading}
            error={convError}
            onSubmit={async (input) => {
              setConvLoading(true);
              setConvError(null);
              try {
                const result = await api.recordConversation(input);
                person.setData(result.person);
                claims.setData((list) => {
                  const incoming = new Map(result.claims.map((c) => [c.id, c]));
                  return [...(list ?? []).filter((c) => !incoming.has(c.id)), ...result.claims];
                });
                return result;
              } catch (e) {
                setConvError(toApiError(e));
                throw e;
              } finally {
                setConvLoading(false);
              }
            }}
          />
        </div>
        <aside className="lg:col-start-2 lg:row-start-2" aria-label="Shared interests">
          {person.data ? (
            <InterestPicker
              key={person.data.updatedAt}
              interests={interests.data ?? []}
              loading={interests.loading}
              error={interests.error}
              selected={person.data.interestIds}
              onSave={(interestIds) => {
                const p = person.data!;
                return updatePerson({
                  id: p.id,
                  data: { name: p.name, notes: p.notes, interestIds },
                });
              }}
            />
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function InterestPicker({
  interests,
  loading,
  error,
  selected,
  onSave,
}: {
  interests: Interest[];
  loading: boolean;
  error: ApiError | null;
  selected: string[];
  onSave: (ids: string[]) => Promise<unknown>;
}) {
  const [draft, setDraft] = useState<string[]>(selected);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<ApiError | null>(null);
  const toggle = (id: string) => {
    setSaved(false);
    setDraft((d) => (d.includes(id) ? d.filter((x) => x !== id) : [...d, id]));
  };

  async function save() {
    setSaving(true);
    setSaved(false);
    setSaveError(null);
    try {
      await onSave(draft);
      setSaved(true);
    } catch (e) {
      setSaveError(toApiError(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-labelledby="person-interests-title">
      <div className="space-y-4 rounded-sm border border-line bg-raised/75 p-5">
        <fieldset className="space-y-1.5">
          <div className="mb-3 flex items-center justify-between gap-2 border-b border-line pb-2.5">
            <legend id="person-interests-title" className="text-base font-bold text-ink">
              Shared interests
            </legend>
            <span className="serial-tag">
              {String(draft.length).padStart(2, "0")} LINKED
            </span>
          </div>
          {loading && interests.length === 0 ? <Loading label="Loading interests..." /> : null}
          {!loading && interests.length === 0 ? (
            <p className="text-sm text-muted">No interests yet. Add some on the interests page.</p>
          ) : null}
          {interests.map((interest) => {
            const isChecked = draft.includes(interest.id);
            return (
              <label
                key={interest.id}
                className={`flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-sm border px-3 text-[15px] font-medium transition-colors ${
                  isChecked
                    ? "border-ink bg-surface text-ink"
                    : "border-transparent bg-surface/50 text-muted hover:border-line hover:bg-surface"
                }`}
              >
                <span className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    className="size-4 accent-ink"
                    checked={isChecked}
                    onChange={() => toggle(interest.id)}
                  />
                  <span>{interest.name}</span>
                </span>
                {isChecked ? (
                  <span className="font-mono text-[10px] font-semibold text-pos-ink">ACTIVE</span>
                ) : null}
              </label>
            );
          })}
        </fieldset>
        <ErrorMessage error={error} />
        <ErrorMessage error={saveError} />
        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-3">
          <Button busy={saving} onClick={save}>
            Save interests
          </Button>
          {saved ? (
            <span
              role="status"
              className="inline-flex items-center gap-1 font-mono text-xs font-semibold text-pos-ink"
            >
              <CheckIcon />
              Updated
            </span>
          ) : null}
        </div>
      </div>
    </section>
  );
}
