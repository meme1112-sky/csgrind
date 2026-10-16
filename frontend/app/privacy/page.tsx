import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy | CSGrind",
  description: "Privacy Policy for CSGrind — how we collect, use, and protect your information.",
};

export default function PrivacyPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 mt-16">
      <h1 className="text-2xl font-semibold text-foreground">Privacy Policy</h1>
      <p className="mt-2 text-muted">
        Last updated: February 27, 2025. This policy describes how CSGrind handles your information.
      </p>

      <div className="mt-8 space-y-8">
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">1. Information We Collect</h2>
          <p className="text-sm text-muted leading-relaxed mb-3">
            We may collect information you provide directly and information from your use of the Service:
          </p>
          <ul className="list-disc list-inside text-sm text-muted space-y-1 ml-2">
            <li>
              <strong className="text-foreground">Account data:</strong> When you sign in (e.g., via Steam), we may
              receive identifiers such as Steam ID, display name, and profile information made available by the
              provider.
            </li>
            <li>
              <strong className="text-foreground">Usage data:</strong> Logs of visits, pages viewed, and actions
              (e.g., reports submitted, profile views) to operate and improve the Service.
            </li>
            <li>
              <strong className="text-foreground">Device & technical data:</strong> IP address, browser type, and
              similar technical data for security and analytics.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">2. How We Use Your Information</h2>
          <p className="text-sm text-muted leading-relaxed mb-3">We use the information we collect to:</p>
          <ul className="list-disc list-inside text-sm text-muted space-y-1 ml-2">
            <li>Provide, maintain, and improve the Service (e.g., profiles, stats, reports, watchlist)</li>
            <li>Authenticate you and manage your account</li>
            <li>Enforce our Terms of Service and prevent abuse or fraud</li>
            <li>Send important service-related notices (e.g., security or policy changes)</li>
            <li>Analyze usage in an aggregated way to improve the product</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">3. Sharing of Information</h2>
          <p className="text-sm text-muted leading-relaxed">
            We do not sell your personal information. We may share information with service providers who help us
            operate the Service (e.g., hosting, analytics), subject to confidentiality and use limits. We may also
            disclose information if required by law, to protect our rights or safety, or with your consent. Profile
            and reputation-related information may be visible to other users as part of the Service (e.g., public
            profiles, reports).
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">4. Cookies & Similar Technologies</h2>
          <p className="text-sm text-muted leading-relaxed">
            We may use cookies, local storage, and similar technologies for session management, preferences, and
            analytics. You can control cookies through your browser settings; disabling them may limit some
            functionality.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">5. Data Retention</h2>
          <p className="text-sm text-muted leading-relaxed">
            We retain your information for as long as your account is active or as needed to provide the Service,
            comply with legal obligations, resolve disputes, and enforce our agreements. You may request deletion of
            your account and associated data subject to applicable law and our retention policies.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">6. Security</h2>
          <p className="text-sm text-muted leading-relaxed">
            We take reasonable measures to protect your information (e.g., encryption, access controls). No method
            of transmission or storage is 100% secure; we cannot guarantee absolute security.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">7. Your Rights</h2>
          <p className="text-sm text-muted leading-relaxed">
            Depending on your location, you may have rights to access, correct, delete, or port your data, or to
            object to or restrict certain processing. To exercise these rights, contact us via the Support page or
            the contact methods on the site. You may also have the right to lodge a complaint with a supervisory
            authority.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">8. Third-Party Services</h2>
          <p className="text-sm text-muted leading-relaxed">
            The Service may link to or integrate with third-party services (e.g., Steam, Discord). Their use of
            your information is governed by their own privacy policies. We encourage you to review those policies.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">9. Children</h2>
          <p className="text-sm text-muted leading-relaxed">
            The Service is not directed at children under 13 (or the applicable age in your jurisdiction). We do
            not knowingly collect personal information from children. If you believe we have collected such
            information, please contact us so we can delete it.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">10. Changes & Contact</h2>
          <p className="text-sm text-muted leading-relaxed">
            We may update this Privacy Policy from time to time. We will post the updated policy on this page and
            update the &quot;Last updated&quot; date. Continued use after changes constitutes acceptance. For questions
            about this policy or your data, contact us via our Support page or the contact methods listed on the
            site.
          </p>
        </section>
      </div>
    </div>
  );
}
