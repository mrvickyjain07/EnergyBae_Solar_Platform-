import React, { useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { RefreshCw, AlertCircle, FileSpreadsheet, Cloud } from "lucide-react";
import Uploader from "../../components/Uploader";
import AnimatedNumber from "../../components/AnimatedNumber";
import {
  CommercialBillData,
  CommercialTodSlotReading,
  TodSlotId,
  buildBlankCommercialBillData,
} from "./types";
import {
  buildBlankBillingRows,
  buildBillingHistoryWindow,
  computeBillingStats,
  detectTodMode,
  computeTodUtilisation,
  computeMeterDerived,
  reconcileCharges,
  computeSizingPipeline,
  computeValidationChecks,
} from "./commercialCalculations";
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

const fmtINR = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
const fmtNum = (n: number) => Math.round(n).toLocaleString("en-IN");
const pct = (n: number, places = 2) => `${(n * 100).toFixed(places)}%`;

function numOrBlank(v: number | "" | undefined): string {
  return v === "" || v === undefined ? "" : String(v);
}

export default function CommercialBillAnalysis() {
  const [data, setData] = useState<CommercialBillData>(() => ({
    ...buildBlankCommercialBillData(),
    billingHistory: buildBlankBillingRows(),
  }));

  const [panelWatt, setPanelWatt] = useState(600);
  const [sunHours, setSunHours] = useState(1400);
  const [buffer, setBuffer] = useState(1.1);
  const [systemCost, setSystemCost] = useState<number | "">("");

  const [fileData, setFileData] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [stageIdx, setStageIdx] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showGoogleSheetsModal, setShowGoogleSheetsModal] = useState(false);
  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleFileLoaded = (base64: string, name: string) => {
    setFileData(base64);
    setFileName(name);
    setErrorMsg(null);
  };

  const runExtraction = async () => {
    if (!fileData || !fileName) return;
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
        body: JSON.stringify({ fileData, fileName }),
      });
      const res = await response.json();
      if (progressTimer.current) clearInterval(progressTimer.current);

      if (res.success && res.data) {
        const ocr = res.data as Partial<CommercialBillData>;
        setData((prev) => {
          const merged: CommercialBillData = { ...prev };
          (Object.keys(ocr) as (keyof CommercialBillData)[]).forEach((key) => {
            const val = ocr[key];
            if (key === "billingHistory" || key === "todSlots") return;
            if (val !== undefined && val !== null && val !== "") {
              (merged as any)[key] = val;
            }
          });
          if (Array.isArray(ocr.billingHistory) && ocr.billingHistory.length > 0) {
            // Server already de-dupes/sorts/merges-in-the-current-month and
            // windows to 12 rows — re-windowing here is a defensive no-op.
            merged.billingHistory = buildBillingHistoryWindow(ocr.billingHistory);
          }
          if (Array.isArray(ocr.todSlots) && ocr.todSlots.length > 0) {
            merged.todSlots = prev.todSlots.map((slot) => {
              const match = ocr.todSlots!.find((s) => s.slot === slot.slot);
              return match && match.units !== "" && match.units !== undefined ? { ...slot, units: match.units } : slot;
            });
          }
          merged.confidence = typeof ocr.confidence === "number" ? ocr.confidence : prev.confidence;
          merged.filename = fileName;
          return merged;
        });
        setStageIdx(OCR_STAGES.length);
        setTimeout(() => setIsLoading(false), 500);
      } else {
        setIsLoading(false);
        setErrorMsg(res.error || "Unable to extract bill. Please upload a higher quality document.");
      }
    } catch (err: any) {
      if (progressTimer.current) clearInterval(progressTimer.current);
      setIsLoading(false);
      setErrorMsg("Unable to extract bill. Please upload a higher quality document.");
    }
  };

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

  const updateTodSlot = (slot: TodSlotId, value: number | "") => {
    setData((prev) => ({
      ...prev,
      todSlots: prev.todSlots.map((s) => (s.slot === slot ? { ...s, units: value } : s)),
    }));
  };

  // ─── Derived calculations (single source of truth, shared with Excel export) ──
  const todMode = useMemo(() => detectTodMode(data.connectionType), [data.connectionType]);
  const stats = useMemo(() => computeBillingStats(data.billingHistory, data.fixedCharges), [data.billingHistory, data.fixedCharges]);
  const tod = useMemo(() => computeTodUtilisation(data.todSlots, todMode), [data.todSlots, todMode]);
  const meter = useMemo(
    () => computeMeterDerived(data.prevReading, data.currReading, data.multiplyingFactor, data.kvahReading, data.recordedMD, data.contractDemand),
    [data.prevReading, data.currReading, data.multiplyingFactor, data.kvahReading, data.recordedMD, data.contractDemand]
  );
  const recon = useMemo(
    () =>
      reconcileCharges({
        energyCharges: data.energyCharges,
        demandCharges: data.demandCharges,
        fac: data.fac,
        ed: data.ed,
        tose: data.tose,
        wheelingCharges: data.wheelingCharges,
        delayedPayment: data.delayedPayment,
        arrears: data.arrears,
        creditAdjustment: data.creditAdjustment,
        otherCharges: data.otherCharges,
        billAmount: data.billAmount,
      }),
    [data.energyCharges, data.demandCharges, data.fac, data.ed, data.tose, data.wheelingCharges, data.delayedPayment, data.arrears, data.creditAdjustment, data.otherCharges, data.billAmount]
  );
  const pipeline = useMemo(
    () =>
      computeSizingPipeline(
        stats.avgUnits,
        stats.avgUnitCost,
        stats.avgUnitCostRoundUp,
        tod.bufferedFraction,
        panelWatt,
        sunHours,
        buffer,
        typeof systemCost === "number" ? systemCost : 0
      ),
    [stats.avgUnits, stats.avgUnitCost, stats.avgUnitCostRoundUp, tod.bufferedFraction, panelWatt, sunHours, buffer, systemCost]
  );
  const checks = useMemo(() => computeValidationChecks(stats, tod, meter, recon), [stats, tod, meter, recon]);

  const handleExcelDownload = async () => {
    try {
      const response = await fetch("/api/commercial/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data, panelWatt, sunHours, buffer, systemCost: systemCost || 0 }),
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
      {/* Upload + extraction control — reuses the generic Uploader component */}
      <div className="max-w-2xl mx-auto w-full space-y-4">
        <div className="text-left">
          <h3 className="text-base font-bold font-display text-[var(--text-primary)] tracking-wide uppercase">Commercial Bill Upload</h3>
          <p className="text-xs text-[var(--text-muted)] font-mono">Load a commercial / industrial / HT / TOD MSEDCL bill to feed the analysis dashboard below.</p>
        </div>
        <Uploader onFileLoaded={handleFileLoaded} isLoading={isLoading} selectedFileName={fileName} />
        {fileName && !isLoading && (
          <div className="flex justify-center">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              type="button"
              onClick={runExtraction}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-sky-500 text-xs font-bold font-display text-white hover:from-blue-500 hover:to-sky-400 shadow-md shadow-blue-950/50 flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Begin Extraction
            </motion.button>
          </div>
        )}
        {isLoading && (
          <div className="glass-panel rounded-2xl p-6 bg-[var(--bg-card)] space-y-3">
            <div className="flex items-center gap-2 text-xs font-mono text-[var(--accent-green)]">
              <span className="w-2 h-2 rounded-full bg-[var(--accent-green)] animate-pulse" />
              {OCR_STAGES[Math.min(stageIdx, OCR_STAGES.length - 1)]}
            </div>
            <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800/80">
              <div
                style={{ width: `${((stageIdx + 1) / OCR_STAGES.length) * 100}%` }}
                className="h-full bg-gradient-to-r from-[var(--accent-green)] to-[var(--accent-green-light)] transition-all duration-300"
              />
            </div>
          </div>
        )}
        {errorMsg && (
          <div className="p-4 bg-red-950/25 border border-red-900/40 rounded-2xl flex items-start gap-3.5 text-xs text-red-300">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-red-400" />
            <span className="font-mono text-[11px]">{errorMsg}</span>
          </div>
        )}
      </div>

      {/* ─── Commercial dashboard (port of bill-analysis-v3.html) ─────────────── */}
      <div className="cba rounded-2xl overflow-hidden border border-[var(--border-subtle)]">
        <div className="ocr-strip">
          <div className={`ocr-dot ${isLoading ? "pending" : data.filename ? "" : "idle"}`} />
          <span className="ocr-txt">SCANNED DOCUMENT: <span className="hl">{data.filename || "—"}</span></span>
          <span className="ocr-txt">·</span>
          <span className="ocr-txt">EXTRACTION CONFIDENCE: <span className="hl">{data.confidence > 0 ? `${data.confidence.toFixed(1)}%` : "—"}</span></span>
        </div>

        <div className="cba-cstrip">
          <span className="cstrip-lbl">SOLAR CONSTANTS ·</span>
          <div className="citem"><span className="citem-k">PANEL</span>
            <input className="citem-inp" value={panelWatt} onChange={(e) => setPanelWatt(Number(e.target.value) || 600)} />
            <span className="citem-k">W</span></div>
          <div className="csep" />
          <div className="citem"><span className="citem-k">SUN HRS</span>
            <input className="citem-inp" style={{ width: 46 }} value={sunHours} onChange={(e) => setSunHours(Number(e.target.value) || 1400)} />
            <span className="citem-k">hrs/yr</span></div>
          <div className="csep" />
          <div className="citem"><span className="citem-k">BUFFER</span>
            <input className="citem-inp" style={{ width: 36 }} value={buffer} onChange={(e) => setBuffer(Number(e.target.value) || 1.1)} />
          </div>
          <div className="csep" />
          <div className="citem"><span className="citem-k">DEMAND FLOOR</span>
            <span className="citem-v">75%</span><span className="citem-k">× CD</span></div>
          <div className="csep" />
          <div className="citem badge-auto">
            <span className="citem-k" style={{ color: "var(--purple)" }}>TOD MODE (AUTO)</span>
            <span className="citem-v" style={{ color: "var(--purple)" }}>{todMode === "LT" ? "LT-II C" : "HT"}</span>
          </div>
        </div>

        <div className="cba-body">
          {/* §01 Consumer Master */}
          <div className="sec">
            <span className="sec-lbl">§ 01 — Consumer Master</span>
            <div className="sec-line" />
            <span className="badge badge-auto">FROM OCR</span>
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
                  <div className="f"><div className="flbl">Connection Type</div>
                    <select className="inp" value={data.connectionType} onChange={(e) => updateField("connectionType", e.target.value as CommercialBillData["connectionType"])}>
                      <option value="">—</option>
                      <option value="LT">LT — 71 LT-II C</option>
                      <option value="HT">HT</option>
                    </select></div>
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
                  <div className="f"><div className="flbl">Sanct. Load (kW)</div>
                    <input className="inp" type="number" placeholder="e.g. 80" value={numOrBlank(data.sanctionedLoad)} onChange={(e) => updateField("sanctionedLoad", e.target.value === "" ? "" : Number(e.target.value))} /></div>
                  <div className="f"><div className="flbl">Contract Demand (KVA) <span className="req">*</span></div>
                    <input className="inp" type="number" placeholder="KVA" value={numOrBlank(data.contractDemand)} onChange={(e) => updateField("contractDemand", e.target.value === "" ? "" : Number(e.target.value))} />
                    <div className="hint">▲ 75% demand floor rule</div></div>
                  <div className="f"><div className="flbl">Fixed Charges (₹) <span className="req">*</span></div>
                    <input className="inp" type="number" placeholder="per month" value={numOrBlank(data.fixedCharges)} onChange={(e) => updateField("fixedCharges", e.target.value === "" ? "" : Number(e.target.value))} />
                    <div className="hint">▲ Varies per bill month</div></div>
                </div>
                <div className="fr3">
                  <div className="f"><div className="flbl">Security Deposit (₹)</div>
                    <input className="inp" type="number" placeholder="₹" value={numOrBlank(data.securityDeposit)} onChange={(e) => updateField("securityDeposit", e.target.value === "" ? "" : Number(e.target.value))} /></div>
                  <div className="f"><div className="flbl">Meter Number</div>
                    <input className="inp" placeholder="Meter No." value={data.meterNo} onChange={(e) => updateField("meterNo", e.target.value)} /></div>
                  <div className="f"><div className="flbl">TOD Mode</div>
                    <input className="inp" readOnly value={todMode === "LT" ? "LT-II C (auto)" : "HT (auto)"} /></div>
                </div>
              </div>
            </div>
          </div>

          {/* §02 Billing History */}
          <div className="sec">
            <span className="sec-lbl">§ 02 — Billing History (12 months)</span>
            <div className="sec-line" />
            <span className="badge badge-auto">FROM OCR TABLE</span>
          </div>
          <div className="card">
            <div className="card-h">
              <span className="card-t">Monthly Bill Data</span>
              <span style={{ fontSize: 9, color: "var(--muted)" }}>UNIT COST = (BILL − FIXED CHARGES) ÷ UNITS</span>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table className="tbl">
                <thead><tr>
                  <th style={{ width: 26 }}>#</th>
                  <th>MONTH</th>
                  <th className="r">UNITS (kWh)</th>
                  <th className="r">BILL AMOUNT (₹)</th>
                  <th className="r">UNIT COST (₹/kWh)</th>
                  <th className="c">STATUS</th>
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
                          {isCurrent ? <span className="flag f-cur">CURRENT</span>
                            : flags?.isOutlier ? <span className="flag f-out">OUTLIER</span>
                            : flags?.isDemandOnly ? <span className="flag f-dem">DEMAND ONLY</span>
                            : flags?.isZero ? <span className="flag f-zero">ZERO</span>
                            : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: "var(--surf)" }}>
                    <td colSpan={2} style={{ fontSize: 9, letterSpacing: 1.5, color: "var(--cyan)", padding: 9 }}>AVERAGE (VALID MONTHS)</td>
                    <td className="tr cc">{stats.avgUnits > 0 ? `${fmtNum(stats.avgUnits)} kWh` : "--"}</td>
                    <td className="tr cc">{stats.avgBillAmount > 0 ? fmtINR(stats.avgBillAmount) : "--"}</td>
                    <td className="tr cc">{stats.avgUnitCost > 0 ? `₹${stats.avgUnitCost.toFixed(4)}` : "--"}</td>
                    <td />
                  </tr>
                  <tr style={{ background: "var(--surf)" }}>
                    <td colSpan={2} style={{ fontSize: 9, letterSpacing: 1.5, color: "var(--amber)", padding: "9px 9px 6px" }}>ROUNDUP(AVG UNIT COST, 0.5)</td>
                    <td /><td />
                    <td className="tr ca">{stats.avgUnitCostRoundUp > 0 ? `₹${stats.avgUnitCostRoundUp.toFixed(2)}` : "--"}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* §03 Meter + Charges */}
          <div className="sec">
            <span className="sec-lbl">§ 03 — Current Bill Breakdown</span>
            <div className="sec-line" />
            <span className="badge badge-auto">FROM OCR · RECONCILED ±₹10</span>
          </div>
          <div className="g2">
            <div className="card">
              <div className="card-h"><span className="card-t">Meter Readings</span></div>
              <div className="card-b">
                <div className="fr2">
                  <div className="f"><div className="flbl">Prev Reading (kWh)</div>
                    <input className="inp" type="number" placeholder="Previous" value={numOrBlank(data.prevReading)} onChange={(e) => updateField("prevReading", e.target.value === "" ? "" : Number(e.target.value))} /></div>
                  <div className="f"><div className="flbl">Curr Reading (kWh)</div>
                    <input className="inp" type="number" placeholder="Current" value={numOrBlank(data.currReading)} onChange={(e) => updateField("currReading", e.target.value === "" ? "" : Number(e.target.value))} /></div>
                </div>
                <div className="fr2">
                  <div className="f"><div className="flbl">Multiplying Factor</div>
                    <input className="inp" type="number" placeholder="1.00" value={numOrBlank(data.multiplyingFactor)} onChange={(e) => updateField("multiplyingFactor", e.target.value === "" ? "" : Number(e.target.value))} />
                    <div className="hint">CT/PT ratio. LT=1. HT often &gt;1.</div></div>
                  <div className="f"><div className="flbl">Assessed Units (kWh)</div>
                    <input className="inp" readOnly value={meter.assessedUnits !== null ? meter.assessedUnits.toFixed(2) : ""} placeholder="(Curr−Prev)×MF" />
                    <div className="hint">Auto-computed</div></div>
                </div>
                <div className="fr2">
                  <div className="f"><div className="flbl">kVAh Reading</div>
                    <input className="inp" type="number" placeholder="Apparent energy" value={numOrBlank(data.kvahReading)} onChange={(e) => updateField("kvahReading", e.target.value === "" ? "" : Number(e.target.value))} /></div>
                  <div className="f"><div className="flbl">Power Factor</div>
                    <input className="inp" readOnly value={meter.powerFactor !== null ? meter.powerFactor.toFixed(4) : ""} placeholder="kWh ÷ kVAh" />
                    <div className="hint">Penalty &lt;0.90 · Incentive &gt;0.95</div></div>
                </div>
                <div className="fr2">
                  <div className="f"><div className="flbl">Recorded MD (KVA)</div>
                    <input className="inp" type="number" placeholder="Peak demand" value={numOrBlank(data.recordedMD)} onChange={(e) => updateField("recordedMD", e.target.value === "" ? "" : Number(e.target.value))} /></div>
                  <div className="f"><div className="flbl">Billed Demand (KVA)</div>
                    <input className="inp inp-amber" readOnly value={meter.billedDemand !== null ? meter.billedDemand.toFixed(1) : ""} placeholder="MAX(MD, 75%×CD)" />
                    <div className="hint">= MAX(recordedMD, 0.75 × CD)</div></div>
                </div>
              </div>
            </div>
            <div className="card">
              <div className="card-h">
                <span className="card-t">Charge Components</span>
                {data.billAmount !== "" && Number(data.billAmount) > 0 && (
                  <span className={`recon ${recon.withinTolerance ? "ok" : "er"}`}>
                    {recon.withinTolerance ? `✓ OK ±₹${recon.diff}` : `✗ MISMATCH ₹${recon.diff}`}
                  </span>
                )}
              </div>
              <div className="card-b" style={{ padding: "9px 13px" }}>
                {([
                  ["energyCharges", "Energy Charges (TOD EC)", "v", "VAR"],
                  ["demandCharges", "Demand Charges", "fi", "FIXED"],
                  ["fac", "Fuel Adj. Charge (FAC)", "v", "VAR"],
                  ["ed", "Electricity Duty (ED)", "v", "VAR"],
                  ["tose", "Tax on Sale (ToSE)", "v", "VAR"],
                  ["wheelingCharges", "Wheeling Charges", "v", "VAR"],
                  ["delayedPayment", "Delayed Payment Charges", "co", "COND"],
                  ["arrears", "Arrears", "co", "COND"],
                  ["creditAdjustment", "Credit Adjustment (SD Interest etc.)", "cr", "CREDIT"],
                  ["otherCharges", "Other Charges", "fi", "FIXED"],
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
                <div className="ctot">
                  <div>
                    <div className="ctot-k">Reconstructed Total</div>
                    <div style={{ fontSize: 8, color: "var(--muted)", marginTop: 2 }}>ROUND(Σ, −1) · TOLERANCE ±₹10</div>
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
              </div>
            </div>
          </div>

          {/* §04 TOD Slots */}
          <div className="sec">
            <span className="sec-lbl">§ 04 — Time-of-Day (TOD) Slot Data</span>
            <div className="sec-line" />
            <span className="badge badge-auto">AUTO-DETECTED FROM CONNECTION TYPE</span>
          </div>
          <div className="info-box">
            {todMode === "LT" ? (
              <>
                <span className="hl">LT-II C</span> — Utilisable TOD = <span className="hlg">Slot B (full %)</span> + <span className="hlg">Slot C (full %)</span> + <span className="hlp">Slot D ÷7</span> (only the 17:00–18:00 pre-sunset hour captured) + Slot A = 0 (night). <span className="hla">+10% buffer (×1.1)</span> applied on total.
              </>
            ) : (
              <>
                <span className="hl">HT</span> — Utilisable TOD = <span className="hlg">Slot B (full %)</span> + <span className="hlg">Slot C (full %)</span>. Slot A and D = 0 utilisable. <span className="hla">No buffer applied</span> — fraction used directly.
              </>
            )}
          </div>
          <div className="card">
            <div className="card-h">
              <span className="card-t">TOD Slot Entry</span>
              <span style={{ fontSize: 9, color: "var(--muted)" }}>UNIT TYPE: {todMode === "LT" ? "kVAh (LT-II C)" : "kWh (HT)"}</span>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table className="tbl">
                <thead><tr>
                  <th>SLOT</th><th>TIME RANGE</th>
                  <th className="r">UNITS</th>
                  <th className="r">% SHARE</th>
                  <th className="r">UTILISABLE %</th>
                  <th className="c">RULE</th>
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
                          {result.rule === "FULL" && <span className="ut-full">FULL %</span>}
                          {result.rule === "DIV7" && <span className="ut-7th">÷7 (1/7 hr)</span>}
                          {result.rule === "NONE" && <span className="ut-no">NO SOLAR</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: "var(--surf)" }}>
                    <td colSpan={2} style={{ fontSize: 9, letterSpacing: 1.5, color: "var(--cyan)", padding: 9 }}>TOTAL</td>
                    <td className="tr cc">{tod.totalUnits > 0 ? fmtNum(tod.totalUnits) : "--"}</td>
                    <td className="tr cc">100%</td>
                    <td className="tr" style={{ fontSize: 13, fontWeight: 800 }}>{tod.utilisableFraction > 0 ? pct(tod.utilisableFraction, 4) : "--"}</td>
                    <td />
                  </tr>
                  <tr style={{ background: "var(--surf)" }}>
                    <td colSpan={4} style={{ fontSize: 9, letterSpacing: 1.5, color: "var(--amber)", padding: "6px 9px" }}>
                      {todMode === "LT" ? "WITH +10% BUFFER (×1.1)" : "NO BUFFER APPLIED (HT MODEL)"}
                    </td>
                    <td className="tr ca" style={{ fontSize: 13, fontWeight: 800 }}>{tod.bufferedFraction > 0 ? pct(tod.bufferedFraction, 4) : "--"}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* §05 Solar Sizing Pipeline */}
          <div className="sec">
            <span className="sec-lbl">§ 05 — Solar Sizing Pipeline</span>
            <div className="sec-line" />
            <span className="badge">EXACT FORMULA ENGINE</span>
          </div>
          <div className="pipe">
            {[
              { n: "01", k: "AVG UNITS", v: stats.avgUnits > 0 ? `${fmtNum(stats.avgUnits)} kWh` : "--", done: stats.avgUnits > 0 },
              { n: "02", k: "SOLAR CAP (raw)", v: pipeline.solarCapacityRawKwp > 0 ? `${pipeline.solarCapacityRawKwp.toFixed(2)} kWp` : "--", done: pipeline.solarCapacityRawKwp > 0 },
              { n: "03", k: "FULL PANELS", v: pipeline.fullPanels > 0 ? `${pipeline.fullPanels} panels` : "--", done: pipeline.fullPanels > 0 },
              { n: "04", k: "FULL kWp (act)", v: pipeline.fullKwp > 0 ? `${pipeline.fullKwp.toFixed(1)} kWp` : "--", done: pipeline.fullKwp > 0 },
              { n: "05", k: "TOD UTIL. FRAC", v: tod.bufferedFraction > 0 ? pct(tod.bufferedFraction) : "--", done: tod.bufferedFraction > 0 },
              { n: "06", k: "TOD SOLAR CAP", v: pipeline.todSolarCapacityKwp > 0 ? `${pipeline.todSolarCapacityKwp.toFixed(2)} kWp` : "--", done: pipeline.todSolarCapacityKwp > 0 },
              { n: "07", k: "TOD PANELS", v: pipeline.todPanels > 0 ? `${pipeline.todPanels} panels` : "--", done: pipeline.todPanels > 0 },
              { n: "08", k: "TOD kWp (act)", v: pipeline.todKwp > 0 ? `${pipeline.todKwp.toFixed(1)} kWp` : "--", done: pipeline.todKwp > 0 },
              { n: "09", k: "SAVING/YR", v: pipeline.annualSavingAvgRate > 0 ? fmtINR(pipeline.annualSavingAvgRate) : "--", done: pipeline.annualSavingAvgRate > 0 },
            ].map((s) => (
              <div key={s.n} className={`ps ${s.done ? "done" : "pend"}`}>
                <div className="ps-n">STEP {s.n}</div>
                <div className="ps-k">{s.k}</div>
                <div className="ps-v">{s.v}</div>
              </div>
            ))}
          </div>
          <div className="vals" style={{ marginTop: 8 }}>
            {checks.map((c, i) => (
              <div key={i} className={`vl ${c.status}`}>
                <div className="vdot" />{c.label}
              </div>
            ))}
          </div>

          {/* §06 Output & Recommendation */}
          <div className="sec">
            <span className="sec-lbl">§ 06 — Output &amp; Recommendation</span>
            <div className="sec-line" />
          </div>
          <div className="g4">
            <div className="res rp">
              <div className="rl">Full Solar Capacity</div>
              <div className="rv cc"><AnimatedNumber value={pipeline.fullKwp} decimals={1} /></div>
              <div className="ru">kWp</div>
              <div className="rs">{pipeline.fullPanels > 0 ? `${pipeline.fullPanels} panels` : "-- panels"}</div>
            </div>
            <div className="res rpurp">
              <div className="rl">Utilisable TOD</div>
              <div className="rv cp"><AnimatedNumber value={tod.bufferedFraction * 100} decimals={2} /></div>
              <div className="ru">%</div>
              <div className="rs">{todMode === "LT" ? "utilisable +10% buffer" : "utilisable (no buffer)"}</div>
            </div>
            <div className="res rg">
              <div className="rl">TOD-Adjusted Capacity</div>
              <div className="rv cg"><AnimatedNumber value={pipeline.todKwp} decimals={1} /></div>
              <div className="ru">kWp</div>
              <div className="rs">{pipeline.todPanels > 0 ? `${pipeline.todPanels} panels` : "-- panels"}</div>
            </div>
            <div className="res ra">
              <div className="rl">Est. Annual Saving</div>
              <div className="rv ca">{pipeline.annualSavingAvgRate > 0 ? fmtINR(pipeline.annualSavingAvgRate) : "--"}</div>
              <div className="ru">₹ / year</div>
              <div className="rs">{stats.avgUnitCost > 0 ? `at ₹${stats.avgUnitCost.toFixed(2)}/kWh avg rate` : "at avg unit cost"}</div>
            </div>
          </div>

          <div className="g3" style={{ marginBottom: 20 }}>
            <div className="card">
              <div className="card-h"><span className="card-t">Unit Cost Analysis</span></div>
              <div className="card-b">
                <div className="cr-row"><span className="cr-name">Avg Unit Cost</span><span className="cc">{stats.avgUnitCost > 0 ? `₹${stats.avgUnitCost.toFixed(4)}` : "--"}</span></div>
                <div className="cr-row"><span className="cr-name">ROUNDUP(Avg Cost, 0.5)</span><span className="ca">{stats.avgUnitCostRoundUp > 0 ? `₹${stats.avgUnitCostRoundUp.toFixed(2)}` : "--"}</span></div>
                <div className="cr-row"><span className="cr-name">Avg Monthly Units</span><span className="cc">{stats.avgUnits > 0 ? `${fmtNum(stats.avgUnits)} kWh/mo` : "--"}</span></div>
                <div className="cr-row"><span className="cr-name">Avg Monthly Bill</span><span className="cc">{stats.avgBillAmount > 0 ? `${fmtINR(stats.avgBillAmount)}/mo` : "--"}</span></div>
                <div className="cr-row"><span className="cr-name">Valid Months</span><span className="cc">{stats.validCount} / 12</span></div>
              </div>
            </div>
            <div className="card">
              <div className="card-h"><span className="card-t">Sizing Detail</span></div>
              <div className="card-b">
                <div className="cr-row"><span className="cr-name">Annual kWh Target</span><span className="cc">{stats.avgUnits > 0 ? `${fmtNum(stats.avgUnits * 12)} kWh/yr` : "--"}</span></div>
                <div className="cr-row"><span className="cr-name">Buffered (×{buffer}÷{sunHours})</span><span className="cc">{pipeline.solarCapacityRawKwp > 0 ? `${pipeline.solarCapacityRawKwp.toFixed(2)} kWp` : "--"}</span></div>
                <div className="cr-row"><span className="cr-name">Full kWp → Panels → Actual kWp</span><span className="cc">{pipeline.fullKwp > 0 ? `${pipeline.fullPanels} → ${pipeline.fullKwp.toFixed(1)} kWp` : "--"}</span></div>
                <div className="cr-row"><span className="cr-name">TOD utilisable fraction</span><span className="cp">{tod.bufferedFraction > 0 ? pct(tod.bufferedFraction, 4) : "--"}</span></div>
                <div className="cr-row"><span className="cr-name">TOD kWp → Panels → Actual kWp</span><span className="cg">{pipeline.todKwp > 0 ? `${pipeline.todPanels} → ${pipeline.todKwp.toFixed(1)} kWp` : "--"}</span></div>
              </div>
            </div>
            <div className="card">
              <div className="card-h"><span className="card-t">Savings &amp; Payback</span></div>
              <div className="card-b">
                <div className="cr-row"><span className="cr-name">Solar Gen / Year (TOD kWp)</span><span className="cc">{pipeline.solarGenPerYearKwh > 0 ? `${fmtNum(pipeline.solarGenPerYearKwh)} kWh` : "--"}</span></div>
                <div className="cr-row"><span className="cr-name">Annual Saving (avg rate)</span><span className="cg">{pipeline.annualSavingAvgRate > 0 ? fmtINR(pipeline.annualSavingAvgRate) : "--"}</span></div>
                <div className="cr-row"><span className="cr-name">Annual Saving (ROUNDUP rate)</span><span className="cg">{pipeline.annualSavingRoundUpRate > 0 ? fmtINR(pipeline.annualSavingRoundUpRate) : "--"}</span></div>
                <div className="cr-row">
                  <span className="cr-name">System Cost (₹)</span>
                  <input className="cr-inp" type="number" placeholder="Optional" value={numOrBlank(systemCost)} onChange={(e) => setSystemCost(e.target.value === "" ? "" : Number(e.target.value))} />
                </div>
                <div className="cr-row"><span className="cr-name">Simple Payback</span><span className="ca">{pipeline.simplePaybackYears !== null ? `${pipeline.simplePaybackYears.toFixed(1)} yrs` : "--"}</span></div>
              </div>
            </div>
          </div>

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
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#4eae0e] to-[#044d90] text-xs font-bold text-white shadow-lg flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <FileSpreadsheet className="w-4 h-4 text-white" />
                Download Commercial Excel (.xlsx)
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                type="button"
                onClick={() => setShowGoogleSheetsModal(true)}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#4285F4] to-[#0F9D58] text-xs font-bold text-white shadow-lg flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Cloud className="w-4 h-4 text-white" />
                Save to Google Sheets
              </motion.button>
            </div>
          </div>
        </div>
      </div>

      <CommercialGoogleSheetsExportModal
        open={showGoogleSheetsModal}
        onClose={() => setShowGoogleSheetsModal(false)}
        data={data}
        panelWatt={panelWatt}
        sunHours={sunHours}
        buffer={buffer}
        systemCost={typeof systemCost === "number" ? systemCost : 0}
      />
    </div>
  );
}
