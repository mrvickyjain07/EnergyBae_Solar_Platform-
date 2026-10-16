// src/components/CommandPalette.tsx
// Header search + ⌘K / Ctrl+K palette. Pattern from 21st.dev "Command
// Palette" (@rafa-porto, Raycast-style): grouped results, arrow-key
// navigation, animated glass overlay. Searches REAL things — pages, their
// sub-sections (Price DB categories, BOQ steps, bill categories) and saved
// proposals — so the box is never decoration. Matching lives in the tested,
// pure commandSearch.ts.
//
// Keyboard is handled at window level while open (not on the input alone),
// so arrows/Enter/Esc work even if focus drifts; hover only takes over the
// selection when the mouse genuinely moves, so it can't fight the arrows.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import {
  Search, CornerDownLeft, FileText, ArrowUp, ArrowDown,
  Home, Building, Factory, Layers, Zap, ShieldCheck, Plug, Package, DollarSign, Cable, Calculator, ChevronRight,
} from "lucide-react";
import { searchCommands, CommandItem } from "../commandSearch";
import type { FeedProposal } from "../notifications";
import { timeAgo } from "../overviewStats";
import { CALC_STEP_LIST, CalcStep } from "../modules/proposal/components/StepNav";
import { PRICE_DB_CATEGORIES, PriceDbCategory } from "../modules/proposal/components/PriceDatabase";

import { ROUTES, NAV_SECTIONS, canAccess, type AppRoute } from "../navigation";
import { ROUTE_ICONS } from "../navIcons";

/** A sub-section jump target, resolved by App.tsx. */
export type NavTarget =
  | { tab: "ocr"; category: "home" | "society" | "commercial"; mode?: "single" | "batch" }
  | { tab: "proposal"; view: "calculator" | "database"; step?: CalcStep; db?: PriceDbCategory };

type Icon = React.ComponentType<{ className?: string }>;
interface Entry extends CommandItem { icon: Icon; run: () => void }

interface Props {
  proposals: FeedProposal[] | null;
  can: (permission: string) => boolean;
  onGoTo: (route: AppRoute) => void;
  onNavigate: (target: NavTarget) => void;
  onOpenProposal: (proposalNo: string) => void;
}

const DB_ICONS: Record<PriceDbCategory, Icon> = { inverters: Zap, acdb: ShieldCheck, dcdb: Plug, bos: Package, charges: DollarSign, wires: Cable };
const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

