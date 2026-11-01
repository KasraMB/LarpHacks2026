import type { ReactNode } from "react";
import Link from "next/link";
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
          <nav aria-label="Main navigation" className="mx-auto flex max-w-5xl gap-5 px-5 py-4">
            <Link href="/">Alias</Link>
            <Link href="/identity">Identity</Link>
            <Link href="/interests">Interests</Link>
            <Link href="/people">People</Link>
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
