"use client";

import { useState } from "react";
import Link from "next/link";
import {
  HiDocumentText,
  HiSpeakerphone,
  HiDocument,
  HiShieldCheck,
  HiChevronDown,
  HiMail,
  HiQuestionMarkCircle,
} from "react-icons/hi";
import { FaDiscord } from "react-icons/fa";

const QUICK_LINKS = [
  { href: "/docs", label: "Documentation", description: "API reference and guides", Icon: HiDocumentText },
  { href: "/announcements", label: "Announcements", description: "Updates and maintenance", Icon: HiSpeakerphone },
  { href: "/terms", label: "Terms of Service", description: "Usage and rules", Icon: HiDocument },
  { href: "/privacy", label: "Privacy Policy", description: "How we handle your data", Icon: HiShieldCheck },
] as const;

const FAQ_ITEMS = [
  {
    id: "1",
    question: "How do I link my Steam account?",
    answer:
      "Sign in with Steam from the header or profile area. We use Steam's official sign-in; no password is stored. You can disconnect your account anytime from Settings.",
  },
  {
    id: "2",
    question: "Why isn't my profile updating?",
    answer:
      "Stats and demos are processed in the background. New matches usually appear within a few hours. If something is stuck, try re-linking your Steam account or contact support with your Steam ID.",
  },
  {
    id: "3",
    question: "How does the trust score work?",
    answer:
      "Trust score is based on match history, report outcomes, and AI analysis. Playing regularly, having clean reports, and verified stats all help. We'll publish a full breakdown in the Docs soon.",
  },
  {
    id: "4",
    question: "I was reported by mistake. What can I do?",
    answer:
      "Reports are reviewed by our team and community overwatch. False reports don't affect your score once reviewed. You can appeal or add context from your profile if needed.",
  },
  {
    id: "5",
    question: "How do I apply for Overwatch?",
    answer:
      "Head to the Apply page from the navigation. You'll need an active account and a short application. Accepted reviewers help assess reports and keep the platform fair.",
  },
];

export default function SupportPage() {
  const [openFaqId, setOpenFaqId] = useState<string | null>(FAQ_ITEMS[0]?.id ?? null);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
      {/* Header */}
      <header className="mb-10">
        <p className="text-accent font-mono text-sm tracking-widest uppercase mb-2">
          Get help · FAQs · Contact
        </p>
        <h1 className="text-3xl sm:text-4xl font-semibold text-foreground tracking-tight">
          Support Center
        </h1>
        <p className="mt-3 text-muted max-w-xl">
          Find answers, guides, and ways to reach the CSGrind team. We're here to help.
        </p>
      </header>

      {/* Quick links */}
      <section className="mb-12">
        <h2 className="text-sm font-bold uppercase tracking-wider text-foreground mb-4">
          Quick links
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {QUICK_LINKS.map(({ href, label, description, Icon }) => (
            <Link
              key={href}
              href={href}
              className="group rounded-xl border border-border bg-card p-5 hover:border-accent/40 hover:shadow-[0_0_24px_-4px_rgba(237,174,95,0.12)] transition-all duration-200 flex items-start gap-4"
            >
              <span className="flex items-center justify-center size-10 rounded-lg bg-accent/15 text-accent shrink-0">
                <Icon className="size-5" aria-hidden />
              </span>
              <div className="min-w-0">
                <span className="font-semibold text-foreground group-hover:text-accent transition-colors">
                  {label}
                </span>
                <p className="mt-0.5 text-sm text-muted">{description}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="mb-12">
        <h2 className="text-sm font-bold uppercase tracking-wider text-foreground mb-4 flex items-center gap-2">
          <HiQuestionMarkCircle className="size-4 text-accent" aria-hidden />
          Frequently asked questions
        </h2>
        <div className="space-y-2">
          {FAQ_ITEMS.map((item) => {
            const isOpen = openFaqId === item.id;
            return (
              <div
                key={item.id}
                className="rounded-xl border border-border bg-card overflow-hidden transition-all duration-200 hover:border-accent/30"
              >
                <button
                  type="button"
                  onClick={() => setOpenFaqId(isOpen ? null : item.id)}
                  className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left"
                  aria-expanded={isOpen}
                >
                  <span className="font-medium text-foreground">{item.question}</span>
                  <HiChevronDown
                    className={`size-5 text-muted shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                    aria-hidden
                  />
                </button>
                <div
                  className={`grid transition-[grid-template-rows] duration-200 ${isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
                >
                  <div className="overflow-hidden">
                    <p className="px-5 pb-4 pt-0 text-sm text-muted leading-relaxed border-t border-border">
                      {item.answer}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Contact */}
      <section>
        <h2 className="text-sm font-bold uppercase tracking-wider text-foreground mb-4">
          Contact us
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <a
            href="https://discord.gg/csgrind"
            target="_blank"
            rel="noopener noreferrer"
            className="group rounded-xl border border-border bg-card p-5 hover:border-accent/40 hover:shadow-[0_0_24px_-4px_rgba(237,174,95,0.12)] transition-all duration-200 flex items-start gap-4"
          >
            <span className="flex items-center justify-center size-10 rounded-lg bg-accent/15 text-accent shrink-0">
              <FaDiscord className="size-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <span className="font-semibold text-foreground group-hover:text-accent transition-colors">
                Discord
              </span>
              <p className="mt-0.5 text-sm text-muted">
                Join our server for help, reports, and community.
              </p>
            </div>
          </a>
          <div className="rounded-xl border border-border bg-card p-5 flex items-start gap-4 opacity-80">
            <span className="flex items-center justify-center size-10 rounded-lg bg-muted/20 text-muted shrink-0">
              <HiMail className="size-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <span className="font-semibold text-foreground">Email support</span>
              <p className="mt-0.5 text-sm text-muted">
                Contact form and support email coming soon.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
