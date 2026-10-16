// src/modules/proposal/components/WirePriceList.tsx
// Wire price management screen: search/filter, inline price edit, manual-
// override toggle. Mirrors PriceDatabase.tsx's editable-table conventions.
import React, { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import AddItemButton from "./AddItemButton";
import { sanitizePrice } from "../sanitizePrice";
import { WIRE_CATEGORIES } from "./WirePriceUpload";
import ConfirmDeleteModal from "../../../components/ConfirmDeleteModal";

interface WirePriceRow {
  id: string;
  internal_name: string;
  type: string;
  brand: string | null;
  size_sqmm: number | null;
  cores: number | null;
  material: string | null;
  price_per_m: number;
  source: "manual" | "upload";
  manual_override: boolean;
  manually_edited: boolean;
  fetched_at: string;
}

// Fixed core-count buckets, not derived from whatever's in the data — a "3.5
// core" cable (3 full conductors + reduced neutral) is a real, distinct
// construction the office needs to filter to directly.
const CORE_OPTIONS: { value: string; label: string }[] = [
  { value: "1", label: "Single (1 core)" },
  { value: "2", label: "2 core" },
  { value: "3", label: "3 core" },
  { value: "3.5", label: "3.5 core" },
  { value: "4", label: "4 core" },
  { value: "5plus", label: "Multicore (5+)" },
];

export default function WirePriceList({ refreshSignal, onCountChange }: { refreshSignal: number; onCountChange?: (n: number) => void }) {
  const [rows, setRows] = useState<WirePriceRow[]>([]);
  // The full, unfiltered row set — used only to build the Company/Type filter
  // option lists. Building those from `rows` instead used to make picking one
  // filter erase the other filter's other options (e.g. selecting "Multi Core
  // Cable" made "Single Core Cable" vanish from the Type dropdown, since
  // `rows` was already narrowed to multi-core results).
  const [allRows, setAllRows] = useState<WirePriceRow[]>([]);
  const [search, setSearch] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [coresFilter, setCoresFilter] = useState("");
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (brandFilter) params.set("brand", brandFilter);
    if (typeFilter) params.set("type", typeFilter);
    if (coresFilter) params.set("cores", coresFilter);
    fetch(`/api/wire-prices?${params}`)
      .then((r) => r.json())
      .then((d) => {
        setRows(d.rows ?? []);
        onCountChange?.((d.rows ?? []).length);
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, [refreshSignal, search, brandFilter, typeFilter, coresFilter]);
  const loadAllRows = () => {
    fetch("/api/wire-prices")
      .then((r) => r.json())
      .then((d) => setAllRows(d.rows ?? []))
      .catch(() => {});
  };
  useEffect(loadAllRows, [refreshSignal]);

  const patchRow = async (id: string, patch: Partial<Pick<WirePriceRow, "price_per_m" | "manual_override">>) => {
    const body = "price_per_m" in patch ? { ...patch, price_per_m: sanitizePrice(patch.price_per_m) } : patch;
    const res = await fetch(`/api/wire-prices/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const { row } = await res.json();
      setRows((rs) => rs.map((r) => (r.id === id ? row : r)));
    }
  };

  // Destructive, so each path routes through the type-to-confirm modal rather
  // than a single click-through confirm — a stray double-click on "Delete
  // all" once wiped 187 live rows (see memory:
  // verify-destructive-filters-before-running).
  const [pendingDelete, setPendingDelete] = useState<{ title: string; message: string; confirmWord: string; run: () => Promise<void> } | null>(null);

  const deleteRow = (row: WirePriceRow) => {
    setPendingDelete({
      title: "Delete wire price",
      message: `Delete "${row.internal_name}"? This permanently removes the price row.`,
      confirmWord: "DELETE",
      run: async () => {
        const res = await fetch(`/api/wire-prices/${row.id}`, { method: "DELETE" });
        if (res.ok) setRows((rs) => rs.filter((r) => r.id !== row.id));
        else alert("Could not delete that wire price.");
      },
    });
  };

  const deleteGroup = (brand: string | null, type: string) => {
    const count = rows.filter((r) => r.brand === brand && r.type === type).length;
    const groupName = `${brand || "No Company"} · ${type}`;
    setPendingDelete({
      title: "Delete wire group",
      message: `Delete all ${count} wire(s) in "${groupName}"? This cannot be undone.`,
      // A bigger, group-scoped wipe asks for the exact group name, not just
      // the generic word — naming what's actually being deleted.
      confirmWord: groupName,
      run: async () => {
        const params = new URLSearchParams({ type });
        // nobrand keeps this scoped to the NULL-brand rows only — using
        // all=true here would also wipe branded rows sharing this type.
        if (brand) params.set("brand", brand);
        else params.set("nobrand", "true");
        const res = await fetch(`/api/wire-prices?${params}`, { method: "DELETE" });
        if (res.ok) { load(); loadAllRows(); }
        else alert("Could not delete that group.");
      },
    });
  };

  const deleteEverything = () => {
    setPendingDelete({
      title: "Delete all wire prices",
      message: `Delete ALL ${rows.length} wire price(s)? This wipes the entire wire price list and cannot be undone.`,
      confirmWord: "WIRE_PRICE_DELETE",
      run: async () => {
        const res = await fetch(`/api/wire-prices?all=true`, { method: "DELETE" });
        if (res.ok) { load(); loadAllRows(); }
        else alert("Could not delete the wire prices.");
      },
    });
  };

  // Manual single-row add — the upload wizard is built for whole price
  // sheets; adding the one wire the office forgot shouldn't need a fake file.
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ internal_name: "", brand: "", type: WIRE_CATEGORIES[0] as string, size_sqmm: "", cores: "", material: "", price_per_m: "" });
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const submitAddWire = async () => {
    setAddBusy(true);
    setAddError(null);
    try {
      const price = parseFloat(addForm.price_per_m);
      if (!addForm.internal_name.trim() || !Number.isFinite(price)) {
        setAddError("Name and a valid price are required.");
        return;
      }
      const res = await fetch("/api/wire-prices/upsert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: [{
            internal_name: addForm.internal_name.trim(),
            brand: addForm.brand.trim() || null,
            type: addForm.type,
            size_sqmm: addForm.size_sqmm ? parseFloat(addForm.size_sqmm) : null,
            cores: addForm.cores ? parseFloat(addForm.cores) : null,
            material: addForm.material.trim() || null,
            price_per_m: price,
            source: "manual",
          }],
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || `HTTP ${res.status}`);
      setAddForm({ internal_name: "", brand: "", type: WIRE_CATEGORIES[0], size_sqmm: "", cores: "", material: "", price_per_m: "" });
      setAddOpen(false);
      load();
      loadAllRows();
    } catch (err: any) {
      setAddError(err.message || "Could not add that wire.");
    } finally {
      setAddBusy(false);
    }
  };

  const brands = Array.from(new Set(allRows.map((r) => r.brand).filter(Boolean))).sort() as string[];
  const types = Array.from(new Set(allRows.map((r) => r.type))).sort();
  const filtersActive = Boolean(search || brandFilter || typeFilter || coresFilter);

  // Group by Company -> Category so browsing reads like the real-world
  // catalogue structure instead of one flat table — same group-header
  // pattern BOQTable.tsx already uses for its category groups. Within a
  // group, sort by size then cores (numeric) rather than name — "150 sqmm"
  // sorts before "16 sqmm" alphabetically, which reads as random to the office.
  const sorted = [...rows].sort((a, b) => {
    if (!a.brand !== !b.brand) return a.brand ? -1 : 1; // unbranded rows sort last
    if (a.brand !== b.brand) return (a.brand || "").localeCompare(b.brand || "");
    if (a.type !== b.type) return a.type.localeCompare(b.type);
    const sizeA = a.size_sqmm ?? Infinity;
    const sizeB = b.size_sqmm ?? Infinity;
    if (sizeA !== sizeB) return sizeA - sizeB;
    const coresA = a.cores ?? Infinity;
    const coresB = b.cores ?? Infinity;
    if (coresA !== coresB) return coresA - coresB;
    return a.internal_name.localeCompare(b.internal_name);
  });
  let lastGroup = "";
  const tableRows: React.ReactNode[] = [];
  sorted.forEach((r) => {
    const groupKey = `${r.brand || "No Company"} · ${r.type}`;
    if (groupKey !== lastGroup) {
      const groupCount = sorted.filter((x) => x.brand === r.brand && x.type === r.type).length;
      tableRows.push(
        <tr key={`g-${groupKey}`} className="bg-[var(--hover-bg)]">
          <td colSpan={6} className="px-1 py-1.5 text-xs font-medium text-[var(--accent-green)]">
            {groupKey} <span className="text-[var(--text-muted)] font-normal">({groupCount})</span>
          </td>
          <td className="px-1 py-1.5 text-right">
            <button type="button" onClick={() => deleteGroup(r.brand, r.type)}
              title={`Delete all ${groupCount} wires in this group`}
              className="text-xs text-[var(--text-muted)] hover:text-red-400 cursor-pointer">
              Delete group
            </button>
          </td>
        </tr>
      );
      lastGroup = groupKey;
    }
    tableRows.push(
      <tr key={r.id} className="border-t border-[var(--border-subtle)]">
        <td>{r.internal_name}</td>
        <td>{r.size_sqmm ?? "—"}</td>
        <td>{r.cores ?? "—"}</td>
        <td>{r.material ?? "—"}</td>
        <td>
          <input key={`${r.id}-${r.price_per_m}`} type="number" defaultValue={r.price_per_m}
            className="w-20 bg-transparent border border-[var(--border-subtle)] rounded px-1"
            onBlur={(e) => patchRow(r.id, { price_per_m: Number(e.target.value) })} />
        </td>
        <td>{r.source}{r.manually_edited ? " (edited)" : ""}</td>
        <td>
          <div className="flex items-center gap-2">
            <input type="checkbox" checked={r.manual_override} title="Lock price — future uploads won't overwrite this row"
              onChange={(e) => patchRow(r.id, { manual_override: e.target.checked })} />
            <button type="button" onClick={() => deleteRow(r)} title={`Delete ${r.internal_name}`}
              className="p-1 rounded text-[var(--text-muted)] hover:text-red-400 cursor-pointer">
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        </td>
      </tr>
    );
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <AddItemButton label="Add Wire" open={addOpen} onClick={() => setAddOpen((o) => !o)} />
        <input placeholder="Search wire name…" value={search} onChange={(e) => setSearch(e.target.value)}
          className="bg-transparent border border-[var(--border-subtle)] rounded px-2 py-1 text-sm" />
        <select value={brandFilter} onChange={(e) => setBrandFilter(e.target.value)}
          className="bg-transparent border border-[var(--border-subtle)] rounded px-2 py-1 text-sm">
          <option value="">All companies</option>
          {brands.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
          className="bg-transparent border border-[var(--border-subtle)] rounded px-2 py-1 text-sm">
          <option value="">All types</option>
          {types.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={coresFilter} onChange={(e) => setCoresFilter(e.target.value)}
          className="bg-transparent border border-[var(--border-subtle)] rounded px-2 py-1 text-sm">
          <option value="">All cores</option>
          {CORE_OPTIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        {!loading && <span className="text-xs text-[var(--text-muted)] font-mono">{rows.length} wire(s)</span>}
        {!loading && rows.length > 0 && (
          <button type="button" onClick={deleteEverything}
            className="ml-auto flex items-center gap-1 px-2 py-1 rounded border border-red-500/30 text-red-400/80 hover:text-red-400 hover:border-red-500/60 text-[10px] font-semibold cursor-pointer transition-colors">
            <Trash2 className="w-3 h-3" /> Delete all
          </button>
        )}
      </div>
      {addOpen && (
        <div className="flex flex-wrap items-end gap-2 p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--hover-bg)]">
          <label className="text-xs flex flex-col gap-1">
            <span>Name *</span>
            <input value={addForm.internal_name} onChange={(e) => setAddForm((f) => ({ ...f, internal_name: e.target.value }))}
              className="bg-transparent border border-[var(--border-subtle)] rounded px-2 py-1 w-48" />
          </label>
          <label className="text-xs flex flex-col gap-1">
            <span>Company</span>
            <input value={addForm.brand} onChange={(e) => setAddForm((f) => ({ ...f, brand: e.target.value }))}
              className="bg-transparent border border-[var(--border-subtle)] rounded px-2 py-1 w-28" />
          </label>
          <label className="text-xs flex flex-col gap-1">
            <span>Category</span>
            <select value={addForm.type} onChange={(e) => setAddForm((f) => ({ ...f, type: e.target.value }))}
              className="bg-transparent border border-[var(--border-subtle)] rounded px-2 py-1">
              {WIRE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="text-xs flex flex-col gap-1">
            <span>Size (sqmm)</span>
            <input type="number" value={addForm.size_sqmm} onChange={(e) => setAddForm((f) => ({ ...f, size_sqmm: e.target.value }))}
              className="bg-transparent border border-[var(--border-subtle)] rounded px-2 py-1 w-20" />
          </label>
          <label className="text-xs flex flex-col gap-1">
            <span>Cores</span>
            <input type="number" step="0.5" value={addForm.cores} onChange={(e) => setAddForm((f) => ({ ...f, cores: e.target.value }))}
              className="bg-transparent border border-[var(--border-subtle)] rounded px-2 py-1 w-16" />
          </label>
          <label className="text-xs flex flex-col gap-1">
            <span>Material</span>
            <input placeholder="Cu/Al" value={addForm.material} onChange={(e) => setAddForm((f) => ({ ...f, material: e.target.value }))}
              className="bg-transparent border border-[var(--border-subtle)] rounded px-2 py-1 w-16" />
          </label>
          <label className="text-xs flex flex-col gap-1">
            <span>Price/m *</span>
            <input type="number" value={addForm.price_per_m} onChange={(e) => setAddForm((f) => ({ ...f, price_per_m: e.target.value }))}
              className="bg-transparent border border-[var(--border-subtle)] rounded px-2 py-1 w-24" />
          </label>
          <button type="button" disabled={addBusy} onClick={submitAddWire}
            className="px-3 py-1.5 rounded bg-[var(--accent-solid)] text-white text-xs font-semibold disabled:opacity-40">
            {addBusy ? "Adding…" : "Add"}
          </button>
          {addError && <p className="w-full text-red-500 text-xs">{addError}</p>}
        </div>
      )}
      {loading ? (
        <p className="text-sm text-[var(--text-muted)]">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">
          {filtersActive ? "No wires match your search/filters." : "No wire prices yet — import a sheet above."}
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[var(--text-muted)]">
              <th>Name</th><th>Size</th><th>Cores</th><th>Material</th><th>Price/m</th><th>Source</th><th>Lock Price</th>
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
