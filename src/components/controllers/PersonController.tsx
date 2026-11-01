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
import { Button, Card, ErrorMessage, formatDate, Loading } from "../ui";

export function PersonController({ personId }: { personId: string }) {
  const router = useRouter();
  const person = useResource(personId, () => api.getPerson({ id: personId }));
  const interests = useResource(`interests:${personId}`, () => listAll((cursor) => api.listInterests({ cursor, limit: 100 })));
  const claims = useResource(`claims:${personId}`, () => listAll((cursor) => api.listClaims({ personId, cursor, limit: 100 })));
  const deck = useResource<Deck | null>(`deck:${personId}`, async () => {
    const page = await api.listDecks({ personId, limit: 1 });
    return page.items[0] ?? null;
  });
  const [convLoading, setConvLoading] = useState(false);
  const [convError, setConvError] = useState<ApiError | null>(null);

  const claimsPending = (claims.data ?? []).some((c) => c.checkStatus === "queued" || c.checkStatus === "running");
  usePolling(claimsPending, claims.reload);
  const deckId = deck.data && !isTerminal(deck.data.status) ? deck.data.id : null;
  usePolling(deckId !== null, deck.reload);

  if (person.error?.code === "NOT_FOUND") {
    return (
      <section className="space-y-3">
        <h1 className="text-xl font-semibold">Person not found</h1>
        <p className="text-sm text-slate-600">This person does not exist or was deleted.</p>
        <Link href="/people" className="underline">Back to people</Link>
      </section>
    );
  }

  const updatePerson: PersonDetailProps["onUpdate"] = async (input) => {
    const updated = await api.updatePerson(input);
    person.setData(updated);
    return updated;
  };
  const recentClaims = [...(claims.data ?? [])].sort((a, b) => Date.parse(b.saidAt) - Date.parse(a.saidAt));
  const flagged = recentClaims.filter((claim) => claim.contradictions.length > 0);

  return (
    <div className="space-y-8">
      <section className="space-y-4" aria-labelledby="person-briefing-title">
        <Link href="/people" className="text-sm underline">All people</Link>
        {person.loading && !person.data ? <Loading label="Loading briefing..." /> : null}
        <ErrorMessage error={person.error} onRetry={person.reload} />
        {person.data ? <div className="space-y-2">
          <h1 id="person-briefing-title" className="text-2xl font-semibold break-words">Prepare for {person.data.name}</h1>
          <p className="text-sm text-slate-600">{person.data.lastConversationAt
            ? `Last conversation: ${formatDate(person.data.lastConversationAt)}. A new deck uses research newer than this conversation.`
            : "No conversation recorded yet. A new deck can use all available research for your shared interests."}</p>
        </div> : null}
        {person.data ? <DeckBuilder
          personId={personId}
          state={{ data: deck.data, loading: deck.loading, error: deck.error }}
          onBuild={async (input) => {
            const built = await api.buildDeck(input);
            deck.setData(built);
            return built;
          }}
        /> : null}
        <div className="space-y-2">
          <h2 className="text-base font-semibold">What they last heard</h2>
          {claims.loading && !claims.data ? <Loading label="Loading claims..." /> : null}
          <ErrorMessage error={claims.error} onRetry={claims.reload} />
          {flagged.length > 0 ? <p className="text-sm font-medium text-red-800">{flagged.length} {flagged.length === 1 ? "claim has" : "claims have"} a possible contradiction. <a href="#claim-history" className="underline">Review claim history</a>.</p> : null}
          {recentClaims[0] ? <>
            <blockquote className="max-w-prose break-words text-sm">&ldquo;{recentClaims[0].text}&rdquo;</blockquote>
            <p className="text-xs text-slate-600">Said {formatDate(recentClaims[0].saidAt)} · {recentClaims[0].checkStatus === "completed"
              ? (recentClaims[0].contradictions.length > 0 ? "Possible contradiction" : "Checked — no contradictions found")
              : recentClaims[0].checkStatus === "failed" ? "Check unavailable — review claim history" : "Checking for contradictions…"}</p>
          </> : !claims.loading && !claims.error ? <p className="text-sm text-slate-600">No claims recorded yet. <a href="#record-conversation" className="underline">Record a conversation</a> to keep track of what you said.</p> : null}
        </div>
      </section>
      <details id="record-conversation" className="border-t border-slate-200 pt-4">
        <summary className="cursor-pointer py-2 text-lg font-semibold">Record a conversation</summary>
        <div className="pt-3">
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
      </details>
      <div id="claim-history">
        <ClaimsLedger
          personId={personId}
          state={{ data: claims.data, loading: claims.loading, error: claims.error }}
          onCreate={async (input) => {
            const created = await api.createClaim(input);
            claims.setData((list) => [...(list ?? []), created]);
            return created;
          }}
        />
      </div>
      <details className="border-t border-slate-200 pt-4">
        <summary className="cursor-pointer py-2 text-lg font-semibold">Edit person and shared interests</summary>
        <div className="space-y-6 pt-3">
          <PersonDetail
            state={{ data: person.data, loading: person.loading, error: person.error }}
            onUpdate={updatePerson}
            onDelete={async (input) => {
              const result = await api.deletePerson(input);
              router.push("/people");
              return result;
            }}
          />
          {person.data ? (
            <InterestPicker
              key={person.data.updatedAt}
              interests={interests.data ?? []}
              loading={interests.loading}
              error={interests.error}
              selected={person.data.interestIds}
              onSave={(interestIds) => {
                const p = person.data!;
                return updatePerson({ id: p.id, data: { name: p.name, notes: p.notes, interestIds } });
              }}
            />
          ) : null}
        </div>
      </details>
    </div>
  );
}

function InterestPicker({ interests, loading, error, selected, onSave }: {
  interests: Interest[];
  loading: boolean;
  error: ApiError | null;
  selected: string[];
  onSave: (ids: string[]) => Promise<unknown>;
}) {
  const [draft, setDraft] = useState<string[]>(selected);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<ApiError | null>(null);
  const toggle = (id: string) => setDraft((d) => (d.includes(id) ? d.filter((x) => x !== id) : [...d, id]));

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      await onSave(draft);
    } catch (e) {
      setSaveError(toApiError(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-labelledby="person-interests-title">
      <Card className="space-y-3">
        <fieldset className="space-y-2">
          <legend id="person-interests-title" className="text-base font-medium">Shared interests</legend>
          {loading && interests.length === 0 ? <Loading label="Loading interests..." /> : null}
          {!loading && interests.length === 0 ? <p className="text-sm text-slate-500">No interests yet. Add some on the interests page.</p> : null}
          {interests.map((interest) => (
            <label key={interest.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={draft.includes(interest.id)} onChange={() => toggle(interest.id)} />
              {interest.name}
            </label>
          ))}
        </fieldset>
        <ErrorMessage error={error} />
        <ErrorMessage error={saveError} />
        <Button busy={saving} onClick={save}>Save interests</Button>
      </Card>
    </section>
  );
}
