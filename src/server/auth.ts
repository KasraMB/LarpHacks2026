import { betterAuth, type BetterAuthOptions } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/postgres-js";
import { after } from "next/server";
import postgres from "postgres";
import { authAccount, authRateLimit, authSession, authUser, authVerification } from "./db/schema";

export type AuthConfig = ReturnType<typeof readAuthConfig>;

/** Called at request time: importing routes during a build needs no credentials. */
export function readAuthConfig(env: Readonly<Record<string, string | undefined>> = process.env) {
  const secret = env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("BETTER_AUTH_SECRET must contain at least 32 characters.");
  if (!env.BETTER_AUTH_URL) throw new Error("BETTER_AUTH_URL is required.");
  let url: URL;
  try { url = new URL(env.BETTER_AUTH_URL); }
  catch { throw new Error("BETTER_AUTH_URL must be an HTTP(S) origin."); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("BETTER_AUTH_URL must be an HTTP(S) origin without credentials, a path, query, or fragment.");
  }
  if (env.NODE_ENV === "production" && url.protocol !== "https:") throw new Error("BETTER_AUTH_URL must use HTTPS in production.");
  if (!env.DATABASE_URL) throw new Error("DATABASE_URL is required for authentication.");
  if (Boolean(env.RESEND_API_KEY) !== Boolean(env.AUTH_EMAIL_FROM)) throw new Error("RESEND_API_KEY and AUTH_EMAIL_FROM must be configured together.");
  const email = env.RESEND_API_KEY && env.AUTH_EMAIL_FROM ? { apiKey: env.RESEND_API_KEY, from: env.AUTH_EMAIL_FROM } : undefined;
  return { secret, baseURL: url.origin, databaseURL: env.DATABASE_URL, email };
}

type ScheduleEmail = (send: () => Promise<void>) => void;

/** Accepting an adapter keeps the same security policy usable with isolated test stores. */
export function createAuth(config: AuthConfig, database: BetterAuthOptions["database"], scheduleEmail: ScheduleEmail = after) {
  const sendEmail = (to: string, subject: string, text: string) => {
    const email = config.email;
    if (!email) return;
    // Keep provider latency out of reset responses and keep the task alive in Next.
    scheduleEmail(async () => {
      try {
        const result = await fetch("https://api.resend.com/emails", {
          method: "POST", headers: { Authorization: `Bearer ${email.apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from: email.from, to: [to], subject, text }), signal: AbortSignal.timeout(15_000),
        });
        if (!result.ok) console.error("Authentication email delivery failed.");
      } catch { console.error("Authentication email delivery failed."); }
    });
  };
  return betterAuth({
    appName: "Alias",
    baseURL: config.baseURL,
    secret: config.secret,
    trustedOrigins: [config.baseURL],
    database,
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
      maxPasswordLength: 128,
      requireEmailVerification: Boolean(config.email),
      revokeSessionsOnPasswordReset: true,
      ...(config.email ? { sendResetPassword: async ({ user, url }) => { sendEmail(user.email, "Reset your Alias password", `Reset your password: ${url}\n\nIf you did not request this, ignore this email.`); } } : {}),
    },
    ...(config.email ? { emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => { sendEmail(user.email, "Verify your Alias email", `Verify your email address: ${url}`); },
    } } : {}),
    session: { cookieCache: { enabled: false } },
    rateLimit: {
      enabled: true, storage: "database", window: 60, max: 100,
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/sign-up/email": { window: 60, max: 5 },
        "/request-password-reset": { window: 60, max: 3 },
        "/send-verification-email": { window: 60, max: 3 },
      },
    },
  });
}

let auth: ReturnType<typeof createAuth> | undefined;
export function getAuth() {
  if (!auth) {
    const config = readAuthConfig();
    const client = postgres(config.databaseURL, { max: 5, idle_timeout: 20, connect_timeout: 10 });
    const schema = { user: authUser, session: authSession, account: authAccount, verification: authVerification, rateLimit: authRateLimit };
    const db = drizzle(client, { schema });
    auth = createAuth(config, drizzleAdapter(db, { provider: "pg", schema, transaction: true }));
  }
  return auth;
}

export function getSession(headers: Headers) {
  return getAuth().api.getSession({ headers });
}