export default function CommandPalette({ proposals, can, onGoTo, onNavigate, onOpenProposal }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastPointer = useRef<{ x: number; y: number } | null>(null);

  // Global shortcut: ⌘K on Mac, Ctrl+K elsewhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    if (!open) return;
    setQuery(""); setActive(0); lastPointer.current = null;
    // Focus after the portal mounts (autoFocus alone can lose to the trigger).
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  const entries: Entry[] = useMemo(() => {
    const page = (id: AppRoute, keywords?: string): Entry => ({
      id: `page:${id}`, group: "Pages", title: ROUTES[id].label,
      subtitle: ROUTES[id].status === "planned" ? `Coming soon · ${ROUTES[id].description}` : ROUTES[id].description,
      keywords, icon: ROUTE_ICONS[id], run: () => onGoTo(id),
    });
    const section = (id: string, title: string, subtitle: string, icon: Icon, target: NavTarget, keywords?: string): Entry =>
      ({ id: `section:${id}`, group: "Sections", title, subtitle, keywords, icon, run: () => onNavigate(target) });

    const KEYWORDS: Partial<Record<AppRoute, string>> = {
      "bill-analysis": "scan upload ocr",
      boq: "calculator quote price proposal maker",
      proposals: "quotes review approve",
      catalogue: "price database inverter acdb dcdb bos",
      pricing: "price database wire charges margin",
      team: "users access",
    };
    const pages: Entry[] = NAV_SECTIONS.flatMap((sec) => sec.items)
      .filter((r) => canAccess(r, can))
      .map((r) => page(r, KEYWORDS[r]));

    const sections: Entry[] = [
      section("bill-home", "Home", "Bill Analysis › Home", Home, { tab: "ocr", category: "home" }, "residential lt house"),
      section("bill-society", "Society", "Bill Analysis › Society", Building, { tab: "ocr", category: "society" }, "housing common meter"),
      section("bill-ci", "Commercial & Industrial", "Bill Analysis › Commercial & Industrial", Factory, { tab: "ocr", category: "commercial", mode: "single" }, "ht tod commercial industrial"),
      section("bill-batch", "Several bills", "Bill Analysis › Commercial & Industrial › Batch", Layers, { tab: "ocr", category: "commercial", mode: "batch" }, "batch bulk multiple drive"),
      ...CALC_STEP_LIST.map((s) =>
        section(`step-${s.id}`, s.label, `BOQ › ${s.label}`, Calculator, { tab: "proposal", view: "calculator", step: s.id }, "boq calculator step"),
      ),
      ...(can("catalogue.update") || can("pricing.update")
        ? [
            ...PRICE_DB_CATEGORIES.filter((c) => can(c.id === "wires" || c.id === "charges" ? "pricing.update" : "catalogue.update")).map((c) =>
              section(`db-${c.id}`, c.label, `${c.id === "wires" || c.id === "charges" ? "Pricing" : "Catalogue"} › ${c.label}`, DB_ICONS[c.id], { tab: "proposal", view: "database", db: c.id }, "price database"),
            ),
          ]
        : []),
    ];

    const props: Entry[] = (proposals ?? []).map((p) => ({
      id: `proposal:${p.proposal_no}`,
      group: "Proposals",
      title: p.customer_name || "Untitled customer",
      subtitle: `${p.proposal_no} · ${p.status === "final" ? "Final" : "Draft"} · ${timeAgo(p.updated_at, new Date())}`,
      keywords: p.status,
      icon: FileText,
      run: () => onOpenProposal(p.proposal_no),
    }));
    return [...pages, ...sections, ...props];
  }, [proposals, can, onGoTo, onNavigate, onOpenProposal]);

  // Empty query: pages, a handful of popular sections, 5 recent proposals.
  // Typing: everything ranked (sections included in full).
  const results: Entry[] = useMemo(() => {
    if (!query.trim()) {
      const quick = ["section:bill-ci", "section:step-boq", "section:db-wires", "section:db-inverters"];
      return [
        ...entries.filter((e) => e.group === "Pages"),
        ...quick.map((id) => entries.find((e) => e.id === id)).filter((e): e is Entry => !!e),
        ...entries.filter((e) => e.group === "Proposals").slice(0, 5),
      ];
    }
    return searchCommands(entries, query).slice(0, 25) as Entry[];
  }, [entries, query]);
  useEffect(() => setActive(0), [query]);

  const run = (e: Entry) => { setOpen(false); e.run(); };

  // Window-level keys while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") { e.preventDefault(); lastPointer.current = null; setActive((a) => Math.min(results.length - 1, a + 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); lastPointer.current = null; setActive((a) => Math.max(0, a - 1)); }
      else if (e.key === "Home") { e.preventDefault(); setActive(0); }
      else if (e.key === "End") { e.preventDefault(); setActive(Math.max(0, results.length - 1)); }
      else if (e.key === "Enter") { const r = results[active]; if (r) { e.preventDefault(); run(r); } }
      else if (e.key === "Escape") { e.preventDefault(); setOpen(false); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, results, active]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  // Only a REAL pointer move selects on hover — scrolling the list under a
  // resting cursor also fires mousemove, which used to undo arrow presses.
  const onPointerMove = (idx: number) => (e: React.MouseEvent) => {
    const prev = lastPointer.current;
    lastPointer.current = { x: e.clientX, y: e.clientY };
    if (prev && (prev.x !== e.clientX || prev.y !== e.clientY)) setActive(idx);
  };

  const kbd = "inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--hover-bg)] text-[11px] font-medium text-[var(--text-muted)]";

  let lastGroup = "";
  return (
    <>
      {/* Trigger — looks like a search field */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search (Ctrl+K)"
        className="hidden md:flex items-center gap-2.5 h-9 w-64 lg:w-72 pl-3 pr-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--hover-bg)] text-sm text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text-secondary)] transition-colors cursor-pointer"
      >
        <Search className="w-4 h-4 shrink-0" />
        <span className="flex-1 text-left truncate">Search proposals, customers…</span>
        <span className={kbd}>{isMac ? "⌘" : "Ctrl"}</span>
        <span className={kbd}>K</span>
      </button>
      <button type="button" onClick={() => setOpen(true)} aria-label="Search"
        className="md:hidden h-9 w-9 inline-flex items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] cursor-pointer">
        <Search className="w-[18px] h-[18px]" />
      </button>

      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              key="cmdk"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}
              className="fixed inset-0 z-[80] glass-overlay flex items-start justify-center p-4 pt-[12vh]"
              onMouseDown={() => setOpen(false)}
            >
              <motion.div
                role="dialog" aria-modal="true" aria-label="Search"
                initial={{ opacity: 0, scale: 0.96, y: -8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: -8 }}
                transition={{ type: "spring", stiffness: 420, damping: 32 }}
                onMouseDown={(e) => e.stopPropagation()}
                className="glass-popover w-full max-w-xl rounded-2xl overflow-hidden"
              >
                <div className="flex items-center gap-3 px-4 border-b border-[var(--border-subtle)]">
                  <Search className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
                  <input
                    ref={inputRef}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search proposals, customers, pages…"
                    className="flex-1 h-14 bg-transparent text-[15px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none"
                    role="combobox" aria-expanded="true" aria-controls="cmdk-list" aria-autocomplete="list"
                    aria-activedescendant={results[active] ? `cmdk-${active}` : undefined}
                  />
                  <span className={kbd}>Esc</span>
                </div>

                <div ref={listRef} id="cmdk-list" role="listbox" className="max-h-[50vh] overflow-y-auto p-2">
                  {results.length === 0 && (
                    <div className="py-10 text-center">
                      <p className="text-sm font-medium text-[var(--text-primary)]">No results for “{query}”</p>
                      <p className="text-xs text-[var(--text-muted)] mt-1">Try a customer name, proposal number or section like “wire”.</p>
                    </div>
                  )}
                  {results.map((item, idx) => {
                    const header = item.group !== lastGroup ? item.group : null;
                    lastGroup = item.group;
                    const selected = idx === active;
                    const Icon = item.icon;
                    // Sections show their path as breadcrumb chips.
                    const path = item.group === "Sections" && item.subtitle ? item.subtitle.split(" › ").slice(0, -1) : null;
                    return (
                      <React.Fragment key={item.id}>
                        {header && <p className="px-2.5 pt-2.5 pb-1.5 text-[11px] font-medium text-[var(--text-muted)]">{header}</p>}
                        <div
                          id={`cmdk-${idx}`}
                          data-idx={idx}
                          role="option"
                          aria-selected={selected}
                          onMouseMove={onPointerMove(idx)}
                          onClick={() => run(item)}
                          className="relative w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-left cursor-pointer"
                        >
                          {selected && (
                            <motion.span layoutId="cmdk-active" className="absolute inset-0 rounded-lg bg-[var(--accent-green)]/10 border border-[var(--accent-green)]/20" transition={{ type: "spring", stiffness: 600, damping: 45 }} aria-hidden />
                          )}
                          <span className={`relative size-8 rounded-lg grid place-items-center shrink-0 transition-colors ${selected ? "bg-[var(--accent-solid)] text-white" : "bg-[var(--hover-bg)] text-[var(--text-muted)]"}`}>
                            <Icon className="w-4 h-4" />
                          </span>
                          <span className="relative min-w-0 flex-1">
                            <span className="block text-sm font-medium text-[var(--text-primary)] truncate">{item.title}</span>
                            {path ? (
                              <span className="flex items-center gap-1 text-xs text-[var(--text-muted)] truncate">
                                {path.map((p, i) => (
                                  <React.Fragment key={i}>
                                    {i > 0 && <ChevronRight className="w-3 h-3 shrink-0" />}
                                    <span className="truncate">{p}</span>
                                  </React.Fragment>
                                ))}
                              </span>
                            ) : (
                              item.subtitle && <span className="block text-xs text-[var(--text-muted)] truncate">{item.subtitle}</span>
                            )}
                          </span>
                          {selected && <CornerDownLeft className="relative w-4 h-4 text-[var(--text-muted)] shrink-0" />}
                        </div>
                      </React.Fragment>
                    );
                  })}
                </div>

                <div className="flex items-center gap-4 px-4 py-2.5 border-t border-[var(--border-subtle)] text-[11px] text-[var(--text-muted)]">
                  <span className="inline-flex items-center gap-1.5"><span className={kbd}><ArrowUp className="w-3 h-3" /></span><span className={kbd}><ArrowDown className="w-3 h-3" /></span> Navigate</span>
                  <span className="inline-flex items-center gap-1.5"><span className={kbd}><CornerDownLeft className="w-3 h-3" /></span> Open</span>
                  <span className="ml-auto">{proposals ? `${proposals.length} proposal${proposals.length === 1 ? "" : "s"} searchable` : "Loading proposals…"}</span>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
