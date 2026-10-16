// src/modules/proposal/components/InverterPriceUpload.tsx
// Upload wizard: pick file -> preview parsed rows -> map columns -> confirm.
// Mirrors WirePriceUpload.tsx closely, including its PDF/image AI-extraction
// branch (inverterPriceExtraction.ts) — vendor pricelists (Deye, Growatt, ...)
// are usually PDFs, not spreadsheets. Brand + System Type are picked once,
// file-wide (like Wire's Company/Category), and stamped onto every row —
// every vendor pricelist seen is one brand/one system type per document.
import React, { useEffect, useRef, useState } from "react";
import { ChevronDown, Upload, FileCheck2 } from "lucide-react";
import MorphingInfinity from "../../../components/MorphingInfinity";
import { SystemType } from "../types";

const INVERTER_FIELDS: { key: string; label: string; required?: boolean }[] = [
  { key: "model", label: "Model", required: true },
  { key: "phase", label: "Phase", required: true },
  { key: "kw", label: "kW", required: true },
  { key: "price", label: "Price", required: true },
  { key: "category", label: "Category" },
  { key: "cost", label: "Cost" },
  { key: "notes", label: "Notes" },
];

const SYSTEM_TYPES: SystemType[] = ["On-Grid", "Off-Grid", "Hybrid"];

function guessMapping(headers: string[]): Record<string, string> {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const guesses: Record<string, string> = {};
  for (const field of INVERTER_FIELDS) {
    const key = norm(field.key);
    const hit = headers.find((h) => {
      const nh = norm(h);
      if (field.key === "kw") return nh === "kw" || nh.includes("capacity") || nh.includes("size");
      if (field.key === "model") return nh.includes("model");
      if (field.key === "price") return nh.includes("price") || nh.includes("rate");
      return nh.includes(key) || key.includes(nh);
    });
    if (hit) guesses[field.key] = hit;
  }
  return guesses;
}

function mappingStorageKey(headers: string[]): string {
  return "inverterUploadMapping:" + headers.slice().sort().join("|");
}

