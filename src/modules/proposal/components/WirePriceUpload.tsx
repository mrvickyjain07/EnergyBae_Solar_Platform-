// src/modules/proposal/components/WirePriceUpload.tsx
// Upload wizard: pick file -> preview parsed rows -> map columns -> confirm.
// File reading mirrors src/components/Uploader.tsx's FileReader.readAsDataURL
// pattern so the server-side decode (wirePricesApi.ts) can reuse the same
// base64 data-URL contract already used for utility-bill uploads.
import React, { useRef, useState } from "react";
import { Upload, FileCheck2 } from "lucide-react";
import MorphingInfinity from "../../../components/MorphingInfinity";
import { resolveWireType } from "../wireCategory";
import { normalizeToPerMetre } from "../wirePriceUnits";

const WIRE_FIELDS: { key: string; label: string; required?: boolean }[] = [
  { key: "internal_name", label: "Wire Name", required: true },
  { key: "size_sqmm", label: "Size (sqmm)" },
  { key: "cores", label: "Cores" },
  { key: "material", label: "Material (Cu/Al)" },
  { key: "price_per_m", label: "Price / m", required: true },
  { key: "gst_pct", label: "GST %" },
];

function guessMapping(headers: string[]): Record<string, string> {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const guesses: Record<string, string> = {};
  for (const field of WIRE_FIELDS) {
    const key = norm(field.key);
    const hit = headers.find((h) => {
      const nh = norm(h);
      if (field.key === "internal_name") return nh.includes("name") || nh.includes("desc") || nh.includes("item");
      if (field.key === "size_sqmm") return nh.includes("size") || nh.includes("sqmm");
      if (field.key === "price_per_m") return nh.includes("price") || nh.includes("rate");
      return nh.includes(key) || key.includes(nh);
    });
    if (hit) guesses[field.key] = hit;
  }
  return guesses;
}

function mappingStorageKey(headers: string[]): string {
  return "wireUploadMapping:" + headers.slice().sort().join("|");
}

export const WIRE_CATEGORIES = ["Single Core Cable", "Multi Core Cable", "Aluminium Armoured Cable"] as const;

