// src/components/ScannerHeader.tsx
// The standalone scanner's only chrome: brand on the left, theme toggle on
// the right. Replaces the SaaS Sidebar + Navbar (search, notifications,
// account menu, settings), none of which exist in this deployment. Layout
// adapted from 21st.dev "Navbar with Theme Toggle" (shadcnui-blocks/navbar-02),
// rewritten in plain Tailwind on the app's CSS tokens so it adds no
// Radix/shadcn dependencies.
import { Moon, Sun } from "lucide-react";
import { useTheme } from "../contexts/ThemeContext";
// Official horizontal logo (mark + ENERGYBAE), cropped from the 2500px brand file.
import brandLogo from "../assets/brand/energybae-wordmark.png";

export default function ScannerHeader() {
  const { theme, toggleTheme } = useTheme();
  return (
    <header className="sticky top-0 z-30 h-16 border-b border-[var(--border-subtle)] bg-[var(--bg-card)]/80 backdrop-blur-md">
      <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <a href="/" className="flex items-center min-w-0">
          <img src={brandLogo} alt="EnergyBae" className="h-7 sm:h-8 w-auto max-w-[200px] sm:max-w-none shrink object-contain" />
        </a>
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)] transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-green)]"
        >
          {theme === "dark" ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
        </button>
      </div>
    </header>
  );
}
