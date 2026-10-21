"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useSyncExternalStore, type ReactNode } from "react";
import { signOut } from "next-auth/react";
import { LogOut, Menu, PanelLeftClose, PanelLeftOpen } from "lucide-react";

import { Dialog } from "@/components/ui/Dialog";
import { ToastProvider } from "@/components/ui/Toast";
import { isActive, mobileMenuPrimary, mobileTabs, moreNav, primaryNav, type NavItem } from "@/lib/navigation";
import type { MeResponse } from "@/types/cie";

import { StudentProvider, initialsFor, useStudent } from "./StudentContext";
import { VerifyEmailBanner } from "./VerifyEmailBanner";

const COLLAPSE_KEY = "cie.sidebar.collapsed";
const COLLAPSE_EVENT = "cie:sidebar";

// The collapsed preference lives in localStorage (a per-browser
// convenience). Reading it through useSyncExternalStore keeps server and
// first client render identical (expanded) and avoids hydration warnings.
function subscribeCollapsed(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(COLLAPSE_EVENT, callback);

  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(COLLAPSE_EVENT, callback);
  };
}

function readCollapsed() {
  try {
    return window.localStorage.getItem(COLLAPSE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeCollapsed(value: boolean) {
  try {
    window.localStorage.setItem(COLLAPSE_KEY, value ? "1" : "0");
  } catch {
    // Storage can be unavailable (private mode); the toggle still works
    // for this page view via the event below.
  }

  window.dispatchEvent(new Event(COLLAPSE_EVENT));
}

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2.5 rounded-xl" aria-label="NeoCity Career Explorer home">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/neocity-knight-mark.png"
        alt=""
        width={36}
        height={36}
        className="size-9 shrink-0 object-contain"
      />
      {!compact && (
        <span className="leading-tight">
          <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
            NeoCity Academy
          </span>
          <span className="font-display block text-[17px] font-semibold text-ink">Career Explorer</span>
        </span>
      )}
    </Link>
  );
}

function Avatar({ size = "md" }: { size?: "sm" | "md" }) {
  const { me, email } = useStudent();

  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent font-semibold text-white ${
        size === "sm" ? "size-8 text-xs" : "size-9 text-sm"
      }`}
    >
      {initialsFor(me.profile.preferred_name || me.profile.name || "", email)}
    </span>
  );
}

function SignOut({ compact = false }: { compact?: boolean }) {
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        void signOut({ redirectTo: "/login" }).catch(() => setBusy(false));
      }}
      title={compact ? "Sign out" : undefined}
      className={`flex items-center gap-3 rounded-xl text-sm font-medium text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-60 ${
        compact ? "size-11 justify-center" : "w-full px-3 py-2.5"
      }`}
    >
      <LogOut aria-hidden className="size-[18px]" />
      {!compact && (busy ? "Signing out…" : "Sign out")}
      {compact && <span className="sr-only">Sign out</span>}
    </button>
  );
}

function NavLink({
  item,
  pathname,
  compact,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  compact: boolean;
  onNavigate?: () => void;
}) {
  const active = isActive(pathname, item.href);
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      title={compact ? item.label : undefined}
      className={`group relative flex items-center gap-3 rounded-xl text-[15px] font-medium transition-colors ${
        compact ? "size-11 justify-center" : "px-3 py-2.5"
      } ${
        active
          ? "bg-primary-softer text-primary-ink"
          : "text-ink-muted hover:bg-surface-2 hover:text-ink"
      }`}
    >
      {active && !compact && (
        <span aria-hidden className="absolute -left-4 top-2 bottom-2 w-1 rounded-r-full bg-primary" />
      )}
      <Icon
        aria-hidden
        className={`size-[18px] shrink-0 ${active ? "text-primary" : "text-ink-soft group-hover:text-ink-muted"}`}
      />
      {compact ? <span className="sr-only">{item.label}</span> : item.label}
    </Link>
  );
}

function Sidebar({
  collapsed,
  onToggle,
  pathname,
}: {
  collapsed: boolean;
  onToggle: () => void;
  pathname: string;
}) {
  const { me, email } = useStudent();

  return (
    <aside
      className={`no-print fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-line bg-surface/80 backdrop-blur-xl transition-[width] duration-200 lg:flex ${
        collapsed ? "w-[76px] items-center px-3" : "w-[264px] px-4"
      }`}
    >
      <div className={`flex h-[72px] shrink-0 items-center ${collapsed ? "justify-center" : "justify-between"}`}>
        <BrandMark compact={collapsed} />
      </div>

      <nav aria-label="Main" className="mt-2 flex flex-col gap-1">
        {primaryNav.map((item) => (
          <NavLink key={item.href} item={item} pathname={pathname} compact={collapsed} />
        ))}
      </nav>

      <div className={`mt-6 border-t border-line pt-4 ${collapsed ? "w-full" : ""}`}>
        {!collapsed && (
          <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-soft">More</p>
        )}
        <nav aria-label="More" className={`flex flex-col gap-1 ${collapsed ? "items-center" : ""}`}>
          {moreNav(Boolean(me.is_staff)).map((item) => (
            <NavLink key={item.href} item={item} pathname={pathname} compact={collapsed} />
          ))}
        </nav>
      </div>

      <div className={`mt-auto flex flex-col gap-1 border-t border-line py-4 ${collapsed ? "items-center" : ""}`}>
        {!collapsed && (
          <div className="mb-1 flex items-center gap-3 rounded-xl px-3 py-2">
            <Avatar />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink">{me.display_name || "Student"}</p>
              <p className="truncate text-xs text-ink-muted">{email}</p>
            </div>
          </div>
        )}
        <SignOut compact={collapsed} />
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={`flex items-center gap-3 rounded-xl text-sm font-medium text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink ${
            collapsed ? "size-11 justify-center" : "w-full px-3 py-2.5"
          }`}
        >
          {collapsed ? (
            <PanelLeftOpen aria-hidden className="size-[18px]" />
          ) : (
            <>
              <PanelLeftClose aria-hidden className="size-[18px]" />
              Collapse
            </>
          )}
        </button>
      </div>
    </aside>
  );
}

function MobileTopBar({ onMenu }: { onMenu: () => void }) {
  return (
    <header className="no-print sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line/70 bg-canvas/85 px-4 backdrop-blur-xl lg:hidden">
      <BrandMark />
      <button
        type="button"
        onClick={onMenu}
        aria-label="Open menu"
        className="flex items-center gap-1.5 rounded-full border border-line bg-surface py-1 pl-1 pr-2.5"
      >
        <Avatar size="sm" />
        <Menu aria-hidden className="size-4 text-ink-muted" />
      </button>
    </header>
  );
}

function MobileTabBar({ pathname }: { pathname: string }) {
  return (
    <nav
      aria-label="Main"
      className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/92 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
    >
      <div className="mx-auto grid max-w-lg grid-cols-5">
        {mobileTabs.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex flex-col items-center gap-1 py-2.5 text-[11px] font-semibold transition-colors ${
                active ? "text-primary" : "text-ink-muted"
              }`}
            >
              <span
                className={`flex h-7 w-12 items-center justify-center rounded-full transition-colors ${
                  active ? "bg-primary-soft" : ""
                }`}
              >
                <Icon aria-hidden className="size-[19px]" />
              </span>
              {item.shortLabel ?? item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function MobileMenu({
  open,
  onClose,
  pathname,
}: {
  open: boolean;
  onClose: () => void;
  pathname: string;
}) {
  const { me, email } = useStudent();

  return (
    <Dialog open={open} onClose={onClose} title="Menu" side="left">
      <div className="flex items-center gap-3 rounded-2xl bg-surface-2 p-3">
        <Avatar />
        <div className="min-w-0">
          <p className="truncate font-semibold">{me.display_name || "Student"}</p>
          <p className="truncate text-sm text-ink-muted">{email}</p>
        </div>
      </div>
      <nav aria-label="Menu" className="mt-4 flex flex-col gap-1">
        {[...mobileMenuPrimary, ...moreNav(Boolean(me.is_staff))].map((item) => (
          <NavLink key={item.href} item={item} pathname={pathname} compact={false} onNavigate={onClose} />
        ))}
      </nav>
      <div className="mt-4 border-t border-line pt-4">
        <SignOut />
      </div>
    </Dialog>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const collapsed = useSyncExternalStore(subscribeCollapsed, readCollapsed, () => false);
  const [menuOpen, setMenuOpen] = useState(false);

  // The counselor is a full-screen experience on phones.
  const immersive = pathname.startsWith("/counselor");

  function toggle() {
    writeCollapsed(!collapsed);
  }

  return (
    <div className="min-h-dvh">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70] focus:rounded-full focus:bg-ink focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to content
      </a>

      <Sidebar collapsed={collapsed} onToggle={toggle} pathname={pathname} />

      <div className={`transition-[padding] duration-200 ${collapsed ? "lg:pl-[76px]" : "lg:pl-[264px]"}`}>
        {!immersive && <MobileTopBar onMenu={() => setMenuOpen(true)} />}

        <main
          id="main"
          className={
            immersive
              ? ""
              : "mx-auto w-full max-w-[1200px] px-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-6 sm:px-6 lg:px-10 lg:pb-16 lg:pt-10"
          }
        >
          {!immersive && <VerifyEmailBanner />}
          {children}
        </main>
      </div>

      {!immersive && <MobileTabBar pathname={pathname} />}
      <MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} pathname={pathname} />
    </div>
  );
}

export function AppShell({
  me,
  email,
  children,
}: {
  me: MeResponse;
  email: string;
  children: ReactNode;
}) {
  return (
    <StudentProvider initial={me} email={email}>
      <ToastProvider>
        <Shell>{children}</Shell>
      </ToastProvider>
    </StudentProvider>
  );
}
