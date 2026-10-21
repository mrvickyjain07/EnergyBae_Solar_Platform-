// Batch Bill Analysis — many bills in, ONE workbook with ONE sheet out.
//
// Extraction is not reimplemented here: each bill goes through the same
// /api/commercial/extract endpoint the single-bill flow uses, one request per
// bill, and the export goes through /api/commercial/batch-export which stacks
// the same per-bill worksheet builder. This file owns only the queue, the
// progress UI and the retry affordances.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { FileSpreadsheet, Play, RotateCcw, Trash2, AlertCircle, CheckCircle2, Clock } from "lucide-react";
import Uploader, { LoadedFile } from "../../components/Uploader";
import { CommercialBillData, buildBlankCommercialBillData } from "./types";
import { billFromExtraction, extractionVersionError } from "./extractionResult";
import { buildBillingHistoryWindow, DEFAULT_SIZING, type SizingSettings } from "./commercialCalculations";
import { analyseCommercial, type MonthStatus } from "./consumptionSizing";
import CiSizingPanel from "./CiSizingPanel";
import type { CommercialAnalysisResult } from "./CommercialBillAnalysis";
import {
  QueueItem,
  QueueStatus,
  RejectedFile,
  validateSelection,
  deriveStatus,
  rollUp,
  isTerminal,
  isRetryable,
} from "./commercialBatchQueue";
import { BatchBillEntry } from "./commercialBatchWorksheetModel";
import "./commercial-bill-analysis.css";

// Small pool: the extraction endpoint is rate-limited per API key, and firing a
// whole folder at once turns a queue into a wall of 429s.
const CONCURRENCY = 2;

const fmtINR = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
const fmtNum = (n: number) => Math.round(n).toLocaleString("en-IN");

const STATUS_TONE: Record<QueueStatus, string> = {
  Waiting: "var(--muted)",
  Processing: "var(--cyan)",
  OCR: "var(--cyan)",
  Extracting: "var(--cyan)",
  Validating: "var(--purple)",
  Completed: "var(--green)",
  "Partially Extracted": "var(--amber)",
  Failed: "#f87171",
  "Quota Blocked": "#f87171",
};

// Each bill starts from a blank record (extractionResult.billFromExtraction), so
// one document's blanks can never be filled from another's.
const toBillData = billFromExtraction;

// Content fingerprint of an uploaded file, so the same bill uploaded twice is
// counted once (consumptionSizing.consolidateBills). Cached per queue item.
const hashCache = new Map<string, string>();
function fileHash(item: QueueItem): string {
  let h = hashCache.get(item.id);
  if (!h) {
    let x = 0x811c9dc5;
    for (let i = 0; i < item.fileData.length; i++) x = Math.imul(x ^ item.fileData.charCodeAt(i), 0x01000193);
    h = `${item.fileData.length}:${(x >>> 0).toString(16)}`;
    hashCache.set(item.id, h);
  }
  return h;
}

const MONTH_TONE: Record<MonthStatus, string> = {
  used: "var(--green)",
  duplicate: "var(--muted)",
  conflict: "#f87171",
  invalid: "var(--amber)",
  "history-only": "var(--muted)",
};

