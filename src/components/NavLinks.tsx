"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/identity", label: "Identity" },
  { href: "/interests", label: "Interests" },
  { href: "/people", label: "People" },
];

export function NavLinks() {
  const pathname = usePathname() ?? "/";
  return (
    <ul className="flex items-center gap-1 sm:gap-2">
      {links.map((link) => {
        const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <li key={link.href}>
            <Link
              href={link.href}
              aria-current={active ? "page" : undefined}
              className={`inline-flex h-11 items-center sm:h-9 rounded-md px-2.5 text-sm font-medium transition-colors sm:px-3 ${
                active ? "bg-raised text-ink" : "text-muted hover:bg-raised/60 hover:text-ink"
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
