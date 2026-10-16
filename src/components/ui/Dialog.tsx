// src/components/ui/Dialog.tsx
// Form dialog in the app's glass-popover style (same look as
// ConfirmDeleteModal). Escape and backdrop click close it; the first field
// is focused on open; labelled for screen readers.
import React, { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import { X } from "lucide-react";

interface DialogProps {
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: "md" | "lg";
}

export default function Dialog({ title, description, onClose, children, footer, width = "md" }: DialogProps) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    requestAnimationFrame(() => panel.current?.querySelector<HTMLElement>("input, select, textarea")?.focus());
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-[60] glass-overlay flex items-center justify-center p-4" onClick={onClose}>
      <motion.div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        initial={{ opacity: 0, scale: 0.97, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        onClick={(e) => e.stopPropagation()}
        className={`glass-popover w-full ${width === "lg" ? "max-w-2xl" : "max-w-lg"} max-h-[90vh] rounded-2xl flex flex-col overflow-hidden`}
      >
        <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-[var(--border-subtle)]">
          <div>
            <h2 id={titleId} className="text-base font-semibold text-[var(--text-primary)]">{title}</h2>
            {description && <p className="text-xs text-[var(--text-muted)] mt-0.5">{description}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)] cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-6 py-5 overflow-y-auto">{children}</div>
        {footer && <div className="px-6 py-4 border-t border-[var(--border-subtle)] flex items-center justify-end gap-2">{footer}</div>}
      </motion.div>
    </motion.div>,
    document.body,
  );
}

export const fieldCls =
  "w-full h-9 px-3 rounded-lg bg-[var(--bg-card)] border border-[var(--border-strong)] text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-green)] focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent-green)_15%,transparent)]";

export function Field({ label, hint, children, wide }: { label: string; hint?: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <label className={`block ${wide ? "sm:col-span-2" : ""}`}>
      <span className="block text-xs font-medium text-[var(--text-secondary)] mb-1">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-[var(--text-muted)] mt-1">{hint}</span>}
    </label>
  );
}

export const primaryBtn = "h-9 px-4 inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--accent-solid)] text-sm font-medium text-white hover:opacity-90 cursor-pointer disabled:opacity-50";
export const secondaryBtn = "h-9 px-3.5 inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--hover-bg)] cursor-pointer disabled:opacity-50";
