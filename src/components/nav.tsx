"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Wordmark } from "@/components/brand";
import { Avatar, TierPill } from "@/components/ui";
import { ThemeToggle } from "@/components/chrome";
import type { Tier } from "@prisma/client";

export type NavItem = { href: string; label: string; badge?: number; icon?: string };

/**
 * The portal's one navigation, in two shapes.
 *
 * Desktop gets a sticky sidebar; a phone gets a sticky top bar and a sheet that
 * slides down. Both render from the same `items` array, so a link can never
 * exist on one and not the other — and both are built from the list the server
 * decided this account may see, not filtered on the client.
 */
export function AppNav({
  items,
  viewer,
  signOutAction,
}: {
  items: NavItem[];
  viewer: {
    name: string;
    nickname: string | null;
    avatarUrl: string | null;
    tier: Tier;
    departmentName: string | null;
  };
  signOutAction: () => Promise<void>;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement | null>(null);

  // A route change closes the sheet. Without this, tapping a link on a phone
  // navigates behind a menu that is still covering the page.
  useEffect(() => setOpen(false), [pathname]);

  // While the sheet is open it owns the screen: the page behind must not scroll
  // under it, and Escape must close it.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const isActive = (href: string) =>
    pathname === href || (href !== "/dashboard" && pathname.startsWith(href));

  const links = (
    <nav className="flex flex-col gap-0.5" aria-label="Main">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={isActive(item.href) ? "page" : undefined}
          className={`group flex items-center justify-between gap-2 rounded-[10px] px-3 py-2 text-sm font-medium transition ${
            isActive(item.href)
              ? "bg-pink-50 text-pink-700"
              : "text-muted hover:bg-pink-50/60 hover:text-pink-700"
          }`}
        >
          <span className="flex min-w-0 items-center gap-2.5">
            {item.icon ? (
              <span aria-hidden="true" className="w-4 shrink-0 text-center opacity-80">
                {item.icon}
              </span>
            ) : null}
            <span className="truncate">{item.label}</span>
          </span>
          {item.badge ? (
            <span className="rounded-full bg-brand px-1.5 py-0.5 text-[11px] font-bold text-white">
              {item.badge}
            </span>
          ) : null}
        </Link>
      ))}
    </nav>
  );

  const profile = (
    <div className="border-t border-line pt-4">
      <Link
        href="/settings"
        className="flex items-center gap-2.5 rounded-[10px] px-1 py-1.5 transition hover:bg-pink-50/60"
      >
        <Avatar name={viewer.name} nickname={viewer.nickname} url={viewer.avatarUrl} size={34} />
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-sm font-semibold text-ink">
            {viewer.nickname || viewer.name}
          </span>
          <span className="block truncate text-[11px] text-faint">
            {viewer.departmentName ?? "No department"}
          </span>
        </span>
      </Link>
      <div className="mt-2 flex items-center justify-between gap-2 px-1">
        <TierPill tier={viewer.tier} />
        <ThemeToggle />
      </div>
      <form action={signOutAction} className="mt-3">
        <button type="submit" className="hs-btn hs-btn-ghost w-full justify-start px-3 text-sm">
          Sign out
        </button>
      </form>
    </div>
  );

  return (
    <>
      {/* Mobile bar */}
      <header className="hs-no-print sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-line bg-[color-mix(in_srgb,var(--hs-surface)_90%,transparent)] px-4 py-2.5 backdrop-blur lg:hidden">
        <Wordmark />
        <div className="flex items-center gap-1.5">
          <Link
            href="/search"
            className="hs-btn hs-btn-ghost px-3"
            aria-label="Search the portal"
            title="Search"
          >
            <span aria-hidden="true">⌕</span>
          </Link>
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls="hs-mobile-nav"
            className="hs-btn hs-btn-ghost px-3"
          >
            <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>
      </header>

      {open ? (
        <div
          id="hs-mobile-nav"
          ref={panel}
          className="hs-enter hs-no-print sticky top-[53px] z-20 max-h-[calc(100vh-53px)] overflow-y-auto border-b border-line bg-surface px-4 py-4 lg:hidden"
        >
          {links}
          <div className="mt-4">{profile}</div>
        </div>
      ) : null}

      {/* Desktop sidebar */}
      <aside className="hs-no-print hidden w-[236px] shrink-0 border-r border-line bg-surface lg:flex lg:sticky lg:top-0 lg:h-screen lg:flex-col lg:justify-between lg:px-4 lg:py-5">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mb-4 px-1">
            <Wordmark />
          </div>
          <NavSearch />
          {links}
        </div>
        {profile}
      </aside>
    </>
  );
}

/**
 * The sidebar search box.
 *
 * Submits to /search rather than filtering in place: the results span seven
 * kinds of record and every one of them is permission-filtered on the server,
 * which is not a decision a client-side filter could make honestly.
 */
function NavSearch() {
  const router = useRouter();
  const params = useSearchParams();
  const [value, setValue] = useState(params.get("q") ?? "");

  return (
    <form
      role="search"
      className="mb-4"
      onSubmit={(event) => {
        event.preventDefault();
        const query = value.trim();
        if (query.length > 0) router.push(`/search?q=${encodeURIComponent(query)}`);
      }}
    >
      <label htmlFor="hs-nav-search" className="sr-only">
        Search the portal
      </label>
      <input
        id="hs-nav-search"
        type="search"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Search everything…"
        className="hs-input py-2 text-sm"
        autoComplete="off"
      />
    </form>
  );
}
