import assert from "node:assert/strict";
import test from "node:test";
import { operations, type AliasService, type Identity } from "../src/contracts";
import { createAuthenticatedOperationHandler } from "../src/server/authenticated-http";
import { ServiceError } from "../src/server/http";

const origin = "https://alias.example";
const context = (operation = "getIdentity") => ({ params: Promise.resolve({ operation }) });
function request(body = "{}", userId?: string, requestOrigin?: string) {
  const headers = new Headers({ "content-type": "application/json" });
  if (userId) headers.set("cookie", `user=${userId}`);
  if (requestOrigin !== undefined) headers.set("origin", requestOrigin);
  return new Request(`${origin}/api/v1/getIdentity`, { method: "POST", headers, body });
}
function service(getIdentity: AliasService["getIdentity"]): AliasService {
  return { ...Object.fromEntries(Object.keys(operations).map(key => [key, async () => { throw new Error("Unexpected operation"); }])), getIdentity } as AliasService;
}
const sessionFromCookie = async (headers: Headers) => {
  const id = headers.get("cookie")?.replace("user=", "");
  return id ? { user: { id } } : null;
};
function privateResponse(response: Response, status: number) {
  assert.equal(response.status, status);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
}

test("anonymous requests fail before constructing runtime services", async () => {
  let sessionCalls = 0;
  const post = createAuthenticatedOperationHandler({
    configuredOrigin: () => origin,
    getSession: async () => { sessionCalls++; return null; },
    serviceForUser: () => { assert.fail("Anonymous requests must not construct a service or runtime"); },
  });
  const response = await post(request(), context());
  privateResponse(response, 401);
  assert.equal((await response.json()).error.code, "UNAUTHORIZED");
  assert.equal(sessionCalls, 1);
});

test("foreign origins fail before session work and malformed configuration returns a private 503", async () => {
  for (const [configuredOrigin, requestOrigin, status] of [[origin, "https://attacker.example", 403], ["invalid", origin, 503], [undefined, undefined, 503], ["https://alias.example/path", origin, 503]] as const) {
    const post = createAuthenticatedOperationHandler({
      configuredOrigin: () => configuredOrigin,
      getSession: async () => { assert.fail("Invalid origins must not access auth"); },
      serviceForUser: () => { assert.fail("Invalid origins must not construct services"); },
    });
    privateResponse(await post(request("{}", "a", requestOrigin), context()), status);
  }
});

test("concurrent accounts keep separate immutable service scopes selected only from their session", async () => {
  let releaseA!: () => void;
  const waitForB = new Promise<void>(resolve => { releaseA = resolve; });
  const selected: string[] = [];
  const post = createAuthenticatedOperationHandler({
    configuredOrigin: () => origin,
    getSession: sessionFromCookie,
    serviceForUser: userId => {
      selected.push(userId);
      return service(async () => {
        if (userId === "a") await waitForB;
        else releaseA();
        const identity: Identity = { id: `identity-${userId}`, name: userId, background: "", createdAt: "2026-11-01T12:00:00Z", updatedAt: "2026-11-01T12:00:00Z" };
        return identity;
      });
    },
  });
  const responses = await Promise.all([post(request('{"userId":"b"}', "a", origin), context()), post(request('{"userId":"a"}', "b", origin), context())]);
  assert.deepEqual(selected, ["a", "b"]);
  for (const [index, response] of responses.entries()) {
    privateResponse(response, 200);
    assert.equal((await response.json()).data.id, index === 0 ? "identity-a" : "identity-b");
  }
});

test("authenticated dispatch retains registry validation and service error semantics", async () => {
  const post = createAuthenticatedOperationHandler({
    configuredOrigin: () => origin,
    getSession: sessionFromCookie,
    serviceForUser: () => service(async () => { throw new ServiceError({ code: "CONFLICT", message: "Conflict", retryable: false }, 409); }),
  });
  privateResponse(await post(request("{}", "a"), context("unknownOperation")), 404);
  privateResponse(await post(request("not-json", "a"), context()), 400);
  privateResponse(await post(request("{}", "a"), context("getPerson")), 400);
  privateResponse(await post(request("{}", "a"), context()), 409);
  const unavailable = createAuthenticatedOperationHandler({ configuredOrigin: () => origin, getSession: async () => { throw new Error("secret database error"); }, serviceForUser: () => service(async () => null) });
  const response = await unavailable(request("{}", "a"), context());
  privateResponse(response, 503);
  assert.equal((await response.json()).error.message, "Account services are unavailable. Try again shortly.");
});
