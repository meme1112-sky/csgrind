import PageContent from "../components/PageContent";

export default function SettingsPage() {
  return (
    <PageContent>
      <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">Settings</h1>
      <p className="mt-2 text-muted">
        Preferences, notifications, and account settings.
      </p>
      <div className="mt-6 rounded-lg border border-border bg-card p-4 sm:p-6">
        <p className="text-sm text-muted">Settings options coming soon.</p>
      </div>
    </PageContent>
  );
}
