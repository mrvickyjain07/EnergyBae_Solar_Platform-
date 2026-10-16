// src/modules/proposal/components/AddItemButton.tsx
// The one "+ Add …" button every Price Database category uses (Wire, Inverter,
// ACDB, DCDB, BOS) — outline accent style, so adding a single item looks and
// feels the same everywhere.
import React from "react";
import { Plus, X } from "lucide-react";

interface Props {
  label: string;
  onClick: () => void;
  /** For inline-form toggles: shows "Cancel" + ✕ while the form is open. */
  open?: boolean;
}

export default function AddItemButton({ label, onClick, open }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-[var(--accent-green)]/40 text-[var(--accent-green)] hover:bg-[var(--accent-green)]/10 text-sm font-medium cursor-pointer transition-colors shrink-0"
    >
      {open ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
      {open ? "Cancel" : label}
    </button>
  );
}