export default function InverterPriceUpload({ onImported }: { onImported: () => void }) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<Record<string, unknown>[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ added: number; updated: number; skipped: number; skippedReasons: string[] } | null>(null);
  const [brand, setBrand] = useState("");
  const [systemType, setSystemType] = useState<SystemType | "">("");
  const [knownBrands, setKnownBrands] = useState<string[]>([]);
  const [extracted, setExtracted] = useState(false);

  // Custom dropdown instead of a native <select>: Windows Chrome renders
  // <select> popups via OS-level list-box chrome that ignores author CSS
  // on <option> entirely, so the dark theme's near-white text becomes
  // unreadable against the browser's own (light) native popup — no CSS fix
  // reaches it. A real styled <div> popup sidesteps that completely.
  const [systemTypeOpen, setSystemTypeOpen] = useState(false);
  const systemTypeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!systemTypeOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (systemTypeRef.current && !systemTypeRef.current.contains(e.target as Node)) setSystemTypeOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [systemTypeOpen]);

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
  // entry (e.g. "Deye") is a pick, not a retype.
  React.useEffect(() => {
    fetch("/api/inverter-prices")
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
        const res = await fetch("/api/inverter-prices/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileData, fileName: file.name }),
        });
        if (!res.ok) throw new Error((await res.json()).error || `HTTP ${res.status}`);
        const data = await res.json();
        if (data.extracted) {
          setExtracted(true);
          setHeaders([]);
          setPreviewRows(data.rows); // already { model, phase, kw, price }
          setTotalRows(data.totalRows);
          setMapping({});
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

  const confirmImport = async () => {
    setBusy(true);
    setError(null);
    try {
      if (!extracted) localStorage.setItem(mappingStorageKey(headers), JSON.stringify(mapping));
      const rowsToImport = extracted
        ? previewRows
        : previewRows.map((r) => {
            const out: Record<string, unknown> = {};
            for (const field of INVERTER_FIELDS) {
              const col = mapping[field.key];
              if (col) out[field.key] = (r as Record<string, unknown>)[col];
            }
            return out;
          });
      const mapped = rowsToImport.map((r: any) => ({ ...r, brand: brand.trim(), system_type: systemType }));
      const res = await fetch("/api/inverter-prices/upsert", {
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

  const requiredMapped = INVERTER_FIELDS.filter((f) => f.required).every((f) => mapping[f.key]);
  const canImport = brand.trim() && systemType && !busy;

  return (
    <div className="glass-panel rounded-2xl p-5 space-y-4">
      <div className="flex flex-wrap items-center gap-4">
        <label className="text-xs flex items-center gap-2">
          <span>Brand *</span>
          <input
            list="inverter-brand-options"
            placeholder="e.g. Deye"
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            className="bg-transparent border border-[var(--border-subtle)] rounded px-2 py-1"
          />
          <datalist id="inverter-brand-options">
            {knownBrands.map((b) => (
              <option key={b} value={b} />
            ))}
          </datalist>
        </label>
        <div className="text-xs flex items-center gap-2 relative" ref={systemTypeRef}>
          <span>System Type *</span>
          <button
            type="button"
            onClick={() => setSystemTypeOpen((o) => !o)}
            aria-haspopup="listbox"
            aria-expanded={systemTypeOpen}
            className="bg-transparent border border-[var(--border-subtle)] rounded px-2 py-1 min-w-[104px] flex items-center justify-between gap-2 cursor-pointer text-[var(--text-primary)]"
          >
            <span>{systemType || "— select —"}</span>
            <ChevronDown className="w-3 h-3 opacity-60 shrink-0" />
          </button>
          {systemTypeOpen && (
            <div
              role="listbox"
              className="glass-popover absolute top-full left-0 mt-1 z-20 min-w-[104px] rounded-lg overflow-hidden"
            >
              {SYSTEM_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  role="option"
                  aria-selected={t === systemType}
                  onClick={() => {
                    setSystemType(t);
                    setSystemTypeOpen(false);
                  }}
                  className={`block w-full text-left px-2 py-1.5 cursor-pointer hover:bg-[var(--hover-bg)] ${
                    t === systemType ? "text-[var(--accent-green)] font-semibold" : "text-[var(--text-primary)]"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          )}
        </div>
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
            {INVERTER_FIELDS.map((f) => (
              <label key={f.key} className="text-xs flex items-center gap-2">
                <span className="w-32">
                  {f.label}
                  {f.required ? " *" : ""}
                </span>
                <select
                  className="flex-1 bg-transparent border border-[var(--border-subtle)] rounded px-1"
                  value={mapping[f.key] || ""}
                  onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value }))}
                >
                  <option value="">— skip —</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <button disabled={!canImport || !requiredMapped} onClick={confirmImport} className="px-4 py-2 rounded bg-[var(--accent-solid)] text-white font-semibold disabled:opacity-40">
            {busy ? "Importing…" : `Import ${previewRows.length} row(s)`}
          </button>
        </div>
      )}
      {fileName && extracted && previewRows.length > 0 && !summary && (
        <div className="space-y-3">
          <p className="text-sm text-[var(--text-muted)]">
            Extracted {previewRows.length} row(s) from {fileName}. Review below, then import.
          </p>
          <div className="max-h-64 overflow-auto text-xs">
            <table className="w-full">
              <thead>
                <tr className="text-left text-[var(--text-muted)]">
                  <th>Model</th>
                  <th>Phase</th>
                  <th>kW</th>
                  <th>Price</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map((r: any, i: number) => (
                  <tr key={i} className="border-t border-[var(--border-subtle)]">
                    <td>{r.model}</td>
                    <td className="text-[var(--text-muted)]">{r.phase || "—"}</td>
                    <td>{r.kw}</td>
                    <td className="font-semibold text-[var(--accent-green)]">{r.price}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button disabled={!canImport} onClick={confirmImport} className="px-4 py-2 rounded bg-[var(--accent-solid)] text-white font-semibold disabled:opacity-40">
            {busy ? "Importing…" : `Import ${previewRows.length} row(s)`}
          </button>
        </div>
      )}
      {fileName && extracted && previewRows.length === 0 && !error && !summary && (
        <p className="text-sm text-[var(--text-muted)]">No inverter prices could be extracted from {fileName}. Try a clearer photo or a different file.</p>
      )}
      {summary && (
        <p className="text-sm">
          Added {summary.added}, updated {summary.updated}, skipped {summary.skipped}.
          {summary.skippedReasons.length > 0 && <span className="block text-[var(--text-muted)] mt-1">{summary.skippedReasons.join("; ")}</span>}
        </p>
      )}
    </div>
  );
}
