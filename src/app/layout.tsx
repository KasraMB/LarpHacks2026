import type { ReactNode } from "react";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import { NavLinks } from "@/components/NavLinks";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });

export const metadata = {
  title: "Alias",
  description: "Keep your cover identity consistent over time.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable}`}>
      <body className="font-sans text-ink">
        <a
          href="#content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-50 focus:rounded-md focus:bg-ink focus:px-3 focus:py-2 focus:text-sm focus:text-white"
        >
          Skip to content
        </a>
        <header className="sticky top-0 z-40 border-b border-line bg-ground/95">
          <nav aria-label="Main navigation" className="mx-auto flex h-14 max-w-[1120px] items-center justify-between gap-3 px-4 sm:px-6">
            <Link href="/" className="group inline-flex items-center gap-2.5 rounded-md py-1 pr-2" aria-label="Alias home">
              <span aria-hidden="true" className="flex flex-col gap-[3px]">
                <span className="redact h-[5px] w-5 transition-[width] duration-200 group-hover:w-3" />
                <span className="redact h-[5px] w-3 transition-[width] duration-200 group-hover:w-5" />
              </span>
              <span className="text-[17px] font-semibold tracking-[-0.02em]">Alias</span>
            </Link>
            <NavLinks />
          </nav>
        </header>
        <main id="content" className="mx-auto w-full max-w-[1120px] px-4 pb-24 pt-8 sm:px-6 sm:pt-12">
          {children}
        </main>
      </body>
    </html>
  );
}
