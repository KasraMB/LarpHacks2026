import { handleResearchCron } from "@/server/cron";
import { getRuntime } from "@/server/service";

export const runtime = "nodejs";
export async function POST(request: Request) {
  return handleResearchCron(request, process.env.CRON_SECRET, () => getRuntime().deps.scheduler);
}
