"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Wordmark } from "@/components/brand";
import { Avatar, TierPill } from "@/components/ui";
import type { Tier } from "@prisma/client";

export type NavItem = { href: string; label: string; badge?: number };

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

  const isActive = (href: string) =>
    pathname === href || (href !== "/dashboard" && pathname.startsWith(href));

  const links = (
    <nav className="flex flex-col gap-0.5" aria-label="Main">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          onClick={() => setOpen(false)}
          aria-current={isActive(item.href) ? "page" : undefined}
          className={`flex items-center justify-between rounded-[10px] px-3 py-2 text-sm font-medium transition ${
            isActive(item.href)
              ? "bg-pink-50 text-pink-700"
              : "text-muted hover:bg-pink-50/60 hover:text-pink-700"
          }`}
        >
          <span>{item.label}</span>
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
    <div className="border-t border-[#f3e3ec] pt-4">
      <Link
        href="/settings"
        onClick={() => setOpen(false)}
        className="flex items-center gap-2.5 rounded-[10px] px-1 py-1.5 hover:bg-pink-50/60"
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
      <div className="mt-2 px-1">
        <TierPill tier={viewer.tier} />
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
      <header className="hs-no-print sticky top-0 z-30 flex items-center justify-between border-b border-[#f3e3ec] bg-white/90 px-4 py-2.5 backdrop-blur lg:hidden">
        <Wordmark />
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="hs-mobile-nav"
          className="hs-btn hs-btn-ghost px-3"
        >
          <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
            {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
      </header>

      {open ? (
        <div
          id="hs-mobile-nav"
          className="hs-no-print sticky top-[53px] z-20 border-b border-[#f3e3ec] bg-white px-4 py-4 lg:hidden"
        >
          {links}
          <div className="mt-4">{profile}</div>
        </div>
      ) : null}

      {/* Desktop sidebar */}
      <aside className="hs-no-print hidden w-[236px] shrink-0 border-r border-[#f3e3ec] bg-white lg:flex lg:h-screen lg:flex-col lg:justify-between lg:sticky lg:top-0 lg:px-4 lg:py-5">
        <div>
          <div className="mb-6 px-1">
            <Wordmark />
          </div>
          {links}
        </div>
        {profile}
      </aside>
    </>
  );
}
