"use client";

import Link from "next/link";
import { useState } from "react";
import { ResearchTimeline } from "@/components/ResearchTimeline";
import { ErrorMessage, Loading } from "@/components/ui";
import { api } from "@/lib/api";
import { isTerminal, listAll, usePolling, useResource } from "@/lib/use-resource";

export function ResearchController({ interestId }: { interestId: string }) {
  const interests = useResource(`interests:${interestId}`, () => listAll((cursor) => api.listInterests({ cursor, limit: 100 })));
  const research = useResource(`research:${interestId}`, async () => {
    const [runs, facts] = await Promise.all([
      listAll((cursor) => api.listResearchRuns({ interestId, cursor, limit: 100 })),
      listAll((cursor) => api.listResearchFacts({ interestId, since: null, cursor, limit: 100 })),
    ]);
    return { runs, facts };
  });
  const [pollError, setPollError] = useState(false);

  // Any queued or running run is polled until it finishes, including ones started elsewhere.
  const activeRun = research.data?.runs.find((r) => !isTerminal(r.status)) ?? null;

  usePolling(activeRun !== null && !pollError, async () => {
    if (!activeRun) return;
    try {
      const run = await api.getResearchRun({ id: activeRun.id });
      research.setData((current) =>
        current ? { ...current, runs: current.runs.map((r) => (r.id === run.id ? run : r)) } : current,
      );
      if (isTerminal(run.status)) await research.reload();
    } catch {
      setPollError(true);
    }
  });

  const interest = interests.data?.find((i) => i.id === interestId) ?? null;

  if (interests.loading && !interests.data) return <Loading />;
  if (interests.error) return <ErrorMessage error={interests.error} onRetry={interests.reload} />;
  if (!interest) {
    return (
      <div className="space-y-3">
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          NOT_FOUND: no interest with this id exists.
        </p>
        <Link href="/interests" className="text-sm underline">Back to interests</Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <Link href="/interests" className="text-sm underline">All interests</Link>
        <h1 className="text-2xl font-semibold">{interest.name}</h1>
        <p className="max-w-prose text-sm text-slate-600">Alias finds sources automatically from this topic using news search, Hacker News, Reddit and Wikipedia. Custom feeds, if added, are extra sources.</p>
        {interest.searchTerms.length > 0 ? (
          <p className="text-sm text-slate-600">Searching for: {interest.searchTerms.join(", ")}</p>
        ) : null}
      </header>
      {pollError ? (
        <ErrorMessage
          error={{ code: "INTERNAL_ERROR", message: "Could not check research progress.", retryable: true }}
          onRetry={() => setPollError(false)}
        />
      ) : null}
      <ResearchTimeline
        interestId={interestId}
        state={{ data: research.data, loading: research.loading, error: research.error }}
        onRunNow={async (input) => {
          const run = await api.startResearch(input);
          setPollError(false);
          research.setData((current) => ({ runs: [run, ...(current?.runs ?? [])], facts: current?.facts ?? [] }));
          return run;
        }}
      />
    </div>
  );
}
