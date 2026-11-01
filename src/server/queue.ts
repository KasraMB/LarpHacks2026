import type { AliasRuntime } from "./runtime";

/** A single job at a time bounds AI concurrency and cost. */
export async function processNextJob(runtime: AliasRuntime, workerId: string): Promise<boolean> {
  const jobs = runtime.deps.repository.jobs;
  const item = await jobs.claim(workerId, 300);
  if (!item) return false;
  try {
    const job = item.job;
    const attempt = { willRetry: item.attempts < 3 };
    if (job.kind === "research") await runtime.workers.research.execute(job.runId, attempt);
    else if (job.kind === "deck") await runtime.workers.deck.execute(job.deckId, attempt);
    else await runtime.workers.claimCheck.execute(job.claimId, attempt);
    await jobs.complete(item.id, workerId);
  } catch {
    // Provider exceptions can contain request bodies or credentials; persist a safe message.
    await jobs.fail(item.id, workerId, "Job execution failed; see entity status for details.");
    console.error(JSON.stringify({ event: "job_failed", id: item.id, kind: item.job.kind, attempt: item.attempts }));
  }
  return true;
}
