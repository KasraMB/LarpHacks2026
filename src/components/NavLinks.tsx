"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Overview", exact: true },
  { href: "/identity", label: "Identity", exact: false },
  { href: "/interests", label: "Skills library", exact: false },
  { href: "/people", label: "People", exact: false },
];

export function NavLinks() {
  const pathname = usePathname() ?? "/";
  return (
    <ul className="flex items-center gap-1 sm:gap-1.5">
      {links.map((link) => {
        const active = link.exact
          ? pathname === link.href
          : pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <li key={link.href}>
            <Link
              href={link.href}
              aria-current={active ? "page" : undefined}
              className={`inline-flex h-10 items-center rounded-sm px-2.5 text-sm font-semibold transition-colors focus-visible:outline-night-ink sm:h-9 sm:px-3 ${
                active
                  ? "bg-night-ink text-header"
                  : "text-night-ink/85 hover:bg-night/35 hover:text-night-ink"
              }`}
            >
              {link.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
