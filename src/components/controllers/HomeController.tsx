"use client";

import Link from "next/link";
import {
  ArrowIcon,
  ErrorMessage,
  formatDate,
  formatSerial,
  Loading,
  SectionTitle,
} from "@/components/ui";
import { api } from "@/lib/api";
import { listAll, usePolling, useResource } from "@/lib/use-resource";

const primaryLink =
  "group inline-flex min-h-11 max-w-full items-center justify-center gap-2 rounded-sm border border-ink bg-ink px-4 text-sm font-semibold text-ground transition-opacity [overflow-wrap:anywhere] hover:opacity-90";
const quietLink = "link inline-flex min-h-11 items-center text-sm font-semibold text-ink";

export function HomeController() {
  const overview = useResource("home", async () => {
    const [identity, interests, people] = await Promise.all([
      api.getIdentity({}),
      listAll((cursor) => api.listInterests({ cursor, limit: 100 })),
      listAll((cursor) => api.listPeople({ cursor, limit: 100 })),
    ]);
    return { identity, interests, people };
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

  const { identity, interests, people } = overview.data;
  const interestCount = interests.length;
  const deckReady = deck?.status === "completed" && deck.cards.length > 0 && !latestDeck.error;

  const routine = [
    {
      step: "STEP 01",
      href: "/identity",
      title: "Set the cover",
      body: "Establish the baseline name and backstory. Every claim and flashcard is verified against this file.",
    },
    {
      step: "STEP 02",
      href: "/interests",
      title: "Pick what you follow",
      body: "Track teams, shows, and hobbies. Alias pulls daily facts so you can speak fluently about recent news.",
    },
    {
      step: "STEP 03",
      href: "/people",
      title: "Log every conversation",
      body: "Record the claims you made per contact. Any statement that contradicts an earlier claim is flagged.",
    },
    {
      step: "STEP 04",
      href: "/people",
      title: "Study the deck",
      body: "Generate person-specific flashcards: quiz yourself in Prep mode before the call or use Live mode beside it.",
    },
  ];

  return (
    <div className="space-y-9">
      {/* Status strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-line bg-raised px-4 py-2.5 font-mono text-xs">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
          <span className="inline-flex items-center gap-2 font-semibold text-ink">
            <span aria-hidden="true" className={`size-2 rounded-full ${identity ? "bg-pos-ink" : "bg-stamp"}`} />
            {identity ? `COVER ACTIVE: ${identity.name.toUpperCase()}` : "COVER UNSET"}
          </span>
          <span className="tnum text-muted">
            SECTORS: <strong className="text-ink">{String(interestCount).padStart(2, "0")}</strong>
          </span>
          <span className="tnum text-muted">
            CONTACTS: <strong className="text-ink">{String(people.length).padStart(2, "0")}</strong>
          </span>
        </div>
      </div>

      <div className="grid items-stretch gap-6 lg:grid-cols-12">
        {/* Left zone: cover identity dossier */}
        <section
          aria-labelledby="home-identity"
          className="flex flex-col justify-between gap-6 rounded-sm border border-night-line bg-night p-6 text-night-ink sm:p-7 lg:col-span-5"
        >
          <div className="space-y-5">
            <div className="flex items-center justify-between gap-4 border-b border-night-line pb-3.5">
              <h2 id="home-identity" className="text-base font-bold tracking-[-0.01em] text-night-ink">
                Identity and setup
              </h2>
              <span className="inline-flex items-center gap-2 rounded-sm bg-night-raised px-2.5 py-1 font-mono text-[11px] font-semibold text-night-muted">
                <span aria-hidden="true" className={`size-1.5 rounded-full ${identity ? "bg-signal" : "bg-stamp"}`} />
                {identity ? "ID-01 // VERIFIED" : "ID-00 // UNSET"}
              </span>
            </div>

            {identity ? (
              <div className="space-y-3">
                <p className="break-words text-[38px] font-bold leading-[1.02] tracking-[-0.035em] text-night-ink sm:text-[46px]">
                  {identity.name}
                </p>
                {identity.background ? (
                  <p className="max-w-[62ch] text-[15px] leading-relaxed text-night-muted">{identity.background}</p>
                ) : (
                  <p className="text-sm text-night-muted">No background summary recorded yet.</p>
                )}
              </div>
            ) : (
              <div className="space-y-2 py-2">
                <p className="text-[28px] font-bold leading-tight tracking-[-0.03em] text-night-ink">
                  Start with your cover identity
                </p>
                <p className="text-sm leading-relaxed text-night-muted">
                  Save the identity you want to keep consistent. Then add interests and the people you talk to.
                </p>
              </div>
            )}
          </div>

          <div className="space-y-5 border-t border-night-line pt-5">
            <dl className="grid grid-cols-2 gap-3 rounded-sm bg-night-raised p-3.5 font-mono">
              <div>
                <dt className="text-[11px] text-night-muted">TOPICS</dt>
                <dd className="tnum mt-1 text-2xl font-bold text-night-ink">{String(interestCount).padStart(2, "0")}</dd>
              </div>
              <div className="border-l border-night-line pl-3">
                <dt className="text-[11px] text-night-muted">CONTACTS</dt>
                <dd className="tnum mt-1 text-2xl font-bold text-night-ink">{String(people.length).padStart(2, "0")}</dd>
              </div>
            </dl>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <Link
                href="/identity"
                className="group inline-flex min-h-11 max-w-full items-center gap-2 rounded-sm bg-night-ink px-4 text-sm font-semibold text-night transition-opacity [overflow-wrap:anywhere] hover:opacity-90 focus-visible:outline-night-ink sm:min-h-10"
              >
                {identity ? `Edit identity: ${identity.name}` : "Set up your identity"}
                <ArrowIcon className="transition-transform duration-150 group-hover:translate-x-0.5" />
              </Link>
              <Link
                href="/interests"
                className="inline-flex min-h-11 items-center gap-1.5 rounded-sm px-2 font-mono text-xs font-semibold text-night-muted underline decoration-night-line underline-offset-4 hover:text-night-ink focus-visible:outline-night-ink sm:min-h-10"
              >
                Manage interests ({interestCount})
              </Link>
              <Link
                href="/people"
                className="inline-flex min-h-11 items-center gap-1.5 rounded-sm px-2 font-mono text-xs font-semibold text-night-muted underline decoration-night-line underline-offset-4 hover:text-night-ink focus-visible:outline-night-ink sm:min-h-10"
              >
                View people ({people.length})
              </Link>
            </div>
          </div>
        </section>

        {/* Right zone: next conversation */}
        <section
          aria-labelledby="home-next"
          className="flex flex-col justify-between gap-6 rounded-sm border border-line bg-surface p-6 sm:p-7 lg:col-span-7"
        >
          {!identity ? (
            <div className="space-y-4">
              <h2 id="home-next" className="text-xl font-bold tracking-[-0.015em] text-ink">Start with your cover identity</h2>
              <p className="max-w-prose text-muted">Save the identity you want to keep consistent. Then add interests and the people you talk to.</p>
              <Link href="/identity" className={primaryLink}>Set up your identity</Link>
            </div>
          ) : !person ? (
            <div className="space-y-4">
              <h2 id="home-next" className="text-xl font-bold tracking-[-0.015em] text-ink">{interestCount === 0 ? "Choose what you follow" : "Who are you preparing to talk to?"}</h2>
              <p className="max-w-prose text-muted">{interestCount === 0
                ? "Add an interest to research, then add a person and choose the topics you discuss with them."
                : "Add a person and assign your shared interests. Their conversation history will shape your prep cards."}</p>
              <Link href={interestCount === 0 ? "/interests" : "/people"} className={primaryLink}>{interestCount === 0 ? "Add an interest" : "Add a person"}</Link>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <h2 id="home-next" className="break-words text-xl font-bold tracking-[-0.015em] text-ink">Prepare for {person.name}</h2>
                <span className="serial-tag">{formatSerial("CNT", 1)}</span>
              </div>
              <p className="max-w-prose text-sm text-muted">{person.lastConversationAt
                ? `Last conversation: ${formatDate(person.lastConversationAt)}. Review what you told them and what has changed since.`
                : "No conversation recorded yet. Add what you have told them to give your prep cards context."}</p>
              {latestDeck.loading && !deck ? <Loading label="Checking your latest prep deck..." /> : null}
              {latestDeck.error ? <><p className="text-sm text-muted">The latest deck could not be checked. You can still open this person&apos;s briefing.</p><ErrorMessage error={latestDeck.error} onRetry={latestDeck.reload} /></> : null}
              {!latestDeck.error && deck?.status === "completed" ? (
                <div className="space-y-3">
                  <p className="text-sm text-muted">{deck.cards.length > 0 ? `${deck.cards.length} prep ${deck.cards.length === 1 ? "card is" : "cards are"} ready. Built ${formatDate(deck.createdAt)}.` : "Your latest deck has no cards. Open the briefing to review inputs and rebuild."}</p>
                  {deck.cards.length > 0 ? (
                    <div className="flex flex-wrap items-center gap-4">
                      <Link href={`/decks/${deck.id}/prep`} className={primaryLink}>Open prep<ArrowIcon className="transition-transform duration-150 group-hover:translate-x-0.5" /></Link>
                      <Link href={`/decks/${deck.id}/live`} className={quietLink}>Go live</Link>
                    </div>
                  ) : null}
                </div>
              ) : null}
              {!latestDeck.error && building ? <p role="status" className="text-sm text-muted">{deck?.status === "queued" ? "Your deck is queued." : "Your deck is being prepared."} Open the briefing to follow its progress.</p> : null}
              {!latestDeck.error && deck?.status === "failed" ? <p role="alert" className="text-sm text-neg-ink">Your latest deck could not be built. Open the briefing to review the error and rebuild.</p> : null}
              {!latestDeck.loading && !latestDeck.error && !deck ? <p className="text-sm text-muted">No prep deck yet. Review their claims and shared interests, then build one from their briefing.</p> : null}
              <Link href={`/people/${person.id}`} className={deckReady ? quietLink : primaryLink}>Open briefing</Link>
            </div>
          )}
        </section>
      </div>

      {/* Operating sequence */}
      <section aria-labelledby="home-routine">
        <SectionTitle aside={<span className="font-mono text-xs text-muted">STANDARD OPERATING SEQUENCE</span>}>
          <span id="home-routine">How Alias keeps your story straight</span>
        </SectionTitle>
        <ol className="grid gap-px overflow-hidden rounded-sm border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
          {routine.map((step) => (
            <li key={step.title} className="bg-surface">
              <Link
                href={step.href}
                className="group flex h-full flex-col justify-between gap-4 p-5 transition-colors hover:bg-raised/45 focus-visible:-outline-offset-2"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold tracking-[-0.015em] text-ink group-hover:text-stamp">{step.title}</span>
                    <span className="serial-tag">{step.step}</span>
                  </div>
                  <p className="text-sm leading-relaxed text-muted">{step.body}</p>
                </div>
                <span className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold text-ink group-hover:text-stamp">
                  Open sector
                  <ArrowIcon className="size-3.5 transition-transform duration-150 group-hover:translate-x-0.5" />
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
