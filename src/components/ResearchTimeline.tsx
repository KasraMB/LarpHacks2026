"use client";

import { useState } from "react";
import type { ApiError, ResearchFact } from "@/contracts";
import { toApiError } from "@/lib/use-resource";
import type { ResearchTimelineProps } from "./contracts";
import { Button, Card, EmptyState, ErrorMessage, formatDate, Loading, StatusBadge } from "./ui";

const kindLabels: Record<ResearchFact["kind"], string> = {
  reported_fact: "Reported fact",
  fan_reaction: "Fan reaction",
  context: "Context",
};

export function ResearchTimeline({ interestId, state, onRunNow }: ResearchTimelineProps) {
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const runs = state.data ? [...state.data.runs].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : [];
  const facts = state.data ? [...state.data.facts].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : [];
  const active = runs.some((r) => r.status === "queued" || r.status === "running");

  async function start() {
    setStarting(true);
    setError(null);
    try {
      await onRunNow({ interestId });
    } catch (e) {
      setError(toApiError(e));
    } finally {
      setStarting(false);
    }
  }

  return (
    <section aria-labelledby="research-timeline-title" className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="research-timeline-title" className="text-lg font-semibold">Research timeline</h2>
        <Button busy={starting} disabled={active} onClick={start}>
          {active ? "Research in progress" : "Run research now"}
        </Button>
      </div>
      <ErrorMessage error={error} />
      {state.loading && !state.data ? <Loading /> : null}
      {state.error ? <ErrorMessage error={state.error} /> : null}

      {state.data ? (
        <>
          <div className="space-y-3">
            <h3 className="font-medium">Runs</h3>
            {runs.length === 0 ? <EmptyState>No research runs yet.</EmptyState> : (
              <ul className="space-y-3">
                {runs.map((run) => (
                  <li key={run.id}>
                    <Card className="space-y-1 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={run.status} />
                        <span>{run.trigger === "manual" ? "Manual run" : "Scheduled run"}</span>
                        <span className="text-slate-500">{run.factCount} {run.factCount === 1 ? "fact" : "facts"}</span>
                      </div>
                      <p className="text-slate-600">
                        Created {formatDate(run.createdAt)}
                        {run.startedAt ? `, started ${formatDate(run.startedAt)}` : ""}
                        {run.finishedAt ? `, finished ${formatDate(run.finishedAt)}` : ""}
                      </p>
                      {run.failure ? (
                        <p role="alert" className="text-red-700">Run failed: {run.failure.message}</p>
                      ) : null}
                      {run.sourceErrors.length > 0 ? (
                        <div>
                          <p className="font-medium text-amber-800">
                            {run.sourceErrors.length} source {run.sourceErrors.length === 1 ? "error" : "errors"}
                          </p>
                          <ul className="list-disc pl-5 text-slate-600">
                            {run.sourceErrors.map((se, i) => (
                              <li key={i}>{se.url ? `${se.url}: ` : ""}{se.message}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </Card>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-3">
            <h3 className="font-medium">Facts</h3>
            {facts.length === 0 ? <EmptyState>No facts collected yet.</EmptyState> : (
              <ul className="space-y-3">
                {facts.map((fact) => (
                  <li key={fact.id}>
                    <Card className="space-y-1 text-sm">
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{kindLabels[fact.kind]}</p>
                      <p>{fact.text}</p>
                      <p className="text-slate-600">
                        <a href={fact.source.url} target="_blank" rel="noreferrer" className="underline hover:text-slate-900">
                          {fact.source.title}
                        </a>
                        {" "}({fact.source.kind.replace("_", " ")}
                        {fact.source.publishedAt ? `, ${formatDate(fact.source.publishedAt)}` : ""})
                      </p>
                    </Card>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      ) : null}
    </section>
  );
}
