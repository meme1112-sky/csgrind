"use client";

import Link from "next/link";
import { HiFire } from "react-icons/hi";
import { openCookieConsentSettings } from "@/lib/cookieConsent";

const FEATURE_LINKS = [
  { href: "/", label: "Home" },
  { href: "/profile", label: "Profile" },
  { href: "/upload", label: "Upload demo" },
  { href: "/announcements", label: "Announcements" },
] as const;

const INFO_LINKS = [
  { href: "/terms", label: "Terms of Service" },
  { href: "/privacy", label: "Privacy Policy" },
] as const;

const linkClass =
  "inline-flex min-h-10 items-center rounded-md py-1.5 text-sm text-muted transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-card";

function FooterLinkColumn({
  title,
  links,
  listClassName = "space-y-0.5",
}: {
  title: string;
  links: readonly { href: string; label: string }[];
  listClassName?: string;
}) {
  return (
    <div className="min-w-0">
      <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-foreground sm:mb-4 sm:text-sm">
        {title}
      </h3>
      <ul className={listClassName}>
        {links.map(({ href, label }) => (
          <li key={`${title}-${href}-${label}`}>
            <Link href={href} className={linkClass}>
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="shrink-0 border-t border-border bg-card text-foreground">
      <div className="mx-auto w-full max-w-6xl px-4 pt-10 pb-[max(1.5rem,env(safe-area-inset-bottom,0px))] sm:px-6 sm:pt-12">
        <div className="grid grid-cols-2 gap-x-6 gap-y-10 md:grid-cols-12 md:gap-x-8 md:gap-y-8">
          <div className="col-span-2 flex flex-col items-center gap-4 text-center md:col-span-5 md:items-start md:text-left">
            <Link
              href="/"
              className="inline-flex items-center gap-2 font-semibold text-foreground transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-card rounded-md"
            >
              <span className="flex size-9 items-center justify-center rounded-md bg-accent/20 text-accent">
                <HiFire className="size-5" aria-hidden />
              </span>
              <span className="text-lg uppercase tracking-tight">
                <span className="text-accent">CS</span>Grind
              </span>
            </Link>
            <p className="max-w-md text-sm leading-relaxed text-muted">
              Counter-Strike 2 player stats and profile lookup. Search Steam,
              FACEIT, or Leetify links and review performance before you queue.
            </p>
          </div>

          <div className="min-w-0 md:col-span-3">
            <FooterLinkColumn title="Navigate" links={FEATURE_LINKS} />
          </div>

          <div className="min-w-0 md:col-span-4">
            <FooterLinkColumn title="Information" links={INFO_LINKS} />
            <button
              type="button"
              onClick={openCookieConsentSettings}
              className={`${linkClass} mt-1`}
            >
              Cookie settings
            </button>
          </div>
        </div>

        <div className="mt-8 border-t border-border pt-6 text-center text-xs leading-relaxed text-muted sm:mt-10 sm:text-left">
          <p className="max-w-prose">
            <span className="sm:hidden">© {year} CSGrind</span>
            <span className="hidden sm:inline">
              © {year} CSGrind — Counter-Strike Player Stats
            </span>
          </p>
        </div>
      </div>
    </footer>
  );
}
