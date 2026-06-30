import React from "react";
import energyBaeNavbarLogo from "../../EnergyBae Logo - 2 png.png";
import { motion, AnimatePresence } from "motion/react";
import { Sun, Moon, Menu } from "lucide-react";
import { useTheme } from "../contexts/ThemeContext";

interface NavbarProps {
  activeTab: 'overview' | 'ocr' | 'sizing';
  setActiveTab: (tab: 'overview' | 'ocr' | 'sizing') => void;
  onOpenMobileMenu: () => void;
}

export default function Navbar({
  activeTab,
  setActiveTab,
  onOpenMobileMenu
}: NavbarProps) {
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="sticky top-0 z-40 w-full border-b border-[var(--border-subtle)] bg-[var(--panel-glass)] backdrop-blur-md select-none transition-colors duration-300">
      <div className="max-w-7xl mx-auto px-4 md:px-8 h-16 flex items-center justify-between gap-2">

        {/* Left: Hamburger (mobile) + Branded Label Info */}
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={onOpenMobileMenu}
            aria-label="Open menu"
            className="md:hidden shrink-0 p-2 -ml-1 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)] transition-colors cursor-pointer"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center justify-center overflow-visible shrink-0">
            {/* EnergyBae Logo - Scaled up to compensate for image padding */}
            <img src={energyBaeNavbarLogo} alt="EnergyBae Navbar Logo" className="w-[150px] sm:w-[200px] md:w-[280px] max-w-none object-contain pointer-events-none" />
          </div>
        </div>

        {/* Center: Interactive Tabs bar list */}
        <nav className="hidden md:flex items-center space-x-1.5 bg-[var(--hover-bg)] p-1 rounded-xl border border-[var(--border-subtle)] transition-colors duration-300">
          {(['overview', 'ocr', 'sizing'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold font-display transition-colors relative cursor-pointer ${
                activeTab === tab
                  ? "text-[var(--accent-green)]"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              {activeTab === tab && (
                <motion.span
                  layoutId="navActivePill"
                  transition={{ type: "spring", stiffness: 400, damping: 32 }}
                  className="absolute inset-0 bg-gradient-to-br from-[var(--accent-green-light)]/15 to-[var(--bg-surface)] border border-[var(--accent-green)]/30 rounded-lg shadow-sm"
                />
              )}
              <span className="capitalize relative z-10">{tab === 'ocr' ? 'AI OCR Scanner' : tab === 'sizing' ? 'Solar Analytics' : tab}</span>
            </button>
          ))}
        </nav>

        {/* Right: Theme Switcher only */}
        <div className="flex items-center space-x-3.5">
          <motion.button
            whileHover={{ scale: 1.08, rotate: 8 }}
            whileTap={{ scale: 0.92 }}
            onClick={toggleTheme}
            className="p-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)] rounded-lg border border-[var(--border-subtle)] transition-colors cursor-pointer overflow-hidden"
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={theme}
                initial={{ rotate: -90, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                exit={{ rotate: 90, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="block"
              >
                {theme === "dark" ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
              </motion.span>
            </AnimatePresence>
          </motion.button>
        </div>

      </div>
    </header>
  );
}
