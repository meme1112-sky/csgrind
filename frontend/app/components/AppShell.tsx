"use client";

import Header from "./Header";
import Footer from "./Footer";
import CookieConsentBanner from "@/components/cookie-consent-banner";
import { ConsentAwareAnalytics } from "@/components/consent-aware-analytics";

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      <div className="flex min-h-dvh min-h-screen flex-col bg-background text-foreground">
        <main className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
          {children}
        </main>
        <Footer />
        <CookieConsentBanner />
        <ConsentAwareAnalytics />
      </div>
    </>
  );
}
