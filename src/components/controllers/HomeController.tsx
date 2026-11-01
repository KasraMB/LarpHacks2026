"use client";

import Link from "next/link";
import type { Claim, Deck, Interest, Person } from "@/contracts";
import {
  AlertIcon,
  ArrowIcon,
  CheckIcon,
  EmptyState,
  ErrorMessage,
  formatCoordDate,
  formatSerial,
  Loading,
  SectionTitle,
} from "@/components/ui";
import { api } from "@/lib/api";
import { listAll, useResource } from "@/lib/use-resource";

type ContactSummary = {
  person: Person;
  claims: Claim[];
  conflictCount: number;
  latestDeck: Deck | null;
};

export function HomeController() {
  const overview = useResource("home", async () => {
    const [identity, interests, people] = await Promise.all([
      api.getIdentity({}),
      listAll((cursor) => api.listInterests({ cursor, limit: 100 })),
      listAll((cursor) => api.listPeople({ cursor, limit: 100 })),
    ]);

    const contactSummaries: ContactSummary[] = await Promise.all(
      people.map(async (person) => {
        const [claims, decksPage] = await Promise.all([
          listAll((cursor) => api.listClaims({ personId: person.id, cursor, limit: 100 })).catch(() => [] as Claim[]),
          api.listDecks({ personId: person.id, limit: 1 }).catch(() => ({ items: [] as Deck[], nextCursor: null })),
        ]);
        const conflictCount = claims.filter((c) => c.contradictions.length > 0).length;
        return {
          person,
          claims,
          conflictCount,
          latestDeck: decksPage.items[0] ?? null,
        };
      }),
    );

    return { identity, interests, contactSummaries };
  });

  if (overview.loading && !overview.data) return <Loading label="Loading field continuity register..." />;
  if (overview.error) return <ErrorMessage error={overview.error} onRetry={overview.reload} />;
  if (!overview.data) return null;

  const { identity, interests, contactSummaries } = overview.data;
  const interestById = new Map<string, Interest>(interests.map((i) => [i.id, i]));
  const totalClaims = contactSummaries.reduce((acc, c) => acc + c.claims.length, 0);
  const totalConflicts = contactSummaries.reduce((acc, c) => acc + c.conflictCount, 0);

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
      {/* Datum Cutoff Status Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-line bg-raised px-4 py-2.5 font-mono text-xs">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
          <span className="inline-flex items-center gap-2 font-semibold text-ink">
            <span
              aria-hidden="true"
              className={`size-2 rounded-full ${identity ? "bg-pos-ink" : "bg-stamp"}`}
            />
            {identity ? `COVER ACTIVE: ${identity.name.toUpperCase()}` : "COVER UNSET"}
          </span>
          <span className="tnum text-muted">
            SECTORS: <strong className="text-ink">{String(interests.length).padStart(2, "0")}</strong>
          </span>
          <span className="tnum text-muted">
            CONTACTS: <strong className="text-ink">{String(contactSummaries.length).padStart(2, "0")}</strong>
          </span>
          <span className="tnum text-muted">
            CLAIMS LOGGED: <strong className="text-ink">{String(totalClaims).padStart(2, "0")}</strong>
          </span>
        </div>
        <div>
          {totalConflicts > 0 ? (
            <span className="inline-flex items-center gap-1.5 rounded-sm border border-neg-line bg-neg-bg px-2.5 py-0.5 font-semibold text-neg-ink">
              <AlertIcon className="size-3.5" />
              {totalConflicts} {totalConflicts === 1 ? "CONFLICT TRAP ACTIVE" : "CONFLICT TRAPS ACTIVE"}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-sm border border-pos-line bg-pos-bg px-2.5 py-0.5 font-semibold text-pos-ink">
              <CheckIcon className="size-3.5" />
              ALL LEDGERS RECONCILED
            </span>
          )}
        </div>
      </div>

      {/* Primary Two-Zone Operational Field */}
      <div className="grid items-stretch gap-6 lg:grid-cols-12">
        {/* Left Zone: Active Cover Benchmark Dossier */}
        <section
          aria-labelledby="home-identity"
          className="flex flex-col justify-between gap-6 rounded-sm border border-night-line bg-night p-6 text-night-ink sm:p-7 lg:col-span-5"
        >
          <div className="space-y-5">
            <div className="flex items-center justify-between gap-4 border-b border-night-line pb-3.5">
              <h2 id="home-identity" className="text-base font-bold tracking-[-0.01em] text-night-ink">
                Cover benchmark dossier
              </h2>
              <span className="inline-flex items-center gap-2 rounded-sm bg-night-raised px-2.5 py-1 font-mono text-[11px] font-semibold text-night-muted">
                <span
                  aria-hidden="true"
                  className={`size-1.5 rounded-full ${identity ? "bg-signal" : "bg-stamp"}`}
                />
                {identity ? "ID-01 // VERIFIED" : "ID-00 // UNSET"}
              </span>
            </div>

            {identity ? (
              <div className="space-y-3">
                <p className="break-words text-[38px] font-bold leading-[1.02] tracking-[-0.035em] text-night-ink sm:text-[46px]">
                  {identity.name}
                </p>
                {identity.background ? (
                  <p className="max-w-[62ch] text-[15px] leading-relaxed text-night-muted">
                    {identity.background}
                  </p>
                ) : (
                  <p className="text-sm text-night-muted">No background summary recorded yet.</p>
                )}
              </div>
            ) : (
              <div className="space-y-2 py-2">
                <p className="text-[28px] font-bold leading-tight tracking-[-0.03em] text-night-ink">
                  No cover identity on file.
                </p>
                <p className="text-sm leading-relaxed text-night-muted">
                  Establish your cover name and background before logging contact claims or building briefing decks.
                </p>
              </div>
            )}
          </div>

          <div className="space-y-5 border-t border-night-line pt-5">
            <dl className="grid grid-cols-3 gap-3 rounded-sm bg-night-raised p-3.5 font-mono">
              <div>
                <dt className="text-[11px] text-night-muted">TOPICS</dt>
                <dd className="tnum mt-1 text-2xl font-bold text-night-ink">
                  {String(interests.length).padStart(2, "0")}
                </dd>
              </div>
              <div className="border-x border-night-line px-3">
                <dt className="text-[11px] text-night-muted">CONTACTS</dt>
                <dd className="tnum mt-1 text-2xl font-bold text-night-ink">
                  {String(contactSummaries.length).padStart(2, "0")}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] text-night-muted">CONFLICTS</dt>
                <dd
                  className={`tnum mt-1 text-2xl font-bold ${
                    totalConflicts > 0 ? "text-stamp" : "text-signal"
                  }`}
                >
                  {String(totalConflicts).padStart(2, "0")}
                </dd>
              </div>
            </dl>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <Link
                href="/identity"
                className="group inline-flex min-h-11 items-center gap-2 rounded-sm bg-night-ink px-4 text-sm font-semibold text-night transition-opacity hover:opacity-90 focus-visible:outline-night-ink sm:min-h-10"
              >
                {identity ? "Edit identity file" : "Set up your identity"}
                <ArrowIcon className="transition-transform duration-150 group-hover:translate-x-0.5" />
              </Link>
              <Link
                href="/interests"
                className="inline-flex min-h-11 items-center gap-1.5 rounded-sm px-2 font-mono text-xs font-semibold text-night-muted underline decoration-night-line underline-offset-4 hover:text-night-ink focus-visible:outline-night-ink sm:min-h-10"
              >
                Manage topics ({interests.length})
              </Link>
            </div>
          </div>
        </section>

        {/* Right Zone: Live Contact & Cutoff Delta Register */}
        <section
          aria-labelledby="home-contacts-register"
          className="flex flex-col justify-between rounded-sm border border-line bg-surface lg:col-span-7"
        >
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-raised/70 px-5 py-3.5">
              <h2 id="home-contacts-register" className="text-base font-bold tracking-[-0.015em] text-ink">
                Contact cutoff &amp; continuity register
              </h2>
              <Link
                href="/people"
                className="group inline-flex items-center gap-1.5 font-mono text-xs font-semibold text-ink hover:text-stamp"
              >
                All contacts ({contactSummaries.length})
                <ArrowIcon className="size-3.5 transition-transform duration-150 group-hover:translate-x-0.5" />
              </Link>
            </div>

            {contactSummaries.length === 0 ? (
              <div className="p-6">
                <EmptyState>
                  No contacts tracked yet.{" "}
                  <Link href="/people" className="link font-semibold text-ink">
                    Add your first contact
                  </Link>{" "}
                  to start logging claims and building briefing decks.
                </EmptyState>
              </div>
            ) : (
              <ul className="divide-y divide-rule">
                {contactSummaries.map(({ person, claims, conflictCount, latestDeck }, idx) => {
                  const linkedTopics = person.interestIds
                    .map((id) => interestById.get(id))
                    .filter((i): i is Interest => Boolean(i));
                  const deckReady = latestDeck?.status === "completed";

                  return (
                    <li key={person.id} className="p-4 transition-colors hover:bg-ground/60 sm:px-5 sm:py-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link
                              href={`/people/${person.id}`}
                              className="group inline-flex items-center gap-1.5 text-[18px] font-bold tracking-[-0.02em] text-ink hover:text-stamp"
                            >
                              <span>{person.name}</span>
                              <ArrowIcon className="size-4 text-faint transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-stamp" />
                            </Link>
                            <span className="serial-tag">{formatSerial("CNT", idx + 1)}</span>
                            {conflictCount > 0 ? (
                              <span className="inline-flex items-center gap-1 rounded-sm border border-neg-line bg-neg-bg px-2 py-0.5 font-mono text-[11px] font-semibold text-neg-ink">
                                <AlertIcon className="size-3" />
                                {conflictCount} {conflictCount === 1 ? "conflict" : "conflicts"}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-sm border border-pos-line bg-pos-bg px-2 py-0.5 font-mono text-[11px] font-semibold text-pos-ink">
                                <CheckIcon className="size-3" />
                                Clear
                              </span>
                            )}
                          </div>
                          {person.notes ? (
                            <p className="line-clamp-1 text-sm text-muted">{person.notes}</p>
                          ) : null}
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/people/${person.id}`}
                            className="inline-flex min-h-9 items-center rounded-sm border border-line bg-raised px-3 text-xs font-semibold text-ink transition-colors hover:border-control hover:bg-rule"
                          >
                            Open ledger ({claims.length})
                          </Link>
                          {deckReady && latestDeck ? (
                            <>
                              <Link
                                href={`/decks/${latestDeck.id}/prep`}
                                className="inline-flex min-h-9 items-center rounded-sm border border-ink bg-ink px-3 text-xs font-semibold text-ground transition-opacity hover:opacity-90"
                              >
                                Prep ({latestDeck.cards.length})
                              </Link>
                              <Link
                                href={`/decks/${latestDeck.id}/live`}
                                className="inline-flex min-h-9 items-center rounded-sm border border-pos-line bg-pos-bg px-3 text-xs font-semibold text-pos-ink transition-opacity hover:opacity-90"
                              >
                                Live
                              </Link>
                            </>
                          ) : null}
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-rule/80 pt-2.5 font-mono text-xs text-muted">
                        <span className="tnum">
                          CUTOFF: <strong className="text-ink">{formatCoordDate(person.lastConversationAt)}</strong>
                        </span>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {linkedTopics.length > 0 ? (
                            linkedTopics.map((topic) => (
                              <Link
                                key={topic.id}
                                href={`/interests/${topic.id}`}
                                className="rounded-sm border border-line bg-ground px-2 py-0.5 text-[11px] font-medium text-ink hover:border-ink"
                              >
                                {topic.name}
                              </Link>
                            ))
                          ) : (
                            <span className="text-[11px] text-faint">No linked topics</span>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Tracked Topic Sectors Footer inside the Register */}
          <div className="border-t border-line bg-ground/60 px-5 py-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-xs font-semibold text-muted">
                RESEARCH SECTORS ({interests.length})
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                {interests.map((interest, idx) => (
                  <Link
                    key={interest.id}
                    href={`/interests/${interest.id}`}
                    className="inline-flex items-center gap-1.5 rounded-sm border border-line bg-surface px-2.5 py-1 text-xs font-semibold text-ink transition-colors hover:border-ink hover:bg-raised"
                  >
                    <span className="font-mono text-[10px] text-muted">{formatSerial("SEC", idx + 1)}</span>
                    <span>{interest.name}</span>
                  </Link>
                ))}
                <Link
                  href="/interests"
                  className="inline-flex items-center gap-1 rounded-sm border border-dashed border-control px-2.5 py-1 font-mono text-xs font-semibold text-muted hover:border-ink hover:text-ink"
                >
                  Manage topics
                </Link>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Operational Protocol Sequence */}
      <section aria-labelledby="home-routine">
        <SectionTitle
          aside={<span className="font-mono text-xs text-muted">STANDARD OPERATING SEQUENCE</span>}
        >
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
                    <span className="font-semibold tracking-[-0.015em] text-ink group-hover:text-stamp">
                      {step.title}
                    </span>
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
