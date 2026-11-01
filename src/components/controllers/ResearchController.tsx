"use client";

import { useState } from "react";
import { ResearchTimeline } from "@/components/ResearchTimeline";
import { BackLink, ErrorMessage, formatCoordDate, Loading } from "@/components/ui";
import { api } from "@/lib/api";
import { isTerminal, listAll, usePolling, useResource } from "@/lib/use-resource";

export function ResearchController({ interestId }: { interestId: string }) {
  const interests = useResource(`interests:${interestId}`, () =>
    listAll((cursor) => api.listInterests({ cursor, limit: 100 })),
  );
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

  if (interests.loading && !interests.data) return <Loading label="Loading topic sector..." />;
  if (interests.error) return <ErrorMessage error={interests.error} onRetry={interests.reload} />;
  if (!interest) {
    return (
      <div className="space-y-3">
        <p role="alert" className="rounded-sm border border-neg-line bg-neg-bg px-4 py-3 text-sm text-neg-ink">
          NOT_FOUND: no interest with this id exists.
        </p>
        <BackLink href="/interests">Back to interests</BackLink>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header className="space-y-3 border-b border-line pb-5">
        <BackLink href="/interests">All interests</BackLink>
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <h1 className="break-words text-[28px] font-bold leading-tight tracking-[-0.03em] sm:text-[34px]">
            {interest.name}
          </h1>
          <span className="serial-tag">UPDATED: {formatCoordDate(interest.updatedAt)}</span>
        </div>
        {interest.searchTerms.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5 pt-1 text-sm text-muted">
            <span className="mr-1 font-mono text-xs font-semibold text-muted">SEARCH TERMS:</span>
            {interest.searchTerms.map((term) => (
              <span
                key={term}
                className="rounded-sm border border-line bg-surface px-2 py-0.5 font-mono text-xs text-ink"
              >
                {term}
              </span>
            ))}
          </div>
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
