import "./env";
async function main() {
  const url = process.env.APP_URL;
  const secret = process.env.CRON_SECRET;
  if (!url || !secret) throw new Error("APP_URL and CRON_SECRET are required.");
  const response = await fetch(new URL("/api/cron/research", url), { method: "POST", headers: { Authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`Cron request returned ${response.status}.`);
  console.log("Daily research queued.");
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
