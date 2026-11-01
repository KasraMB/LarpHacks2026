"use client";

import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";
import Link from "next/link";
import type { ApiError } from "@/contracts";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger"; busy?: boolean };

const variants = {
  primary: "bg-ink text-white hover:bg-[#2a2a27] active:bg-black",
  secondary: "bg-raised text-ink hover:bg-[#dedcd6] active:bg-[#d4d2cb]",
  danger: "bg-neg-bg text-neg-ink hover:bg-[#ffdcd6] active:bg-[#ffcdc5]",
};

export function Button({ variant = "primary", busy = false, disabled, className = "", children, type = "button", ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={`inline-flex min-h-11 items-center sm:min-h-9 justify-center gap-2 rounded-md px-3.5 py-1.5 text-sm font-medium transition-[background-color,transform] duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 disabled:active:scale-100 ${variants[variant]} ${className}`}
      {...rest}
    >
      {busy ? (
        <>
          <span aria-hidden="true" className="pulse-dot size-1.5 rounded-full bg-current" />
          Working...
        </>
      ) : (
        children
      )}
    </button>
  );
}

const fieldClass =
  "w-full rounded-md border border-control bg-surface px-3 py-2 text-[15px] text-ink placeholder:text-placeholder transition-colors hover:border-[#b5b3ab] focus:border-ink focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-signal";

export function TextField({ label, hint, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-sm font-medium text-ink">{label}</span>
      <input className={`${fieldClass} h-11 sm:h-10`} {...rest} />
      {hint ? <span className="block text-[13px] text-muted">{hint}</span> : null}
    </label>
  );
}

export function TextArea({ label, hint, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; hint?: string }) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-sm font-medium text-ink">{label}</span>
      <textarea className={`${fieldClass} min-h-24 leading-relaxed`} {...rest} />
      {hint ? <span className="block text-[13px] text-muted">{hint}</span> : null}
    </label>
  );
}

export function ErrorMessage({ error, onRetry }: { error: ApiError | null; onRetry?: () => void }) {
  if (!error) return null;
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-neg-bg px-4 py-3 text-sm text-neg-ink">
      <span className="flex items-start gap-2.5">
        <AlertIcon className="mt-0.5 shrink-0" />
        <span>{error.message}</span>
      </span>
      {error.retryable && onRetry ? (
        <Button variant="secondary" onClick={onRetry} className="bg-white! hover:bg-white/70!">
          Retry
        </Button>
      ) : null}
    </div>
  );
}

export function Loading({ label = "Loading..." }: { label?: string }) {
  return (
    <div role="status" className="space-y-3" aria-live="polite">
      <span className="sr-only">{label}</span>
      <span aria-hidden="true" className="flex items-center gap-2 text-sm text-muted">
        <span className="pulse-dot size-1.5 rounded-full bg-muted" />
        {label}
      </span>
      <span aria-hidden="true" className="block space-y-2">
        <span className="skeleton h-4 w-2/3" />
        <span className="skeleton h-4 w-1/2" />
        <span className="skeleton h-4 w-3/5" />
      </span>
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-control px-5 py-8 text-center text-sm text-muted">{children}</p>
  );
}

const statusStyles = {
  queued: { box: "bg-raised text-[#3d3d3a]", dot: "bg-faint", label: "Queued" },
  running: { box: "bg-info-bg text-info-ink", dot: "bg-signal pulse-dot", label: "Running" },
  completed: { box: "bg-pos-bg text-pos-ink", dot: "bg-[#2e7d32]", label: "Completed" },
  failed: { box: "bg-neg-bg text-neg-ink", dot: "bg-stamp", label: "Failed" },
};

export function StatusBadge({ status }: { status: keyof typeof statusStyles }) {
  const style = statusStyles[status];
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${style.box}`}>
      <span aria-hidden="true" className={`size-1.5 rounded-full ${style.dot}`} />
      {style.label}
    </span>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-lg border border-line bg-surface p-5 ${className}`}>{children}</div>;
}

export function PageHeader({ title, children, back }: { title: ReactNode; children?: ReactNode; back?: ReactNode }) {
  return (
    <header className="mb-8 space-y-3">
      {back}
      <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.025em] text-balance sm:text-[32px]">{title}</h1>
      {children ? <div className="max-w-2xl text-[15px] leading-relaxed text-muted">{children}</div> : null}
    </header>
  );
}

export function SectionTitle({ children, aside, as: Tag = "h2" }: { children: ReactNode; aside?: ReactNode; as?: "h2" | "h3" }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <Tag className="text-base font-semibold tracking-[-0.01em]">{children}</Tag>
      {aside}
    </div>
  );
}

export function AlertIcon({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4M12 17h.01" />
    </svg>
  );
}

export function ArrowIcon({ direction = "right", className = "" }: { direction?: "left" | "right"; className?: string }) {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      {direction === "right" ? <path d="M5 12h14M13 6l6 6-6 6" /> : <path d="M19 12H5M11 6l-6 6 6 6" />}
    </svg>
  );
}

export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="group -my-2 inline-flex min-h-11 items-center gap-1.5 rounded text-sm text-muted transition-colors hover:text-ink sm:-my-1 sm:min-h-9">
      <ArrowIcon direction="left" className="transition-transform duration-150 group-hover:-translate-x-0.5" />
      {children}
    </Link>
  );
}

export const formatDate = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : "Never");

/** Converts an ISO timestamp to the value a datetime-local input expects, and back. */
export const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
export const fromLocalInput = (value: string) => new Date(value).toISOString();
