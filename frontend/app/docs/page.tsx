import Link from "next/link";
import { HiDocumentText, HiCode, HiBookOpen, HiArrowRight } from "react-icons/hi";

export default function DocsPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
      <header className="mb-10">
        <p className="text-accent font-mono text-sm tracking-widest uppercase mb-2">
          API · Guides · Reference
        </p>
        <h1 className="text-3xl sm:text-4xl font-semibold text-foreground tracking-tight">
          Docs / API
        </h1>
        <p className="mt-3 text-muted max-w-xl">
          Documentation and API reference for developers. Coming soon.
        </p>
      </header>

      <div className="rounded-xl border border-border bg-card p-8 sm:p-12 text-center">
        <span className="inline-flex items-center justify-center size-16 rounded-2xl bg-accent/15 text-accent mb-6">
          <HiDocumentText className="size-8" aria-hidden />
        </span>
        <h2 className="text-xl font-semibold text-foreground">
          Coming soon
        </h2>
        <p className="mt-3 text-muted max-w-md mx-auto">
          We're preparing API docs, integration guides, and a full reference. Check back later or join our Discord for updates.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-4">
          <span className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-muted/20 text-muted text-sm">
            <HiCode className="size-4" aria-hidden />
            REST API
          </span>
          <span className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-muted/20 text-muted text-sm">
            <HiBookOpen className="size-4" aria-hidden />
            Integration guides
          </span>
        </div>
        <Link
          href="/announcements"
          className="inline-flex items-center gap-2 mt-8 text-sm font-medium text-accent hover:underline"
        >
          View announcements
          <HiArrowRight className="size-4" aria-hidden />
        </Link>
      </div>
    </div>
  );
}
