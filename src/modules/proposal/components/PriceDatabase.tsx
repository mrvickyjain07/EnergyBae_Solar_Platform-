// src/modules/proposal/components/PriceDatabase.tsx
// Sidebar + detail-panel layout: one category selected at a time, instead of
// all seven-plus sections stacked in one long scroll. Wire Prices (formerly
// its own top-level Proposal Maker tab) is folded in here as another
// category — one place for every price list instead of two tabs.
import React, { useEffect, useState } from "react";
import { Trash2, RotateCcw, DollarSign, X, Zap, ShieldCheck, Plug, Package, Cable } from "lucide-react";
import { AcdbCatalogueRow, CATEGORIES, Catalogue, CustomBosItem, DcdbCatalogueRow } from "../types";
import { BOS_ITEM_DEFS } from "../defaultCatalogue";
import { sanitizePrice } from "../sanitizePrice";
import InverterPriceUpload from "./InverterPriceUpload";
import InverterPriceList from "./InverterPriceList";
import WirePriceUpload from "./WirePriceUpload";
import WirePriceList from "./WirePriceList";
import AddItemButton from "./AddItemButton";

interface Props {
  catalogue: Catalogue;
  setCatalogue: React.Dispatch<React.SetStateAction<Catalogue>>;
  onReset: () => void;
  inverterPriceRefresh: number;
  onInverterPricesImported: () => void;
  wireRefresh: number;
  onWirePricesImported: () => void;
  /** Reports the open category's label (header breadcrumb). */
  onCategoryChange?: (label: string) => void;
  /** Jump request from the header search; nonce re-triggers the same one. */
  categoryRequest?: { id: PriceDbCategory; nonce: number } | null;
}

export type PriceDbCategory = "inverters" | "acdb" | "dcdb" | "bos" | "charges" | "wires";
export const PRICE_DB_CATEGORIES: { id: PriceDbCategory; label: string }[] = [
  { id: "inverters", label: "Inverters" },
  { id: "acdb", label: "ACDB Lookup" },
  { id: "dcdb", label: "DCDB Lookup" },
  { id: "bos", label: "BOS Item Prices" },
  { id: "charges", label: "Overhead Charges & Rates" },
  { id: "wires", label: "Wire Prices" },
];

const uid = () => Date.now() + Math.random();
const cellIn =
  "w-full px-2 py-1.5 rounded-md bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[11px] font-mono text-[var(--text-primary)] outline-none focus:border-[var(--accent-green)] " +
  // Suppress native number-input spinner arrows (Chrome/Safari + Firefox) —
  // a no-op on text/select inputs that also use this class.
  "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <th className={`px-2 py-2 text-xs font-medium text-[var(--text-muted)] bg-[var(--bg-surface)] border-b border-[var(--border-subtle)] whitespace-nowrap ${right ? "text-right" : "text-left"}`}>{children}</th>;
}
function EmptyRow({ colSpan, label }: { colSpan: number; label: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-6 text-center text-[11px] text-[var(--text-muted)] font-mono border-b border-[var(--border-subtle)]">
        {label} — click <span className="text-[var(--accent-green)] font-semibold">Add</span> above to create your first entry.
      </td>
    </tr>
  );
}
function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-2 py-1.5 border-b border-[var(--border-subtle)]">{children}</td>;
}
function DelBtn({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="p-1 rounded text-[var(--text-muted)] hover:text-red-400 cursor-pointer">
      <Trash2 className="w-3.5 h-3.5" />
    </button>
  );
}
function CategorySelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select value={value || "Main Equipment"} onChange={(e) => onChange(e.target.value)} className={`${cellIn} cursor-pointer min-w-[130px]`}>
      {CATEGORIES.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </select>
  );
}

