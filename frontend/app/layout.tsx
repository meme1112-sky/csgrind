import type { Metadata } from "next";
import localFont from "next/font/local";
import { Geist_Mono } from "next/font/google";
import "./globals.css";
import AppShell from "./components/AppShell";
import StoreProvider from "./StoreProvider";

const exo2 = localFont({
  src: [
    { path: "./fonts/exo2-latin-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/exo2-latin-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/exo2-latin-600.woff2", weight: "600", style: "normal" },
    { path: "./fonts/exo2-latin-700.woff2", weight: "700", style: "normal" },
  ],
  display: "swap",
  variable: "--font-exo-2",
  fallback: ["ui-sans-serif", "system-ui", "sans-serif"],
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: "CS2 Player Stats, Reputation & AI Cheat Detection | CSGrind",
  description: "A complete reputation system powered by stats, demos, AI, and community reports — all in a transparent platform for evaluating players.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${exo2.variable} ${geistMono.variable} ${exo2.className}`}
    >
      <body className="antialiased">
        <StoreProvider>
          <AppShell>{children}</AppShell>
        </StoreProvider>
      </body>
    </html>
  );
}
