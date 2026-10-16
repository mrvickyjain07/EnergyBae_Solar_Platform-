// src/components/Sidebar.tsx
// The app's single navigation surface. Pattern from 21st.dev "Sidebar"
// (@wensity): sections, count badges, an icon rail when collapsed, and an
// ANIMATED active item — the highlight slides between rows (shared layoutId)
// instead of jumping. The user, theme and sign-out live in the top bar
// (Navbar.tsx), the SaaS convention.
//
// Sections and routes come from navigation.ts. Planned modules stay visible
// (so the product's shape is clear) but are dimmed and marked "Soon".
import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { PanelLeftClose, PanelLeftOpen, X, LifeBuoy, ScanLine } from "lucide-react";
import { ROUTES, visibleSections, type AppRoute } from "../navigation";
import { ROUTE_ICONS } from "../navIcons";

// Cropped from the brand files "EnergyBae Logo - 1/2 png.png" (2500px
// canvases that are ~85-97% empty padding) — see src/assets/brand/.
import brandMark from "../assets/brand/energybae-mark.png";
import brandWordmark from "../assets/brand/energybae-wordmark.png";
import { useAuth } from "../contexts/AuthContext";
import { useOrganization } from "../contexts/OrganizationContext";
import { initialsOf } from "./Navbar";

