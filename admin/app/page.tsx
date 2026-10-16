import Link from "next/link";
import {
  HiExclamationCircle,
  HiChip,
  HiClipboardList,
  HiSpeakerphone,
  HiServer,
  HiArrowRight,
  HiTrendingUp,
  HiUsers,
  HiFilm,
} from "react-icons/hi";

const STATS = [
  { label: "Pending reports", value: "24", change: "+3 today", Icon: HiExclamationCircle },
  { label: "AI flags (review)", value: "12", change: "5 high priority", Icon: HiChip },
  { label: "Overwatch applications", value: "8", change: "2 new this week", Icon: HiClipboardList },
  { label: "Players analyzed (24h)", value: "4,218", change: "+12% vs yesterday", Icon: HiUsers },
] as const;

const RECENT_ACTIVITY = [
  {
    id: "1",
    type: "report",
    title: "Player report #1842",
    detail: "Suspected aim assistance — SteamID64 …55928",
    time: "12 min ago",
    tone: "rose" as const,
  },
  {
    id: "2",
    type: "flag",
    title: "AI flag escalated",
    detail: "Confidence 0.94 — demo round 14 anomaly",
    time: "34 min ago",
    tone: "amber" as const,
  },
  {
    id: "3",
    type: "application",
    title: "Overwatch application",
    detail: "Applicant: veteran reviewer, 2k+ hours",
    time: "1 hr ago",
    tone: "accent" as const,
  },
  {
    id: "4",
    type: "pipeline",
    title: "Demo pipeline completed",
    detail: "3 matches parsed for player …85736",
    time: "2 hr ago",
    tone: "emerald" as const,
  },
] as const;

const SERVICES = [
  { name: "Frontend", port: "3000", status: "online" as const },
  { name: "Backend (Express)", port: "5000", status: "online" as const },
  { name: "Extra-backend (FastAPI)", port: "8000", status: "online" as const },
  { name: "Admin", port: "7006", status: "online" as const },
] as const;

const QUICK_LINKS = [
  { href: "/reports", label: "Review reports", Icon: HiExclamationCircle },
  { href: "/ai-flags", label: "AI flag queue", Icon: HiChip },
  { href: "/announcements", label: "Publish announcement", Icon: HiSpeakerphone },
  { href: "/services", label: "Service status", Icon: HiServer },
] as const;

const toneClasses = {
  rose: "bg-rose-500/15 text-rose-400",
  amber: "bg-amber-500/15 text-amber-400",
  accent: "bg-accent/15 text-accent",
  emerald: "bg-emerald-500/15 text-emerald-400",
};

export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <p className="font-mono text-sm uppercase tracking-widest text-accent">
        Overview
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
        Dashboard
      </h1>
      <p className="mt-3 max-w-2xl text-muted leading-relaxed">
        Monitor moderation queues, platform activity, and service health for CSGrind.
      </p>

      <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STATS.map(({ label, value, change, Icon }) => (
          <article
            key={label}
            className="rounded-xl border border-border bg-card p-5 transition-colors hover:border-accent/40 hover:shadow-[0_0_24px_-4px_rgba(237,174,95,0.12)]"
          >
            <div className="flex items-start justify-between gap-3">
              <Icon className="size-6 text-accent/90 shrink-0" aria-hidden />
              <HiTrendingUp className="size-4 text-muted/60" aria-hidden />
            </div>
            <p className="mt-4 text-2xl font-bold tabular-nums text-foreground">
              {value}
            </p>
            <p className="mt-1 text-sm font-medium text-foreground">{label}</p>
            <p className="mt-1 text-xs text-muted">{change}</p>
          </article>
        ))}
      </div>

      <div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2 rounded-xl border border-border bg-card overflow-hidden">
          <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
            <h2 className="text-lg font-semibold text-foreground">
              Recent activity
            </h2>
            <span className="text-xs text-muted font-mono">Sample data</span>
          </div>
          <ul className="divide-y divide-border">
            {RECENT_ACTIVITY.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-start justify-between gap-3 px-5 py-4 hover:bg-muted/10 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${toneClasses[item.tone]}`}
                    >
                      {item.type}
                    </span>
                    <span className="font-medium text-foreground">
                      {item.title}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted">{item.detail}</p>
                </div>
                <time className="text-xs text-muted whitespace-nowrap">
                  {item.time}
                </time>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-lg font-semibold text-foreground">Quick actions</h2>
          <ul className="mt-4 space-y-2">
            {QUICK_LINKS.map(({ href, label, Icon }) => (
              <li key={href}>
                <Link
                  href={href}
                  className="group flex items-center justify-between gap-2 rounded-lg border border-border bg-background/40 px-3 py-2.5 text-sm transition-colors hover:border-accent/40 hover:bg-accent/10"
                >
                  <span className="flex items-center gap-2 text-foreground">
                    <Icon className="size-4 text-accent shrink-0" />
                    {label}
                  </span>
                  <HiArrowRight className="size-4 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-accent" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="mt-10 rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <HiServer className="size-5 text-accent" aria-hidden />
            <h2 className="text-lg font-semibold text-foreground">Services</h2>
          </div>
          <Link
            href="/services"
            className="text-sm text-accent hover:text-accent-hover transition-colors"
          >
            View all
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-border">
          {SERVICES.map((svc) => (
            <div key={svc.name} className="px-5 py-4">
              <div className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-emerald-500" aria-hidden />
                <span className="text-sm font-medium text-foreground capitalize">
                  {svc.status}
                </span>
              </div>
              <p className="mt-2 font-medium text-foreground">{svc.name}</p>
              <p className="text-xs text-muted font-mono">:{svc.port}</p>
            </div>
          ))}
        </div>
        <div className="border-t border-border bg-muted/10 px-5 py-3 flex items-center gap-2 text-sm text-muted">
          <HiFilm className="size-4 text-accent shrink-0" aria-hidden />
          <span>
            Demo pipeline runs via extra-backend — connect health checks in Services.
          </span>
        </div>
      </section>
    </div>
  );
}
