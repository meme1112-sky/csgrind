import Link from "next/link";
import { HiArrowLeft } from "react-icons/hi";

type PlaceholderPageProps = {
  title: string;
  description: string;
};

export default function PlaceholderPage({
  title,
  description,
}: PlaceholderPageProps) {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-accent"
      >
        <HiArrowLeft className="size-4" />
        Dashboard
      </Link>
      <p className="font-mono text-sm uppercase tracking-widest text-accent">
        Coming soon
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
        {title}
      </h1>
      <p className="mt-3 max-w-2xl text-muted leading-relaxed">{description}</p>
      <div className="mt-8 rounded-xl border border-border bg-card p-8 text-center">
        <p className="text-sm text-muted">
          This section will connect to backend APIs in a future release.
        </p>
      </div>
    </div>
  );
}
