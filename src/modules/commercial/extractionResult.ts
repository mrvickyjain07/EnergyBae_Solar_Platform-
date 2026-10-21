// src/modules/commercial/extractionResult.ts
// One place that turns a /api/commercial/extract response into bill data, for
// Single bill, Several bills and a project's "Scan bill".
//
// Why: Single bill used to merge a new scan ONTO the previous bill, keeping any
// old value the new scan left blank — so a re-scan, or the next customer's
// bill, silently inherited the last bill's figures, and every "left blank for
// review" guard on the server was undone in the browser. A scan now always
// starts from a blank bill.
//
// EXTRACTION_VERSION is shared by the server and the page. `npm run dev` does
// not reload server code, so a page newer than its server would otherwise show
// old-pipeline results as a fresh scan; the mismatch is reported instead.
import type { CommercialBillData } from "./types";
import { buildBlankCommercialBillData } from "./types";
import { buildBillingHistoryWindow } from "./commercialCalculations";

/** Bump when the extraction prompt, schema or sanitizer changes meaning. */
export const EXTRACTION_VERSION = "ci-2026-10-21.3";

export function extractionVersionError(res: { extractionVersion?: unknown }): string | null {
  if (res?.extractionVersion === EXTRACTION_VERSION) return null;
  return "The server is still running an older bill reader than this page, so this scan would use the old rules. "
    + "Restart the dev server (Ctrl+C in its terminal, then npm run dev) and scan again.";
}

/** A fresh scan → bill data. Known fields only; blanks stay blank (never the previous bill's values). */
export function billFromExtraction(ocr: Partial<CommercialBillData> | null | undefined, fileName: string): CommercialBillData {
  const bill = buildBlankCommercialBillData();
  const src = (ocr ?? {}) as Record<string, unknown>;
  for (const key of Object.keys(bill) as (keyof CommercialBillData)[]) {
    if (key === "billingHistory" || key === "todSlots" || key === "filename") continue;
    const v = src[key];
    if (v !== undefined && v !== null) (bill as any)[key] = v;
  }
  if (Array.isArray(ocr?.billingHistory)) bill.billingHistory = buildBillingHistoryWindow(ocr!.billingHistory);
  if (Array.isArray(ocr?.todSlots)) {
    bill.todSlots = bill.todSlots.map((slot) => {
      const match = ocr!.todSlots!.find((s) => s.slot === slot.slot);
      return match && (match.units === "" || typeof match.units === "number") ? { ...slot, units: match.units } : slot;
    });
  }
  bill.confidence = typeof ocr?.confidence === "number" ? ocr.confidence : 0;
  bill.filename = fileName;
  return bill;
}
