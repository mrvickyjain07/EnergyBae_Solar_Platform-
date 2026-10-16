// src/modules/proposal/components/SearchableSelect.tsx
// Type-to-narrow picker for lists a native <select> can't cope with — the
// wire catalogue is ~180 near-identical names, where the browser's
// first-letter typeahead is useless and you can only scroll.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import { FieldLabel } from "./FormField";
import { filterOptions } from "../filterOptions";

export interface SelectOption {
  value: string;
  label: string;
  /** right-aligned secondary text, e.g. the ₹/m rate */
  hint?: string;
}

interface Props {
  label: string;
  value: string;
  options: SelectOption[];
  onSelect: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  hint?: string;
}

export default function SearchableSelect({ label, value, options, onSelect, placeholder = "— select —", disabled, hint }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  const shown = useMemo(() => filterOptions(options, query, (o) => `${o.label} ${o.hint ?? ""}`), [options, query]);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => { if (open) { setQuery(""); setActive(0); input.current?.focus(); } }, [open]);
  useEffect(() => { setActive(0); }, [query]);

  const pick = (v: string) => { onSelect(v); setOpen(false); };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); setOpen(false); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, shown.length - 1)); return; }
    if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); return; }
    if (e.key === "Enter") { e.preventDefault(); if (shown[active]) pick(shown[active].value); }
  };

  return (
    <div ref={wrap} className="ss-wrap">
      <FieldLabel hint={hint}>{label}</FieldLabel>

      <button type="button" disabled={disabled} onClick={() => setOpen((o) => !o)} className="ss-trigger" aria-haspopup="listbox" aria-expanded={open}>
        <span className={selected ? "ss-value" : "ss-placeholder"}>{selected ? selected.label : placeholder}</span>
        <span className="ss-trigger-right">
          {selected && (
            // A span, not a button — a nested <button> is invalid HTML and
            // React would warn; this still stops the click reaching the trigger.
            <span
              role="button"
              tabIndex={0}
              aria-label={`Clear ${label}`}
              className="ss-clear"
              onClick={(e) => { e.stopPropagation(); onSelect(""); }}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); onSelect(""); } }}
            >
              <X size={12} />
            </span>
          )}
          <ChevronDown size={14} className="ss-chevron" />
        </span>
      </button>

      {open && (
        <div className="ss-pop">
          <div className="ss-search">
            <Search size={13} className="ss-search-icon" />
            <input
              ref={input}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Type to filter — e.g. 4 sqmm 3 core"
              aria-label={`Search ${label}`}
            />
          </div>
          <div className="ss-list" role="listbox">
            {shown.length === 0 ? (
              <div className="ss-none">No match for “{query}”</div>
            ) : (
              shown.map((o, i) => (
                <button
                  key={o.value}
                  type="button"
                  role="option"
                  aria-selected={o.value === value}
                  className={`ss-option ${i === active ? "active" : ""} ${o.value === value ? "selected" : ""}`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(o.value)}
                >
                  <span className="ss-option-label">{o.label}</span>
                  {o.hint && <span className="ss-option-hint">{o.hint}</span>}
                </button>
              ))
            )}
          </div>
          <div className="ss-count">{shown.length} of {options.length}</div>
        </div>
      )}
    </div>
  );
}
