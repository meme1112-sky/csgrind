import PageContent from "../components/PageContent";

export default function ApplyPage() {
  return (
    <PageContent>
      <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">Apply</h1>
      <p className="mt-2 text-muted">
        Apply to join the Overwatch program and help review cases.
      </p>
      <div className="mt-6 rounded-lg border border-border bg-card p-4 sm:p-6">
        <p className="text-sm text-muted">Application form and requirements coming soon.</p>
      </div>
    </PageContent>
  );
}
