"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { authClient } from "@/lib/auth-client";
import { apiMode } from "@/lib/api";
import { Button, Loading } from "./ui";

export function AccountControls() {
  return apiMode !== "real" ? <span className="text-sm">Local demo</span> : <SessionControls />;
}

function SessionControls() {
  const { data, isPending } = authClient.useSession();
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  if (isPending) return null;
  if (!data) return <Link href="/sign-in" className="underline">Sign in</Link>;
  return <div className="flex flex-wrap items-center gap-3 text-sm">
    <span className="max-w-48 truncate" title={data.user.email}>{data.user.email}</span>
    <Button variant="secondary" busy={busy} onClick={async () => {
      setBusy(true); setError(false);
      try {
        const result = await authClient.signOut();
        if (result.error) throw new Error("Sign out failed");
        window.location.assign("/sign-in");
      } catch { setError(true); setBusy(false); }
    }}>Sign out</Button>
    {error ? <span role="alert">Could not sign out. Try again.</span> : null}
  </div>;
}

export function AccountAccess({ children }: { children: ReactNode }) {
  return apiMode !== "real" ? children : <SessionAccess>{children}</SessionAccess>;
}

function SessionAccess({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { data, error, isPending, refetch } = authClient.useSession();
  if (pathname === "/sign-in" || pathname === "/reset-password") return children;
  if (isPending) return <Loading label="Checking your account..." />;
  if (error) return <div role="alert" className="space-y-3">
    <h1 className="text-xl font-semibold">Cannot reach account services</h1>
    <p>Your session could not be checked. Try again in a moment.</p>
    <Button onClick={() => void refetch()}>Try again</Button>
  </div>;
  if (!data) return <section className="max-w-prose space-y-4">
    <h1 className="text-2xl font-semibold">Your persona, your conversations</h1>
    <p>Sign in to keep a private persona and conversation history. Browse shared skills, or create skills just for yourself.</p>
    <Link className="inline-flex min-h-11 items-center rounded-md bg-slate-900 px-4 text-white" href="/sign-in">Sign in or create an account</Link>
  </section>;
  return children;
}
