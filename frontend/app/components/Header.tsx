"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { FaSteam } from "react-icons/fa";
import {
  HiArrowRightOnRectangle,
  HiUser,
  HiBars3,
  HiXMark,
} from "react-icons/hi2";
import { HiFire } from "react-icons/hi";
import { useAppDispatch, useAppSelector } from "../../lib/hooks";
import { setSession, setSessionLoading } from "../../lib/slices/sessionSlice";

const navItems = [
  { href: "/", label: "Home" },
  { href: "/profile", label: "Profile" },
  { href: "/upload", label: "Upload demo" },
  { href: "/announcements", label: "Announcements" },
] as const;

function isActivePath(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function Header() {
  const dispatch = useAppDispatch();
  const pathname = usePathname();
  const isHome = pathname === "/";
  const { steamId, displayName, avatar, loading } = useAppSelector(
    (state) => state.session
  );
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const mobileNavRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const transparent = isHome && !scrolled;
  const useCardHeader =
    pathname === "/profile" ||
    pathname.startsWith("/profile/") ||
    pathname === "/announcements" ||
    pathname.startsWith("/announcements/") ||
    pathname === "/upload" ||
    pathname.startsWith("/upload/");

  useEffect(() => {
    async function fetchSession() {
      try {
        const res = await fetch("/api/auth/session");
        const data = await res.json();
        dispatch(
          setSession({
            steamId: data.steamId ?? null,
            displayName: data.displayName ?? null,
            avatar: data.avatar ?? null,
          })
        );
      } catch {
        dispatch(
          setSession({ steamId: null, displayName: null, avatar: null })
        );
      } finally {
        dispatch(setSessionLoading(false));
      }
    }
    fetchSession();
  }, [dispatch]);

  useEffect(() => {
    setMobileNavOpen(false);
    setUserMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileNavOpen]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (dropdownRef.current && !dropdownRef.current.contains(target)) {
        setUserMenuOpen(false);
      }
      if (mobileNavRef.current && !mobileNavRef.current.contains(target)) {
        setMobileNavOpen(false);
      }
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setUserMenuOpen(false);
        setMobileNavOpen(false);
      }
    }
    document.addEventListener("click", handleClickOutside);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("click", handleClickOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, []);

  return (
    <header
      className={`absolute top-0 z-40 w-full transition-[background-color,border-color,backdrop-filter] duration-300 ${
        transparent
          ? "border-b border-transparent bg-transparent"
          : useCardHeader
            ? "border-b border-border bg-[#18181b]"
            : "border-b border-border/80 bg-background/80 backdrop-blur-xl"
      }`}
    >
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:h-16 sm:px-6">
        <Link
          href="/"
          className="flex min-w-0 shrink-0 items-center gap-2 font-semibold transition-colors hover:opacity-90"
        >
          <HiFire className="size-5 shrink-0 text-accent sm:size-6" aria-hidden />
          <span className="truncate font-mono text-base tracking-tight text-accent sm:text-lg mt-1.5">
            CSGrind
          </span>
        </Link>

        <nav
          className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-1 md:flex"
          aria-label="Main"
        >
          {navItems.map((item) => {
            const active = isActivePath(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "bg-white/10 text-foreground"
                    : "text-muted hover:text-foreground"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          {loading ? (
            <span className="text-xs text-muted sm:text-sm">Loading…</span>
          ) : steamId ? (
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setUserMenuOpen((prev) => !prev);
                  setMobileNavOpen(false);
                }}
                className="flex cursor-pointer items-center gap-2 rounded-full focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-background"
                aria-expanded={userMenuOpen}
                aria-haspopup="true"
                aria-label="User menu"
              >
                {avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={avatar}
                    alt={displayName ?? "User avatar"}
                    width={36}
                    height={36}
                    className="h-8 w-8 rounded-full border-2 border-border object-cover sm:h-9 sm:w-9"
                  />
                ) : (
                  <span
                    className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-border bg-[#232323] text-sm font-medium text-[#f9f0f0] sm:h-9 sm:w-9"
                    aria-hidden
                  >
                    {displayName?.charAt(0)?.toUpperCase() ?? "?"}
                  </span>
                )}
              </button>

              {userMenuOpen && (
                <div
                  className="absolute right-0 top-full z-50 mt-2 w-52 rounded-xl border border-border bg-card py-1 shadow-lg"
                  role="menu"
                >
                  <Link
                    href="/profile"
                    className="flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-muted/80"
                    role="menuitem"
                    onClick={() => setUserMenuOpen(false)}
                  >
                    <HiUser className="size-4 shrink-0 text-muted" />
                    Profile
                  </Link>
                  <div className="my-1 border-t border-border" role="separator" />
                  <form action="/api/auth/signout" method="post" className="block">
                    <button
                      type="submit"
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-muted/80"
                      role="menuitem"
                    >
                      <HiArrowRightOnRectangle className="size-4 shrink-0 text-muted" />
                      Sign out
                    </button>
                  </form>
                </div>
              )}
            </div>
          ) : (
            <Link
              href="/api/auth/steam"
              className="hidden items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover sm:inline-flex"
              aria-label="Sign in with Steam"
            >
              <FaSteam className="size-4 shrink-0" />
              Sign in with Steam
            </Link>
          )}

          <div className="relative md:hidden" ref={mobileNavRef}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setMobileNavOpen((prev) => !prev);
                setUserMenuOpen(false);
              }}
              className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-white/5 hover:text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
              aria-expanded={mobileNavOpen}
              aria-controls="mobile-nav"
              aria-label={mobileNavOpen ? "Close menu" : "Open menu"}
            >
              {mobileNavOpen ? (
                <HiXMark className="size-5" />
              ) : (
                <HiBars3 className="size-5" />
              )}
            </button>

            {mobileNavOpen && (
              <div
                id="mobile-nav"
                className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-xl border border-border bg-card shadow-xl"
                role="navigation"
                aria-label="Mobile"
              >
                <ul className="py-1">
                  {navItems.map((item) => {
                    const active = isActivePath(pathname, item.href);
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          onClick={() => setMobileNavOpen(false)}
                          className={`block px-4 py-2.5 text-sm font-medium transition-colors ${
                            active
                              ? "bg-accent/15 text-accent"
                              : "text-foreground hover:bg-white/5"
                          }`}
                        >
                          {item.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
                {!loading && !steamId && (
                  <div className="border-t border-border p-2">
                    <Link
                      href="/api/auth/steam"
                      className="flex w-full items-center justify-center gap-2 rounded-full bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
                      aria-label="Sign in with Steam"
                      onClick={() => setMobileNavOpen(false)}
                    >
                      <FaSteam className="size-4 shrink-0" />
                      Sign in with Steam
                    </Link>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
