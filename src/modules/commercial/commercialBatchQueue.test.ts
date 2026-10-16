// Guards the batch queue's real decisions: which files are refused before they
// cost an API call, and when a bill is honestly "Completed" vs only partially
// extracted.
import assert from "node:assert/strict";
import { validateSelection, deriveStatus, rollUp, base64Bytes, QueueItem } from "./commercialBatchQueue";
import { CommercialBillData, buildBlankCommercialBillData } from "./types";

function check(label: string, actual: unknown, expected: unknown) {
  assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`);
  console.log(`  ok  ${label}`);
}

const dataUrl = (body: string) => `data:application/pdf;base64,${Buffer.from(body).toString("base64")}`;
const file = (fileName: string, body = "hello-bill") => ({ fileName, base64Data: dataUrl(body) });

// ── validation ─────────────────────────────────────────────────────────────
const { accepted, rejected } = validateSelection(
  [
    file("bill1.pdf"),
    file("scan.JPG", "image-bytes"),
    file("notes.txt", "nope"),
    file("bill1.pdf", "different-content"), // duplicate name
    file("copy.pdf", "hello-bill"), // duplicate payload of bill1
  ],
  []
);

check("valid files accepted", accepted.map((a) => a.fileName), ["bill1.pdf", "scan.JPG"]);
check("uppercase extension accepted", accepted[1].fileName, "scan.JPG");
check("three rejections", rejected.length, 3);
check("unsupported type rejected", rejected[0].reason.includes("Unsupported file type"), true);
check("duplicate filename rejected", rejected[1].reason.includes("Duplicate filename"), true);
check("duplicate contents rejected", rejected[2].reason.includes("Duplicate file contents"), true);
check("accepted items start Waiting", accepted[0].status, "Waiting");

// Duplicates are also caught against what is ALREADY queued, not just within
// the new selection.
const second = validateSelection([file("bill1.pdf")], accepted);
check("duplicate against existing queue rejected", second.accepted.length, 0);

check("empty file rejected", validateSelection([{ fileName: "x.pdf", base64Data: "data:application/pdf;base64," }], []).rejected[0].reason, "File is empty or unreadable");
check("base64 byte count", base64Bytes(dataUrl("abcd")), 4);

// ── status derivation ──────────────────────────────────────────────────────
function bill(over: Partial<CommercialBillData> = {}): CommercialBillData {
  return {
    ...buildBlankCommercialBillData(),
    consumerNo: "170850115152",
    fixedCharges: 0,
    energyCharges: 66268.39,
    demandCharges: 1305,
    fac: 2094.65,
    ed: 12161.41,
    wheelingCharges: 6340.8,
    creditAdjustment: 120,
    billAmount: 88050,
    activeKwh: 3963,
    billingHistory: [{ monthLabel: "Jun-2026", units: 3963, billAmount: 88050 }],
    ...over,
  };
}

check("reconciling bill is Completed", deriveStatus(bill()), "Completed");
check("missing consumer number is partial", deriveStatus(bill({ consumerNo: "" })), "Partially Extracted");
check("missing bill amount is partial", deriveStatus(bill({ billAmount: "" })), "Partially Extracted");
check("no active kWh is partial", deriveStatus(bill({ activeKwh: "" })), "Partially Extracted");
check("history is reference only: no history but kWh present is still Completed", deriveStatus(bill({ billingHistory: [] })), "Completed");
// Wheeling folded into energy charges — the misread that inflates the total.
check(
  "charges that don't reconcile are partial",
  deriveStatus(bill({ energyCharges: 72609.19, wheelingCharges: 0, creditAdjustment: 0 })),
  "Partially Extracted"
);

// ── roll-up ────────────────────────────────────────────────────────────────
const items: QueueItem[] = [
  { id: "1", fileName: "a.pdf", fileData: "x", status: "Completed", data: bill() },
  { id: "2", fileName: "b.pdf", fileData: "x", status: "Partially Extracted", data: bill({ billAmount: 1000 }) },
  { id: "3", fileName: "c.pdf", fileData: "x", status: "Failed", error: "bad scan" },
  { id: "4", fileName: "d.pdf", fileData: "x", status: "Quota Blocked", error: "quota" },
  { id: "5", fileName: "e.pdf", fileData: "x", status: "Waiting" },
];
const totals = rollUp(items);
check("counts by status", [totals.completed, totals.partial, totals.failed, totals.quotaBlocked, totals.pending], [1, 1, 1, 1, 1]);
check("total bill value sums extracted bills only", totals.totalBillValue, 89050);

console.log("\nAll commercialBatchQueue checks passed.");
