import { timingSafeEqual } from "node:crypto";
import { apiFailure } from "./http";
import type { ResearchScheduler } from "./ports";

export async function handleResearchCron(request: Request, secret: string | undefined, getScheduler: () => ResearchScheduler): Promise<Response> {
  if (!secret) return apiFailure("INTERNAL_ERROR", "Cron is not configured.", 503);
  const provided = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return apiFailure("UNAUTHORIZED", "Invalid cron credentials.", 401);
  try { return Response.json({ ok: true, data: await getScheduler().enqueueDaily() }); }
  catch { return apiFailure("INTERNAL_ERROR", "Research scheduling failed.", 500, true); }
}
