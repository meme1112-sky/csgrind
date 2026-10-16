import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service | CSGrind",
  description: "Terms of Service for CSGrind — Counter-Strike 2 player reputation and stat-checking platform.",
};

export default function TermsPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 mt-16">
      <h1 className="text-2xl font-semibold text-foreground">Terms of Service</h1>
      <p className="mt-2 text-muted">
        Last updated: February 27, 2025. Please read these terms before using CSGrind.
      </p>

      <div className="mt-8 space-y-8">
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">1. Acceptance of Terms</h2>
          <p className="text-sm text-muted leading-relaxed">
            By accessing or using CSGrind (&quot;the Service&quot;), you agree to be bound by these Terms of Service.
            If you do not agree, do not use the Service. We may update these terms from time to time; continued use
            after changes constitutes acceptance of the updated terms.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">2. Description of Service</h2>
          <p className="text-sm text-muted leading-relaxed">
            CSGrind provides a player reputation and stat-checking platform for Counter-Strike 2. Features may include
            profile and stats display, community reports, watchlist, overwatch-style review, and related tools. We
            reserve the right to modify, suspend, or discontinue any part of the Service with or without notice.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">3. Eligibility & Account</h2>
          <p className="text-sm text-muted leading-relaxed mb-3">
            You must be at least 13 years of age (or the minimum age in your jurisdiction) to use the Service. You may
            sign in via Steam or other supported methods. You are responsible for maintaining the security of your
            account and for all activity under it. Do not share account access or use another person&apos;s account.
          </p>
          <p className="text-sm text-muted leading-relaxed">
            We may suspend or terminate your access if you violate these terms or for other reasons at our discretion.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">4. Acceptable Use</h2>
          <p className="text-sm text-muted leading-relaxed mb-3">You agree not to:</p>
          <ul className="list-disc list-inside text-sm text-muted space-y-1 ml-2">
            <li>Use the Service for any illegal purpose or in violation of applicable laws</li>
            <li>Harass, abuse, or harm other users or submit false or malicious reports</li>
            <li>Attempt to circumvent security, scrape data without permission, or overload our systems</li>
            <li>Impersonate others or misrepresent your affiliation</li>
            <li>Use the Service to distribute malware or engage in fraud</li>
          </ul>
          <p className="text-sm text-muted leading-relaxed mt-3">
            We may remove content and restrict or ban accounts that violate these rules.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">5. Intellectual Property</h2>
          <p className="text-sm text-muted leading-relaxed">
            CSGrind, its branding, and original content are owned by us or our licensors. You may not copy, modify,
            or distribute our materials without permission. Game-related data (e.g., stats) may be subject to
            third-party terms (e.g., Steam, game publishers). You grant us a limited license to use content you
            submit (e.g., reports, comments) to operate and improve the Service.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">6. Disclaimers</h2>
          <p className="text-sm text-muted leading-relaxed">
            The Service is provided &quot;as is&quot; and &quot;as available.&quot; We do not guarantee accuracy of stats or
            reputation data, and we are not responsible for decisions made based on the Service. We are not
            affiliated with Valve, Steam, or Counter-Strike 2; all related trademarks belong to their owners.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">7. Limitation of Liability</h2>
          <p className="text-sm text-muted leading-relaxed">
            To the maximum extent permitted by law, CSGrind and its operators shall not be liable for any indirect,
            incidental, special, or consequential damages, or loss of data or profits, arising from your use of the
            Service. Our total liability shall not exceed the amount you paid to us in the twelve months before the
            claim (or zero if you have not paid).
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">8. Contact</h2>
          <p className="text-sm text-muted leading-relaxed">
            For questions about these Terms of Service, contact us via our Support page or the contact methods
            listed on the site.
          </p>
        </section>
      </div>
    </div>
  );
}
