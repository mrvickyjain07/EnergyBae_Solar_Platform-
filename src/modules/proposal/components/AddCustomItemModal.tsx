// src/modules/proposal/components/AddCustomItemModal.tsx
// Proper add-item dialog for the BOQ Workspace, replacing the inline row of
// bare inputs. Only name/unit/price persist to the Catalogue (CustomBosItem's
// shape — see types.ts); spec and brand are display-only hints, and qty seeds
// a BOQ override, so this dialog adds no new persisted fields.
import React, { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { X, PackagePlus } from "lucide-react";
import { sanitizePrice } from "../sanitizePrice";

export interface NewCustomItem {
  label: string;
  unit: string;
  price: number;
  qty: number;
}

const UNITS = ["Nos.", "MTS", "Set", "Pkt", "Pair", "kW", "Sqft"];

export default function AddCustomItemModal({ onCancel, onAdd }: { onCancel: () => void; onAdd: (item: NewCustomItem) => void }) {
  const [label, setLabel] = useState("");
  const [unit, setUnit] = useState("Nos.");
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState("");
  const firstField = useRef<HTMLInputElement>(null);

  useEffect(() => {
    firstField.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const canSubmit = label.trim().length > 0;
  const submit = () => {
    if (!canSubmit) return;
    onAdd({ label: label.trim(), unit: unit || "Nos.", price: sanitizePrice(price), qty: sanitizePrice(qty) });
  };

  const field = "w-full px-3 py-2 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-green)] focus:ring-2 focus:ring-[var(--accent-green)]/20 transition-all duration-200";
  const labelCls = "text-xs text-[var(--text-muted)] font-medium mb-1.5 block";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 glass-overlay" onClick={onCancel} />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
        role="dialog"
        aria-modal="true"
        aria-label="Add custom BOQ item"
        className="glass-popover relative w-full max-w-md rounded-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--border-subtle)] bg-[var(--hover-bg)]">
          <div className="flex items-center gap-2">
            <PackagePlus className="w-4 h-4 text-[var(--accent-green)]" />
            <h3 className="text-xs font-medium font-display text-[var(--text-primary)]">Add Custom BOQ Item</h3>
          </div>
          <button type="button" onClick={onCancel} aria-label="Close" className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className={labelCls} htmlFor="ci-name">Material Name *</label>
            <input id="ci-name" ref={firstField} className={field} value={label} onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Cable Trench Excavation"
              onKeyDown={(e) => { if (e.key === "Enter" && canSubmit) submit(); }} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelCls} htmlFor="ci-unit">Unit</label>
              <select id="ci-unit" className={`${field} cursor-pointer`} value={unit} onChange={(e) => setUnit(e.target.value)}>
                {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls} htmlFor="ci-qty">Quantity</label>
              <input id="ci-qty" type="number" min={0} className={field} value={qty} onChange={(e) => setQty(e.target.value)} />
            </div>
            <div>
              <label className={labelCls} htmlFor="ci-price">Unit Cost (₹)</label>
              <input id="ci-price" type="number" min={0} className={field} value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0" />
            </div>
          </div>
          <p className="text-[10px] text-[var(--text-muted)] font-mono">
            Added under <span className="text-[var(--text-secondary)]">Optional / Special</span>. Rate is saved to the Price Database.
          </p>
        </div>

        <div className="flex justify-end gap-2 px-5 py-3.5 border-t border-[var(--border-subtle)] bg-[var(--hover-bg)]">
          <button type="button" onClick={onCancel}
            className="px-4 py-2 rounded-lg border border-[var(--border-strong)] text-[var(--text-secondary)] text-xs font-semibold cursor-pointer hover:text-[var(--text-primary)] transition-colors">
            Cancel
          </button>
          <button type="button" onClick={submit} disabled={!canSubmit}
            className="px-4 py-2 rounded-lg bg-[var(--accent-solid)] text-white text-xs font-bold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110 transition-all">
            Add Item
          </button>
        </div>
      </motion.div>
    </div>
  );
}
