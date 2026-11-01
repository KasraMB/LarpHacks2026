import type { ReactNode } from "react";
import Link from "next/link";
import { AccountAccess, AccountControls } from "@/components/AccountAccess";
import "./globals.css";

export const metadata = {
  title: "Alias",
  description: "Keep your cover identity consistent over time.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="border-b border-slate-200 bg-white">
          <nav aria-label="Main navigation" className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-5 gap-y-3 px-5 py-4">
            <Link href="/">Alias</Link>
            <Link href="/identity">Identity</Link>
            <Link href="/interests">Skills library</Link>
            <Link href="/people">People</Link>
            <div className="ml-auto"><AccountControls /></div>
          </nav>
        </header>
        <main><AccountAccess>{children}</AccountAccess></main>
      </body>
    </html>
  );
}
