import "./env";
import { randomUUID } from "node:crypto";
import { setTimeout } from "node:timers/promises";
import { createRuntime } from "../src/server/runtime";
import { processNextJob } from "../src/server/queue";

async function main() {
  const runtime = createRuntime();
  const workerId = randomUUID();
  let stopping = false;
  process.on("SIGTERM", () => { stopping = true; });
  process.on("SIGINT", () => { stopping = true; });
  try {
    do {
      const processed = await processNextJob(runtime, workerId);
      if (process.argv.includes("--once")) break;
      if (!processed) await setTimeout(1500);
    } while (!stopping);
  } finally { await runtime.close(); }
}
main().catch(() => { console.error("Worker stopped. Verify database and provider configuration."); process.exitCode = 1; });