// Collapsed-rail tooltip — the only place labels exist when collapsed.
function NavTooltip({ label, children }: { label: string; children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative flex items-center w-full" onMouseEnter={() => setVisible(true)} onMouseLeave={() => setVisible(false)}>
      {children}
      <AnimatePresence>
        {visible && (
          <motion.div
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute left-full ml-2 z-50 pointer-events-none"
          >
            <div className="glass-popover text-[var(--text-primary)] text-xs font-medium px-2 py-1 rounded-md whitespace-nowrap">{label}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface SidebarProps {
  route: AppRoute;
  onGo: (route: AppRoute) => void;
  isCollapsed: boolean;
  setIsCollapsed: (val: boolean) => void;
  fileLoaded: boolean;
  hasExtractedData: boolean;
  isMobileOpen: boolean;
  onCloseMobile: () => void;
  /** Finalised proposals awaiting review — shown as a badge for admins. */
  reviewCount?: number;
}

export default function Sidebar({
  route,
  onGo,
  isCollapsed,
  setIsCollapsed,
  fileLoaded,
  hasExtractedData,
  isMobileOpen,
  onCloseMobile,
  reviewCount = 0,
}: SidebarProps) {
  // Hover-to-peek: while collapsed, hovering (or tabbing into) the rail opens
  // it as an OVERLAY — the layout slot stays 64px so page content never jumps.
  // A short intent delay stops it flashing open when the cursor just passes.
  const [peek, setPeek] = useState(false);
  const peekTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const schedulePeek = (open: boolean, ms: number) => {
    if (peekTimer.current) clearTimeout(peekTimer.current);
    peekTimer.current = setTimeout(() => setPeek(open), ms);
  };
  useEffect(() => () => { if (peekTimer.current) clearTimeout(peekTimer.current); }, []);
  useEffect(() => { if (!isCollapsed) setPeek(false); }, [isCollapsed]);
  const peeking = isCollapsed && peek && !isMobileOpen;

  // The mobile drawer always shows labels, whatever the desktop collapse state.
  const expanded = isMobileOpen || !isCollapsed || peeking;
  const { can } = useAuth();
  const { org } = useOrganization();
  const customBrand = !!(org?.logoDataUrl || org?.companyName);

  const badgeFor = (r: AppRoute): string | null =>
    r === "bill-analysis" ? (hasExtractedData ? "Ready" : fileLoaded ? "Loaded" : null) : null;
  const countFor = (r: AppRoute): number => (r === "proposals" && can("proposal.approve") ? reviewCount : 0);

  const renderItem = (id: AppRoute) => {
    const meta = ROUTES[id];
    const Icon = ROUTE_ICONS[id];
    const planned = meta.status === "planned";
    const item = { id, name: meta.label, badge: badgeFor(id), count: countFor(id) };
    const active = route === id;
    const btn = (
      <button
        key={item.id}
        type="button"
        onClick={() => { onGo(item.id); onCloseMobile(); }}
        aria-current={active ? "page" : undefined}
        className={`relative w-full h-9 flex items-center gap-2.5 rounded-lg text-sm cursor-pointer transition-colors ${
          expanded ? "px-2.5" : "justify-center px-0"
        } ${active ? "text-[var(--text-primary)] font-medium" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)]"}`}
      >
        {/* The sliding highlight: one element shared across items via layoutId. */}
        {active && (
          <motion.span
            layoutId="sidebar-active"
            transition={{ type: "spring", stiffness: 500, damping: 38 }}
            className="absolute inset-0 rounded-lg bg-[var(--hover-bg)]"
            aria-hidden
          >
            <span className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-[3px] rounded-r-full bg-[var(--accent-green)]" />
          </motion.span>
        )}
        <Icon className={`relative w-[18px] h-[18px] shrink-0 ${active ? "text-[var(--accent-green)]" : "text-[var(--text-muted)]"} ${planned && !active ? "opacity-60" : ""}`} />
        {expanded && <span className={`relative flex-1 text-left truncate ${planned && !active ? "opacity-70" : ""}`}>{item.name}</span>}
        {expanded && planned && (
          <span className="relative text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-md bg-[var(--hover-bg)] text-[var(--text-muted)]">Soon</span>
        )}
        {expanded && item.badge && (
          <span className="relative text-[11px] font-medium px-1.5 py-0.5 rounded-md bg-[var(--accent-green)]/10 text-[var(--accent-green)]">{item.badge}</span>
        )}
        {!!item.count && item.count > 0 && (
          expanded ? (
            <span className="relative min-w-5 h-5 px-1.5 rounded-full bg-[var(--accent-solid)] text-white text-[11px] font-semibold leading-5 text-center">
              {item.count > 99 ? "99+" : item.count}
            </span>
          ) : (
            <span className="absolute top-1.5 right-2.5 size-2 rounded-full bg-[var(--accent-solid)] ring-2 ring-[var(--bg-surface)]" aria-label={`${item.count} pending`} />
          )
        )}
      </button>
    );
    const label = item.count ? `${item.name} (${item.count})` : planned ? `${item.name} — coming soon` : item.name;
    return expanded ? <React.Fragment key={item.id}>{btn}</React.Fragment> : <NavTooltip key={item.id} label={label}>{btn}</NavTooltip>;
  };

  const sectionLabel = (text: string) =>
    expanded
      ? <div className="px-2.5 pt-5 pb-1.5 text-xs font-medium text-[var(--text-muted)]">{text}</div>
      : <div className="my-3 mx-2 border-t border-[var(--border-subtle)]" />;

  const footerBtn = `w-full h-9 flex items-center gap-2.5 rounded-lg text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)] cursor-pointer ${expanded ? "px-2.5" : "justify-center"}`;

  return (
    <>
      {/* Mobile backdrop — tapping it closes the drawer */}
      <AnimatePresence>
        {isMobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/50 md:hidden"
            onClick={onCloseMobile}
          />
        )}
      </AnimatePresence>

      {/* Layout slot: reserves the collapsed/expanded width on desktop. The
          aside inside is absolutely positioned so a hover-peek can overlay
          the page instead of pushing it. */}
      <div className={`relative shrink-0 md:h-screen transition-[width] duration-200 ease-out ${isCollapsed ? "md:w-[64px]" : "md:w-[248px]"}`}>
      <aside
        onMouseEnter={() => isCollapsed && schedulePeek(true, 150)}
        onMouseLeave={() => schedulePeek(false, 120)}
        onFocus={() => isCollapsed && schedulePeek(true, 0)}
        onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) schedulePeek(false, 0); }}
        // z-50 on desktop too: the top bar is z-40 and comes later in the
        // DOM, so at equal z it painted over the peeked sidebar's brand row.
        className={`max-md:fixed md:absolute inset-y-0 left-0 z-50 w-[248px] ${isCollapsed && !peeking ? "md:w-[64px]" : "md:w-[248px]"} ${
          isMobileOpen ? "translate-x-0" : "-translate-x-full"
        } md:translate-x-0 transition-[width,transform,box-shadow] duration-200 ease-out border-r border-[var(--border-subtle)] bg-[var(--bg-surface)] flex flex-col h-screen select-none overflow-hidden ${
          peeking ? "md:shadow-2xl" : ""
        }`}
      >
        {/* Brand */}
        <div className={`h-14 flex items-center gap-2.5 border-b border-[var(--border-subtle)] shrink-0 ${expanded ? "px-3" : "justify-center"}`}>
          {customBrand ? (
            // Company branding from Settings (organization_settings).
            <>
              {org!.logoDataUrl ? (
                <img src={org!.logoDataUrl} alt={org!.companyName || "Company logo"}
                  className={`h-8 object-contain shrink-0 ${expanded && org!.companyName ? "max-w-[56px]" : expanded ? "max-w-[180px]" : "w-8"}`} />
              ) : (
                <span className="size-8 rounded-lg bg-[var(--accent-solid)] text-white text-xs font-semibold grid place-items-center shrink-0">
                  {initialsOf(org!.companyName || "")}
                </span>
              )}
              {expanded && org!.companyName && (
                <div className="flex-1 min-w-0 text-sm font-semibold text-[var(--text-primary)] truncate">{org!.companyName}</div>
              )}
              {expanded && !org!.companyName && <div className="flex-1" />}
            </>
          ) : expanded ? (
            <div className="flex-1 min-w-0 flex items-center">
              <img src={brandWordmark} alt="EnergyBae" className="h-[22px] w-auto max-w-full object-contain object-left" />
            </div>
          ) : (
            <img src={brandMark} alt="EnergyBae" className="h-7 w-auto object-contain" />
          )}
          {expanded && (
            <>
              {peeking ? (
                // While peeking, the same corner button pins the sidebar open.
                <button type="button" onClick={() => setIsCollapsed(false)} aria-label="Pin sidebar open" title="Pin sidebar open"
                  className="hidden md:flex p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)] cursor-pointer">
                  <PanelLeftOpen className="w-4 h-4" />
                </button>
              ) : (
                <button type="button" onClick={() => setIsCollapsed(true)} aria-label="Collapse sidebar" title="Collapse sidebar"
                  className="hidden md:flex p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)] cursor-pointer">
                  <PanelLeftClose className="w-4 h-4" />
                </button>
              )}
              <button type="button" onClick={onCloseMobile} aria-label="Close menu"
                className="md:hidden p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)] cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </>
          )}
        </div>

        {/* Primary action — the SaaS "New …" button. Bill Analysis is where
            nearly every job starts, so it gets the one accent button. */}
        <div className="px-2 pt-3 shrink-0">
          {expanded ? (
            <button
              type="button"
              onClick={() => { onGo("bill-analysis"); onCloseMobile(); }}
              className="w-full h-9 inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--accent-solid)] text-white text-sm font-medium shadow-sm hover:opacity-90 cursor-pointer"
            >
              <ScanLine className="w-4 h-4" /> Scan a bill
            </button>
          ) : (
            <NavTooltip label="Scan a bill">
              <button
                type="button"
                onClick={() => onGo("bill-analysis")}
                aria-label="Scan a bill"
                className="w-full h-9 flex items-center justify-center rounded-lg bg-[var(--accent-solid)] text-white shadow-sm hover:opacity-90 cursor-pointer"
              >
                <ScanLine className="w-4 h-4" />
              </button>
            </NavTooltip>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2 pb-3" aria-label="Main">
          {visibleSections(can).map((sec, i) => (
            <React.Fragment key={sec.label ?? `top-${i}`}>
              {sec.label ? sectionLabel(sec.label) : <div className="pt-3" />}
              <div className="space-y-0.5">{sec.items.map(renderItem)}</div>
            </React.Fragment>
          ))}
        </nav>

        {/* Footer: help + (collapsed) expand */}
        <div className="border-t border-[var(--border-subtle)] p-2 space-y-0.5 shrink-0">
          {expanded ? (
            <a href="mailto:info@energybae.in" className={footerBtn}>
              <LifeBuoy className="w-[18px] h-[18px] text-[var(--text-muted)]" /> Help &amp; support
            </a>
          ) : (
            <>
              <NavTooltip label="Help & support">
                <a href="mailto:info@energybae.in" aria-label="Help & support" className={footerBtn}>
                  <LifeBuoy className="w-[18px] h-[18px] text-[var(--text-muted)]" />
                </a>
              </NavTooltip>
              <NavTooltip label="Expand sidebar">
                <button type="button" onClick={() => setIsCollapsed(false)} aria-label="Expand sidebar" className={footerBtn}>
                  <PanelLeftOpen className="w-[18px] h-[18px] text-[var(--text-muted)]" />
                </button>
              </NavTooltip>
            </>
          )}
        </div>
      </aside>
      </div>
    </>
  );
}