// A section's own header (title/subtitle/Add button) — same visual weight
// the old always-visible TableShell had, just now rendered for one category
// at a time inside the detail panel.
function SectionShell({ title, subtitle, onAdd, addLabel = "Add", children }: { title: string; subtitle: string; onAdd?: () => void; addLabel?: string; children: React.ReactNode }) {
  return (
    <div className="glass-panel rounded-2xl overflow-hidden bg-[var(--bg-card)]">
      <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-[var(--border-subtle)] bg-[var(--hover-bg)]">
        <div className="min-w-0">
          <h4 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h4>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">{subtitle}</p>
        </div>
        {/* Same "+ Add …" button as Wire / Inverter (AddItemButton). */}
        {onAdd && <AddItemButton label={addLabel} onClick={onAdd} />}
      </div>
      <div>{children}</div>
    </div>
  );
}

type CategoryId = PriceDbCategory;

export default function PriceDatabase({
  catalogue,
  setCatalogue,
  onReset,
  inverterPriceRefresh,
  onInverterPricesImported,
  wireRefresh,
  onWirePricesImported,
  onCategoryChange,
  categoryRequest,
}: Props) {
  const [active, setActive] = useState<CategoryId>(categoryRequest?.id ?? "inverters");
  useEffect(() => { if (categoryRequest) setActive(categoryRequest.id); }, [categoryRequest?.nonce]);
  useEffect(() => {
    onCategoryChange?.(PRICE_DB_CATEGORIES.find((c) => c.id === active)?.label ?? "");
  }, [active, onCategoryChange]);
  const [inverterCount, setInverterCount] = useState<number | null>(null);
  const [wireCount, setWireCount] = useState<number | null>(null);

  // ─── ACDB ──────────────────────────────────────────────────────────────
  const updACDB = (id: number, patch: Partial<AcdbCatalogueRow>) => setCatalogue((c) => ({ ...c, acdb: c.acdb.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));
  const addACDB = () => setCatalogue((c) => ({ ...c, acdb: [...c.acdb, { id: uid(), capMin: 1, capMax: 5, phase: 1, spec: "", price: 0, category: "Protection Devices" }] }));
  const delACDB = (id: number) => setCatalogue((c) => ({ ...c, acdb: c.acdb.filter((r) => r.id !== id) }));

  // ─── DCDB ──────────────────────────────────────────────────────────────
  const updDCDB = (id: number, patch: Partial<DcdbCatalogueRow>) => setCatalogue((c) => ({ ...c, dcdb: c.dcdb.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));
  const addDCDB = () => setCatalogue((c) => ({ ...c, dcdb: [...c.dcdb, { id: uid(), spd: 1, io: "1/1", voltage: 1000, price: 0, category: "Protection Devices" }] }));
  const delDCDB = (id: number) => setCatalogue((c) => ({ ...c, dcdb: c.dcdb.filter((r) => r.id !== id) }));

  // ─── BOS / Charges ─────────────────────────────────────────────────────
  const updBOS = (key: keyof Catalogue["bos"], val: string) => setCatalogue((c) => ({ ...c, bos: { ...c.bos, [key]: sanitizePrice(val) } }));
  const updBOSName = (key: keyof Catalogue["bos"], val: string) => setCatalogue((c) => ({ ...c, bosNames: { ...c.bosNames, [key]: val } }));
  const updCharge = (key: keyof Catalogue["charges"], val: string) => setCatalogue((c) => ({ ...c, charges: { ...c.charges, [key]: sanitizePrice(val) } }));

  // ─── Custom BOS items (user-added, appended after the default 30) ──────
  const updCustomBOS = (id: number, patch: Partial<CustomBosItem>) =>
    setCatalogue((c) => ({ ...c, customBOS: c.customBOS.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
  const addCustomBOS = () =>
    setCatalogue((c) => ({ ...c, customBOS: [...c.customBOS, { id: uid(), label: "", unit: "/Nos.", price: 0 }] }));
  const delCustomBOS = (id: number) => setCatalogue((c) => ({ ...c, customBOS: c.customBOS.filter((x) => x.id !== id) }));

  const CATEGORY_NAV: { id: CategoryId; label: string; icon: typeof Zap; count: number | null }[] = [
    { id: "inverters", label: "Inverters", icon: Zap, count: inverterCount },
    { id: "acdb", label: "ACDB Lookup", icon: ShieldCheck, count: catalogue.acdb.length },
    { id: "dcdb", label: "DCDB Lookup", icon: Plug, count: catalogue.dcdb.length },
    { id: "bos", label: "BOS Item Prices", icon: Package, count: BOS_ITEM_DEFS.length + catalogue.customBOS.length },
    { id: "charges", label: "Overhead Charges & Rates", icon: DollarSign, count: null },
    { id: "wires", label: "Wire Prices", icon: Cable, count: wireCount },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap p-4 rounded-xl bg-amber-500/5 border border-amber-500/20">
        <div className="flex items-center gap-2 text-[11px] text-[var(--text-secondary)] font-mono">
          <span className="w-2 h-2 rounded-full bg-[var(--accent-green)] animate-pulse" />
          All changes auto-save to this browser and reflect live in the BOQ Calculator.
        </div>
        <button
          type="button"
          onClick={onReset}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-900/40 text-red-400 hover:bg-red-950/20 text-[10px] font-bold cursor-pointer"
        >
          <RotateCcw className="w-3 h-3" /> Reset All to Factory Defaults
        </button>
      </div>

      <div className="flex flex-col lg:flex-row gap-4 items-start">
        <nav className="w-full lg:w-56 shrink-0 glass-panel rounded-2xl p-2 space-y-1 lg:sticky lg:top-4">
          {CATEGORY_NAV.map((c) => {
            const Icon = c.icon;
            const isActive = active === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setActive(c.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-left cursor-pointer transition-colors ${
                  isActive
                    ? "bg-gradient-to-br from-[var(--accent-green-light)]/15 to-[var(--bg-surface)] border border-[var(--accent-green)]/30 text-[var(--accent-green)]"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)] border border-transparent"
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span className="flex-1 min-w-0 truncate">{c.label}</span>
                {c.count !== null && (
                  <span className={`shrink-0 text-[10px] font-mono px-1.5 py-0.5 rounded ${isActive ? "bg-[var(--accent-green)]/15" : "bg-[var(--hover-bg)] text-[var(--text-muted)]"}`}>
                    {c.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="flex-1 min-w-0 w-full">
          {active === "inverters" && (
            // Inverters live in a dedicated table (inverter_prices, see
            // supabase/migrations/0006_inverter_prices.sql) rather than a row
            // in this jsonb catalogue, since it supports bulk Excel/CSV/PDF
            // upload with dedupe. Matched by System Type + Phase + Brand + kW
            // in the BOQ (see matchInverter.ts) — auto-fills Unit Cost + Qty.
            <SectionShell title="Inverters" subtitle="Matched by System Type + Phase + Brand + kW — auto-fills Unit Cost & Qty in BOQ">
              <div className="p-4 space-y-4">
                <InverterPriceUpload onImported={onInverterPricesImported} />
                <div className="pt-4 border-t border-[var(--border-subtle)]">
                  <InverterPriceList refreshSignal={inverterPriceRefresh} onCountChange={setInverterCount} />
                </div>
              </div>
            </SectionShell>
          )}

          {active === "acdb" && (
            <SectionShell title="ACDB Lookup" subtitle="Auto-matched by Phase + Capacity range" onAdd={addACDB} addLabel="Add ACDB row">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[420px]">
                  <thead>
                    <tr>
                      <Th>Ph</Th>
                      <Th>kW Min</Th>
                      <Th>kW Max</Th>
                      <Th>Spec</Th>
                      <Th right>Price</Th>
                      <Th right>Del</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {catalogue.acdb.map((r) => (
                      <tr key={r.id}>
                        <Td>
                          <select className={`${cellIn} cursor-pointer w-16`} value={r.phase} onChange={(e) => updACDB(r.id, { phase: Number(e.target.value) as 1 | 3 })}>
                            <option value={1}>1Ph</option>
                            <option value={3}>3Ph</option>
                          </select>
                        </Td>
                        <Td><input className={`${cellIn} w-16 text-right`} type="number" value={r.capMin} onChange={(e) => updACDB(r.id, { capMin: Number(e.target.value) || 0 })} /></Td>
                        <Td><input className={`${cellIn} w-16 text-right`} type="number" value={r.capMax} onChange={(e) => updACDB(r.id, { capMax: Number(e.target.value) || 0 })} /></Td>
                        <Td><input className={`${cellIn} w-32`} value={r.spec} onChange={(e) => updACDB(r.id, { spec: e.target.value })} /></Td>
                        <Td><input className={`${cellIn} text-right`} type="number" value={r.price} onChange={(e) => updACDB(r.id, { price: sanitizePrice(e.target.value) })} /></Td>
                        <Td><div className="flex justify-end"><DelBtn onClick={() => delACDB(r.id)} /></div></Td>
                      </tr>
                    ))}
                    {catalogue.acdb.length === 0 && <EmptyRow colSpan={6} label="No ACDB rows added yet" />}
                  </tbody>
                </table>
              </div>
            </SectionShell>
          )}

          {active === "dcdb" && (
            <SectionShell title="DCDB Lookup" subtitle="Auto-matched by Strings + DC Voltage" onAdd={addDCDB} addLabel="Add DCDB row">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[380px]">
                  <thead>
                    <tr>
                      <Th>SPD</Th>
                      <Th>In/Out</Th>
                      <Th>Voltage</Th>
                      <Th right>Price</Th>
                      <Th right>Del</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {catalogue.dcdb.map((r) => (
                      <tr key={r.id}>
                        <Td><input className={`${cellIn} w-14 text-right`} type="number" value={r.spd} onChange={(e) => updDCDB(r.id, { spd: Number(e.target.value) || 1 })} /></Td>
                        <Td>
                          <select className={`${cellIn} cursor-pointer w-20`} value={r.io} onChange={(e) => updDCDB(r.id, { io: e.target.value })}>
                            {["1/1", "2/2", "3/3", "4/4", "6/6", "8/8", "10/10"].map((v) => (
                              <option key={v}>{v}</option>
                            ))}
                          </select>
                        </Td>
                        <Td>
                          <select className={`${cellIn} cursor-pointer w-20`} value={r.voltage} onChange={(e) => updDCDB(r.id, { voltage: Number(e.target.value) })}>
                            <option value={600}>600V</option>
                            <option value={1000}>1000V</option>
                            <option value={1200}>1200V</option>
                          </select>
                        </Td>
                        <Td><input className={`${cellIn} text-right`} type="number" value={r.price} onChange={(e) => updDCDB(r.id, { price: sanitizePrice(e.target.value) })} /></Td>
                        <Td><div className="flex justify-end"><DelBtn onClick={() => delDCDB(r.id)} /></div></Td>
                      </tr>
                    ))}
                    {catalogue.dcdb.length === 0 && <EmptyRow colSpan={5} label="No DCDB rows added yet" />}
                  </tbody>
                </table>
              </div>
            </SectionShell>
          )}

          {active === "bos" && (
            <SectionShell title="BOS Item Prices" subtitle="Balance-of-system unit costs — directly updates BOQ line item prices" onAdd={addCustomBOS} addLabel="Add BOS item">
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 p-4">
                {BOS_ITEM_DEFS.map((item) => (
                  <div
                    key={item.key}
                    className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 transition-colors hover:border-[var(--accent-green)]/30"
                  >
                    <input
                      type="text"
                      value={catalogue.bosNames?.[item.key] ?? item.label}
                      onChange={(e) => updBOSName(item.key, e.target.value)}
                      className={`${cellIn} w-full mb-2 font-semibold border-transparent bg-transparent px-0 focus:border-transparent focus:px-2 focus:bg-[var(--bg-card)]`}
                      placeholder={item.label}
                    />
                    {item.wireFallback && (
                      <div
                        className="mb-2 -mt-1 text-[9px] text-amber-400/80 font-mono"
                        title="The BOQ Calculator's 'Fill cable rates' button prices this from the Wire Prices tab (matched by size/material) whenever a match exists. This value is only the fallback used when it doesn't."
                      >
                        ⚡ fallback rate · Wire Prices tab is checked first
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <span className="shrink-0 text-[11px] text-[var(--text-muted)] font-mono">₹</span>
                      <input
                        type="number"
                        value={catalogue.bos[item.key] || 0}
                        onChange={(e) => updBOS(item.key, e.target.value)}
                        className={`${cellIn} min-w-0 flex-1 text-right`}
                      />
                      <span className="shrink-0 whitespace-nowrap rounded-md bg-[var(--hover-bg)] px-1.5 py-1 text-[9px] text-[var(--text-muted)] font-mono">
                        {item.unit}
                      </span>
                    </div>
                  </div>
                ))}
                {catalogue.customBOS.map((ci) => (
                  <div
                    key={ci.id}
                    className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 transition-colors hover:border-[var(--accent-green)]/30"
                  >
                    <div className="flex items-center gap-1.5 mb-2">
                      <input
                        type="text"
                        value={ci.label}
                        onChange={(e) => updCustomBOS(ci.id, { label: e.target.value })}
                        placeholder="Custom item name"
                        className={`${cellIn} min-w-0 flex-1 font-semibold border-transparent bg-transparent px-0 focus:border-transparent focus:px-2 focus:bg-[var(--bg-card)]`}
                      />
                      <button
                        type="button"
                        onClick={() => delCustomBOS(ci.id)}
                        className="p-1 rounded text-[var(--text-muted)] hover:text-red-400 cursor-pointer shrink-0"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="shrink-0 text-[11px] text-[var(--text-muted)] font-mono">₹</span>
                      <input
                        type="number"
                        value={ci.price}
                        onChange={(e) => updCustomBOS(ci.id, { price: sanitizePrice(e.target.value) })}
                        className={`${cellIn} min-w-0 flex-1 text-right`}
                      />
                      <input
                        type="text"
                        value={ci.unit}
                        onChange={(e) => updCustomBOS(ci.id, { unit: e.target.value })}
                        placeholder="/Nos."
                        className={`${cellIn} w-16 shrink-0 text-center`}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </SectionShell>
          )}

          {active === "charges" && (
            <SectionShell title="Overhead Charges & Rates" subtitle="These drive the Pricing Summary calculations">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                {[
                  { key: "installation" as const, label: "Installation", unit: "₹/kW" },
                  { key: "transport" as const, label: "Transportation", unit: "% of material" },
                  { key: "liaisoning" as const, label: "Liaisoning", unit: "₹/kW" },
                  { key: "profit" as const, label: "Profit Margin", unit: "%" },
                  { key: "gst" as const, label: "GST Rate", unit: "%" },
                  { key: "subsidy" as const, label: "PMSGY Subsidy (DCR)", unit: "₹ fixed" },
                ].map((c, i) => (
                  <div key={c.key} className={`px-4 py-3 border-b border-[var(--border-subtle)] ${i % 3 !== 2 ? "lg:border-r" : ""}`}>
                    <div className="text-xs text-[var(--text-muted)] font-medium mb-1.5">{c.label}</div>
                    <div className="flex items-center gap-2">
                      <input type="number" step="0.1" value={catalogue.charges[c.key] || 0} onChange={(e) => updCharge(c.key, e.target.value)} className={`${cellIn} w-28 text-right`} />
                      <span className="text-[10px] text-[var(--text-muted)]">{c.unit}</span>
                    </div>
                  </div>
                ))}
              </div>
            </SectionShell>
          )}

          {active === "wires" && (
            <SectionShell title="Wire Prices" subtitle="Matched by size + material — priced into the BOQ's cable line items">
              <div className="p-4 space-y-4">
                <WirePriceUpload onImported={onWirePricesImported} />
                <div className="pt-4 border-t border-[var(--border-subtle)]">
                  <WirePriceList refreshSignal={wireRefresh} onCountChange={setWireCount} />
                </div>
              </div>
            </SectionShell>
          )}
        </div>
      </div>
    </div>
  );
}
