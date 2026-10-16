// Pure queue logic for Batch Bill Analysis — file validation, status derivation
// and roll-up totals. Split out of the component so it can be tested directly
// (repo convention: pure logic lives beside a .test.ts sibling rather than being
// tested through React).
import { CommercialBillData } from "./types";
import { reconcileCharges } from "./commercialCalculations";
import { BatchBillStatus } from "./commercialBatchWorksheetModel";

export type QueueStatus =
  | "Waiting"
  | "Processing"
  | "OCR"
  | "Extracting"
  | "Validating"
  | BatchBillStatus;

export interface QueueItem {
  id: string;
  fileName: string;
  fileData: string; // data URL
  status: QueueStatus;
  data?: CommercialBillData;
  error?: string;
}

import { MAX_BILL_BYTES, MAX_BILL_LABEL } from "../../uploadLimits";

export interface RejectedFile {
  fileName: string;
  reason: string;
}

const ALLOWED_EXT = ["pdf", "jpg", "jpeg", "png"];
// The deployable upload limit (src/uploadLimits.ts: what fits one Vercel
// request once base64-encoded) — rejecting here means a doomed file never
// costs an API call. Local uploads arrive already compressed by Uploader;
// this mainly catches oversized Drive imports.
export const MAX_FILE_BYTES = MAX_BILL_BYTES;

export function base64Bytes(dataUrl: string): number {
  const b64 = dataUrl.replace(/^data:[^;]+;base64,/, "");
  if (!b64) return 0;
  const padding = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - padding;
}

export const isTerminal = (s: QueueStatus): boolean =>
  s === "Completed" || s === "Partially Extracted" || s === "Failed" || s === "Quota Blocked";

export const isRetryable = (s: QueueStatus): boolean => s === "Failed" || s === "Quota Blocked";

/**
 * Validates a fresh selection against what is already queued.
 * Duplicates are caught by BOTH filename and payload, so the same bill saved
 * under two names still costs only one extraction.
 */
export function validateSelection(
  incoming: { fileName: string; base64Data: string }[],
  existing: QueueItem[]
): { accepted: QueueItem[]; rejected: RejectedFile[] } {
  const accepted: QueueItem[] = [];
  const rejected: RejectedFile[] = [];

  const seenNames = new Set(existing.map((i) => i.fileName.toLowerCase()));
  const seenPayloads = new Set(existing.map((i) => i.fileData));

  incoming.forEach((file, idx) => {
    const ext = file.fileName.split(".").pop()?.toLowerCase() ?? "";
    const bytes = base64Bytes(file.base64Data);

    if (!ALLOWED_EXT.includes(ext)) {
      rejected.push({ fileName: file.fileName, reason: `Unsupported file type (.${ext || "unknown"})` });
      return;
    }
    if (bytes === 0) {
      rejected.push({ fileName: file.fileName, reason: "File is empty or unreadable" });
      return;
    }
    if (bytes > MAX_FILE_BYTES) {
      rejected.push({
        fileName: file.fileName,
        reason: `Too large (${(bytes / 1024 / 1024).toFixed(1)} MB, limit ${MAX_BILL_LABEL})`,
      });
      return;
    }
    if (seenNames.has(file.fileName.toLowerCase())) {
      rejected.push({ fileName: file.fileName, reason: "Duplicate filename — already queued" });
      return;
    }
    if (seenPayloads.has(file.base64Data)) {
      rejected.push({ fileName: file.fileName, reason: "Duplicate file contents — already queued" });
      return;
    }

    seenNames.add(file.fileName.toLowerCase());
    seenPayloads.add(file.base64Data);
    accepted.push({
      id: `${Date.now()}-${idx}-${file.fileName}`,
      fileName: file.fileName,
      fileData: file.base64Data,
      status: "Waiting",
    });
  });

  return { accepted, rejected };
}

/**
 * Completed vs Partially Extracted, decided from the data itself rather than
 * from the model's self-reported confidence. A bill counts as fully extracted
 * only when it identifies its consumer, carries a printed total, and its charge
 * components reconcile to that total within the engine's own ±Rs.10 tolerance.
 */
export function deriveStatus(data: CommercialBillData): BatchBillStatus {
  if (!data.consumerNo) return "Partially Extracted";
  if (typeof data.billAmount !== "number" || data.billAmount <= 0) return "Partially Extracted";

  const recon = reconcileCharges(data);
  if (!recon.withinTolerance) return "Partially Extracted";

  // Sizing needs this bill's active kWh; the history table (kVAh on MSEDCL) is reference only.
  if (!(typeof data.activeKwh === "number" && data.activeKwh > 0)) return "Partially Extracted";

  return "Completed";
}

export interface BatchTotals {
  total: number;
  completed: number;
  partial: number;
  failed: number;
  quotaBlocked: number;
  pending: number;
  totalBillValue: number;
}

export function rollUp(items: QueueItem[]): BatchTotals {
  const totals: BatchTotals = {
    total: items.length,
    completed: 0,
    partial: 0,
    failed: 0,
    quotaBlocked: 0,
    pending: 0,
    totalBillValue: 0,
  };

  items.forEach((item) => {
    if (item.status === "Completed") totals.completed += 1;
    else if (item.status === "Partially Extracted") totals.partial += 1;
    else if (item.status === "Failed") totals.failed += 1;
    else if (item.status === "Quota Blocked") totals.quotaBlocked += 1;
    else totals.pending += 1;

    if (item.data) {
      if (typeof item.data.billAmount === "number") totals.totalBillValue += item.data.billAmount;
    }
  });

  return totals;
}
