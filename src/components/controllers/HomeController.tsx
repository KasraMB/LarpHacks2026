"use client";

import Link from "next/link";
import { Card, ErrorMessage, formatDate, Loading } from "@/components/ui";
import { api } from "@/lib/api";
import { listAll, usePolling, useResource } from "@/lib/use-resource";

export function HomeController() {
  const overview = useResource("home", async () => {
    const [identity, interests, people] = await Promise.all([
      api.getIdentity({}),
      listAll((cursor) => api.listInterests({ cursor, limit: 100 })),
      listAll((cursor) => api.listPeople({ cursor, limit: 100 })),
    ]);
    return { identity, interestCount: interests.length, people };
  });

  // Start with the most recently recorded conversation, then the most recently updated person.
  const person = overview.data?.identity ? [...overview.data.people].sort((a, b) =>
    (b.lastConversationAt ?? "").localeCompare(a.lastConversationAt ?? "") ||
    b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id),
  )[0] : undefined;
  const latestDeck = useResource(person ? `home-deck:${person.id}` : null, async () => {
    const result = await api.listDecks({ personId: person!.id, limit: 1 });
    return result.items[0] ?? null;
  });
  const deck = latestDeck.data;
  const building = deck?.status === "queued" || deck?.status === "running";
  usePolling(building, latestDeck.reload);

  if (overview.loading && !overview.data) return <Loading />;
  if (overview.error) return <ErrorMessage error={overview.error} onRetry={overview.reload} />;
  if (!overview.data) return null;
  const { identity, interestCount, people } = overview.data;
  const primaryLink = "inline-flex min-h-11 max-w-full items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white [overflow-wrap:anywhere] hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-slate-900";

  return (
    <div className="space-y-8">
      <Card className="space-y-4 sm:p-6">
        {!identity ? (
          <>
            <h2 className="text-xl font-semibold">Start with your cover identity</h2>
            <p className="max-w-prose text-slate-600">Save the identity you want to keep consistent. Then add interests and the people you talk to.</p>
            <Link href="/identity" className={primaryLink}>Set up your identity</Link>
          </>
        ) : !person ? (
          <>
            <h2 className="text-xl font-semibold">{interestCount === 0 ? "Choose what you follow" : "Who are you preparing to talk to?"}</h2>
            <p className="max-w-prose text-slate-600">{interestCount === 0
              ? "Add an interest to research, then add a person and choose the topics you discuss with them."
              : "Add a person and assign your shared interests. Their conversation history will shape your prep cards."}</p>
            <Link href={interestCount === 0 ? "/interests" : "/people"} className={primaryLink}>{interestCount === 0 ? "Add an interest" : "Add a person"}</Link>
          </>
        ) : (
          <>
            <h2 className="break-words text-xl font-semibold">Prepare for {person.name}</h2>
            <p className="max-w-prose text-sm text-slate-600">{person.lastConversationAt
              ? `Last conversation: ${formatDate(person.lastConversationAt)}. Review what you told them and what has changed since.`
              : "No conversation recorded yet. Add what you have told them to give your prep cards context."}</p>
            {latestDeck.loading && !deck ? <Loading label="Checking your latest prep deck..." /> : null}
            {latestDeck.error ? <><p className="text-sm text-slate-600">The latest deck could not be checked. You can still open this person's briefing.</p><ErrorMessage error={latestDeck.error} onRetry={latestDeck.reload} /></> : null}
            {!latestDeck.error && deck?.status === "completed" ? (
              <div className="space-y-3">
                <p className="text-sm text-slate-600">{deck.cards.length > 0 ? `${deck.cards.length} prep ${deck.cards.length === 1 ? "card is" : "cards are"} ready. Built ${formatDate(deck.createdAt)}.` : "Your latest deck has no cards. Open the briefing to review inputs and rebuild."}</p>
                {deck.cards.length > 0 ? <div className="flex flex-wrap items-center gap-4"><Link href={`/decks/${deck.id}/prep`} className={primaryLink}>Open prep</Link><Link href={`/decks/${deck.id}/live`} className="text-sm underline underline-offset-4">Go live</Link></div> : null}
              </div>
            ) : null}
            {!latestDeck.error && building ? <p role="status" className="text-sm text-slate-600">{deck?.status === "queued" ? "Your deck is queued." : "Your deck is being prepared."} Open the briefing to follow its progress.</p> : null}
            {!latestDeck.error && deck?.status === "failed" ? <p role="alert" className="text-sm text-red-800">Your latest deck could not be built. Open the briefing to review the error and rebuild.</p> : null}
            {!latestDeck.loading && !latestDeck.error && !deck ? <p className="text-sm text-slate-600">No prep deck yet. Review their claims and shared interests, then build one from their briefing.</p> : null}
            <Link href={`/people/${person.id}`} className={deck?.status === "completed" && deck.cards.length > 0 && !latestDeck.error ? "inline-flex min-h-11 items-center text-sm underline underline-offset-4" : primaryLink}>Open briefing</Link>
          </>
        )}
      </Card>
      <section aria-labelledby="setup-heading" className="space-y-3">
        <h2 id="setup-heading" className="text-base font-semibold">Identity and setup</h2>
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-600">
          <Link href="/identity" className="inline-flex min-h-11 max-w-full items-center underline underline-offset-4 [overflow-wrap:anywhere]">{identity ? `Edit identity: ${identity.name}` : "Set up your identity"}</Link>
          <Link href="/interests" className="inline-flex min-h-11 items-center underline underline-offset-4">Manage interests ({interestCount})</Link>
          <Link href="/people" className="inline-flex min-h-11 items-center underline underline-offset-4">View people ({people.length})</Link>
        </div>
      </section>
    </div>
  );
}
