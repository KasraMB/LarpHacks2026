"use client";

import { useState } from "react";
import type { ApiError, ResearchFact } from "@/contracts";
import { toApiError } from "@/lib/use-resource";
import type { ResearchTimelineProps } from "./contracts";
import { Button, EmptyState, ErrorMessage, formatDate, Loading, SectionTitle, StatusBadge } from "./ui";

const kindLabels: Record<ResearchFact["kind"], string> = {
  reported_fact: "Reported fact",
  fan_reaction: "Fan reaction",
  context: "Context",
};

const kindStyles: Record<ResearchFact["kind"], string> = {
  reported_fact: "bg-info-bg text-info-ink",
  fan_reaction: "bg-warn-bg text-warn-ink",
  context: "bg-raised text-[#3d3d3a]",
};

const runDot = {
  queued: "bg-faint",
  running: "bg-signal pulse-dot",
  completed: "bg-ink",
  failed: "bg-stamp",
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
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-5">
        <h2 id="research-timeline-title" className="text-base font-semibold tracking-[-0.01em]">Research timeline</h2>
        <Button busy={starting} disabled={active} onClick={start}>
          {active ? (
            <>
              <span aria-hidden="true" className="pulse-dot size-1.5 rounded-full bg-current" />
              Research in progress
            </>
          ) : "Run research now"}
        </Button>
      </div>
      <ErrorMessage error={error} />
      {state.loading && !state.data ? <Loading /> : null}
      {state.error ? <ErrorMessage error={state.error} /> : null}

      {state.data ? (
        <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,8fr)_minmax(0,4fr)]">
          <div className="space-y-4 lg:order-1">
            <SectionTitle as="h3" aside={<span className="tnum text-sm text-muted">{facts.length} collected</span>}>Facts</SectionTitle>
            {facts.length === 0 ? <EmptyState>No facts collected yet.</EmptyState> : (
              <ul className="divide-y divide-rule overflow-hidden rounded-lg border border-line bg-surface">
                {facts.map((fact) => (
                  <li key={fact.id} className="space-y-2.5 px-5 py-4 sm:px-6 sm:py-5">
                    <p className={`inline-flex rounded px-1.5 py-0.5 text-xs font-medium ${kindStyles[fact.kind]}`}>{kindLabels[fact.kind]}</p>
                    <p className="text-[15px] leading-relaxed text-ink">{fact.text}</p>
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted">
                      <a href={fact.source.url} target="_blank" rel="noreferrer" className="link font-medium text-ink">
                        {fact.source.title}
                      </a>
                      <span>
                        ({fact.source.kind.replace("_", " ")}
                        {fact.source.publishedAt ? `, ${formatDate(fact.source.publishedAt)}` : ""})
                      </span>
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-4 lg:order-2">
            <SectionTitle as="h3">Runs</SectionTitle>
            {runs.length === 0 ? <EmptyState>No research runs yet.</EmptyState> : (
              <ol className="relative space-y-5 before:absolute before:bottom-2 before:left-[5px] before:top-2 before:w-px before:bg-line">
                {runs.map((run) => (
                  <li key={run.id} className="relative pl-6 text-sm">
                    <span aria-hidden="true" className={`absolute left-0 top-1.5 size-[11px] rounded-full border-2 border-ground ${runDot[run.status]}`} />
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={run.status} />
                        <span className="font-medium">{run.trigger === "manual" ? "Manual run" : "Scheduled run"}</span>
                        <span className="tnum text-muted">{run.factCount} {run.factCount === 1 ? "fact" : "facts"}</span>
                      </div>
                      <p className="text-[13px] leading-relaxed text-muted">
                        Created {formatDate(run.createdAt)}
                        {run.startedAt ? `, started ${formatDate(run.startedAt)}` : ""}
                        {run.finishedAt ? `, finished ${formatDate(run.finishedAt)}` : ""}
                      </p>
                      {run.failure ? (
                        <p role="alert" className="rounded-md bg-neg-bg px-3 py-2 text-[13px] text-neg-ink">Run failed: {run.failure.message}</p>
                      ) : null}
                      {run.sourceErrors.length > 0 ? (
                        <div className="rounded-md border border-warn-line bg-warn-bg px-3 py-2 text-[13px] text-warn-ink">
                          <p className="font-medium">
                            {run.sourceErrors.length} source {run.sourceErrors.length === 1 ? "error" : "errors"}
                          </p>
                          <ul className="mt-1 list-disc space-y-0.5 pl-4 break-words">
                            {run.sourceErrors.map((se, i) => (
                              <li key={i}>{se.url ? `${se.url}: ` : ""}{se.message}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
