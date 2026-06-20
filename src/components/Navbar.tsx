import React, { useState } from "react";
import energyBaeNavbarLogo from "../../EnergyBae Logo - 2 png.png";
import { motion, AnimatePresence } from "motion/react";
import { 
  Sun,
  Moon,
  Sparkles, 
  Bell, 
  User, 
  ChevronDown, 
  Laptop, 
  Wifi, 
  Check, 
  Settings,
  HelpCircle,
  Menu,
  FileSpreadsheet
} from "lucide-react";
import { useTheme } from "../contexts/ThemeContext";

interface NavbarProps {
  activeTab: 'overview' | 'ocr' | 'sizing';
  setActiveTab: (tab: 'overview' | 'ocr' | 'sizing') => void;
  fileName: string | null;
  hasExtractedData: boolean;
  onClear: () => void;
}

export default function Navbar({
  activeTab,
  setActiveTab,
  fileName,
  hasExtractedData,
  onClear
}: NavbarProps) {
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const { theme, toggleTheme } = useTheme();

  const notifications = [
    { id: 1, title: "EnergyBae Active", desc: "Using high-precision Multimodal vision parameters for MSEDCL audits.", time: "Just now" },
    { id: 2, title: "Maharashtra Solar Slab Updated", desc: "Grid offset calibrated at ~125 Units/kW.", time: "1 hr ago" }
  ];

  return (
    <header className="sticky top-0 z-40 w-full border-b border-[var(--border-subtle)] bg-[var(--panel-glass)] backdrop-blur-md select-none transition-colors duration-300">
      <div className="max-w-7xl mx-auto px-4 md:px-8 h-16 flex items-center justify-between">
        
        {/* Left: Branded Label Info */}
        <div className="flex items-center space-x-3 w-[160px] justify-center overflow-visible">
          {/* EnergyBae Logo - Scaled up to compensate for image padding */}
          <img src={energyBaeNavbarLogo} alt="EnergyBae Navbar Logo" className="w-[280px] max-w-none object-contain pointer-events-none" />
        </div>

        {/* Center: Interactive Tabs bar list */}
        <nav className="hidden md:flex items-center space-x-1.5 bg-[var(--hover-bg)] p-1 rounded-xl border border-[var(--border-subtle)] transition-colors duration-300">
          {(['overview', 'ocr', 'sizing'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold font-display transition-all relative cursor-pointer ${
                activeTab === tab 
                  ? "bg-[var(--bg-surface)] text-[var(--accent-blue)] border border-[var(--border-strong)] shadow-sm" 
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              <span className="capitalize">{tab === 'ocr' ? 'AI OCR Scanner' : tab === 'sizing' ? 'Solar Analytics' : tab}</span>
            </button>
          ))}
        </nav>

        {/* Right: Actions, lights counters */}
        <div className="flex items-center space-x-3.5">
          {/* Status badge */}
          <div className="flex items-center space-x-1.5 bg-[var(--hover-bg)] border border-[var(--border-subtle)] px-2.5 py-1 rounded-lg text-[10px] font-mono text-[var(--accent-green)] transition-colors duration-300">
            <Wifi className="w-3 h-3 animate-pulse" />
            <span className="hidden sm:inline">LIVE GRID</span>
          </div>

          {/* Theme Switcher */}
          <button
            onClick={toggleTheme}
            className="p-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)] rounded-lg border border-[var(--border-subtle)] transition-colors cursor-pointer"
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            {theme === "dark" ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
          </button>

          {/* Notifications Trigger */}
          <div className="relative">
            <button 
              onClick={() => {
                setShowNotifications(!showNotifications);
                setShowProfileMenu(false);
              }}
              className="p-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)] rounded-lg border border-[var(--border-subtle)] transition-colors relative cursor-pointer"
            >
              <Bell className="w-4 h-4" />
              <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-[var(--accent-blue)] rounded-full"></span>
            </button>

            {/* Notification drop layout */}
            <AnimatePresence>
              {showNotifications && (
                <motion.div 
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute right-0 mt-2.5 w-72 bg-[var(--bg-card)] border border-[var(--border-strong)] rounded-2xl p-4 shadow-2xl z-50 text-left backdrop-blur-xl transition-colors duration-300"
                >
                  <div className="flex justify-between items-center pb-2 border-b border-[var(--border-subtle)] mb-2">
                    <span className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider font-display">Notifications</span>
                    <span className="text-[10px] text-[var(--accent-blue)] cursor-pointer font-mono">Mark all read</span>
                  </div>
                  <div className="space-y-3">
                    {notifications.map((n) => (
                      <div key={n.id} className="text-xs leading-relaxed space-y-0.5 border-b border-[var(--border-subtle)] pb-2 last:border-0 last:pb-0">
                        <div className="font-semibold text-[var(--text-primary)]">{n.title}</div>
                        <div className="text-[var(--text-secondary)] text-[11px]">{n.desc}</div>
                        <div className="text-[9px] text-[var(--text-muted)] font-mono mt-0.5">{n.time}</div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* User profile dropdown avatar summary */}
          <div className="relative">
            <button 
              onClick={() => {
                setShowProfileMenu(!showProfileMenu);
                setShowNotifications(false);
              }}
              className="flex items-center space-x-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)] p-1.5 rounded-lg border border-[var(--border-subtle)] transition-colors cursor-pointer"
            >
              <div className="w-5 h-5 rounded-full bg-[var(--hover-bg)] border border-[var(--border-strong)] flex items-center justify-center text-[var(--accent-blue)] font-mono text-[10px] font-bold">EB</div>
              <ChevronDown className="w-3 h-3 text-[var(--text-muted)]" />
            </button>

            <AnimatePresence>
              {showProfileMenu && (
                <motion.div 
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute right-0 mt-2.5 w-56 bg-[var(--bg-card)] border border-[var(--border-strong)] rounded-2xl p-3 shadow-2xl z-50 text-left font-sans transition-colors duration-300"
                >
                  <div className="px-2.5 py-1.5 border-b border-[var(--border-subtle)] text-xs">
                    <div className="font-semibold text-[var(--text-primary)]">Registered Associate</div>
                    <div className="text-[10px] text-[var(--text-muted)] font-mono mt-0.5 truncate font-semibold">vj937379@gmail.com</div>
                  </div>
                  <div className="py-2.5 space-y-1.5">
                    <button className="w-full text-left px-2.5 py-1.5 rounded text-xs text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)] transition-colors flex items-center gap-2 cursor-pointer">
                       <Settings className="w-3.5 h-3.5" /> Security Permissions
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

        </div>

      </div>
    </header>
  );
}
