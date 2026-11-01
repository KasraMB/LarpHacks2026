import assert from "node:assert/strict";
import test from "node:test";
import { memoryAdapter, type MemoryDB } from "better-auth/adapters/memory";
import { createAuth, readAuthConfig } from "../src/server/auth";

const baseURL = "https://alias.example";
const env = { BETTER_AUTH_SECRET: "test-only-secret-with-more-than-32-characters", BETTER_AUTH_URL: baseURL, DATABASE_URL: "postgres://unused-in-memory-test" };
const credentials = { name: "Test User", email: "user@example.com", password: "a-long-test-password" };
function store(): MemoryDB { return { user: [], session: [], account: [], verification: [], rateLimit: [] }; }
function request(path: string, body?: unknown, extraHeaders?: HeadersInit) {
  const headers = new Headers({ origin: baseURL, "x-forwarded-for": "192.0.2.1", ...extraHeaders });
  if (body) headers.set("content-type", "application/json");
  return new Request(new URL(`/api/auth${path}`, baseURL), { method: body ? "POST" : "GET", headers, ...(body ? { body: JSON.stringify(body) } : {}) });
}
function cookies(response: Response) { return response.headers.getSetCookie().map(cookie => cookie.split(";")[0]).join("; "); }

test("auth configuration fails closed and accepts only an explicitly configured origin", () => {
  assert.throws(() => readAuthConfig({}), /BETTER_AUTH_SECRET/);
  assert.throws(() => readAuthConfig({ ...env, BETTER_AUTH_SECRET: "short" }), /32/);
  assert.throws(() => readAuthConfig({ ...env, BETTER_AUTH_URL: undefined }), /BETTER_AUTH_URL/);
  for (const value of ["not-a-url", "javascript:alert(1)", "https://user:pass@example.com", "https://example.com/path", "https://example.com?query=1", "https://example.com#hash"]) {
    assert.throws(() => readAuthConfig({ ...env, BETTER_AUTH_URL: value }), /BETTER_AUTH_URL/);
  }
  assert.throws(() => readAuthConfig({ ...env, BETTER_AUTH_URL: "http://alias.example", NODE_ENV: "production" }), /HTTPS/);
  assert.throws(() => readAuthConfig({ ...env, DATABASE_URL: undefined }), /DATABASE_URL/);
  assert.throws(() => readAuthConfig({ ...env, RESEND_API_KEY: "test" }), /configured together/);
  assert.equal(readAuthConfig({ ...env, BETTER_AUTH_URL: `${baseURL}/` }).baseURL, baseURL);
  assert.equal(readAuthConfig(env).email, undefined);
});

test("email/password uses opaque HttpOnly sessions and sign-out revokes the stored session", async () => {
  const db = store();
  const auth = createAuth(readAuthConfig(env), memoryAdapter(db));
  const short = await auth.handler(request("/sign-up/email", { ...credentials, password: "short" }));
  assert.equal(short.status, 400);
  const signup = await auth.handler(request("/sign-up/email", credentials));
  assert.equal(signup.status, 200);
  assert.match(signup.headers.get("set-cookie")!, /HttpOnly/i);
  assert.match(signup.headers.get("set-cookie")!, /Secure/i);
  assert.match(signup.headers.get("set-cookie")!, /SameSite=Lax/i);
  assert.notEqual(db.account[0].password, credentials.password);
  const cookie = cookies(signup);
  const session = await auth.api.getSession({ headers: new Headers({ cookie }) });
  assert.equal(session?.user.email, credentials.email);
  assert.equal("password" in session!.user, false);
  assert.equal((await auth.handler(request("/sign-out", {}, { cookie }))).status, 200);
  assert.equal(await auth.api.getSession({ headers: new Headers({ cookie }) }), null);
  assert.equal((await auth.handler(request("/sign-in/email", { email: credentials.email, password: "wrong-password" }))).status, 401);
  assert.equal((await auth.handler(request("/sign-in/email", credentials))).status, 200);
});

test("cross-origin requests and external callback URLs are rejected before creating an account", async () => {
  const db = store();
  const auth = createAuth(readAuthConfig(env), memoryAdapter(db));
  assert.equal((await auth.handler(request("/sign-up/email", credentials, { origin: "https://attacker.example" }))).status, 403);
  assert.equal((await auth.handler(request("/sign-up/email", { ...credentials, callbackURL: "https://attacker.example" }))).status, 403);
  assert.equal(db.user.length, 0);
});

test("sign-in rate limits are persisted through the configured database adapter", async () => {
  const db = store();
  const config = readAuthConfig(env);
  for (let attempt = 0; attempt < 5; attempt++) {
    const auth = createAuth(config, memoryAdapter(db));
    assert.equal((await auth.handler(request("/sign-in/email", credentials))).status, 401);
  }
  const response = await createAuth(config, memoryAdapter(db)).handler(request("/sign-in/email", credentials));
  assert.equal(response.status, 429);
  assert.ok(db.rateLimit.length > 0);
});

test("configured email verification gates access and password recovery revokes existing sessions", async () => {
  const jobs: Array<() => Promise<void>> = [];
  const sent: Array<{ text: string }> = [];
  const fetchMock = test.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    sent.push(JSON.parse(String(init.body)) as { text: string });
    return Response.json({ id: "mock-mail" });
  });
  try {
    const config = readAuthConfig({ ...env, RESEND_API_KEY: "test-key", AUTH_EMAIL_FROM: "Alias <auth@example.com>" });
    const auth = createAuth(config, memoryAdapter(store()), job => { jobs.push(job); });
    const signup = await auth.handler(request("/sign-up/email", { ...credentials, callbackURL: "/" }));
    assert.equal(signup.status, 200);
    assert.equal((await signup.json()).token, null);
    assert.equal(sent.length, 0);
    await jobs.shift()!();
    const verifyURL = sent[0].text.match(/https:\/\/\S+/)![0];
    const verification = await auth.handler(new Request(verifyURL));
    assert.equal(verification.status, 302);
    const cookie = cookies(verification);
    assert.ok(await auth.api.getSession({ headers: new Headers({ cookie }) }));
    const unknown = await auth.handler(request("/request-password-reset", { email: "missing@example.com", redirectTo: "/reset-password" }));
    const reset = await auth.handler(request("/request-password-reset", { email: credentials.email, redirectTo: "/reset-password" }));
    assert.deepEqual(await unknown.json(), await reset.json());
    await jobs.shift()!();
    const resetURL = sent[1].text.match(/https:\/\/\S+/)![0];
    const redirect = await auth.handler(new Request(resetURL));
    const token = new URL(redirect.headers.get("location")!).searchParams.get("token");
    assert.ok(token);
    assert.equal((await auth.handler(request("/reset-password", { token, newPassword: "a-different-long-password" }))).status, 200);
    assert.equal(await auth.api.getSession({ headers: new Headers({ cookie }) }), null);
    assert.equal((await auth.handler(request("/sign-in/email", { email: credentials.email, password: "a-different-long-password" }))).status, 200);
  } finally { fetchMock.mock.restore(); }
});
