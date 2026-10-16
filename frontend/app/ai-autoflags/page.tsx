import PageContent from "../components/PageContent";

export default function AiAutoFlagsPage() {
  return (
    <PageContent>
      <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">AI Auto Flags</h1>
      <p className="mt-2 text-muted">
        Review and manage AI-detected suspicious behavior and auto-flagged demos.
      </p>
      <div className="mt-6 rounded-lg border border-border bg-card p-4 sm:p-6">
        <p className="text-sm text-muted">AI auto-flag queue and tools coming soon.</p>
      </div>
    </PageContent>
  );
}
