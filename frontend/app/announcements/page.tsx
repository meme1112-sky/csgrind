"use client";

import { useState } from "react";
import {
  HiSpeakerphone,
  HiCalendar,
  HiArrowRight,
  HiNewspaper,
  HiCog,
  HiUserGroup,
  HiLightningBolt,
} from "react-icons/hi";

const CATEGORIES = [
  { id: "all", label: "All", Icon: HiSpeakerphone },
  { id: "update", label: "Updates", Icon: HiLightningBolt },
  { id: "maintenance", label: "Maintenance", Icon: HiCog },
  { id: "community", label: "Community", Icon: HiUserGroup },
] as const;

type CategoryId = (typeof CATEGORIES)[number]["id"];

const ANNOUNCEMENTS = [
  {
    id: "1",
    date: "2025-02-25",
    category: "update" as const,
    title: "New AI detection models live",
    excerpt:
      "We've rolled out improved cheat detection with lower false positives. Your trust scores now reflect the latest models across all regions.",
  },
  {
    id: "2",
    date: "2025-02-20",
    category: "maintenance" as const,
    title: "Scheduled maintenance — March 2",
    excerpt:
      "Brief downtime between 02:00–04:00 UTC for database upgrades. Profiles and stats will be read-only during the window.",
  },
  {
    id: "3",
    date: "2025-02-15",
    category: "community" as const,
    title: "Overwatch applications open",
    excerpt:
      "Apply to join the reviewer pool and help keep the platform fair. New slots are available for active community members.",
  },
  {
    id: "4",
    date: "2025-02-10",
    category: "update" as const,
    title: "Demo parsing improvements",
    excerpt:
      "Faster demo processing and better round-by-round breakdowns. Large demos now complete in under 30 seconds.",
  },
];

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getCategoryLabel(id: string) {
  return CATEGORIES.find((c) => c.id === id)?.label ?? id;
}

export default function AnnouncementsPage() {
  const [activeCategory, setActiveCategory] = useState<CategoryId>("all");

  const filtered =
    activeCategory === "all"
      ? ANNOUNCEMENTS
      : ANNOUNCEMENTS.filter((a) => a.category === activeCategory);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-10 mt-16">
      {/* Header */}
      <header className="mb-10">
        <p className="text-accent font-mono text-sm tracking-widest uppercase mb-2">
          Platform updates · Maintenance · News
        </p>
        <h1 className="text-3xl sm:text-4xl font-semibold text-foreground tracking-tight">
          Announcements
        </h1>
        <p className="mt-3 text-muted max-w-xl">
          Product updates, scheduled maintenance, and community news. Check here
          for the latest.
        </p>
      </header>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-8">
        {CATEGORIES.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveCategory(id)}
            className={`
              inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
              transition-all duration-200 border
              ${
                activeCategory === id
                  ? "bg-accent/15 border-accent/50 text-accent"
                  : "bg-card border-border text-muted hover:border-accent/30 hover:text-foreground"
              }
            `}
            aria-pressed={activeCategory === id}
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="space-y-4">
        {filtered.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-12 text-center">
            <HiNewspaper className="size-12 text-muted/50 mx-auto mb-4" aria-hidden />
            <h2 className="text-lg font-semibold text-foreground">
              No announcements in this category
            </h2>
            <p className="mt-2 text-sm text-muted max-w-sm mx-auto">
              Try another filter or check back later for updates.
            </p>
          </div>
        ) : (
          filtered.map((announcement) => (
            <article
              key={announcement.id}
              className="group rounded-xl border border-border bg-card p-5 sm:p-6 hover:border-accent/40 hover:shadow-[0_0_24px_-4px_rgba(237,174,95,0.12)] transition-all duration-200"
            >
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className="inline-flex items-center gap-1.5 text-xs text-muted font-mono">
                      <HiCalendar className="size-3.5" aria-hidden />
                      {formatDate(announcement.date)}
                    </span>
                    <span
                      className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium bg-accent/15 text-accent border border-accent/20"
                      aria-label={`Category: ${getCategoryLabel(announcement.category)}`}
                    >
                      {getCategoryLabel(announcement.category)}
                    </span>
                  </div>
                  <h2 className="text-lg font-semibold text-foreground group-hover:text-accent transition-colors">
                    {announcement.title}
                  </h2>
                  <p className="mt-2 text-sm text-muted leading-relaxed">
                    {announcement.excerpt}
                  </p>
                </div>
                <span
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-accent opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                  aria-hidden
                >
                  Read more
                  <HiArrowRight className="size-4" />
                </span>
              </div>
            </article>
          ))
        )}
      </div>

      {/* Footer note */}
      {filtered.length > 0 && (
        <p className="mt-8 text-xs text-muted text-center">
          Stay tuned for more updates. Follow us on Discord for real-time
          notifications.
        </p>
      )}
    </div>
  );
}
