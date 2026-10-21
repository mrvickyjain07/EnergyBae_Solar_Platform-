import React, { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { motion, AnimatePresence } from "motion/react";
import { RefreshCw, AlertCircle, FileSpreadsheet, Cloud, Plus, X } from "lucide-react";
import BillEnhancer from "../../components/BillEnhancer";
import AnimatedNumber from "../../components/AnimatedNumber";
import ScanProgress from "../../components/ScanProgress";
import type { ScanStep } from "../../scanSteps";
import {
  CommercialBillData,
  CommercialTodSlotReading,
  TodSlotId,
  buildBlankCommercialBillData,
} from "./types";
import {
  buildBlankBillingRows,
  buildBillingHistoryWindow,
  computeBillingStats, monthlyFixedOf,
  detectTodMode,
  computeTodUtilisation, todTotalsOf,
  computeMeterDerived,
  reconcileCharges,
  computeValidationChecks,
  DEFAULT_SIZING,
  type SizingSettings,
} from "./commercialCalculations";
import { analyseCommercial } from "./consumptionSizing";
import { billFromExtraction, extractionVersionError } from "./extractionResult";
import { chargeSuggestions, todSuggestions, type ChargeCategory, type SuggestField } from "./chargeMapping";

const SUGGEST_LABEL: Record<SuggestField, string> = { fac: "FAC", tose: "Tax on Sale", wheelingCharges: "Wheeling Charges" };

const CATEGORY_LABEL: Record<ChargeCategory, string> = {
  energy: "Energy", tod: "TOD Tariff EC", demand: "Demand", fixed: "Fixed", fac: "FAC", ed: "Electricity duty", tose: "Tax on sale",
  wheeling: "Wheeling", other: "Other", arrears: "Arrears", interest: "Interest (arrears)", credit: "Credit",
  currentTotal: "Total current bill", billAmount: "Bill amount (rounded)", afterDue: "Payable after due date",
  lateFeeIfLate: "Late fee — only if paid late", conditional: "Conditional discount — not applied", subtotal: "Subtotal / base — not added",
  unmapped: "Unrecognised — not counted",
};
import CiSizingPanel from "./CiSizingPanel";
import CommercialGoogleSheetsExportModal from "./CommercialGoogleSheetsExportModal";
import "./commercial-bill-analysis.css";

const OCR_STAGES = [
  "Reading Bill...",
  "Extracting Consumer Details...",
  "Extracting Meter Readings...",
  "Extracting Billing History...",
  "Extracting Charge Components...",
  "Generating Analysis...",
];

// One checklist row per OCR stage, evenly spaced across 0–100%.
const COMMERCIAL_SCAN_STEPS: ScanStep[] = OCR_STAGES.map((label, i) => ({
  label: label.replace(/\.{3}$/, ""),
  start: (i / OCR_STAGES.length) * 100,
}));

const fmtINR = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
const fmtNum = (n: number) => Math.round(n).toLocaleString("en-IN");
const pct = (n: number, places = 2) => `${(n * 100).toFixed(places)}%`;

function numOrBlank(v: number | "" | undefined): string {
  return v === "" || v === undefined ? "" : String(v);
}

/** A bill handed in by the unified Bill Analysis page (App.tsx). `nonce`
 *  changes on every "Scan bill" click so re-scanning the same file re-runs. */
export interface ExternalBillFile {
  data: string;
  name: string;
  nonce: number;
}

/** The analysis as it stands — exactly the inputs the Excel export posts.
 *  Handed to the parent so it can save the bill to a project; the parent
 *  never recomputes or edits it. */
export interface CommercialAnalysisResult extends SizingSettings {
  /** The bill being sized (Several bills: the latest bill of the sized connection). */
  data: CommercialBillData;
  /** Several bills only: every extracted bill, so the server can re-consolidate. */
  bills?: CommercialBillData[];
}

interface Props {
  externalFile?: ExternalBillFile | null;
  /** The unified page owns the upload box; hide this component's own. */
  hideUploader?: boolean;
  /** Called once a result exists (scan or manual entry) and after every edit. */
  onResult?: (result: CommercialAnalysisResult) => void;
}

export default function CommercialBillAnalysis({ externalFile, hideUploader, onResult }: Props = {}) {
  const canUseGoogle = useAuth().can("bill_analysis.import");
  const [data, setData] = useState<CommercialBillData>(() => ({
    ...buildBlankCommercialBillData(),
    billingHistory: buildBlankBillingRows(),
  }));

  const [sizing, setSizing] = useState<SizingSettings>(DEFAULT_SIZING);
  const updateSizing = (patch: Partial<SizingSettings>) => setSizing((prev) => ({ ...prev, ...patch }));

  const [fileData, setFileData] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [stageIdx, setStageIdx] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showGoogleSheetsModal, setShowGoogleSheetsModal] = useState(false);
  // In the unified flow the analysis stays hidden until a scan succeeds (or
  // the user opts into manual entry after a failed scan).
  const [hasResult, setHasResult] = useState(false);
  const showDashboard = !hideUploader || hasResult;
  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleFileLoaded = (base64: string, name: string) => {
    setFileData(base64);
    setFileName(name);
    setErrorMsg(null);
  };

  // `file` is passed explicitly when a scan is triggered from outside —
  // state set in the same tick wouldn't be visible to this call yet.
  const runExtraction = async (file?: { data: string; name: string }) => {
    const fd = file?.data ?? fileData;
    const fn = file?.name ?? fileName;
    if (!fd || !fn) return;
    setIsLoading(true);
    setErrorMsg(null);
    setStageIdx(0);

    progressTimer.current = setInterval(() => {
      setStageIdx((prev) => (prev < OCR_STAGES.length - 1 ? prev + 1 : prev));
    }, 700);

    try {
      const response = await fetch("/api/commercial/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileData: fd, fileName: fn }),
      });
      const res = await response.json();
      if (progressTimer.current) clearInterval(progressTimer.current);

      const stale = res.success ? extractionVersionError(res) : null;
      if (res.success && res.data && !stale) {
        // A scan replaces the bill outright — never merged onto the previous bill's values.
        setData(billFromExtraction(res.data as Partial<CommercialBillData>, fn));
        setStageIdx(OCR_STAGES.length);
        setHasResult(true);
        setTimeout(() => setIsLoading(false), 500);
      } else {
        setIsLoading(false);
        setErrorMsg(stale ?? res.error ?? "Unable to extract bill. Please upload a higher quality document.");
      }
    } catch (err: any) {
      if (progressTimer.current) clearInterval(progressTimer.current);
      setIsLoading(false);
      setErrorMsg("Unable to extract bill. Please upload a higher quality document.");
    }
  };

  useEffect(() => {
    if (!externalFile) return;
    setFileData(externalFile.data);
    setFileName(externalFile.name);
    setErrorMsg(null);
    runExtraction(externalFile);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only on a new scan
  }, [externalFile?.nonce]);

  useEffect(() => {
    if (hasResult) onResult?.({ data, ...sizing });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onResult identity is the parent's concern
  }, [hasResult, data, sizing]);

  // Every figure on screen is derived from `data`, so an edit recalculates everything. The bill's own
  // month in the history table is a copy of its kWh/kVAh and bill amount, so it is kept in step too.
  const updateField = <K extends keyof CommercialBillData>(key: K, value: CommercialBillData[K]) => {
    setData((prev) => ({ ...prev, [key]: value }));
  };

  const updateBillRow = (idx: number, key: "units" | "billAmount", value: number | "") => {
    setData((prev) => {
      const rows = [...prev.billingHistory];
      rows[idx] = { ...rows[idx], [key]: value };
      return { ...prev, billingHistory: rows };
    });
  };

  // Inserts a blank row just before the last one — the last row is always
  // the "current" period by convention (see commercialCalculations.ts), so
  // a manually-added month is always an older month, never bumps CURRENT.
  const addBillingMonth = () => {
    setData((prev) => {
      const rows = [...prev.billingHistory];
      const insertAt = rows.length > 0 ? rows.length - 1 : 0;
      rows.splice(insertAt, 0, { monthLabel: "", units: "", billAmount: "" });
      return { ...prev, billingHistory: rows };
    });
  };

  const removeBillingMonth = (idx: number) => {
    setData((prev) => {
      if (prev.billingHistory.length <= 1) return prev;
      const rows = [...prev.billingHistory];
      rows.splice(idx, 1);
      return { ...prev, billingHistory: rows };
    });
  };

  const updateTodSlot = (slot: TodSlotId, value: number | "") => {
    setData((prev) => ({
      ...prev,
      todSlots: prev.todSlots.map((s) => (s.slot === slot ? { ...s, units: value } : s)),
    }));
  };

  // ─── Derived calculations (single source of truth, shared with Excel export) ──
  const todMode = useMemo(() => detectTodMode(data.connectionType), [data.connectionType]);
  const monthlyFixed = monthlyFixedOf(data);
  const stats = useMemo(() => computeBillingStats(data.billingHistory, monthlyFixed), [data.billingHistory, monthlyFixed]);
  const tod = useMemo(() => computeTodUtilisation(data.todSlots, undefined, todTotalsOf(data)), [data]);
  const meter = useMemo(() => computeMeterDerived(data), [data]);
  const recon = useMemo(() => reconcileCharges(data), [data]);
  // Sized on this bill's active energy (kWh) — same engine as Several bills and the exports.
  const analysis = useMemo(() => analyseCommercial([{ data, sourceId: data.filename || "bill" }], sizing), [data, sizing]);
  const historySized = analysis.baseline?.source === "history";
  const todFixes = useMemo(() => todSuggestions(data.todRows, data.todSlots, todTotalsOf(data)), [data]);
  const suggestions = useMemo(() => recon.printedCurrentTotal > 0
    ? chargeSuggestions(data.chargeLines, data, Number(data.billedUnits) || Number(data.activeKwh) || 0, recon.printedCurrentTotal - recon.currentCharges)
    : [], [data, recon]);
  const checks = useMemo(() => computeValidationChecks(stats, tod, meter, recon, data, historySized), [stats, tod, meter, recon, data, historySized]);

  const handleExcelDownload = async () => {
    try {
      const response = await fetch("/api/commercial/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data, ...sizing }),
      });
      if (!response.ok) throw new Error("Failed to compile commercial workbook.");
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Commercial_Bill_Analysis_${data.consumerNo || "Untitled"}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert("Error downloading commercial Excel workbook: " + err.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Upload + extraction control. Hidden when the unified Bill Analysis
          page owns the upload — progress and errors still show here. */}
      {!hideUploader && (
        <div className="glass-panel rounded-2xl p-6 space-y-4">
          <div>
            <h3 className="text-base font-semibold text-[var(--text-primary)]">Upload bill</h3>
            <p className="text-sm text-[var(--text-muted)] mt-1">Commercial, industrial, HT or TOD MSEDCL bill.</p>
          </div>
          <BillEnhancer onFileLoaded={handleFileLoaded} isLoading={isLoading} selectedFileName={fileName} fileSrc={fileData} />
          {fileName && !isLoading && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => runExtraction()}
                className="h-9 px-4 rounded-lg bg-[var(--accent-solid)] text-sm font-medium text-white hover:opacity-90 shadow-sm flex items-center gap-2 cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" /> Begin extraction
              </button>
            </div>
          )}
        </div>
      )}
      {isLoading && (
        // stageIdx parks on the last stage until the server answers, then
        // jumps to OCR_STAGES.length (= 100%) on success — so the final
        // step only completes when extraction really has.
        <ScanProgress
          title="Reading your commercial bill"
          steps={COMMERCIAL_SCAN_STEPS}
          progress={(stageIdx / OCR_STAGES.length) * 100}
          preview={fileData}
          fileName={fileName}
        />
      )}
      {errorMsg && (
        <div className="p-4 rounded-xl border border-red-500/30 bg-red-500/10 flex items-start gap-3 text-sm">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-red-500" />
          <div>
            <p className="font-medium text-[var(--text-primary)]">Extraction failed</p>
            <p className="mt-1 text-[var(--text-secondary)]">{errorMsg}</p>
            {!hasResult && (
              <button
                type="button"
                onClick={() => setHasResult(true)}
                className="mt-3 h-8 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-primary)] hover:bg-[var(--hover-bg)] text-xs font-medium cursor-pointer"
              >
                Enter bill details manually
              </button>
            )}
          </div>
        </div>
      )}

      {/* ─── Commercial dashboard (port of bill-analysis-v3.html) ─────────────── */}
      {/* Hidden, not unmounted — keeps the worksheet's state intact. Inline
          display wins over .cba's own `display:flex`. */}
      <div className="cba" style={showDashboard ? undefined : { display: "none" }}>
        <div className="ocr-strip">
          <div className={`ocr-dot ${isLoading ? "pending" : data.filename ? "" : "idle"}`} />
          <span className="ocr-txt">Scanned document: <span className="hl">{data.filename || "—"}</span></span>
          <span className="ocr-txt">·</span>
          <span className="ocr-txt">Extraction confidence: <span className="hl">{data.confidence > 0 ? `${data.confidence.toFixed(1)}%` : "—"}</span></span>
        </div>

        <div className="cba-cstrip">
          <span className="cstrip-lbl">Solar constants ·</span>
          <div className="citem"><span className="citem-k">Panel</span>
            <input className="citem-inp" value={sizing.panelWatt} onChange={(e) => updateSizing({ panelWatt: Number(e.target.value) || 600 })} />
            <span className="citem-k">W</span></div>
          <div className="csep" />
          <div className="citem"><span className="citem-k">Yield (assumed)</span>
            <span className="citem-v">{sizing.specificYield}</span><span className="citem-k">kWh/kWp/yr · edit in § 05</span></div>
          <div className="csep" />
          <div className="citem badge-auto">
            <span className="citem-k" style={{ color: "var(--purple)" }}>TOD mode (auto)</span>
            <span className="citem-v" style={{ color: "var(--purple)" }}>{data.connectionType ? (todMode === "LT" ? "LT-II C" : "HT") : "—"}</span>
          </div>
        </div>

        <div className="cba-body">
          {/* §01 Consumer Master */}
          <div className="sec">
            <span className="sec-lbl">§ 01 — Consumer Master</span>
            <div className="sec-line" />
            <span className="badge badge-auto">From OCR</span>
          </div>
          <div className="g2">
            <div className="card">
              <div className="card-h"><span className="card-t">Consumer Identity</span></div>
              <div className="card-b">
                <div className="fr2">
                  <div className="f"><div className="flbl">Consumer No <span className="req">*</span></div>
                    <input className="inp" placeholder="12-digit MSEDCL ID" value={data.consumerNo} onChange={(e) => updateField("consumerNo", e.target.value)} /></div>
                  <div className="f"><div className="flbl">Consumer Name <span className="req">*</span></div>
                    <input className="inp" placeholder="Name as on bill" value={data.consumerName} onChange={(e) => updateField("consumerName", e.target.value)} /></div>
                </div>
                <div className="f"><div className="flbl">Address</div>
                  <input className="inp" placeholder="Address from bill" value={data.address} onChange={(e) => updateField("address", e.target.value)} /></div>
                <div className="fr3">
                  <div className="f"><div className="flbl">Connection Type <span className="ocr-pill">Auto · OCR</span></div>
                    <select className="inp" value={data.connectionType} onChange={(e) => updateField("connectionType", e.target.value as CommercialBillData["connectionType"])}>
                      <option value="">—</option>
                      <option value="LT">LT</option>
                      <option value="HT">HT</option>
                    </select>
                    <div className="hint">Drives TOD mode below — change if OCR misread it</div></div>
                  <div className="f"><div className="flbl">Category</div>
                    <select className="inp" value={data.category} onChange={(e) => updateField("category", e.target.value)}>
                      <option value="">—</option>
                      <option>Commercial</option><option>Industrial</option>
                    </select></div>
                  <div className="f"><div className="flbl">ED Code</div>
                    <input className="inp" placeholder="e.g. 06 PART B" value={data.edCode} onChange={(e) => updateField("edCode", e.target.value)} /></div>
                </div>
              </div>
            </div>
            <div className="card">
              <div className="card-h"><span className="card-t">Technical Parameters</span></div>
              <div className="card-b">
                <div className="fr3">
                  <div className="f"><div className="flbl">Sanct. Load (as printed)</div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <input className="inp" type="number" placeholder="e.g. 200" value={numOrBlank(data.sanctionedLoad)} onChange={(e) => updateField("sanctionedLoad", e.target.value === "" ? "" : Number(e.target.value))} />
                      <select className="inp" style={{ width: 78 }} value={data.sanctionedLoadUnit} onChange={(e) => updateField("sanctionedLoadUnit", e.target.value as CommercialBillData["sanctionedLoadUnit"])}>
                        <option value="">unit?</option><option>HP</option><option>kW</option><option>kVA</option>
                      </select>
                    </div>
                    <div className="hint">{analysis.sanctioned.kw !== null ? (analysis.sanctioned.method === "HP × 0.746" ? `= ${analysis.sanctioned.kw} kW (HP × 0.746)` : `${analysis.sanctioned.kw} kW`) : analysis.sanctioned.warning ?? "Unit printed on the bill"}</div></div>
                  <div className="f"><div className="flbl">Contract Demand (KVA) <span className="req">*</span></div>
                    <input className="inp" type="number" placeholder="KVA" value={numOrBlank(data.contractDemand)} onChange={(e) => updateField("contractDemand", e.target.value === "" ? "" : Number(e.target.value))} />
                    <div className="hint">kVA — never converted to kW</div></div>
                  <div className="f"><div className="flbl">Fixed Charges (₹)</div>
                    <input className="inp" type="number" readOnly placeholder="from Demand Charges" value={numOrBlank(monthlyFixed)} />
                    <div className="hint">Demand Charges{Number(data.fixedCharges) > 0 ? " + printed Fixed Charges line" : ""} · edit them under Charges</div></div>
                </div>
                <div className="fr3">
                  <div className="f"><div className="flbl">Connected Load (as printed)</div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <input className="inp" type="number" placeholder="optional" value={numOrBlank(data.connectedLoad)} onChange={(e) => updateField("connectedLoad", e.target.value === "" ? "" : Number(e.target.value))} />
                      <select className="inp" style={{ width: 78 }} value={data.connectedLoadUnit} onChange={(e) => updateField("connectedLoadUnit", e.target.value as CommercialBillData["connectedLoadUnit"])}>
                        <option value="">unit?</option><option>HP</option><option>kW</option><option>kVA</option>
                      </select>
                    </div>
                    <div className="hint">{analysis.connected.kw !== null && data.connectedLoadUnit === "HP" ? `= ${analysis.connected.kw} kW (HP × 0.746)` : "Kept separate from sanctioned load and contract demand"}</div></div>
                </div>
                <div className="fr3">
                  <div className="f"><div className="flbl">Security Deposit (₹)</div>
                    <input className="inp" type="number" placeholder="₹" value={numOrBlank(data.securityDeposit)} onChange={(e) => updateField("securityDeposit", e.target.value === "" ? "" : Number(e.target.value))} /></div>
                  <div className="f"><div className="flbl">Meter Number</div>
                    <input className="inp" placeholder="Meter No." value={data.meterNo} onChange={(e) => updateField("meterNo", e.target.value)} /></div>
                  <div className="f"><div className="flbl">TOD Mode <span className="ocr-pill">Auto · OCR</span></div>
                    <input className="inp" readOnly placeholder="Auto from OCR" value={data.connectionType ? (todMode === "LT" ? "LT (auto)" : "HT (auto)") : ""} />
                    <div className="hint">Uses the LT-II C TOD ruleset — see § 04 below</div></div>
                </div>
                <div className="fr2">
                  <div className="f"><div className="flbl">Existing Solar <span className="ocr-pill">Auto · OCR</span></div>
                    <input
                      className="inp"
                      readOnly
                      placeholder="Auto from OCR"
                      value={
                        !data.hasSolar
                          ? "None detected"
                          : data.solarCapacityKw !== "" && Number(data.solarCapacityKw) > 0
                          ? `${data.solarCapacityKw} kW (nameplate)`
                          : data.solarGenerationUnits !== "" && Number(data.solarGenerationUnits) > 0
                          ? `${fmtNum(Number(data.solarGenerationUnits))} kWh generated (no nameplate on bill)`
                          : ""
                      }
                    />
                    <div className="hint">Installed on this bill — independent of the § 05 recommended sizing below</div></div>
                  <div className="f"><div className="flbl">Solar Source Field</div>
                    <input className="inp" readOnly placeholder="—" value={data.solarSourceField} />
                    <div className="hint">Audit trail: which label/table this was read from</div></div>
                </div>
              </div>
            </div>
          </div>

          {/* §02 Billing History */}
          <div className="sec">
            <span className="sec-lbl">§ 02 — Billing History ({data.billingHistory.length} months)</span>
            <div className="sec-line" />
            <span className="badge badge-auto">{historySized ? "Sizing baseline · printed months only" : "Reference only · not used for sizing"}</span>
          </div>
          <div className="card">
            <div className="card-h">
              <span className="card-t">Monthly Bill Data</span>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 12, color: "var(--muted)" }}>Units measured in{" "}
                  <select className="ti" style={{ width: 80 }} value={data.billingHistoryUnit} onChange={(e) => updateField("billingHistoryUnit", e.target.value as CommercialBillData["billingHistoryUnit"])}>
                    <option value="unknown">unit?</option><option>kVAh</option><option>kWh</option>
                  </select>
                  {" "}· {monthlyFixed !== "" ? `(bill − ₹${monthlyFixed} fixed/demand) ÷ units` : "bill ÷ units is an all-in ratio"}, not an energy rate</span>
                <button
                  type="button"
                  onClick={addBillingMonth}
                  style={{
                    display: "flex", alignItems: "center", gap: 4,
                    fontSize: 12, fontWeight: 700,
                    color: "var(--cyan)", background: "transparent", border: "1px solid var(--cyan)",
                    borderRadius: 6, padding: "3px 8px", cursor: "pointer",
                  }}
                >
                  <Plus size={11} /> Add Month
                </button>
              </div>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table className="tbl">
                <thead><tr>
                  <th style={{ width: 26 }}>#</th>
                  <th>Month</th>
                  <th className="r">Units ({data.billingHistoryUnit === "unknown" ? "billed" : data.billingHistoryUnit})</th>
                  <th className="r">Bill amount (₹)</th>
                  <th className="r" title="Bill amount (incl. demand, duty, taxes, minus any printed fixed charges) ÷ history units — not an energy rate">{monthlyFixed !== "" ? "(Bill − fixed/demand) ÷ units (₹)" : "Bill ÷ units (₹, all-in)"}</th>
                  <th className="c">Status</th>
                  <th style={{ width: 28 }} />
                </tr></thead>
                <tbody>
                  {data.billingHistory.map((row, idx) => {
                    const flags = stats.rows[idx];
                    const isCurrent = idx === data.billingHistory.length - 1;
                    const rowClass = isCurrent ? "cur" : flags?.isOutlier ? "out" : flags?.isZero ? "zero" : "";
                    return (
                      <tr key={idx} className={rowClass}>
                        <td className="cm" style={{ fontSize: 11 }}>{idx + 1}</td>
                        <td style={{ fontSize: 12, color: isCurrent ? "var(--cyan)" : "var(--txt)" }}>{row.monthLabel}</td>
                        <td className="r">
                          <input className="ti" placeholder="--" value={numOrBlank(row.units)} onChange={(e) => updateBillRow(idx, "units", e.target.value === "" ? "" : Number(e.target.value))} />
                        </td>
                        <td className="r">
                          <input className="ti" placeholder="--" value={numOrBlank(row.billAmount)} onChange={(e) => updateBillRow(idx, "billAmount", e.target.value === "" ? "" : Number(e.target.value))} />
                        </td>
                        <td className={`r ${flags?.unitCost !== null && flags?.unitCost !== undefined ? "cc" : "cm"}`}>
                          {flags?.unitCost !== null && flags?.unitCost !== undefined ? `₹${flags.unitCost.toFixed(4)}` : "--"}
                        </td>
                        <td className="tc">
                          {isCurrent ? <span className="flag f-cur">Current</span>
                            : flags?.isOutlier ? <span className="flag f-out">Outlier</span>
                            : flags?.isDemandOnly ? <span className="flag f-dem">Demand only</span>
                            : flags?.isZero ? <span className="flag f-zero">Zero</span>
                            : null}
                        </td>
                        <td className="tc">
                          {data.billingHistory.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeBillingMonth(idx)}
                              title="Remove this month"
                              style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 18, height: 18, border: "none", background: "transparent", color: "var(--muted)", cursor: "pointer" }}
                            >
                              <X size={13} />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: "var(--surf)" }}>
                    <td colSpan={2} style={{ fontSize: 12, color: "var(--cyan)", padding: 9 }}>Average (valid months)</td>
                    <td className="tr cc">{stats.avgUnits > 0 ? `${fmtNum(stats.avgUnits)} ${data.billingHistoryUnit === "unknown" ? "units" : data.billingHistoryUnit}` : "--"}</td>
                    <td className="tr cc">{stats.avgBillAmount > 0 ? fmtINR(stats.avgBillAmount) : "--"}</td>
                    <td className="tr cc">{stats.avgUnitCost > 0 ? `₹${stats.avgUnitCost.toFixed(4)}` : "--"}</td>
                    <td /><td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* §03 Meter + Charges */}
          <div className="sec">
            <span className="sec-lbl">§ 03 — Current Bill Breakdown</span>
            <div className="sec-line" />
            <span className="badge badge-auto">From OCR · reconciled ±₹10</span>
          </div>
          <div className="g2">
            <div className="card">
              <div className="card-h"><span className="card-t">Meter Readings</span></div>
              <div className="card-b">
                <div className="fr2">
                  <div className="f"><div className="flbl">KWH register — previous</div>
                    <input className="inp" type="number" placeholder="cumulative reading" value={numOrBlank(data.prevReading)} onChange={(e) => updateField("prevReading", e.target.value === "" ? "" : Number(e.target.value))} /></div>
                  <div className="f"><div className="flbl">KWH register — current</div>
                    <input className="inp" type="number" placeholder="cumulative reading" value={numOrBlank(data.currReading)} onChange={(e) => updateField("currReading", e.target.value === "" ? "" : Number(e.target.value))} /></div>
                </div>
                <div className="fr2">
                  <div className="f"><div className="flbl">KVAH register — previous</div>
                    <input className="inp" type="number" placeholder="cumulative reading" value={numOrBlank(data.kvahPrevReading)} onChange={(e) => updateField("kvahPrevReading", e.target.value === "" ? "" : Number(e.target.value))} /></div>
                  <div className="f"><div className="flbl">KVAH register — current</div>
                    <input className="inp" type="number" placeholder="cumulative reading" value={numOrBlank(data.kvahCurrReading)} onChange={(e) => updateField("kvahCurrReading", e.target.value === "" ? "" : Number(e.target.value))} /></div>
                </div>
                <div className="fr2">
                  <div className="f"><div className="flbl">Multiplying Factor</div>
                    <input className="inp" type="number" placeholder="1.00" value={numOrBlank(data.multiplyingFactor)} onChange={(e) => updateField("multiplyingFactor", e.target.value === "" ? "" : Number(e.target.value))} />
                    <div className="hint">CT/PT ratio printed on the bill</div></div>
                  <div className="f"><div className="flbl">Register check (curr − prev) × MF</div>
                    <input className="inp" readOnly value={[meter.assessedUnits !== null ? `${fmtNum(meter.assessedUnits)} kWh` : "", meter.kvahFromRegisters !== null ? `${fmtNum(meter.kvahFromRegisters)} kVAh` : ""].filter(Boolean).join(" · ")} placeholder="from the registers" />
                    <div className="hint">Cross-check only — the printed totals below are used</div></div>
                </div>
                <div className="fr2">
                  <div className="f"><div className="flbl">Active energy consumption (kWh) <span className="ocr-pill">Sizing input</span></div>
                    <input className="inp" type="number" placeholder={meter.assessedUnits !== null ? `from readings: ${meter.assessedUnits.toFixed(0)}` : "KWH total consumption"} value={numOrBlank(data.activeKwh)} onChange={(e) => updateField("activeKwh", e.target.value === "" ? "" : Number(e.target.value))} />
                    <div className="hint">Period consumption: KWH "Total Consumption"{data.activeKwh === "" && meter.assessedUnits !== null ? " · blank = (curr − prev) × MF" : ""}</div></div>
                  <div className="f"><div className="flbl">Reading period</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      <input className="inp" style={{ flex: "1 1 140px", minWidth: 0 }} type="date" aria-label="Previous reading date" value={data.readingFrom} onChange={(e) => updateField("readingFrom", e.target.value)} />
                      <input className="inp" style={{ flex: "1 1 140px", minWidth: 0 }} type="date" aria-label="Current reading date" value={data.readingTo} onChange={(e) => updateField("readingTo", e.target.value)} />
                    </div>
                    <div className="hint">{analysis.meterBaseline?.totalDays
                      ? `${analysis.meterBaseline.totalDays} days${analysis.baseline?.source === "meter" ? ", used to annualise" : " (the sizing uses the billing history)"}`
                      : "Dates missing: the year is estimated as 12 × this month"}</div></div>
                </div>
                <div className="fr2">
                  <div className="f"><div className="flbl">Apparent energy consumption (kVAh)</div>
                    <input className="inp" type="number" placeholder="KVAH total consumption" value={numOrBlank(data.kvahReading)} onChange={(e) => updateField("kvahReading", e.target.value === "" ? "" : Number(e.target.value))} />
                    <div className="hint">Period consumption, kept separate — never used as kWh</div></div>
                  <div className="f"><div className="flbl">Power factor (as printed)</div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <input className="inp" type="number" step="0.001" aria-label="Average or assessed power factor" placeholder="Avg. / assessed" value={numOrBlank(data.avgPowerFactor)} onChange={(e) => updateField("avgPowerFactor", e.target.value === "" ? "" : Number(e.target.value))} />
                      <input className="inp" type="number" step="0.001" aria-label="Billed power factor" placeholder="Billed" value={numOrBlank(data.billedPowerFactor)} onChange={(e) => updateField("billedPowerFactor", e.target.value === "" ? "" : Number(e.target.value))} />
                    </div>
                    <div className="hint">Avg. / assessed PF · billed PF — read from the bill, never computed</div></div>
                </div>
                <div className="fr2">
                  <div className="f"><div className="flbl">Recorded MD</div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <input className="inp" type="number" aria-label="Recorded maximum demand in kW" placeholder="kW" value={numOrBlank(data.recordedMdKw)} onChange={(e) => updateField("recordedMdKw", e.target.value === "" ? "" : Number(e.target.value))} />
                      <input className="inp" type="number" aria-label="Recorded maximum demand in kVA" placeholder="kVA" value={numOrBlank(data.recordedMD)} onChange={(e) => updateField("recordedMD", e.target.value === "" ? "" : Number(e.target.value))} />
                    </div>
                    <div className="hint">KW (MD) · KVA (MD)</div></div>
                  <div className="f"><div className="flbl">Billed Demand (as printed{data.billedDemandUnit ? `, ${data.billedDemandUnit}` : ""})</div>
                    <input className="inp" type="number" placeholder="from the bill" value={numOrBlank(data.billedDemand)} onChange={(e) => updateField("billedDemand", e.target.value === "" ? "" : Number(e.target.value))} />
                    <div className="hint">{meter.demandFloorKva !== null ? `75% of contract demand = ${meter.demandFloorKva.toFixed(1)} kVA (screening only — tariff rule not verified)` : "Never replaced by a derived rule"}</div></div>
                </div>
              </div>
            </div>
            <div className="card">
              <div className="card-h">
                <span className="card-t">Charge Components</span>
                {data.billAmount !== "" && Number(data.billAmount) > 0 && (
                  <span className={`recon ${recon.withinTolerance && recon.currentOk !== false ? "ok" : "er"}`}>
                    {recon.currentOk === false ? `✗ CURRENT ≠ SUM ₹${recon.currentDiff}` : recon.withinTolerance ? `✓ OK ±₹${recon.diff}` : `✗ MISMATCH ₹${recon.diff}`}
                  </span>
                )}
              </div>
              <div className="card-b" style={{ padding: "9px 13px" }}>
                {([
                  ["energyCharges", "Energy Charges", "v", "VAR"],
                  ["todCharges", "TOD Tariff EC (− = rebate)", "v", "VAR"],
                  ["demandCharges", "Demand Charges", "fi", "DEMAND"],
                  ["fixedCharges", "Fixed Charges line (only if printed)", "fi", "FIXED"],
                  ["fac", "Fuel Adj. Charge (FAC)", "v", "VAR"],
                  ["ed", "Electricity Duty (ED)", "v", "VAR"],
                  ["tose", "Tax on Sale (ToSE)", "v", "VAR"],
                  ["wheelingCharges", "Wheeling Charges", "v", "VAR"],
                  ["delayedPayment", "Delayed Payment Charges", "co", "COND"],
                  ["arrears", "Arrears", "co", "COND"],
                  ["creditAdjustment", "Credit Adjustment (SD Interest etc.)", "cr", "CREDIT"],
                  ["otherCharges", "Other (PF penal, excess demand, debit adj.)", "fi", "OTHER"],
                ] as [keyof CommercialBillData, string, string, string][]).map(([key, label, tagClass, tagLabel]) => (
                  <div className="cr-row" key={key}>
                    <span className="cr-name">{label}</span>
                    <span className={`cr-tag ${tagClass}`}>{tagLabel}</span>
                    <input
                      className="cr-inp"
                      type="number"
                      placeholder="0.00"
                      value={numOrBlank(data[key] as number | "")}
                      onChange={(e) => updateField(key, (e.target.value === "" ? "" : Number(e.target.value)) as any)}
                    />
                  </div>
                ))}
                {suggestions.map((s) => (
                  <div key={s.field} className="vl warn" style={{ margin: "8px 0", display: "flex", alignItems: "center", gap: 8 }}>
                    <div className="vdot" />
                    <span style={{ flex: 1 }}>Suggested {SUGGEST_LABEL[s.field]}: ₹{s.value.toFixed(2)} — {s.reason}</span>
                    <button type="button" onClick={() => updateField(s.field, s.value)}
                      style={{ fontSize: 12, fontWeight: 700, color: "var(--cyan)", border: "1px solid var(--cyan)", borderRadius: 6, padding: "2px 8px", background: "transparent", cursor: "pointer" }}>Apply</button>
                  </div>
                ))}
                <div className="cr-row" style={{ marginTop: 6 }}>
                  <span className="cr-name">Σ current charges {fmtINR(recon.currentCharges)} vs printed Total Current Bill</span>
                  <input
                    className="cr-inp"
                    type="number"
                    placeholder="As on bill"
                    value={numOrBlank(data.currentBillTotal)}
                    onChange={(e) => updateField("currentBillTotal", e.target.value === "" ? "" : Number(e.target.value))}
                  />
                </div>
                <div className="ctot">
                  <div>
                    <div className="ctot-k">Reconstructed Total</div>
                    <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>Round(current + delayed + arrears − credit, nearest ₹10) · ±₹10</div>
                  </div>
                  <div className="ctot-v">{fmtINR(recon.reconstructedTotal)}</div>
                </div>
                <div className="cr-row" style={{ marginTop: 6 }}>
                  <span className="cr-name cc">Printed Bill Amount</span>
                  <input
                    className="cr-inp"
                    type="number"
                    placeholder="As on bill"
                    style={{ borderColor: "var(--cyan)" }}
                    value={numOrBlank(data.billAmount)}
                    onChange={(e) => updateField("billAmount", e.target.value === "" ? "" : Number(e.target.value))}
                  />
                </div>
                {data.chargeLines.length > 0 && (
                  <details style={{ marginTop: 10 }}>
                    <summary style={{ fontSize: 12, color: "var(--muted)", cursor: "pointer" }}>
                      As printed on the bill · {data.chargeLines.length} lines{data.chargeLines.some((l) => l.category === "unmapped" && l.amount !== 0) ? " · some unrecognised" : ""}
                    </summary>
                    <table className="tbl" style={{ marginTop: 6 }}>
                      <thead><tr><th>Printed label</th><th className="r">₹</th><th>Counted as</th></tr></thead>
                      <tbody>
                        {data.chargeLines.map((l, i) => (
                          <tr key={i}>
                            <td style={{ fontSize: 12 }}>{l.label}</td>
                            <td className="r" style={{ fontSize: 12 }}>{l.amount.toFixed(2)}</td>
                            <td style={{ fontSize: 11, color: l.category === "unmapped" ? "var(--amber)" : "var(--muted)" }}>{CATEGORY_LABEL[l.category]}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="hint">Labels are classified by the app, not the AI. Editing a field above doesn't change this record of the bill.</div>
                  </details>
                )}
                <div className="cr-row">
                  <span className="cr-name" title="Late-payment total — a different figure, never reconciled as the bill amount">Payable after due date (not reconciled)</span>
                  <input
                    className="cr-inp"
                    type="number"
                    placeholder="As on bill"
                    value={numOrBlank(data.amountAfterDue)}
                    onChange={(e) => updateField("amountAfterDue", e.target.value === "" ? "" : Number(e.target.value))}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* §04 TOD Slots */}
          <div className="sec">
            <span className="sec-lbl">§ 04 — Time-of-Day (TOD) Slot Data</span>
            <div className="sec-line" />
            <span className="badge badge-auto">Auto-detected from connection type</span>
          </div>
          <div className="info-box">
            TOD share = <span className="hlg">Slot B</span> + <span className="hlg">Slot C</span> share of all TOD units (06:00–17:00 tariff bands).
            As in the office workbook, <span className="hla">TOD consideration = share + 10 %</span>, and the recommended solar capacity =
            TOD consideration × calculated capacity (§ 05).
          </div>
          <div className="card">
            <div className="card-h">
              <span className="card-t">TOD Slot Entry</span>
              <span style={{ fontSize: 12, color: "var(--muted)" }}>Units as billed{data.billingHistoryUnit !== "unknown" ? ` (${data.billingHistoryUnit})` : ""}</span>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table className="tbl">
                <thead><tr>
                  <th>Slot</th><th>Time range</th>
                  <th className="r">Units</th>
                  <th className="r">% share</th>
                  <th className="r">Utilisable %</th>
                  <th className="c">Rule</th>
                </tr></thead>
                <tbody>
                  {[
                    { slot: "A" as TodSlotId, t: "00:00 Hrs – 06:00 Hrs" },
                    { slot: "B" as TodSlotId, t: "06:00 Hrs – 09:00 Hrs" },
                    { slot: "C" as TodSlotId, t: "09:00 Hrs – 17:00 Hrs" },
                    { slot: "D" as TodSlotId, t: "17:00 Hrs – 24:00 Hrs" },
                  ].map(({ slot, t }) => {
                    const reading = data.todSlots.find((s) => s.slot === slot) as CommercialTodSlotReading;
                    const result = tod.slots.find((s) => s.slot === slot)!;
                    return (
                      <tr key={slot}>
                        <td style={{ fontWeight: 700, color: "var(--cyan)", fontSize: 13 }}>{slot}</td>
                        <td style={{ fontSize: 11, color: "var(--muted)" }}>{t}</td>
                        <td className="r">
                          <input className="ti" placeholder="--" value={numOrBlank(reading.units)} onChange={(e) => updateTodSlot(slot, e.target.value === "" ? "" : Number(e.target.value))} />
                        </td>
                        <td className="tr cc">{result.pctShare > 0 ? pct(result.pctShare) : "--"}</td>
                        <td className="tr" style={{ color: "var(--purple)", fontWeight: 700 }}>{result.utilisable > 0 ? pct(result.utilisable, 4) : "0"}</td>
                        <td className="tc">
                          {result.rule === "FULL" && <span className="ut-full">Full %</span>}
                          {result.rule === "NONE" && <span className="ut-no">No solar</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: "var(--surf)" }}>
                    <td colSpan={2} style={{ fontSize: 12, color: "var(--cyan)", padding: 9 }}>Total</td>
                    <td className="tr cc">{tod.totalUnits > 0 ? fmtNum(tod.totalUnits) : "--"}</td>
                    <td className="tr cc">100%</td>
                    <td className="tr" style={{ fontSize: 13, fontWeight: 800 }}>{tod.utilisableFraction > 0 ? pct(tod.utilisableFraction, 4) : "--"}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {todFixes.map((s) => (
            <div key={s.slot} className={`vl ${s.exact ? "warn" : "err"}`} style={{ margin: "8px 0", display: "flex", alignItems: "center", gap: 8 }}>
              <div className="vdot" />
              <span style={{ flex: 1 }}>Slot {s.slot} → {s.value} units ({s.reason})</span>
              <button type="button" onClick={() => updateTodSlot(s.slot, s.value)}
                style={{ fontSize: 12, fontWeight: 700, color: "var(--cyan)", border: "1px solid var(--cyan)", borderRadius: 6, padding: "2px 8px", background: "transparent", cursor: "pointer" }}>Apply</button>
            </div>
          ))}

          <div className="vals" style={{ marginTop: 8 }}>
            {checks.map((c, i) => (
              <div key={i} className={`vl ${c.status}`}>
                <div className="vdot" />{c.label}
              </div>
            ))}
          </div>

          <CiSizingPanel a={analysis} settings={sizing} onChange={updateSizing} />

          {/* Footer controls */}
          <div className="p-4 bg-[var(--hover-bg)] border-t border-[var(--border-subtle)] rounded-xl flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
            <div className="text-[11px] text-[var(--text-muted)]">
              COMMERCIAL WORKSHEET · INDEPENDENT FROM RESIDENTIAL SOLAR ANALYTICS
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                type="button"
                onClick={handleExcelDownload}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-[var(--accent-solid)] text-xs font-bold text-white shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <FileSpreadsheet className="w-4 h-4 text-white" />
                Download Commercial Excel (.xlsx)
              </motion.button>
              {/* Standalone scanner: employees only — Google export requests Drive scopes. */}
              {canUseGoogle && <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                type="button"
                onClick={() => setShowGoogleSheetsModal(true)}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#4285F4] to-[#0F9D58] text-xs font-bold text-white shadow-lg flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Cloud className="w-4 h-4 text-white" />
                Save to Google Sheets
              </motion.button>}
            </div>
          </div>
        </div>
      </div>

      <CommercialGoogleSheetsExportModal
        open={showGoogleSheetsModal}
        onClose={() => setShowGoogleSheetsModal(false)}
        data={data}
        sizing={sizing}
      />
    </div>
  );
}
