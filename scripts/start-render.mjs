import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

// One Render web instance owns both HTTP and the durable queue consumer.
const children = new Set();
let stopping = false;
let killTimer;
function stop(code) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) child.kill("SIGTERM");
  killTimer = setTimeout(() => {
    for (const child of children) child.kill("SIGKILL");
  }, 25000);
  killTimer.unref();
}
function launch(args) {
  const child = spawn(process.execPath, args, { stdio: "inherit", env: process.env });
  children.add(child);
  child.once("error", () => {
    console.error("Could not start a deployment process.");
    stop(1);
  });
  child.once("exit", () => {
    children.delete(child);
    if (children.size === 0 && killTimer) clearTimeout(killTimer);
  });
  return child;
}
process.on("SIGTERM", () => stop(0));
process.on("SIGINT", () => stop(0));

const migration = launch(["--import", "tsx", "scripts/migrate.ts"]);
migration.once("exit", (code) => {
  if (stopping) return;
  if (code !== 0) { stop(1); return; }
  const web = launch([fileURLToPath(import.meta.resolve("next/dist/bin/next")), "start", "--hostname", "0.0.0.0"]);
  const worker = launch(["--import", "tsx", "scripts/worker.ts"]);
  // Restart the service if either half dies, rather than silently losing jobs.
  for (const child of [web, worker]) child.once("exit", () => stop(1));
});