export default function WirePriceUpload({ onImported }: { onImported: () => void }) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<Record<string, unknown>[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ added: number; updated: number; skipped: number; skippedReasons: string[] } | null>(null);
  const [category, setCategory] = useState<string>("");
  const [company, setCompany] = useState<string>("");
  // Supplier sheets state their length basis inconsistently across sub-tables
  // ("Rate Per/100 mtr" governs the main grid, but House Wire / Coaxial
  // sections often say nothing). Detection is per-row and can be wrong by
  // 100x, so the office can force one basis for the whole import here.
  const [basisOverride, setBasisOverride] = useState<string>("");
  // Supplier list prices are usually before the office's negotiated discount
  // — applied uniformly to every row at import time rather than requiring the
  // office to pre-discount the whole sheet by hand.
  const [discountPct, setDiscountPct] = useState<string>("");
  const [knownBrands, setKnownBrands] = useState<string[]>([]);
  const [extracted, setExtracted] = useState(false);

  // Drag-and-drop + hidden-input file picker, replacing the bare native
  // "Choose File" control (unstyled, and truncates the filename with no
  // way to see what's currently loaded at a glance).
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragActive, setIsDragActive] = useState(false);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setIsDragActive(true);
    else if (e.type === "dragleave") setIsDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  // Populate the brand datalist from whatever's already in the DB, so repeat
  // entry (e.g. "Polycab") is a pick, not a retype. Best-effort — an empty
  // list just means no suggestions, not a broken form.
  React.useEffect(() => {
    fetch("/api/wire-prices")
      .then((r) => r.json())
      .then((d) => setKnownBrands(Array.from(new Set((d.rows ?? []).map((r: any) => r.brand).filter(Boolean))).sort() as string[]))
      .catch(() => {});
  }, []);

  const handleFile = (file: File) => {
    setError(null);
    setSummary(null);
    setExtracted(false);
    setPreviewRows([]);
    setHeaders([]);
    setTotalRows(0);
    const reader = new FileReader();
    reader.onload = async (e) => {
      const fileData = e.target?.result as string;
      setFileName(file.name);
      setBusy(true);
      try {
        const res = await fetch("/api/wire-prices/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileData, fileName: file.name }),
        });
        if (!res.ok) throw new Error((await res.json()).error || `HTTP ${res.status}`);
        const data = await res.json();
        if (data.extracted) {
          setExtracted(true);
          setHeaders([]);
          setPreviewRows(data.rows);   // already MappedWireRow-shaped: internal_name, size_sqmm, cores, material, price_per_m
          setTotalRows(data.totalRows);
          setMapping({});               // no column mapping needed for the AI path
        } else {
          setExtracted(false);
          setHeaders(data.headers);
          setPreviewRows(data.rows);
          setTotalRows(data.totalRows);
          const stored = localStorage.getItem(mappingStorageKey(data.headers));
          setMapping(stored ? JSON.parse(stored) : guessMapping(data.headers));
        }
      } catch (err: any) {
        setError(err.message || "Could not parse file.");
      } finally {
        setBusy(false);
      }
    };
    reader.readAsDataURL(file);
  };

  // Effective ₹/m for a previewed row: the detected value, unless the office
  // forced a basis — then recompute from the printed figure — with the
  // discount applied last so it reads on top of the basis-corrected price.
  const effectivePrice = (r: any): number => {
    const base = !basisOverride || r.price_raw == null ? r.price_per_m : normalizeToPerMetre(r.price_raw, Number(basisOverride));
    const pct = parseFloat(discountPct);
    return Number.isFinite(pct) && pct > 0 ? base * (1 - Math.min(pct, 100) / 100) : base;
  };
  const effectiveBasis = (r: any) => (basisOverride ? Number(basisOverride) : r.price_covers_metres);

  const confirmImport = async () => {
    setBusy(true);
    setError(null);
    try {
      if (!extracted) { localStorage.setItem(mappingStorageKey(headers), JSON.stringify(mapping)); }
      const rowsToImport = extracted
        ? previewRows
        : previewRows.map((r) => {
            const out: Record<string, unknown> = {};
            for (const field of WIRE_FIELDS) {
              const col = mapping[field.key];
              if (col) out[field.key] = (r as Record<string, unknown>)[col];
            }
            return out;
          });
      const mapped = rowsToImport.map((r: any) => ({
        ...r,
        type: category,
        brand: company.trim(),
        // Re-derive from the printed figure when the office overrides the
        // basis, so the stored price_per_m always matches what's previewed.
        price_per_m: effectivePrice(r),
      }));
      const res = await fetch("/api/wire-prices/upsert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: mapped }),
      });
      if (!res.ok) throw new Error((await res.json()).error || `HTTP ${res.status}`);
      setSummary(await res.json());
      onImported();
    } catch (err: any) {
      setError(err.message || "Import failed.");
    } finally {
      setBusy(false);
    }
  };

  const requiredMapped = WIRE_FIELDS.filter((f) => f.required).every((f) => mapping[f.key]);

  return (
    <div className="glass-panel rounded-2xl p-5 space-y-4">
      <div className="flex flex-wrap gap-4">
        <label className="text-xs flex items-center gap-2">
          <span>Company *</span>
          <input list="wire-brand-options" placeholder="e.g. Polycab" value={company}
            onChange={(e) => setCompany(e.target.value)}
            className="bg-transparent border border-[var(--border-subtle)] rounded px-2 py-1" />
          <datalist id="wire-brand-options">
            {knownBrands.map((b) => <option key={b} value={b} />)}
          </datalist>
        </label>
        <label className="text-xs flex items-center gap-2">
          <span>Category *</span>
          <select className="bg-transparent border border-[var(--border-subtle)] rounded px-2 py-1"
            value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">— select —</option>
            {WIRE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="text-xs flex items-center gap-2">
          <span>Discount %</span>
          <input type="number" min={0} max={100} step="0.1" placeholder="0" value={discountPct}
            onChange={(e) => setDiscountPct(e.target.value)}
            className="w-16 bg-transparent border border-[var(--border-subtle)] rounded px-2 py-1 text-right" />
          <span className="text-[10px] text-[var(--text-muted)]">(Upload price only including GST)</span>
        </label>
      </div>
      <div
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        onClick={() => !busy && fileInputRef.current?.click()}
        className={`flex flex-col items-center justify-center gap-2 text-center px-4 py-10 rounded-xl border-2 border-dashed transition-colors ${
          busy ? "opacity-60 cursor-not-allowed" : "cursor-pointer"
        } ${
          isDragActive
            ? "border-[var(--accent-green)] bg-[var(--accent-green)]/10"
            : "border-[var(--border-subtle)] hover:border-[var(--accent-green)]/40 hover:bg-[var(--hover-bg)]"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.csv,.pdf,.jpg,.jpeg,.png"
          disabled={busy}
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          className="hidden"
        />
        {fileName ? (
          <FileCheck2 className="w-8 h-8 text-[var(--accent-green)]" />
        ) : (
          <Upload className="w-8 h-8 text-[var(--text-muted)]" />
        )}
        <span className="text-sm min-w-0 truncate max-w-full">
          {fileName ? (
            <span className="text-[var(--text-primary)] font-medium">{fileName}</span>
          ) : (
            <span className="text-[var(--text-secondary)]">Drag & drop a price list here, or click below</span>
          )}
        </span>
        <span className="text-[10px] text-[var(--text-muted)]">.xlsx .csv .pdf .jpg .png</span>
        <button
          type="button"
          disabled={busy}
          onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
          className="px-4 py-1.5 rounded-lg bg-[var(--accent-solid)] text-white text-xs font-semibold disabled:opacity-40"
        >
          Upload
        </button>
      </div>
      {error && <p className="text-red-500 text-sm">{error}</p>}
      {busy && (
        <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
          <MorphingInfinity className="w-5 h-5 text-[var(--accent-green)]" />
          {summary === null && previewRows.length === 0 ? "Reading file…" : "Importing…"}
        </div>
      )}
      {fileName && !extracted && headers.length > 0 && !summary && (
        <div className="space-y-3">
          <p className="text-sm text-[var(--text-muted)]">
            {fileName}: {totalRows} row(s) will be imported.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {WIRE_FIELDS.map((f) => (
              <label key={f.key} className="text-xs flex items-center gap-2">
                <span className="w-32">{f.label}{f.required ? " *" : ""}</span>
                <select className="flex-1 bg-transparent border border-[var(--border-subtle)] rounded px-1"
                  value={mapping[f.key] || ""}
                  onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value }))}>
                  <option value="">— skip —</option>
                  {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </label>
            ))}
          </div>
          <button disabled={!company.trim() || !category || !requiredMapped || busy} onClick={confirmImport}
            className="px-4 py-2 rounded bg-[var(--accent-solid)] text-white font-semibold disabled:opacity-40">
            {busy ? "Importing…" : `Import ${previewRows.length} row(s)`}
          </button>
        </div>
      )}
      {fileName && extracted && previewRows.length > 0 && !summary && (
        <div className="space-y-3">
          <p className="text-sm text-[var(--text-muted)]">
            Extracted {previewRows.length} row(s) from {fileName}. Review below, then import.
          </p>
          {/* Core split preview — confirms 1-core rows file to Single Core and
              the rest to Multi Core before anything is written. */}
          <div className="flex flex-wrap gap-3 text-[11px] text-[var(--text-muted)]">
            <span>Single-core: <strong className="text-[var(--text-primary)]">{previewRows.filter((r: any) => r.cores === 1).length}</strong></span>
            <span>Multi-core: <strong className="text-[var(--text-primary)]">{previewRows.filter((r: any) => r.cores > 1).length}</strong></span>
            <span>No core info: <strong className="text-[var(--text-primary)]">{previewRows.filter((r: any) => !r.cores).length}</strong></span>
          </div>

          <div className="flex flex-wrap items-center gap-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <span className="text-[11px] text-[var(--text-secondary)]">
              <strong className="text-[var(--text-primary)]">Check the price basis.</strong> A sheet headed “Rate Per/100 mtr” means
              ₹2040 is ₹20.40/m. If the ₹/m column looks 100× too high, force the basis:
            </span>
            <select value={basisOverride} onChange={(e) => setBasisOverride(e.target.value)}
              className="bg-transparent border border-[var(--border-subtle)] rounded px-2 py-1 text-xs">
              <option value="">As detected per row</option>
              <option value="1">All prices are per 1 m</option>
              <option value="90">All prices are per 90 m</option>
              <option value="100">All prices are per 100 m</option>
              <option value="305">All prices are per 305 m</option>
            </select>
          </div>
          <div className="max-h-64 overflow-auto text-xs">
            <table className="w-full">
              <thead><tr className="text-left text-[var(--text-muted)]">
                <th>Name</th><th>Size</th><th>Cores</th><th>Material</th><th>Printed</th><th>Basis</th><th>₹/m</th><th>Files to</th>
              </tr></thead>
              <tbody>
                {previewRows.map((r: any, i: number) => (
                  <tr key={i} className="border-t border-[var(--border-subtle)]">
                    <td>{r.internal_name}</td>
                    <td>{r.size_sqmm ?? "—"}</td>
                    <td>{r.cores ?? "—"}</td>
                    <td>{r.material ?? "—"}</td>
                    <td className="text-[var(--text-muted)]">{r.price_raw ?? "—"}</td>
                    <td className={basisOverride ? "text-amber-500" : "text-[var(--text-muted)]"}>
                      {effectiveBasis(r) > 1 ? `per ${effectiveBasis(r)}m` : "per m"}
                    </td>
                    <td className="font-semibold text-[var(--accent-green)]">{effectivePrice(r)}</td>
                    <td className="text-[10px] text-[var(--text-muted)]">{resolveWireType(category, r.cores)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button disabled={!company.trim() || !category || busy} onClick={confirmImport}
            className="px-4 py-2 rounded bg-[var(--accent-solid)] text-white font-semibold disabled:opacity-40">
            {busy ? "Importing…" : `Import ${previewRows.length} row(s)`}
          </button>
        </div>
      )}
      {fileName && extracted && previewRows.length === 0 && !error && !summary && (
        <p className="text-sm text-[var(--text-muted)]">
          No wire prices could be extracted from {fileName}. Try a clearer photo or a different file.
        </p>
      )}
      {summary && (
        <p className="text-sm">
          Added {summary.added}, updated {summary.updated}, skipped {summary.skipped}.
          {summary.skippedReasons.length > 0 && (
            <span className="block text-[var(--text-muted)] mt-1">{summary.skippedReasons.join("; ")}</span>
          )}
        </p>
      )}
    </div>
  );
}