export default function CommercialBatchAnalysis({ onResult }: { onResult?: (result: CommercialAnalysisResult | null) => void } = {}) {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [rejected, setRejected] = useState<RejectedFile[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const [sizing, setSizing] = useState<SizingSettings>(DEFAULT_SIZING);
  const updateSizing = (patch: Partial<SizingSettings>) => setSizing((prev) => ({ ...prev, ...patch }));

  // Read inside the worker pool, which outlives any single render.
  const itemsRef = useRef<QueueItem[]>([]);
  itemsRef.current = items;

  const totals = useMemo(() => rollUp(items), [items]);
  const progress = totals.total === 0 ? 0 : ((totals.total - totals.pending) / totals.total) * 100;
  const hasResults = items.some((i) => i.data);
  const retryable = items.filter((i) => isRetryable(i.status));

  const patch = (id: string, next: Partial<QueueItem>) =>
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...next } : i)));

  // All extracted bills consolidated per connection, then sized — the same
  // engine Single bill, the exports and the server's save check use.
  const extracted = items.filter((i) => i.data);
  const analysis = useMemo(
    () => analyseCommercial(extracted.map((i) => ({ data: i.data!, sourceId: i.fileName, fileHash: fileHash(i) })), sizing),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `extracted` is derived from items
    [items, sizing]
  );
  const itemBySource = new Map(extracted.map((i) => [i.fileName, i]));
  const editKwh = (item: QueueItem, v: string) =>
    patch(item.id, { data: { ...item.data!, activeKwh: v === "" ? "" : Math.max(0, Number(v) || 0) } });
  const removeItem = (id: string) => setItems((prev) => prev.filter((i) => i.id !== id));

  useEffect(() => {
    onResult?.(analysis.latest && analysis.baseline ? { data: analysis.latest, bills: extracted.map((i) => i.data!), ...sizing } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onResult identity is the parent's concern
  }, [analysis]);

  const handleFilesLoaded = (files: LoadedFile[]) => {
    setItems((prev) => {
      const { accepted, rejected: bad } = validateSelection(files, prev);
      setRejected(bad);
      return [...prev, ...accepted];
    });
  };

  // One bill, start to finish. Never throws — a failure is a status, so a bad
  // bill can never take the rest of the batch down with it.
  const processOne = async (item: QueueItem) => {
    patch(item.id, { status: "Processing", error: undefined });
    try {
      patch(item.id, { status: "OCR" });
      const response = await fetch("/api/commercial/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileData: item.fileData, fileName: item.fileName }),
      });
      const res = await response.json();
      patch(item.id, { status: "Extracting" });

      const stale = res.success ? extractionVersionError(res) : null;
      if (!res.success || !res.data || stale) {
        patch(item.id, {
          status: res.code === "QUOTA_EXCEEDED" ? "Quota Blocked" : "Failed",
          error: stale ?? res.error ?? "Unable to extract bill.",
        });
        return;
      }

      patch(item.id, { status: "Validating" });
      const data = toBillData(res.data as Partial<CommercialBillData>, item.fileName);
      patch(item.id, { status: deriveStatus(data), data, error: undefined });
    } catch {
      patch(item.id, { status: "Failed", error: "Unable to reach the extraction service." });
    }
  };

  const runPool = async (queue: QueueItem[]) => {
    setIsRunning(true);
    setDownloadError(null);
    let next = 0;
    const worker = async () => {
      while (next < queue.length) {
        const item = queue[next++];
        await processOne(item);
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
    setIsRunning(false);
  };

  const startBatch = () => runPool(itemsRef.current.filter((i) => !isTerminal(i.status)));
  const retryOne = (item: QueueItem) => runPool([item]);
  const retryAllFailed = () => runPool(itemsRef.current.filter((i) => isRetryable(i.status)));

  const clearAll = () => {
    setItems([]);
    setRejected([]);
    setDownloadError(null);
  };

  const handleDownload = async () => {
    setDownloadError(null);
    // Every queued bill is reported, including the ones that never extracted —
    // a silently missing row is worse than a row that says "Failed".
    const bills: BatchBillEntry[] = items.map((i) => ({
      sourceFile: i.fileName,
      status: isTerminal(i.status) ? (i.status as BatchBillEntry["status"]) : "Failed",
      data: i.data,
      error: i.data ? undefined : i.error || "Not processed",
    }));

    try {
      const response = await fetch("/api/commercial/batch-export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bills, ...sizing }),
      });
      if (!response.ok) throw new Error("Failed to compile the batch workbook.");
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Commercial_Bill_Batch_Analysis_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch {
      setDownloadError("Could not build the batch workbook. Please try again.");
    }
  };

  return (
    <div className="space-y-6">
      {/* Same illustrated upload box as single-bill mode (the Single/Several
          switch lives on the page above). Drive import removed in the standalone scanner. */}
      <div className="space-y-5">
        <div className="space-y-5">
          <Uploader
            multiple
            onFilesLoaded={handleFilesLoaded}
            isLoading={isRunning}
            selectedFileName={items.length ? `${items.length} bill${items.length > 1 ? "s" : ""} queued` : null}
          />


          {rejected.length > 0 && (
            <div className="p-4 rounded-xl border border-red-500/30 bg-red-500/10 space-y-1.5 text-sm">
              <p className="flex items-center gap-2 font-medium text-[var(--text-primary)]">
                <AlertCircle className="w-4 h-4 text-red-500" /> {rejected.length} file{rejected.length > 1 ? "s" : ""} not queued
              </p>
              {rejected.map((r) => (
                <p key={r.fileName} className="text-[var(--text-secondary)] pl-6">
                  {r.fileName} — {r.reason}
                </p>
              ))}
            </div>
          )}
        </div>

        {items.length > 0 && (
          <div className="glass-panel rounded-2xl px-5 py-4 flex flex-wrap items-center gap-2">
            <span className="text-sm text-[var(--text-secondary)] mr-2">
              <span className="font-semibold text-[var(--text-primary)]">{items.length}</span> bill{items.length === 1 ? "" : "s"} in the queue
            </span>
            <button
              type="button"
              disabled={isRunning || totals.pending === 0}
              onClick={startBatch}
              className="h-10 px-5 rounded-lg bg-[var(--accent-solid)] text-sm font-medium text-white hover:opacity-90 shadow-sm flex items-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Play className="w-4 h-4" /> {isRunning ? "Processing…" : `Analyse ${totals.pending || items.length} bill${(totals.pending || items.length) === 1 ? "" : "s"}`}
            </button>

            {retryable.length > 0 && !isRunning && (
              <button
                type="button"
                onClick={retryAllFailed}
                className="h-10 px-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--hover-bg)] flex items-center gap-2 cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" /> Retry {retryable.length} failed
              </button>
            )}

            {!isRunning && (
              <button
                type="button"
                onClick={clearAll}
                className="ml-auto h-10 px-4 rounded-lg text-sm font-medium text-[var(--text-secondary)] hover:text-red-500 hover:bg-[var(--hover-bg)] flex items-center gap-2 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" /> Clear queue
              </button>
            )}
          </div>
        )}
      </div>

      {items.length > 0 && (
        <div className="cba">
          <div className="cba-cstrip">
            <span className="cstrip-lbl">Solar constants ·</span>
            <div className="citem"><span className="citem-k">Panel</span>
              <input className="citem-inp" value={sizing.panelWatt} onChange={(e) => updateSizing({ panelWatt: Number(e.target.value) || 600 })} />
              <span className="citem-k">W</span></div>
            <div className="csep" />
            <div className="citem"><span className="citem-k">Yield (assumed)</span>
              <span className="citem-v">{sizing.specificYield}</span><span className="citem-k">kWh/kWp/yr · edit in § 05</span></div>
          </div>

          <div className="cba-body">
            <div className="sec">
              <span className="sec-lbl">§ B1 — Processing Queue</span>
              <div className="sec-line" />
              <span className="badge badge-auto">{totals.total - totals.pending} / {totals.total} done</span>
            </div>

            <div className="w-full h-1.5 bg-[var(--hover-bg)] rounded-full overflow-hidden mb-3">
              <div
                style={{ width: `${progress}%` }}
                className="h-full rounded-full bg-[var(--accent-green)] transition-all duration-300"
              />
            </div>

            <div className="card">
              <div style={{ overflowX: "auto" }}>
                <table className="tbl">
                  <thead><tr>
                    <th style={{ width: 26 }}>#</th>
                    <th>Source file</th>
                    <th>Consumer</th>
                    <th>Month</th>
                    <th className="r">Active (kWh)</th>
                    <th className="r">Bill amount</th>
                    <th className="c">Status</th>
                    <th className="c">Action</th>
                  </tr></thead>
                  <tbody>
                    {items.map((item, idx) => (
                      <tr key={item.id}>
                        <td className="cm" style={{ fontSize: 11 }}>{idx + 1}</td>
                        <td style={{ fontSize: 11 }}>{item.fileName}</td>
                        <td style={{ fontSize: 11, color: "var(--muted)" }}>
                          {item.data ? (
                            <>
                              <div>{item.data.consumerName || "—"}</div>
                              {/* Bills group by this number only — correct a misread digit here. */}
                              <input className="ti" style={{ width: 120, textAlign: "left" }} aria-label={`Consumer number for ${item.fileName}`} placeholder="consumer no."
                                value={item.data.consumerNo} onChange={(e) => patch(item.id, { data: { ...item.data!, consumerNo: e.target.value.replace(/[^0-9]/g, "") } })} />
                            </>
                          ) : "—"}
                        </td>
                        <td style={{ fontSize: 11 }}>{item.data?.billingMonth || "—"}</td>
                        <td className="tr cc">
                          {typeof item.data?.activeKwh === "number" ? fmtNum(item.data.activeKwh) : item.data ? "from readings" : "--"}
                        </td>
                        <td className="tr cc">
                          {typeof item.data?.billAmount === "number" ? fmtINR(item.data.billAmount) : "--"}
                        </td>
                        <td className="tc" style={{ color: STATUS_TONE[item.status], fontSize: 12, fontWeight: 600 }}>
                          {/* "quota_blocked" → "Quota blocked" — sentence case like the rest of the app. */}
                          {item.status.charAt(0).toUpperCase() + item.status.slice(1).replace(/_/g, " ")}
                          {item.error && (
                            <div style={{ color: "var(--muted)", fontWeight: 400, fontSize: 12, maxWidth: 220, whiteSpace: "normal" }}>
                              {item.error}
                            </div>
                          )}
                        </td>
                        <td className="tc">
                          {isRetryable(item.status) && !isRunning ? (
                            <button
                              type="button"
                              onClick={() => retryOne(item)}
                              className="text-xs font-medium hover:underline cursor-pointer"
                              style={{ color: "var(--cyan)" }}
                            >
                              Retry
                            </button>
                          ) : !isRunning ? (
                            <button type="button" onClick={() => removeItem(item.id)} className="text-xs font-medium hover:underline cursor-pointer" style={{ color: "var(--muted)" }}>
                              Remove
                            </button>
                          ) : (
                            <span style={{ color: "var(--muted)", fontSize: 12 }}>—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="sec" style={{ marginTop: 14 }}>
              <span className="sec-lbl">§ B2 — Batch Results</span>
              <div className="sec-line" />
            </div>
            <div className="g4">
              <div className="res rg">
                <div className="rl">Succeeded</div>
                <div className="rv cg">{totals.completed}</div>
                <div className="ru">bills</div>
                <div className="rs">fully reconciled</div>
              </div>
              <div className="res ra">
                <div className="rl">Partially Extracted</div>
                <div className="rv ca">{totals.partial}</div>
                <div className="ru">bills</div>
                <div className="rs">check flagged fields</div>
              </div>
              <div className="res rp">
                <div className="rl">Active energy (consolidated)</div>
                <div className="rv cc">{analysis.baseline ? fmtNum(analysis.baseline.annualKwh) : "--"}</div>
                <div className="ru">kWh / yr</div>
                <div className="rs">{analysis.baseline ? `${analysis.baseline.periods} valid month${analysis.baseline.periods === 1 ? "" : "s"} · ${analysis.baseline.annualBasis}` : "no valid kWh yet"}</div>
              </div>
              <div className="res rpurp">
                <div className="rl">Total Bill Value</div>
                <div className="rv cp">{totals.totalBillValue > 0 ? fmtINR(totals.totalBillValue) : "--"}</div>
                <div className="ru">₹ this cycle</div>
                <div className="rs">{totals.failed + totals.quotaBlocked} not extracted</div>
              </div>
            </div>

            {analysis.histories.length > 0 && (
              <>
                <div className="sec" style={{ marginTop: 14 }}>
                  <span className="sec-lbl">§ B3 — Consolidated History</span>
                  <div className="sec-line" />
                  <span className="badge badge-auto">Review before sizing</span>
                </div>
                {analysis.histories.length > 1 && (
                  <div className="vals" style={{ marginBottom: 8 }}>
                    <div className="vl warn"><div className="vdot" />{analysis.histories.length} connections found — they are kept apart. Sizing uses {analysis.history?.connectionId ?? "the bill"} (most valid months). If one is a misread digit, correct the consumer number in § B1; otherwise remove bills that don't belong.</div>
                  </div>
                )}
                {analysis.histories.map((h) => (
                  <div className="card" key={h.connectionId ?? h.months[0]?.sources[0]} style={{ marginBottom: 10 }}>
                    <div className="card-h"><span className="card-t">Connection {h.connectionId ?? "not identified"}{h === analysis.history ? " · sized" : ""}</span></div>
                    <div style={{ overflowX: "auto" }}>
                      <table className="tbl">
                        <thead><tr>
                          <th>Month</th><th className="c">Status</th><th className="r">Active (kWh)</th><th className="r">Apparent (kVAh)</th><th className="r">Days</th><th>Source / note</th>
                        </tr></thead>
                        <tbody>
                          {h.months.map((m, i) => {
                            const src = m.status === "history-only" ? null : itemBySource.get(m.sources[0]);
                            return (
                              <tr key={`${m.month}-${i}`} style={m.status === "history-only" || m.status === "duplicate" ? { opacity: 0.6 } : undefined}>
                                <td style={{ fontSize: 12 }}>{m.month}</td>
                                <td className="tc" style={{ color: MONTH_TONE[m.status], fontSize: 12, fontWeight: 600 }}>{m.status}</td>
                                <td className="r">
                                  {src ? (
                                    <input className="ti" placeholder="kWh" value={typeof src.data!.activeKwh === "number" ? String(src.data!.activeKwh) : ""} onChange={(e) => editKwh(src, e.target.value)}
                                      title={m.activeKwh !== null && src.data!.activeKwh === "" ? `From meter readings: ${m.activeKwh}` : "Active energy, KWH total consumption"} />
                                  ) : m.activeKwh !== null ? fmtNum(m.activeKwh) : "--"}
                                </td>
                                <td className="tr">{m.apparentKvah !== null ? fmtNum(m.apparentKvah) : "--"}</td>
                                <td className="tr">{m.days ?? "--"}</td>
                                <td style={{ fontSize: 11, color: "var(--muted)", whiteSpace: "normal" }}>{[m.sources.join(", "), m.note].filter(Boolean).join(" — ")}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {h.warnings.length > 0 && (
                      <div className="vals" style={{ padding: 8 }}>
                        {h.warnings.map((w) => <div key={w} className="vl warn"><div className="vdot" />{w}</div>)}
                      </div>
                    )}
                  </div>
                ))}

                <CiSizingPanel a={analysis} settings={sizing} onChange={updateSizing} />
              </>
            )}

            {downloadError && (
              <div className="p-4 mt-3 rounded-xl border border-red-500/30 bg-red-500/10 flex items-start gap-3 text-sm">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-red-500" />
                <span className="text-[var(--text-secondary)]">{downloadError}</span>
              </div>
            )}

            <div className="p-4 mt-4 bg-[var(--hover-bg)] border-t border-[var(--border-subtle)] rounded-xl flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
              <div className="text-sm text-[var(--text-muted)] flex items-center gap-2">
                {isRunning ? <Clock className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                All bills export onto one sheet · same engine as single-bill mode
              </div>
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                type="button"
                disabled={!hasResults || isRunning}
                onClick={handleDownload}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-[var(--accent-solid)] text-xs font-bold text-white shadow-sm flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <FileSpreadsheet className="w-4 h-4 text-white" />
                Download Combined Excel (.xlsx)
              </motion.button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
