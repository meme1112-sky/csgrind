import { HiClock } from "react-icons/hi2";

function formatRelativeTime(iso: string | null): string {
  if (!iso) return "Unknown";
  const diffMs = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  if (hours < 1) return "Just now";
  if (hours < 24) return `~${hours} hr${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `~${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `~${months} mo${months === 1 ? "" : "s"} ago`;
  const years = Math.floor(days / 365);
  return `~${years} yr${years === 1 ? "" : "s"} ago`;
}

function formatTooltip(iso: string): string {
  const exact = new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return `${exact} — most recent CS2 match from Leetify, FACEIT, or parsed demos`;
}

type Props = {
  lastActivityAt?: string | null;
  /** Used when no match sources returned a date (e.g. signed-in profile sync). */
  fallbackAt?: string | null;
};

export function ProfileLastMatchFooter({ lastActivityAt, fallbackAt }: Props) {
  const iso = lastActivityAt ?? fallbackAt ?? null;
  const relative = formatRelativeTime(iso);
  const tooltip = iso
    ? formatTooltip(iso)
    : "No recent match data found for this player";

  return (
    <div className="px-3 py-2 border border-border bg-background/80 text-sm text-muted rounded-lg">
      <div className="flex items-center justify-center gap-2">
        <HiClock className="size-3 shrink-0" aria-hidden />
        <span title={tooltip}>
          Last match{" "}
          <span className="text-foreground font-medium">· {relative}</span>
        </span>
      </div>
    </div>
  );
}
