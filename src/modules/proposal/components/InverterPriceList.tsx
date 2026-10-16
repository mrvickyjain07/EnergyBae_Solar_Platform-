// src/modules/proposal/components/InverterPriceList.tsx
// Inverter price management screen: search/filter, inline price edit, manual-
// override toggle. Mirrors WirePriceList.tsx's shape, grouped by
// brand -> system type instead of brand -> type.
import React, { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { sanitizePrice } from "../sanitizePrice";
import { SystemType } from "../types";
import ConfirmDeleteModal from "../../../components/ConfirmDeleteModal";
import AddItemButton from "./AddItemButton";

interface InverterPriceRow {
  id: string;
  internal_name: string;
  brand: string;
  system_type: SystemType;
  phase: 1 | 3;
  kw: number;
  model: string;
  price: number;
  source: "manual" | "upload";
  manual_override: boolean;
}

const SYSTEM_TYPES: SystemType[] = ["On-Grid", "Off-Grid", "Hybrid"];

export default function InverterPriceList({ refreshSignal, onCountChange }: { refreshSignal: number; onCountChange?: (n: number) => void }) {
  const [rows, setRows] = useState<InverterPriceRow[]>([]);
  // Unfiltered row set for the Brand filter's own option list — building it
  // from `rows` instead made picking one brand erase every other brand from
  // the dropdown, since `rows` was already narrowed to that brand.
  const [allRows, setAllRows] = useState<InverterPriceRow[]>([]);
  const [search, setSearch] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [systemTypeFilter, setSystemTypeFilter] = useState("");
  const [phaseFilter, setPhaseFilter] = useState("");
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (brandFilter) params.set("brand", brandFilter);
    if (systemTypeFilter) params.set("systemType", systemTypeFilter);
    if (phaseFilter) params.set("phase", phaseFilter);
    fetch(`/api/inverter-prices?${params}`)
      .then((r) => r.json())
      .then((d) => {
        setRows(d.rows ?? []);
        onCountChange?.((d.rows ?? []).length);
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, [refreshSignal, search, brandFilter, systemTypeFilter, phaseFilter]);
  const loadAllRows = () => {
    fetch("/api/inverter-prices")
      .then((r) => r.json())
      .then((d) => setAllRows(d.rows ?? []))
      .catch(() => {});
  };
  useEffect(loadAllRows, [refreshSignal]);

  const patchRow = async (id: string, patch: Partial<Pick<InverterPriceRow, "price" | "manual_override">>) => {
    const body = "price" in patch ? { ...patch, price: sanitizePrice(patch.price) } : patch;
    const res = await fetch(`/api/inverter-prices/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const { row } = await res.json();
      setRows((rs) => rs.map((r) => (r.id === id ? row : r)));
    }
  };

  // Destructive, so each path routes through the type-to-confirm modal —
  // see WirePriceList.tsx for why.
  const [pendingDelete, setPendingDelete] = useState<{ title: string; message: string; confirmWord: string; run: () => Promise<void> } | null>(null);

  const deleteRow = (row: InverterPriceRow) => {
    setPendingDelete({
      title: "Delete inverter price",
      message: `Delete "${row.brand} ${row.model}"? This permanently removes the price row.`,
      confirmWord: "DELETE",
      run: async () => {
        const res = await fetch(`/api/inverter-prices/${row.id}`, { method: "DELETE" });
        if (res.ok) setRows((rs) => rs.filter((r) => r.id !== row.id));
        else alert("Could not delete that inverter price.");
      },
    });
  };

  const deleteGroup = (brand: string, systemType: SystemType) => {
    const count = rows.filter((r) => r.brand === brand && r.system_type === systemType).length;
    const groupName = `${brand} · ${systemType}`;
    setPendingDelete({
      title: "Delete inverter group",
      message: `Delete all ${count} inverter(s) in "${groupName}"? This cannot be undone.`,
      // A bigger, group-scoped wipe asks for the exact group name, not just
      // the generic word — naming what's actually being deleted.
      confirmWord: groupName,
      run: async () => {
        const params = new URLSearchParams({ brand, systemType });
        const res = await fetch(`/api/inverter-prices?${params}`, { method: "DELETE" });
        if (res.ok) { load(); loadAllRows(); }
        else alert("Could not delete that group.");
      },
    });
  };

  const deleteEverything = () => {
    setPendingDelete({
      title: "Delete all inverter prices",
      message: `Delete ALL ${rows.length} inverter price(s)? This wipes the entire inverter price list and cannot be undone.`,
      confirmWord: "INVERTER_PRICE_DELETE",
      run: async () => {
        const res = await fetch(`/api/inverter-prices?all=true`, { method: "DELETE" });
        if (res.ok) { load(); loadAllRows(); }
        else alert("Could not delete the inverter prices.");
      },
    });
  };

  // Manual single-inverter add — mirrors WirePriceList's "Add Wire": the
  // upload wizard is for whole vendor price lists, not the one model the
  // office wants to price by hand. Goes through the same validated upsert
  // (and price_history logging) as uploads, marked source "manual".
  const blankAdd = { brand: "", system_type: "On-Grid" as SystemType, phase: "1", kw: "", model: "", price: "" };
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState(blankAdd);
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const submitAddInverter = async () => {
    setAddError(null);
    if (!addForm.brand.trim() || !addForm.model.trim()) return setAddError("Brand and model are required.");
    if (!(parseFloat(addForm.kw) > 0)) return setAddError("Enter a valid kW rating.");
    if (!(parseFloat(addForm.price) >= 0)) return setAddError("Enter a valid price.");
    setAddBusy(true);
    try {
      const res = await fetch("/api/inverter-prices/upsert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: [{
            brand: addForm.brand.trim(),
            system_type: addForm.system_type,
            phase: Number(addForm.phase),
            kw: parseFloat(addForm.kw),
            model: addForm.model.trim(),
            price: parseFloat(addForm.price),
            source: "manual",
          }],
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      // The upsert skips (rather than errors) rows it won't write — e.g. an
      // existing price-locked inverter — so surface the reason.
      if (body.skipped > 0) throw new Error(body.skippedReasons?.[0] || "That inverter wasn't saved.");
      setAddForm(blankAdd);
      setAddOpen(false);
      load();
      loadAllRows();
    } catch (err: any) {
      setAddError(err.message || "Could not add that inverter.");
    } finally {
      setAddBusy(false);
    }
  };

  const brands = Array.from(new Set(allRows.map((r) => r.brand).filter(Boolean))).sort();
  const filtersActive = Boolean(search || brandFilter || systemTypeFilter || phaseFilter);

  const sorted = [...rows].sort((a, b) => {
    if (a.brand !== b.brand) return a.brand.localeCompare(b.brand);
    if (a.system_type !== b.system_type) return a.system_type.localeCompare(b.system_type);
    return a.kw - b.kw;
  });
  let lastGroup = "";
  const tableRows: React.ReactNode[] = [];
  sorted.forEach((r) => {
    const groupKey = `${r.brand} · ${r.system_type}`;
    if (groupKey !== lastGroup) {
      const groupCount = sorted.filter((x) => x.brand === r.brand && x.system_type === r.system_type).length;
      tableRows.push(
        <tr key={`g-${groupKey}`} className="bg-[var(--hover-bg)]">
          <td colSpan={6} className="px-1 py-1.5 text-xs font-medium text-[var(--accent-green)]">
            {groupKey} <span className="text-[var(--text-muted)] font-normal">({groupCount})</span>
          </td>
          <td className="px-1 py-1.5 text-right">
            <button
              type="button"
              onClick={() => deleteGroup(r.brand, r.system_type)}
              title={`Delete all ${groupCount} inverters in this group`}
              className="text-xs text-[var(--text-muted)] hover:text-red-400 cursor-pointer"
            >
              Delete group
            </button>
          </td>
        </tr>
      );
      lastGroup = groupKey;
    }
    tableRows.push(
      <tr key={r.id} className="border-t border-[var(--border-subtle)]">
        <td>{r.model}</td>
        <td>{r.system_type}</td>
        <td>{r.phase}-Phase</td>
        <td>{r.kw} kW</td>
        <td>
          <input
            key={`${r.id}-${r.price}`}
            type="number"
            defaultValue={r.price}
            className="w-20 bg-transparent border border-[var(--border-subtle)] rounded px-1"
            onBlur={(e) => patchRow(r.id, { price: Number(e.target.value) })}
          />
        </td>
        <td>{r.source}</td>
        <td>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={r.manual_override}
              title="Lock price — future uploads won't overwrite this row"
              onChange={(e) => patchRow(r.id, { manual_override: e.target.checked })}
            />
            <button type="button" onClick={() => deleteRow(r)} title={`Delete ${r.brand} ${r.model}`} className="p-1 rounded text-[var(--text-muted)] hover:text-red-400 cursor-pointer">
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        </td>
      </tr>
    );
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <AddItemButton label="Add Inverter" open={addOpen} onClick={() => { setAddOpen((o) => !o); setAddError(null); }} />
        <input
          placeholder="Search brand/model…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-transparent border border-[var(--border-subtle)] rounded px-2 py-1 text-sm"
        />
        <select value={brandFilter} onChange={(e) => setBrandFilter(e.target.value)} className="bg-transparent border border-[var(--border-subtle)] rounded px-2 py-1 text-sm">
          <option value="">All brands</option>
          {brands.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
        <select value={systemTypeFilter} onChange={(e) => setSystemTypeFilter(e.target.value)} className="bg-transparent border border-[var(--border-subtle)] rounded px-2 py-1 text-sm">
          <option value="">All system types</option>
          {SYSTEM_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select value={phaseFilter} onChange={(e) => setPhaseFilter(e.target.value)} className="bg-transparent border border-[var(--border-subtle)] rounded px-2 py-1 text-sm">
          <option value="">All phases</option>
          <option value="1">1-Phase</option>
          <option value="3">3-Phase</option>
        </select>
        {!loading && <span className="text-xs text-[var(--text-muted)] font-mono">{rows.length} inverter(s)</span>}
        {!loading && rows.length > 0 && (
          <button
            type="button"
            onClick={deleteEverything}
            className="ml-auto flex items-center gap-1 px-2 py-1 rounded border border-red-500/30 text-red-400/80 hover:text-red-400 hover:border-red-500/60 text-[10px] font-semibold cursor-pointer transition-colors"
          >
            <Trash2 className="w-3 h-3" /> Delete all
          </button>
        )}
      </div>
      {addOpen && (
        <div className="flex flex-wrap items-end gap-2 p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--hover-bg)]">
          {([
            ["brand", "Brand *", "e.g. Deye", "w-32", "text"],
            ["model", "Model *", "e.g. SUN-5K-G03", "w-40", "text"],
            ["kw", "kW *", "5", "w-20", "number"],
            ["price", "Price ₹ *", "0", "w-28", "number"],
          ] as const).map(([key, label, ph, w, type]) => (
            <label key={key} className="text-xs flex flex-col gap-1">
              <span className="text-[var(--text-secondary)] font-medium">{label}</span>
              <input
                type={type}
                list={key === "brand" ? "add-inverter-brands" : undefined}
                value={addForm[key]}
                placeholder={ph}
                onChange={(e) => setAddForm((f) => ({ ...f, [key]: e.target.value }))}
                onKeyDown={(e) => { if (e.key === "Enter") void submitAddInverter(); }}
                className={`${w} h-8 bg-[var(--bg-card)] border border-[var(--border-strong)] rounded-lg px-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-green)]`}
              />
            </label>
          ))}
          <datalist id="add-inverter-brands">{brands.map((b) => <option key={b} value={b} />)}</datalist>
          <label className="text-xs flex flex-col gap-1">
            <span className="text-[var(--text-secondary)] font-medium">System type</span>
            <select value={addForm.system_type} onChange={(e) => setAddForm((f) => ({ ...f, system_type: e.target.value as SystemType }))}
              className="h-8 bg-[var(--bg-card)] border border-[var(--border-strong)] rounded-lg px-2 text-sm text-[var(--text-primary)]">
              {SYSTEM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label className="text-xs flex flex-col gap-1">
            <span className="text-[var(--text-secondary)] font-medium">Phase</span>
            <select value={addForm.phase} onChange={(e) => setAddForm((f) => ({ ...f, phase: e.target.value }))}
              className="h-8 bg-[var(--bg-card)] border border-[var(--border-strong)] rounded-lg px-2 text-sm text-[var(--text-primary)]">
              <option value="1">1-Phase</option>
              <option value="3">3-Phase</option>
            </select>
          </label>
          <button type="button" disabled={addBusy} onClick={() => void submitAddInverter()}
            className="h-8 px-4 rounded-lg bg-[var(--accent-solid)] text-white text-sm font-medium hover:opacity-90 disabled:opacity-40 cursor-pointer">
            {addBusy ? "Adding…" : "Add"}
          </button>
          {addError && <p className="w-full text-red-500 text-xs">{addError}</p>}
        </div>
      )}
      {loading ? (
        <p className="text-sm text-[var(--text-muted)]">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">{filtersActive ? "No inverters match your search/filters." : "No inverter prices yet — import a sheet above."}</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[var(--text-muted)]">
              <th>Model</th>
              <th>System Type</th>
              <th>Phase</th>
              <th>kW</th>
              <th>Price</th>
              <th>Source</th>
              <th>Lock Price</th>
            </tr>
          </thead>
          <tbody>{tableRows}</tbody>
        </table>
      )}
      <ConfirmDeleteModal
        open={pendingDelete !== null}
        title={pendingDelete?.title ?? ""}
        message={pendingDelete?.message ?? ""}
        confirmWord={pendingDelete?.confirmWord ?? "DELETE"}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => { const p = pendingDelete; setPendingDelete(null); p?.run(); }}
      />
    </div>
  );
}
