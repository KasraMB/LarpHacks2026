import test from "node:test";
import assert from "node:assert/strict";
import { handleResearchCron } from "../src/server/cron";
import { processNextJob } from "../src/server/queue";
import type { AliasRuntime } from "../src/server/runtime";

test("cron fails closed and never constructs the scheduler before authorization", async () => {
  let invoked = 0;
  const scheduler = () => { invoked++; return { enqueueDaily: async () => ({ runIds: ["run-1"] }) }; };
  const request = (authorization?: string) => new Request("https://example.com/api/cron/research", { method: "POST", headers: authorization ? { authorization } : {} });
  assert.equal((await handleResearchCron(request(), undefined, scheduler)).status, 503);
  assert.equal((await handleResearchCron(request(), "secret", scheduler)).status, 401);
  assert.equal((await handleResearchCron(request("Bearer wrong!"), "secret", scheduler)).status, 401);
  assert.equal(invoked, 0);
  const response = await handleResearchCron(request("Bearer secret"), "secret", scheduler);
  assert.deepEqual(await response.json(), { ok: true, data: { runIds: ["run-1"] } });
  assert.equal(invoked, 1);
});

test("durable processor dispatches all job types, acknowledges only success, and hides provider errors", async () => {
  const events: string[] = [];
  const pending = [ { kind: "research", runId: "run" }, { kind: "deck", deckId: "deck" }, { kind: "claim_check", claimId: "claim" } ];
  const runtime = {
    deps: { repository: { jobs: {
      claim: async () => { const job = pending.shift(); return job ? { id: job.kind, job, attempts: 1 } : null; },
      complete: async (id: string) => { events.push(`complete:${id}`); },
      fail: async (_id: string, _worker: string, error: string) => { assert.ok(!error.includes("secret-provider-body")); events.push("retry"); },
    } } },
    workers: { research: { execute: async (id: string) => { events.push(id); } }, deck: { execute: async () => { throw new Error("secret-provider-body"); } }, claimCheck: { execute: async (id: string) => { events.push(id); } } },
  } as unknown as AliasRuntime;
  for (let i = 0; i < 3; i++) assert.equal(await processNextJob(runtime, "worker"), true);
  assert.equal(await processNextJob(runtime, "worker"), false);
  assert.deepEqual(events, ["run", "complete:research", "retry", "claim", "complete:claim_check"]);
});
