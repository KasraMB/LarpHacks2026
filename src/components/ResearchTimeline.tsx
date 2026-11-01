"use client";

import { useState } from "react";
import type { ApiError, ResearchFact } from "@/contracts";
import { toApiError } from "@/lib/use-resource";
import type { ResearchTimelineProps } from "./contracts";
import {
  Button,
  EmptyState,
  ErrorMessage,
  ExternalLinkIcon,
  formatCoordDate,
  formatDate,
  formatSerial,
  Loading,
  SectionTitle,
  StatusBadge,
} from "./ui";

const kindLabels: Record<ResearchFact["kind"], string> = {
  reported_fact: "Reported fact",
  fan_reaction: "Fan reaction",
  context: "Context",
};

const kindStyles: Record<ResearchFact["kind"], string> = {
  reported_fact: "border border-info-line bg-info-bg text-info-ink",
  fan_reaction: "border border-warn-line bg-warn-bg text-warn-ink",
  context: "border border-line bg-raised text-ink",
};

const runDot = {
  queued: "bg-faint",
  running: "bg-signal pulse-dot",
  completed: "bg-pos-ink",
  failed: "bg-stamp",
};

export function ResearchTimeline({ interestId, state, onRunNow }: ResearchTimelineProps) {
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const runs = state.data ? [...state.data.runs].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : [];
  const facts = state.data ? [...state.data.facts].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : [];
  const active = runs.some((r) => r.status === "queued" || r.status === "running");

  // Assign deterministic serial codes (FCT-01 is oldest, FCT-N is newest).
  const factSerials = new Map<string, string>();
  const chronologicalFacts = [...facts].reverse();
  chronologicalFacts.forEach((f, idx) => factSerials.set(f.id, formatSerial("FCT", idx + 1)));

  const runSerials = new Map<string, string>();
  const chronologicalRuns = [...runs].reverse();
  chronologicalRuns.forEach((r, idx) => runSerials.set(r.id, formatSerial("RUN", idx + 1)));

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
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-line bg-raised/75 px-5 py-3.5">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="research-timeline-title" className="text-base font-bold tracking-[-0.01em] text-ink">
            Research timeline
          </h2>
          {state.data ? (
            <span className="serial-tag">
              {String(facts.length).padStart(2, "0")} FACTS // {String(runs.length).padStart(2, "0")} RUNS
            </span>
          ) : null}
        </div>
        <Button busy={starting} disabled={active} onClick={start}>
          {active ? (
            <>
              <span aria-hidden="true" className="pulse-dot size-1.5 rounded-full bg-current" />
              Research in progress
            </>
          ) : (
            "Run research now"
          )}
        </Button>
      </div>
      <ErrorMessage error={error} />
      {state.loading && !state.data ? <Loading label="Loading research timeline..." /> : null}
      {state.error ? <ErrorMessage error={state.error} /> : null}

      {state.data ? (
        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,8fr)_minmax(0,4fr)] lg:gap-10">
          <div className="space-y-4 lg:order-1">
            <SectionTitle
              as="h3"
              aside={
                <span className="font-mono text-xs text-muted">
                  {String(facts.length).padStart(2, "0")} COLLECTED
                </span>
              }
            >
              Facts
            </SectionTitle>
            {facts.length === 0 ? (
              <EmptyState>No facts collected yet. Run research now to populate the sector ledger.</EmptyState>
            ) : (
              <ul className="divide-y divide-rule overflow-hidden rounded-sm border border-line bg-surface">
                {facts.map((fact) => (
                  <li key={fact.id} className="space-y-2.5 px-5 py-4 transition-colors hover:bg-ground/45 sm:px-6 sm:py-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="serial-tag">{factSerials.get(fact.id) ?? "FCT"}</span>
                        <span
                          className={`inline-flex rounded-sm px-2 py-0.5 font-mono text-[11px] font-semibold ${kindStyles[fact.kind]}`}
                        >
                          {kindLabels[fact.kind]}
                        </span>
                      </div>
                      <span className="tnum font-mono text-xs text-muted">
                        {formatCoordDate(fact.source.publishedAt ?? fact.createdAt)}
                      </span>
                    </div>
                    <p className="max-w-[70ch] text-[15px] leading-relaxed text-ink">{fact.text}</p>
                    <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 pt-0.5 text-[13px] text-muted">
                      <a
                        href={fact.source.url}
                        target="_blank"
                        rel="noreferrer"
                        className="link inline-flex items-center gap-1 font-semibold text-ink hover:text-signal"
                      >
                        <span>{fact.source.title}</span>
                        <ExternalLinkIcon />
                      </a>
                      <span className="font-mono text-xs text-muted">
                        [{fact.source.kind.replace("_", " ").toUpperCase()}
                        {fact.source.publishedAt ? ` // ${formatDate(fact.source.publishedAt)}` : ""}]
                      </span>
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-4 lg:order-2">
            <SectionTitle as="h3" aside={<span className="font-mono text-xs text-muted">COLLECTION LOG</span>}>
              Runs
            </SectionTitle>
            {runs.length === 0 ? (
              <EmptyState>No research runs yet.</EmptyState>
            ) : (
              <ol className="relative space-y-4 before:absolute before:bottom-3 before:left-[5px] before:top-3 before:w-px before:bg-line">
                {runs.map((run) => (
                  <li key={run.id} className="relative pl-6 text-sm">
                    <span
                      aria-hidden="true"
                      className={`absolute left-0 top-2.5 size-[11px] rounded-full border-2 border-ground ${runDot[run.status]}`}
                    />
                    <div className="space-y-2 rounded-sm border border-line bg-surface p-3.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="serial-tag">{runSerials.get(run.id) ?? "RUN"}</span>
                          <StatusBadge status={run.status} />
                        </div>
                        <span className="tnum font-mono text-xs font-semibold text-ink">
                          {run.factCount} {run.factCount === 1 ? "fact" : "facts"}
                        </span>
                      </div>
                      <p className="font-semibold text-ink">
                        {run.trigger === "manual" ? "Manual run" : "Scheduled run"}
                      </p>
                      <p className="tnum font-mono text-[11px] leading-relaxed text-muted">
                        CREATED: {formatCoordDate(run.createdAt)}
                        {run.finishedAt ? ` // DONE: ${formatCoordDate(run.finishedAt)}` : ""}
                      </p>
                      {run.failure ? (
                        <p
                          role="alert"
                          className="rounded-sm border border-neg-line bg-neg-bg px-3 py-2 text-[13px] text-neg-ink"
                        >
                          Run failed: {run.failure.message}
                        </p>
                      ) : null}
                      {run.sourceErrors.length > 0 ? (
                        <div className="rounded-sm border border-warn-line bg-warn-bg px-3 py-2 text-[13px] text-warn-ink">
                          <p className="font-semibold">
                            {run.sourceErrors.length} source {run.sourceErrors.length === 1 ? "error" : "errors"}
                          </p>
                          <ul className="mt-1 list-disc space-y-0.5 pl-4 break-words text-xs">
                            {run.sourceErrors.map((se, i) => (
                              <li key={i}>
                                {se.url ? `${se.url}: ` : ""}
                                {se.message}
                              </li>
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
