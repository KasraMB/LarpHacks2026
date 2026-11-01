"use client";

import Link from "next/link";
import { ArrowIcon, ErrorMessage, Loading, SectionTitle } from "@/components/ui";
import { api } from "@/lib/api";
import { listAll, useResource } from "@/lib/use-resource";

export function HomeController() {
  const overview = useResource("home", async () => {
    const [identity, interests, people] = await Promise.all([
      api.getIdentity({}),
      listAll((cursor) => api.listInterests({ cursor, limit: 100 })),
      listAll((cursor) => api.listPeople({ cursor, limit: 100 })),
    ]);
    return { identity, interestCount: interests.length, peopleCount: people.length };
  });

  if (overview.loading && !overview.data) return <Loading />;
  if (overview.error) return <ErrorMessage error={overview.error} onRetry={overview.reload} />;
  if (!overview.data) return null;
  const { identity, interestCount, peopleCount } = overview.data;

  const routine = [
    { href: "/identity", title: "Set the cover", body: "Name and backstory. Everything else is checked against it." },
    { href: "/interests", title: "Pick what you follow", body: "Teams, shows, hobbies. Alias reads the news so you can talk about last night." },
    { href: "/people", title: "Log every conversation", body: "Record the claims you made. A new claim that breaks an old one gets flagged." },
    { href: "/people", title: "Study the deck", body: "Flashcards per person: prep before the call, live mode beside it." },
  ];

  return (
    <div className="space-y-10">
      <div className="grid gap-3 lg:grid-cols-12">
        <section aria-labelledby="home-identity" className="flex min-h-60 flex-col justify-between gap-8 rounded-lg bg-ink p-6 text-white sm:p-8 lg:col-span-8">
          <div className="flex items-center justify-between gap-4">
            <h2 id="home-identity" className="text-sm font-medium text-night-muted">Identity</h2>
            <span className="inline-flex items-center gap-2 text-xs text-night-muted">
              <span aria-hidden="true" className={`size-1.5 rounded-full ${identity ? "bg-[#4ade80]" : "bg-night-muted"}`} />
              {identity ? "Cover active" : "No cover set"}
            </span>
          </div>
          <div className="space-y-5">
            {identity ? (
              <>
                <p className="break-words text-[40px] font-semibold leading-[1] tracking-[-0.035em] sm:text-[56px]">{identity.name}</p>
                {identity.background ? (
                  <p className="line-clamp-3 max-w-xl text-[15px] leading-relaxed text-night-muted">{identity.background}</p>
                ) : null}
              </>
            ) : (
              <p className="text-[28px] font-semibold leading-tight tracking-[-0.03em] sm:text-[36px]">No identity yet.</p>
            )}
            <Link
              href="/identity"
              className="group inline-flex min-h-11 items-center gap-2 rounded-md bg-white px-3.5 text-sm font-medium text-ink transition-colors hover:bg-[#e9e8e4]"
            >
              {identity ? "Edit identity" : "Set up your identity"}
              <ArrowIcon className="transition-transform duration-150 group-hover:translate-x-0.5" />
            </Link>
          </div>
        </section>

        <div className="grid grid-cols-2 gap-3 lg:col-span-4 lg:grid-cols-1">
          <CountTile title="Interests" count={interestCount} href="/interests" linkLabel="Manage interests" caption={interestCount === 1 ? "topic researched" : "topics researched"} />
          <CountTile title="People" count={peopleCount} href="/people" linkLabel="View people" caption={peopleCount === 1 ? "person tracked" : "people tracked"} />
        </div>
      </div>

      <section aria-labelledby="home-routine">
        <SectionTitle>
          <span id="home-routine">How Alias keeps your story straight</span>
        </SectionTitle>
        <ol className="grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
          {routine.map((step) => (
            <li key={step.title} className="bg-surface">
              <Link href={step.href} className="group flex h-full flex-col gap-2 p-5 transition-colors hover:bg-[#fafaf8] focus-visible:-outline-offset-2">
                <span className="flex items-center justify-between gap-2 font-semibold tracking-[-0.01em]">
                  {step.title}
                  <ArrowIcon className="text-faint transition-[transform,color] duration-150 group-hover:translate-x-0.5 group-hover:text-ink" />
                </span>
                <span className="text-sm leading-relaxed text-muted">{step.body}</span>
              </Link>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function CountTile({ title, count, href, linkLabel, caption }: { title: string; count: number; href: string; linkLabel: string; caption: string }) {
  return (
    <section aria-label={title} className="flex flex-col justify-between gap-4 rounded-lg border border-line bg-surface p-5">
      <h2 className="text-sm font-medium text-muted">{title}</h2>
      <p>
        <span className={`tnum block text-[32px] font-medium leading-none tracking-[-0.03em] ${count === 0 ? "text-faint" : "text-ink"}`}>{count}</span>
        <span className="mt-1.5 block text-[13px] text-muted">{caption}</span>
      </p>
      <Link href={href} className="link -my-2 inline-flex min-h-11 w-fit items-center text-sm font-medium sm:min-h-9">{linkLabel}</Link>
    </section>
  );
}
