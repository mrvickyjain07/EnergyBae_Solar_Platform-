// src/components/ui/StatusPill.tsx
// One visual language for "does this module work yet?" — used in the
// sidebar, the workflow map and planned-module pages.
import React from "react";
import type { ModuleStatus } from "../../navigation";

const STYLES: Record<ModuleStatus, { label: string; cls: string }> = {
  live: { label: "Live", cls: "bg-emerald-500/10 text-[var(--success-text)]" },
  partial: { label: "Partial", cls: "bg-[var(--solar)]/12 text-[var(--solar-text)]" },
  planned: { label: "Soon", cls: "bg-[var(--hover-bg)] text-[var(--text-muted)]" },
};

export default function StatusPill({ status, className = "" }: { status: ModuleStatus; className?: string }) {
  const s = STYLES[status];
  return (
    <span className={`inline-flex items-center text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-md ${s.cls} ${className}`}>
      {s.label}
    </span>
  );
}
