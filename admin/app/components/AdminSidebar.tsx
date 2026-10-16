"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  HiHome,
  HiSpeakerphone,
  HiExclamationCircle,
  HiChip,
  HiClipboardList,
  HiServer,
  HiCog,
  HiFire,
} from "react-icons/hi";

const navByCategory = [
  {
    category: "Overview",
    items: [{ href: "/", label: "Dashboard", icon: HiHome }],
  },
  {
    category: "Content",
    items: [{ href: "/announcements", label: "Announcements", icon: HiSpeakerphone }],
  },
  {
    category: "Moderation",
    items: [
      { href: "/reports", label: "Player Reports", icon: HiExclamationCircle },
      { href: "/ai-flags", label: "AI Auto Flags", icon: HiChip },
    ],
  },
  {
    category: "Overwatch",
    items: [{ href: "/applications", label: "Applications", icon: HiClipboardList }],
  },
  {
    category: "System",
    items: [
      { href: "/services", label: "Services", icon: HiServer },
      { href: "/settings", label: "Settings", icon: HiCog },
    ],
  },
];

export default function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-56 shrink-0 border-r border-border bg-card flex flex-col h-screen sticky top-0">
      <div className="p-4 border-b border-border">
        <Link
          href="/"
          className="flex items-center gap-2 font-semibold text-foreground hover:text-accent transition-colors"
        >
          <HiFire className="size-5 text-accent shrink-0" />
          <span className="text-accent font-mono text-lg">CSGrind</span>
        </Link>
        <p className="mt-1 px-0.5 text-xs text-muted font-mono uppercase tracking-wider">
          Admin
        </p>
      </div>
      <nav className="flex-1 p-3 overflow-y-auto">
        <ul className="space-y-4">
          {navByCategory.map((section, index) => (
            <li key={section.category}>
              <p className="px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-muted/80">
                {section.category}
              </p>
              <ul className="mt-0.5 space-y-0.5">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const active =
                    item.href === "/"
                      ? pathname === "/"
                      : pathname.startsWith(item.href);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={`flex items-center gap-2 px-3 py-2 rounded rounded-l-none text-sm border-l-4 transition-colors ${
                          active
                            ? "border-l-accent bg-accent/20 text-foreground"
                            : "border-l-transparent text-muted hover:border-l-accent hover:text-foreground hover:bg-accent/20"
                        }`}
                      >
                        <Icon className="size-4 shrink-0" />
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
              {index < navByCategory.length - 1 && (
                <div className="mt-2 border-t border-accent/10" />
              )}
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}
