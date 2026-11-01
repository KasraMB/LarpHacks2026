"use client";

import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";
import Link from "next/link";
import type { ApiError } from "@/contracts";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger";
  busy?: boolean;
};

const variants = {
  primary: "border border-ink bg-ink text-ground hover:opacity-90 active:opacity-100",
  secondary: "border border-line bg-raised text-ink hover:border-control hover:bg-rule active:bg-line",
  danger: "border border-neg-line bg-neg-bg text-neg-ink hover:opacity-90 active:opacity-100",
};

export function Button({
  variant = "primary",
  busy = false,
  disabled,
  className = "",
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-sm px-3.5 py-1.5 text-sm font-semibold tracking-[-0.01em] transition-[background-color,border-color,opacity,transform] duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 disabled:active:scale-100 sm:min-h-9 ${variants[variant]} ${className}`}
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
  "w-full rounded-sm border border-control bg-surface px-3 py-2 text-[15px] text-ink placeholder:text-placeholder transition-colors hover:border-muted focus:border-ink focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-signal";

export function TextField({
  label,
  hint,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-sm font-semibold text-ink">{label}</span>
      <input className={`${fieldClass} h-11 sm:h-10`} {...rest} />
      {hint ? <span className="block text-[13px] text-muted">{hint}</span> : null}
    </label>
  );
}

export function TextArea({
  label,
  hint,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; hint?: string }) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-sm font-semibold text-ink">{label}</span>
      <textarea className={`${fieldClass} min-h-24 leading-relaxed`} {...rest} />
      {hint ? <span className="block text-[13px] text-muted">{hint}</span> : null}
    </label>
  );
}

export function ErrorMessage({ error, onRetry }: { error: ApiError | null; onRetry?: () => void }) {
  if (!error) return null;
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-neg-line bg-neg-bg px-4 py-3 text-sm text-neg-ink"
    >
      <span className="flex items-start gap-2.5">
        <AlertIcon className="mt-0.5 shrink-0" />
        <span>{error.message}</span>
      </span>
      {error.retryable && onRetry ? (
        <Button variant="secondary" onClick={onRetry} className="bg-surface! text-neg-ink! hover:bg-surface/80!">
          Retry
        </Button>
      ) : null}
    </div>
  );
}

export function Loading({ label = "Loading..." }: { label?: string }) {
  return (
    <div role="status" className="space-y-3 rounded-sm border border-line bg-surface p-5" aria-live="polite">
      <span className="sr-only">{label}</span>
      <span aria-hidden="true" className="flex items-center gap-2 font-mono text-xs text-muted">
        <span className="pulse-dot size-1.5 rounded-full bg-stamp" />
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
    <div className="rounded-sm border border-dashed border-control bg-surface/70 px-5 py-8 text-center text-sm text-muted">
      {children}
    </div>
  );
}

const statusStyles = {
  queued: { box: "border border-line bg-raised text-ink", dot: "bg-faint", label: "Queued" },
  running: { box: "border border-info-line bg-info-bg text-info-ink", dot: "bg-signal pulse-dot", label: "Running" },
  completed: { box: "border border-pos-line bg-pos-bg text-pos-ink", dot: "bg-pos-ink", label: "Verified" },
  failed: { box: "border border-neg-line bg-neg-bg text-neg-ink", dot: "bg-stamp", label: "Failed" },
};

export function StatusBadge({ status }: { status: keyof typeof statusStyles }) {
  const style = statusStyles[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm px-2 py-0.5 font-mono text-[11px] font-semibold ${style.box}`}
    >
      <span aria-hidden="true" className={`size-1.5 rounded-full ${style.dot}`} />
      {style.label}
    </span>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-sm border border-line bg-surface p-5 ${className}`}>{children}</div>;
}

export function PageHeader({
  title,
  children,
  back,
  aside,
}: {
  title: ReactNode;
  children?: ReactNode;
  back?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <header className="mb-8 border-b border-line pb-5">
      {back ? <div className="mb-3">{back}</div> : null}
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="text-[28px] font-bold leading-tight tracking-[-0.03em] text-balance sm:text-[34px]">{title}</h1>
        {aside}
      </div>
      {children ? <div className="mt-2 max-w-[68ch] text-[15px] leading-relaxed text-muted">{children}</div> : null}
    </header>
  );
}

export function SectionTitle({
  children,
  aside,
  as: Tag = "h2",
}: {
  children: ReactNode;
  aside?: ReactNode;
  as?: "h2" | "h3";
}) {
  return (
    <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3 border-b border-rule pb-2">
      <Tag className="text-[17px] font-bold tracking-[-0.015em] text-ink">{children}</Tag>
      {aside}
    </div>
  );
}

export function AlertIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4M12 17h.01" />
    </svg>
  );
}

export function ArrowIcon({
  direction = "right",
  className = "",
}: {
  direction?: "left" | "right";
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {direction === "right" ? <path d="M5 12h14M13 6l6 6-6 6" /> : <path d="M19 12H5M11 6l-6 6 6 6" />}
    </svg>
  );
}

export function CheckIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export function PlusIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function CrosshairIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="12" cy="12" r="8" />
      <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
    </svg>
  );
}

export function ExternalLinkIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
    </svg>
  );
}

export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="group -my-1 inline-flex min-h-11 items-center gap-1.5 rounded-sm font-mono text-xs font-semibold text-muted transition-colors hover:text-ink sm:min-h-8"
    >
      <ArrowIcon direction="left" className="transition-transform duration-150 group-hover:-translate-x-0.5" />
      {children}
    </Link>
  );
}

export const formatDate = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : "Never");

/** Formats an ISO timestamp as a compact tabular coordinate string (YYYY-MM-DD HH:mm). */
export const formatCoordDate = (iso: string | null) => {
  if (!iso) return "NO CUTOFF";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** Formats a serial reference code like CLM-01, FCT-04, CRD-02. */
export const formatSerial = (prefix: string, num: number) => `${prefix}-${String(num).padStart(2, "0")}`;

/** Converts an ISO timestamp to the value a datetime-local input expects, and back. */
export const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
export const fromLocalInput = (value: string) => new Date(value).toISOString();
