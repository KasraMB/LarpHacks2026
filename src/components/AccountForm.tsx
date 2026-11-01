"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth-client";
import { Button, TextField } from "./ui";

export function AccountForm({ emailDelivery }: { emailDelivery: boolean }) {
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(null); setMessage(null);
    try {
      const result = mode === "signup"
        ? await authClient.signUp.email({ name: name.trim(), email: email.trim(), password })
        : mode === "forgot"
          ? await authClient.requestPasswordReset({ email: email.trim(), redirectTo: "/reset-password" })
          : await authClient.signIn.email({ email: email.trim(), password });
      if (result.error) { setError(result.error.message ?? "Could not complete this request. Try again."); return; }
      if (mode === "forgot") setMessage("If an account exists for that email, a reset link is on its way.");
      else if (mode === "signup" && emailDelivery) setMessage("Check your email to verify your account, then sign in.");
      else window.location.assign("/");
    } catch { setError("Account services are unavailable. Try again shortly."); }
    finally { setBusy(false); }
  }
  function change(next: typeof mode) { setMode(next); setError(null); setMessage(null); setPassword(""); }
  return <section className="mx-auto max-w-md space-y-6">
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold">{mode === "signup" ? "Create your account" : mode === "forgot" ? "Reset your password" : "Sign in to Alias"}</h1>
      <p className="text-sm text-slate-600">One private persona per account. Your people, claims and decks stay private; sharing a skill is your choice.</p>
    </div>
    <form className="space-y-4" onSubmit={submit}>
      {mode === "signup" ? <TextField label="Your name" value={name} onChange={e => setName(e.target.value)} required autoComplete="name" maxLength={100} /> : null}
      <TextField label="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" />
      {mode !== "forgot" ? <TextField label="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={mode === "signup" ? 10 : undefined} maxLength={128} autoComplete={mode === "signup" ? "new-password" : "current-password"} hint={mode === "signup" ? "Use at least 10 characters." : undefined} /> : null}
      {error ? <p role="alert" className="text-sm text-red-800">{error}</p> : null}
      {message ? <p role="status" className="text-sm text-slate-700">{message}</p> : null}
      <Button className="min-h-11" type="submit" busy={busy}>{mode === "signup" ? "Create account" : mode === "forgot" ? "Send reset link" : "Sign in"}</Button>
    </form>
    <div className="flex flex-wrap gap-3 text-sm">
      <Button variant="secondary" disabled={busy} onClick={() => change(mode === "signin" ? "signup" : "signin")}>{mode === "signin" ? "Create an account" : "Back to sign in"}</Button>
      {mode === "signin" && emailDelivery ? <Button variant="secondary" disabled={busy} onClick={() => change("forgot")}>Forgot password?</Button> : null}
    </div>
    {!emailDelivery ? <p className="text-xs text-slate-600">Email verification and password recovery are not enabled on this deployment yet.</p> : null}
  </section>;
}

export function ResetPasswordForm({ token }: { token: string | null }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  return <section className="mx-auto max-w-md space-y-4">
    <h1 className="text-2xl font-semibold">Choose a new password</h1>
    {!token ? <p role="alert">This reset link is missing or expired. Request another from sign in.</p> : <form className="space-y-4" onSubmit={async event => {
      event.preventDefault(); setBusy(true); setMessage(null);
      try {
        const result = await authClient.resetPassword({ newPassword: password, token });
        if (result.error) setMessage(result.error.message ?? "This link could not be used. Request a new one.");
        else { setDone(true); setMessage("Password updated. Sign in with your new password."); }
      } catch { setMessage("Could not reset your password. Try again shortly."); }
      finally { setBusy(false); }
    }}>
      {!done ? <><TextField label="New password" type="password" autoComplete="new-password" required minLength={10} maxLength={128} value={password} onChange={e => setPassword(e.target.value)} hint="Use at least 10 characters." /><Button type="submit" busy={busy}>Save password</Button></> : null}
    </form>}
    {message ? <p role="status">{message}</p> : null}
    <Link href="/sign-in" className="inline-flex min-h-11 items-center underline">Back to sign in</Link>
  </section>;
}
