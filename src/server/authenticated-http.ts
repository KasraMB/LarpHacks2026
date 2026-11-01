import type { AliasService } from "@/contracts";
import { apiFailure, dispatchOperation } from "./http";

type Session = { user: { id: string } } | null;
type AuthenticatedDependencies = {
  configuredOrigin(): string | undefined;
  getSession(headers: Headers): Promise<Session>;
  serviceForUser(userId: string): AliasService;
};
type OperationContext = { params: Promise<{ operation: string }> };

/** Dependencies stay lazy; no account service is constructed before authentication. */
export function createAuthenticatedOperationHandler(deps: AuthenticatedDependencies) {
  return async function POST(request: Request, context: OperationContext): Promise<Response> {
    let response: Response;
    try {
      const configured = deps.configuredOrigin();
      if (!configured) throw new Error("Authentication origin is not configured.");
      const expected = new URL(configured);
      if (!["https:", "http:"].includes(expected.protocol) || expected.username || expected.password || expected.pathname !== "/" || expected.search || expected.hash) {
        throw new Error("Authentication origin is invalid.");
      }
      const origin = request.headers.get("origin");
      if (origin && origin !== expected.origin) {
        response = apiFailure("UNAUTHORIZED", "This request origin is not allowed.", 403);
      } else {
        const session = await deps.getSession(request.headers);
        if (!session) response = apiFailure("UNAUTHORIZED", "Sign in to access your persona.", 401);
        else {
          const { operation } = await context.params;
          // Keep the owner in this request's closure; never mutate a shared service.
          const service = deps.serviceForUser(session.user.id);
          response = await dispatchOperation(service, operation, request);
        }
      }
    } catch {
      response = apiFailure("INTERNAL_ERROR", "Account services are unavailable. Try again shortly.", 503, true);
    }
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  };
}
