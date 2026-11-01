import { serviceForUser } from "@/server/service";
import { getSession } from "@/server/auth";
import { createAuthenticatedOperationHandler } from "@/server/authenticated-http";

export const runtime = "nodejs";
export const POST = createAuthenticatedOperationHandler({
  configuredOrigin: () => process.env.BETTER_AUTH_URL,
  getSession,
  serviceForUser,
});
