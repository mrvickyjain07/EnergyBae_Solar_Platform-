// src/components/SegmentedTabs.tsx
// Segmented control — pattern from 21st.dev "Segmented Tabs" (@micka_design):
// a selected-tab background that SLIDES between options, plus a fluid hover
// highlight that follows the cursor. Both are shared-layout motion elements
// (layoutId), so switching animates instead of jumping.
import React, { useId, useState } from "react";
import { motion } from "motion/react";

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
}

interface Props<T extends string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel: string;
}

export default function SegmentedTabs<T extends string>({ options, value, onChange, ariaLabel }: Props<T>) {
  const id = useId();
  const [hovered, setHovered] = useState<T | null>(null);

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      onMouseLeave={() => setHovered(null)}
      className="inline-flex items-center gap-1 p-1 rounded-xl bg-[var(--hover-bg)] border border-[var(--border-subtle)]"
    >
      {options.map((o) => {
        const active = o.value === value;
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            onMouseEnter={() => setHovered(o.value)}
            className={`relative h-9 px-4 rounded-lg text-sm font-medium inline-flex items-center gap-2 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-green)] transition-colors ${
              active ? "text-white" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            {hovered === o.value && !active && (
              <motion.span layoutId={`${id}-hover`} className="absolute inset-0 rounded-lg bg-[var(--bg-card)]" transition={{ type: "spring", stiffness: 500, damping: 40 }} aria-hidden />
            )}
            {active && (
              <motion.span layoutId={`${id}-active`} className="absolute inset-0 rounded-lg bg-[var(--accent-solid)] shadow-sm" transition={{ type: "spring", stiffness: 450, damping: 34 }} aria-hidden />
            )}
            {Icon && <Icon className="relative w-4 h-4" />}
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
