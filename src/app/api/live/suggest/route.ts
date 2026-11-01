import { getSession } from "@/server/auth";
import { getRuntime } from "@/server/service";
import { createLiveOperationHandler } from "@/server/live-http";
import { createLiveSuggestionProvider } from "@/server/ai/live";

export const runtime = "nodejs";
export const POST = createLiveOperationHandler({
  configuredOrigin: () => process.env.BETTER_AUTH_URL,
  getSession,
  repositoryForUser: userId => getRuntime().repository.forUser(userId),
  provider: createLiveSuggestionProvider(),
});
