import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Mail,
  Zap,
  LayoutDashboard,
  FileScan,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
  Sun,
  X,
} from "lucide-react";

import energyBaeLogo from "../../EnergyBae Logo 28mm.jpg";

function EnergyBaeCircularLogo({ size = 128 }: { size?: number }) {
  return (
    <img
      src={energyBaeLogo}
      alt="EnergyBae Logo"
      style={{
        width: `${size}px`,
        height: `${size}px`,
        display: "block",
      }}
      className="object-cover rounded-full"
    />
  );
}

// ─── Tooltip for collapsed nav items ──────────────────────────────────────────
function NavTooltip({ label, children }: { label: string; children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  return (
    <div
      className="relative flex items-center w-full"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      <AnimatePresence>
        {visible && (
          <motion.div
            initial={{ opacity: 0, x: -6, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -6, scale: 0.95 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute left-full ml-3 z-50 pointer-events-none"
          >
            <div className="relative bg-[var(--bg-card)] border border-[var(--border-strong)] text-[var(--text-primary)] text-xs font-semibold font-display px-3 py-1.5 rounded-lg shadow-xl whitespace-nowrap transition-colors duration-300">
              {label}
              <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-[var(--border-strong)] transition-colors duration-300" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface SidebarProps {
  confidenceThreshold: number;
  setConfidenceThreshold: (val: number) => void;
  selectedModel: string;
  setSelectedModel: (model: string) => void;
  activeTab: "overview" | "ocr" | "sizing";
  setActiveTab: (tab: "overview" | "ocr" | "sizing") => void;
  isCollapsed: boolean;
  setIsCollapsed: (val: boolean) => void;
  fileLoaded: boolean;
  hasExtractedData: boolean;
  isMobileOpen: boolean;
  onCloseMobile: () => void;
}

export default function Sidebar({
  activeTab,
  setActiveTab,
  isCollapsed,
  setIsCollapsed,
  fileLoaded,
  hasExtractedData,
  isMobileOpen,
  onCloseMobile,
}: SidebarProps) {
  // On mobile the drawer always shows full labels/content, regardless of the
  // desktop-only collapsed/expanded state (which defaults to collapsed).
  const showExpanded = isMobileOpen || !isCollapsed;
  useEffect(() => {
    fetch("/api/status").catch(() => {});
  }, []);

  const navItems = [
    {
      id: "overview",
      name: "Overview",
      icon: LayoutDashboard,
      badge: hasExtractedData ? "Live" : null,
      badgeColor: "bg-[var(--accent-green)]/20 text-[var(--accent-green)]",
    },
    {
      id: "ocr",
      name: "AI OCR Scanner",
      icon: FileScan,
      badge: fileLoaded ? "Loaded" : null,
      badgeColor: "bg-[var(--accent-green)]/20 text-[var(--accent-green)]",
    },
    {
      id: "sizing",
      name: "Solar Analytics",
      icon: TrendingUp,
      badge: hasExtractedData ? "Calculated" : null,
      badgeColor: "bg-amber-500/10 text-amber-500",
    },
  ] as const;

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

    <motion.aside
      className={`max-md:fixed md:relative inset-y-0 left-0 z-50 md:z-30 w-[280px] ${isCollapsed ? "md:w-[72px]" : "md:w-[320px]"} ${isMobileOpen ? "translate-x-0" : "-translate-x-full"} md:translate-x-0 transition-[width,transform,background-color,border-color] duration-300 ease-in-out border-r border-[var(--border-subtle)] bg-[var(--bg-surface)] flex flex-col h-screen shrink-0 text-[var(--text-primary)] select-none overflow-hidden`}
    >
      {/* Ambient glow */}
      <div className="absolute top-0 left-0 w-32 h-32 rounded-full bg-[var(--accent-green)]/5 blur-2xl pointer-events-none" />
      <div className="absolute bottom-10 left-0 w-20 h-20 rounded-full bg-[var(--accent-green)]/5 blur-2xl pointer-events-none" />

      {/* 1. HEADER — Logo & Badge */}
      <div className="border-b border-[var(--border-subtle)] bg-[var(--bg-card)]/50 relative flex-shrink-0 transition-colors duration-300">
        <AnimatePresence mode="wait">

          {/* ── EXPANDED ── */}
          {showExpanded && (
            <motion.div
              key="expanded-header"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="pt-6 pb-4 px-4 flex flex-col items-center gap-3"
            >
              {/* Circular logo with glassmorphism container + glow */}
              <div className="relative group cursor-default">
                {/* Soft glow aura */}
                <div className="absolute inset-0 rounded-full bg-gradient-to-br from-[var(--accent-green-light)]/30 via-[var(--accent-green)]/20 to-transparent blur-2xl scale-150 pointer-events-none transition-opacity duration-300 group-hover:opacity-100 opacity-70" />
                {/* Container ring */}
                <div className="relative w-[130px] h-[130px] rounded-full bg-[var(--bg-surface)]/50 border border-[var(--border-subtle)] shadow-xl flex items-center justify-center hover:scale-[1.03] transition-all duration-300 overflow-hidden">
                  <div className="absolute inset-0 rounded-full ring-1 ring-inset ring-[var(--border-strong)]/30" />
                  <EnergyBaeCircularLogo size={124} />
                </div>
              </div>

              {/* Solar Intel Engine badge */}
              <p className="text-[10px] text-[var(--accent-green)] font-mono tracking-widest font-semibold flex items-center bg-[var(--accent-green)]/10 px-3 py-1 rounded-full border border-[var(--accent-green)]/20 whitespace-nowrap transition-colors duration-300">
                <Zap className="w-3.5 h-3.5 mr-1 text-[var(--accent-green)] animate-pulse" />
                SOLAR INTEL ENGINE
              </p>
            </motion.div>
          )}

          {/* ── COLLAPSED ── */}
          {!showExpanded && (
            <motion.div
              key="collapsed-header"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.2 }}
              className="py-4 flex justify-center cursor-pointer"
              onClick={() => setIsCollapsed(false)}
              title="Expand sidebar"
            >
              <div className="relative w-[42px] h-[42px] rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-lg flex items-center justify-center hover:scale-110 hover:border-[var(--accent-green)]/40 hover:shadow-lg transition-all duration-300 overflow-hidden">
                <EnergyBaeCircularLogo size={40} />
              </div>
            </motion.div>
          )}

        </AnimatePresence>

        {/* Toggle arrow button — desktop-only collapse/expand */}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="hidden md:flex absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-[var(--bg-surface)] border border-[var(--border-strong)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent-green)] items-center justify-center shadow-xl hover:scale-110 active:scale-95 transition-all duration-150 z-40 cursor-pointer"
        >
          {isCollapsed
            ? <ChevronRight className="w-3.5 h-3.5" />
            : <ChevronLeft className="w-3.5 h-3.5" />
          }
        </button>

        {/* Close button — mobile-only, dismisses the drawer */}
        <button
          onClick={onCloseMobile}
          aria-label="Close menu"
          className="md:hidden absolute right-3 top-3 w-7 h-7 rounded-full bg-[var(--hover-bg)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center justify-center cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* 2. NAVIGATION */}
      <div className="px-3 py-4 space-y-1.5 flex-1 overflow-y-auto overflow-x-hidden">

        <AnimatePresence>
          {showExpanded && (
            <motion.div
              key="nav-label"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="px-2 pb-2 text-[10px] font-mono font-semibold tracking-wider text-[var(--text-muted)] uppercase transition-colors duration-300"
            >
              Platform Navigation
            </motion.div>
          )}
        </AnimatePresence>

        {/* Nav items */}
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

          const btn = (
            <button
              key={item.id}
              onClick={() => { setActiveTab(item.id); onCloseMobile(); }}
              className={`w-full flex items-center rounded-xl py-3 text-sm font-medium transition-all duration-200 relative group cursor-pointer ${
                showExpanded ? "justify-between px-3.5" : "justify-center px-0"
              } ${
                isActive
                  ? "bg-[var(--hover-bg)] text-[var(--text-primary)] shadow-sm border-l-2 border-[var(--accent-green)] font-semibold"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)]"
              }`}
            >
              <div className={`flex items-center min-w-0 ${showExpanded ? "space-x-3" : ""}`}>
                <Icon
                  className={`w-4 h-4 shrink-0 transition-colors duration-300 ${
                    isActive ? "text-[var(--accent-green)]" : "text-[var(--text-muted)] group-hover:text-[var(--text-secondary)]"
                  }`}
                />
                {showExpanded && (
                  <motion.span
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.18 }}
                    className="truncate font-display"
                  >
                    {item.name}
                  </motion.span>
                )}
              </div>

              {showExpanded && item.badge && (
                <span className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded-full shrink-0 ${item.badgeColor}`}>
                  {item.badge}
                </span>
              )}
            </button>
          );

          return !showExpanded ? (
            <NavTooltip key={item.id} label={item.name}>
              {btn}
            </NavTooltip>
          ) : (
            <React.Fragment key={item.id}>{btn}</React.Fragment>
          );
        })}

        <AnimatePresence>
          {showExpanded && (
            <motion.div
              key="divider"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="border-t border-[var(--border-subtle)] my-4 transition-colors duration-300"
            />
          )}
        </AnimatePresence>
      </div>

      {/* 3. FOOTER */}
      <div className="p-4 border-t border-[var(--border-subtle)] bg-[var(--bg-card)]/40 flex-shrink-0 transition-colors duration-300">
        <AnimatePresence mode="wait">
          {showExpanded ? (
            <motion.div
              key="footer-exp"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="space-y-1 text-center"
            >
              <div className="text-[10px] text-[var(--text-muted)] font-mono tracking-widest uppercase transition-colors duration-300">
                ENERGYBAE CORP PUNE
              </div>
              <div className="flex items-center justify-center text-[10px] text-[var(--text-secondary)] transition-colors duration-300">
                <span className="flex items-center hover:text-[var(--accent-green)] transition cursor-pointer">
                  <Mail className="w-3 h-3 mr-1" /> info@energybae.in
                </span>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="footer-col"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="flex justify-center"
            >
              <NavTooltip label="info@energybae.in">
                <Sun className="w-4 h-4 text-[var(--text-muted)] animate-pulse cursor-default" />
              </NavTooltip>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.aside>
    </>
  );
}
