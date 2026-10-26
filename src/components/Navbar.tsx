// src/components/Navbar.tsx
// App top bar: page title on the left; notifications, theme and the profile
// menu on the right (the SaaS convention — the user block used to sit at the
// bottom of the sidebar). Patterns from 21st.dev: "Notifications" bell with
// unread badge and popover list (@ruixen.ui), "User Profile Dropdown Menu"
// (@shadcnspace), rebuilt on the app's tokens + glass popovers.
//
// Notifications are derived from real proposal state (notifications.ts);
// read/unread is remembered per browser in localStorage.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Menu, Bell, Sun, Moon, Settings, Users, LifeBuoy, CheckCheck,
  Clock, CheckCircle2, AlertCircle, ChevronDown, ChevronRight, Building2, Check,
} from "lucide-react";
import CommandPalette, { NavTarget } from "./CommandPalette";
import { useTheme } from "../contexts/ThemeContext";
import { useAuth } from "../contexts/AuthContext";
import { useOrganization } from "../contexts/OrganizationContext";
import { buildNotifications, AppNotification, FeedProposal } from "../notifications";
import { timeAgo } from "../overviewStats";

import { ROUTES, type AppRoute } from "../navigation";

interface NavbarProps {
  route: AppRoute;
  onGo: (route: AppRoute) => void;
  /** Opens the admin review queue on the Proposals page. */
  onOpenReviews: () => void;
  onOpenMobileMenu: () => void;
  proposals: FeedProposal[] | null;
  /** Opens a saved proposal in the Proposal Maker (from the search palette). */
  onOpenProposal: (proposalNo: string) => void;
  /** Sub-sections of the current page (e.g. ["Price Database", "Wire Prices"]). */
  breadcrumb: string[];
  onNavigate: (target: NavTarget) => void;
}

// Close a popover on outside click or Escape.
function useDismiss(ref: React.RefObject<HTMLElement | null>, open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) close(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [ref, open, close]);
}

const iconBtn =
  "relative h-9 w-9 inline-flex items-center justify-center rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)] cursor-pointer transition-colors";

const popIn = {
  initial: { opacity: 0, y: -6, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -6, scale: 0.98 },
  transition: { duration: 0.14 },
};

const KIND_ICON: Record<AppNotification["kind"], { icon: typeof Clock; cls: string }> = {
  awaiting_review: { icon: Clock, cls: "text-amber-500 bg-amber-500/10" },
  approved: { icon: CheckCircle2, cls: "text-emerald-500 bg-emerald-500/10" },
  needs_changes: { icon: AlertCircle, cls: "text-red-500 bg-red-500/10" },
};

export function initialsOf(name: string) {
  return name.split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "?";
}

