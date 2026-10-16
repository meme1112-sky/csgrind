"use client";

import { HiBell, HiExternalLink } from "react-icons/hi";

export default function AdminHeader() {
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-border bg-card/95 px-6 backdrop-blur">
      <p className="text-sm text-muted">
        Platform operations & moderation
      </p>
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="flex size-9 items-center justify-center rounded-full text-muted transition-colors hover:bg-muted/80 hover:text-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-background"
          aria-label="Notifications"
        >
          <HiBell className="size-5" />
        </button>
        <a
          href="http://localhost:3000"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-muted transition-colors hover:border-accent/40 hover:text-foreground"
        >
          <HiExternalLink className="size-4 shrink-0" />
          View site
        </a>
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent/20 text-sm font-medium text-accent">
          A
        </span>
      </div>
    </header>
  );
}
