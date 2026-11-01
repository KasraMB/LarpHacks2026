import type { ReactNode } from "react";
import Link from "next/link";
import { Public_Sans, Azeret_Mono } from "next/font/google";
import { NavLinks } from "@/components/NavLinks";
import { ThemeToggle } from "@/components/ThemeToggle";
import { CrosshairIcon } from "@/components/ui";
import "./globals.css";

const publicSans = Public_Sans({
  subsets: ["latin"],
  variable: "--font-public-sans",
  display: "swap",
});

const azeretMono = Azeret_Mono({
  subsets: ["latin"],
  variable: "--font-azeret-mono",
  display: "swap",
});

export const metadata = {
  title: "Alias — Field Continuity & Briefing Register",
  description: "Keep your cover identity consistent over time.",
};

const themeInitScript = `(() => {
  try {
    const saved = localStorage.getItem("alias-theme-wood");
    const theme = saved === "dark" || saved === "light" ? saved : "dark";
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  } catch {}
})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${publicSans.variable} ${azeretMono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="font-sans text-ink">
        <a
          href="#content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-50 focus:rounded-sm focus:bg-ink focus:px-3.5 focus:py-2 focus:text-sm focus:font-medium focus:text-ground"
        >
          Skip to content
        </a>
        <header className="sticky top-0 z-40 border-b border-header-line bg-header text-night-ink">
          <nav
            aria-label="Main navigation"
            className="mx-auto flex h-14 max-w-[1200px] items-center justify-between gap-4 px-4 sm:px-6"
          >
            <Link
              href="/"
              className="group inline-flex items-center gap-3 rounded-sm py-1 pr-2 focus-visible:outline-night-ink"
              aria-label="Alias home"
            >
              <span
                aria-hidden="true"
                className="inline-flex size-7 items-center justify-center rounded-sm border border-night-ink/30 bg-night/40 text-night-ink transition-transform duration-200 group-hover:scale-105"
              >
                <CrosshairIcon className="size-4" />
              </span>
              <span className="flex items-baseline gap-2.5">
                <span className="text-[18px] font-bold tracking-[-0.025em] text-night-ink">Alias</span>
                <span className="hidden font-mono text-[11px] font-medium text-night-ink/75 sm:inline">
                  CONTINUITY REGISTER
                </span>
              </span>
            </Link>
            <div className="flex items-center gap-2 sm:gap-3">
              <NavLinks />
              <ThemeToggle />
            </div>
          </nav>
        </header>
        <main id="content" className="mx-auto w-full max-w-[1200px] px-4 pb-24 pt-7 sm:px-6 sm:pt-10">
          {children}
        </main>
      </body>
    </html>
  );
}