// ── Notifications ─────────────────────────────────────────────────────────────
function NotificationsMenu({ items, storageScope, onOpenItem }: { items: AppNotification[]; storageScope: string; onOpenItem: (n: AppNotification) => void }) {
  // Per user AND company — proposal numbers are only unique within a company.
  const storageKey = `energybae-read-notifications:${storageScope}`;
  const [open, setOpen] = useState(false);
  const [readIds, setReadIds] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(storageKey) || "[]")); } catch { return new Set(); }
  });
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, open, () => setOpen(false));

  const persist = (next: Set<string>) => {
    setReadIds(next);
    // Keep only ids that still exist so storage can't grow forever.
    const live = [...next].filter((id) => items.some((n) => n.id === id));
    try { localStorage.setItem(storageKey, JSON.stringify(live)); } catch { /* storage full/blocked — unread state just won't persist */ }
  };
  const unread = items.filter((n) => !readIds.has(n.id)).length;
  const now = new Date();

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} aria-expanded={open} className={iconBtn}>
        <Bell className="w-[18px] h-[18px]" />
        {unread > 0 && (
          <span className="absolute top-1 right-1 min-w-4 h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold leading-4 text-center ring-2 ring-[var(--bg-surface)]">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div {...popIn} className="glass-popover absolute right-0 mt-2 w-[360px] max-w-[calc(100vw-2rem)] rounded-xl overflow-hidden z-50 origin-top-right">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]">
              <p className="text-sm font-semibold text-[var(--text-primary)]">Notifications</p>
              {unread > 0 && (
                <button type="button" onClick={() => persist(new Set(items.map((n) => n.id)))} className="inline-flex items-center gap-1 text-xs font-medium text-[var(--accent-green)] hover:underline cursor-pointer">
                  <CheckCheck className="w-3.5 h-3.5" /> Mark all as read
                </button>
              )}
            </div>
            <div className="max-h-[380px] overflow-y-auto">
              {items.length === 0 ? (
                <div className="px-4 py-10 text-center">
                  <Bell className="w-6 h-6 mx-auto text-[var(--text-muted)]" />
                  <p className="mt-2 text-sm font-medium text-[var(--text-primary)]">You're all caught up</p>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">Proposal reviews will show up here.</p>
                </div>
              ) : (
                items.map((n) => {
                  const isUnread = !readIds.has(n.id);
                  const { icon: Icon, cls } = KIND_ICON[n.kind];
                  return (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => { persist(new Set(readIds).add(n.id)); setOpen(false); onOpenItem(n); }}
                      className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-[var(--hover-bg)] border-b border-[var(--border-subtle)] last:border-b-0 cursor-pointer"
                    >
                      <span className={`mt-0.5 size-8 rounded-full grid place-items-center shrink-0 ${cls}`}><Icon className="w-4 h-4" /></span>
                      <span className="min-w-0 flex-1">
                        <span className={`block text-sm ${isUnread ? "font-semibold text-[var(--text-primary)]" : "text-[var(--text-secondary)]"}`}>{n.title}</span>
                        <span className="block text-xs text-[var(--text-muted)] truncate">{n.body}</span>
                        <span className="block text-[11px] text-[var(--text-muted)] mt-0.5">{timeAgo(n.at, now)}</span>
                      </span>
                      {isUnread && <span className="mt-2 size-2 rounded-full bg-[var(--accent-green)] shrink-0" aria-label="Unread" />}
                    </button>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}


// ── Profile ───────────────────────────────────────────────────────────────
function ProfileMenu({ onOpenSettings, onOpenUsers }: { onOpenSettings: () => void; onOpenUsers: () => void }) {
  const { user, switchOrganization, can } = useAuth();
  const { org } = useOrganization();
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, open, () => setOpen(false));
  if (!user) return null;

  const onSwitch = async (id: string) => {
    if (id === user.organization.id) return;
    setSwitching(id);
    setSwitchError(null);
    try {
      await switchOrganization(id); // reloads the page on success
    } catch (e: any) {
      setSwitchError(e.message);
      setSwitching(null);
    }
  };

  const item = "w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-[var(--text-primary)] hover:bg-[var(--hover-bg)] cursor-pointer";
  const helpEmail = org?.email || "info@energybae.in";

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-label="Account menu" aria-expanded={open}
        className="flex items-center gap-2 h-9 pl-1 pr-2 rounded-lg hover:bg-[var(--hover-bg)] cursor-pointer">
        <span className="relative size-7 rounded-full bg-[var(--accent-solid)] text-white text-[11px] font-semibold grid place-items-center">
          {initialsOf(user.name)}
          <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full bg-emerald-500 ring-2 ring-[var(--bg-surface)]" aria-hidden />
        </span>
        <span className="hidden md:block text-left leading-tight">
          <span className="block text-[13px] font-medium text-[var(--text-primary)] max-w-[140px] truncate">{user.name}</span>
          <span className="block text-[11px] text-[var(--text-muted)]">{user.roleName}</span>
        </span>
        <ChevronDown className={`hidden md:block w-4 h-4 text-[var(--text-muted)] transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div {...popIn} className="glass-popover absolute right-0 mt-2 w-64 rounded-xl p-1.5 z-50 origin-top-right">
            <div className="flex items-center gap-3 px-3 py-2.5">
              <span className="size-9 rounded-full bg-[var(--accent-solid)] text-white text-xs font-semibold grid place-items-center shrink-0">{initialsOf(user.name)}</span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-[var(--text-primary)] truncate">{user.name}</span>
                <span className="block text-xs text-[var(--text-muted)] truncate">{user.email}</span>
              </span>
            </div>
            <div className="my-1 border-t border-[var(--border-subtle)]" />
            {user.organizations.length > 1 ? (
              <div role="group" aria-label="Switch company">
                <p className="px-3 pt-1 pb-1.5 text-[11px] font-medium text-[var(--text-muted)]">Company</p>
                {user.organizations.map((o) => {
                  const current = o.id === user.organization.id;
                  return (
                    <button key={o.id} type="button" className={item} disabled={!!switching} aria-current={current ? "true" : undefined} onClick={() => void onSwitch(o.id)}>
                      <Building2 className="w-4 h-4 text-[var(--text-muted)]" />
                      <span className="flex-1 min-w-0 text-left truncate">{o.name}</span>
                      <span className="text-[11px] text-[var(--text-muted)]">{switching === o.id ? "Switching…" : o.roleName}</span>
                      {current && <Check className="w-4 h-4 text-[var(--accent-green)]" aria-label="Current company" />}
                    </button>
                  );
                })}
                {switchError && <p className="px-3 py-1 text-xs text-red-500">{switchError}</p>}
                <div className="my-1 border-t border-[var(--border-subtle)]" />
              </div>
            ) : (
              <p className="px-3 pb-1.5 flex items-center gap-2 text-xs text-[var(--text-muted)]">
                <Building2 className="w-3.5 h-3.5" /> <span className="truncate">{user.organization.name}</span>
              </p>
            )}
            <button type="button" className={item} onClick={() => { setOpen(false); onOpenSettings(); }}>
              <Settings className="w-4 h-4 text-[var(--text-muted)]" /> Settings
            </button>
            {can("user.view") && (
              <button type="button" className={item} onClick={() => { setOpen(false); onOpenUsers(); }}>
                <Users className="w-4 h-4 text-[var(--text-muted)]" /> Team
              </button>
            )}
            <a href={`mailto:${helpEmail}`} className={item} onClick={() => setOpen(false)}>
              <LifeBuoy className="w-4 h-4 text-[var(--text-muted)]" /> Help &amp; support
            </a>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Bar ────────────────────────────────────────────────────────────────
export default function Navbar({ route, onGo, onOpenReviews, onOpenMobileMenu, proposals, onOpenProposal, breadcrumb, onNavigate }: NavbarProps) {
  const meta = ROUTES[route];
  const { theme, toggleTheme } = useTheme();
  const { user, can } = useAuth();

  const notifications = useMemo(
    () => (user && proposals ? buildNotifications(proposals, { id: user.id, canReview: can("proposal.approve") }) : []),
    [proposals, user],
  );

  return (
    <header className="sticky top-0 z-40 w-full h-14 shrink-0 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] select-none">
      <div className="h-full px-4 md:px-6 flex items-center gap-3">
        <button type="button" onClick={onOpenMobileMenu} aria-label="Open menu"
          className="md:hidden p-1.5 -ml-1 rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)] cursor-pointer">
          <Menu className="w-5 h-5" />
        </button>
        {/* Breadcrumb: page › sub-section › sub-sub-section. Pages with no
            sub-sections show their description instead. */}
        <nav aria-label="Breadcrumb" className="min-w-0 flex items-center gap-2">
          <h1 className="text-[15px] font-semibold text-[var(--text-primary)] truncate shrink-0">{meta.label}</h1>
          {breadcrumb.length > 0 ? (
            <ol className="hidden sm:flex items-center gap-2 min-w-0">
              {breadcrumb.map((crumb, i) => {
                const last = i === breadcrumb.length - 1;
                return (
                  <li key={`${i}-${crumb}`} className="flex items-center gap-2 min-w-0">
                    <ChevronRight className="w-4 h-4 shrink-0 text-[var(--text-muted)]" aria-hidden />
                    <motion.span
                      key={crumb}
                      initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.18 }}
                      aria-current={last ? "page" : undefined}
                      className={`text-[13px] truncate ${last ? "font-medium text-[var(--text-primary)]" : "text-[var(--text-muted)]"}`}
                    >
                      {crumb}
                    </motion.span>
                  </li>
                );
              })}
            </ol>
          ) : (
            <>
              <ChevronRight className="hidden lg:block w-4 h-4 shrink-0 text-[var(--text-muted)]" aria-hidden />
              <p className="hidden lg:block text-[13px] text-[var(--text-muted)] truncate">{meta.description}</p>
            </>
          )}
        </nav>

        <div className="ml-auto flex items-center gap-1">
          <div className="mr-1.5">
            <CommandPalette
              proposals={proposals}
              can={can}
              onGoTo={onGo}
              onNavigate={onNavigate}
              onOpenProposal={onOpenProposal}
            />
          </div>
          {user && (
            <NotificationsMenu
              items={notifications}
              storageScope={`${user.id}:${user.organization.id}`}
              onOpenItem={(n) => (n.kind === "awaiting_review" ? onOpenReviews() : onOpenProposal(n.proposalNo))}
            />
          )}
          <button type="button" onClick={toggleTheme} className={iconBtn}
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`} title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.span key={theme} initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.18 }}>
                {theme === "dark" ? <Moon className="w-[18px] h-[18px]" /> : <Sun className="w-[18px] h-[18px]" />}
              </motion.span>
            </AnimatePresence>
          </button>
          <span className="mx-1.5 h-6 w-px bg-[var(--border-subtle)]" aria-hidden />
          <ProfileMenu onOpenSettings={() => onGo("settings")} onOpenUsers={() => onGo("team")} />
        </div>
      </div>
    </header>
  );
}
