import { apiFailure } from "@/server/http";

export const runtime = "nodejs";
// Deliberately unavailable until authorization AND scheduling are implemented together.
// Future request: POST with Authorization: Bearer <CRON_SECRET>; no body.
export async function POST() {
  return apiFailure("NOT_IMPLEMENTED", "Cron authorization and research scheduling are not implemented.", 501);
}
