// The contract that matters: a bill's block inside a batch sheet must be the
// EXACT single-bill export, only shifted down. Every label, every value, every
// column, same order. If this test fails, batch output has drifted from what the
// single-bill download produces and the numbers can no longer be trusted.
import assert from "node:assert/strict";
import { buildCommercialWorksheetModel } from "./commercialWorksheetModel";
import { buildCommercialBatchWorksheetModel, BatchBillEntry, BATCH_SHEET_TITLE } from "./commercialBatchWorksheetModel";
import { CommercialBillData, buildBlankCommercialBillData } from "./types";

function check(label: string, actual: unknown, expected: unknown) {
  assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`);
  console.log(`  ok  ${label}`);
}

const SIZING = { panelWatt: 600, specificYield: 1400, offsetPct: 100, marginPct: 0, systemCost: "" as const };

function bill(over: Partial<CommercialBillData> = {}): CommercialBillData {
  return {
    ...buildBlankCommercialBillData(),
    consumerNo: "170850115152",
    consumerName: "NANDED CITY DEV & CONST CO LTD",
    address: "COMMON LIGHTING, BLDG H",
    connectionType: "LT",
    category: "Commercial",
    contractDemand: 45,
    fixedCharges: 0,
    sanctionedLoad: 45,
    prevReading: 756971.1,
    currReading: 760934.2,
    multiplyingFactor: 1,
    kvahReading: 3973.6,
    recordedMD: 11,
    energyCharges: 66268.39,
    demandCharges: 1305,
    fac: 2094.65,
    ed: 12161.41,
    wheelingCharges: 6340.8,
    creditAdjustment: 120,
    billAmount: 88050,
    billingMonth: "Jun-2026",
    billingHistory: [
      { monthLabel: "Apr-2026", units: 4556, billAmount: 103757.92 },
      { monthLabel: "May-2026", units: 3907, billAmount: 86121.5 },
      { monthLabel: "Jun-2026", units: 3963, billAmount: 88050 },
    ],
    todSlots: [
      { slot: "A", units: 1211 },
      { slot: "B", units: 1249 },
      { slot: "C", units: 399 },
      { slot: "D", units: 1105 },
    ],
    ...over,
  };
}

// ── startRow / endRow refactor ─────────────────────────────────────────────
const atOne = buildCommercialWorksheetModel(bill(), SIZING);
const at50 = buildCommercialWorksheetModel(bill(), SIZING, 50);

check("default startRow is unchanged (back-compat)", atOne.cells[0].ref, "A1");
check("startRow offsets the block", at50.cells[0].ref, "A50");
check("same cell count regardless of offset", at50.cells.length, atOne.cells.length);
check("endRow reported", atOne.endRow, Math.max(...atOne.cells.map((c) => Number(c.ref.slice(1)))));

const shift = (ref: string, by: number) => ref[0] + String(Number(ref.slice(1)) + by);
check(
  "offset block is the base block shifted, cell for cell",
  at50.cells.map((c) => ({ ref: c.ref, value: c.value })),
  atOne.cells.map((c) => ({ ref: shift(c.ref, 49), value: c.value }))
);

// ── the batch guarantee ────────────────────────────────────────────────────
const entries: BatchBillEntry[] = [
  { sourceFile: "a.pdf", status: "Completed", data: bill() },
  { sourceFile: "b.pdf", status: "Failed", error: "Unable to extract bill." },
  { sourceFile: "c.pdf", status: "Quota Blocked", error: "Daily AI quota reached." },
  // Shorter history + no TOD => a different block height than bill #1.
  {
    sourceFile: "d.pdf",
    status: "Partially Extracted",
    data: bill({
      consumerNo: "170850618561",
      consumerName: "STREET LIGHT",
      billingHistory: [{ monthLabel: "Jun-2026", units: 3150, billAmount: 29230 }],
      todSlots: [
        { slot: "A", units: "" },
        { slot: "B", units: "" },
        { slot: "C", units: "" },
        { slot: "D", units: "" },
      ],
    }),
  },
];

const batch = buildCommercialBatchWorksheetModel(entries, SIZING, new Date("2026-08-12T00:00:00Z"));
const cellAt = (ref: string) => batch.cells.find((c) => c.ref === ref);

check("sheet title", batch.sheetTitle, BATCH_SHEET_TITLE);

// Locate each bill's block by its separator row, then prove the block that
// follows equals a fresh single-bill model built at that offset.
// Anchored: a loose "BILL " prefix also matches the block's own
// "BILLING HISTORY" heading.
const separators = batch.cells.filter((c) => /^BILL \d+ — /.test(String(c.value ?? "")));
check("one separator per bill WITH data", separators.length, 2);

[
  { sep: separators[0], data: bill() },
  { sep: separators[1], data: entries[3].data! },
].forEach(({ sep, data }, i) => {
  const blockStart = Number(sep.ref.slice(1)) + 1;
  const expected = buildCommercialWorksheetModel(data, SIZING, blockStart);
  const got = expected.cells.map((e) => {
    const actual = cellAt(e.ref);
    return { ref: e.ref, value: actual ? actual.value : "<<MISSING>>" };
  });
  check(
    `bill ${i + 1} block is the exact single-bill export`,
    got,
    expected.cells.map((e) => ({ ref: e.ref, value: e.value }))
  );
});

// Blocks must not collide, and the gap must survive.
const b1Start = Number(separators[0].ref.slice(1)) + 1;
const b1End = buildCommercialWorksheetModel(bill(), SIZING, b1Start).endRow!;
check("two blank rows between blocks", Number(separators[1].ref.slice(1)) - b1End - 1, 2);

// ── summary table ──────────────────────────────────────────────────────────
check("summary header present", cellAt("A4")?.value, "Sr.No");
check("failed bill still gets a summary row", cellAt("B6")?.value, "b.pdf");
check("quota-blocked reason surfaced", String(cellAt("I7")?.value).startsWith("Quota Blocked"), true);
check("failed bill has no consumer figures", cellAt("F6")?.value, null);

// Hyperlink must point at the row the block actually starts on.
check("summary links to its block", cellAt("A5")?.link, `#'${BATCH_SHEET_TITLE}'!A${separators[0].ref.slice(1)}`);
check("failed bill has no link", cellAt("A6")?.link, undefined);

// ── processing summary ─────────────────────────────────────────────────────
const totalsLabelRow = batch.cells.find((c) => c.value === "Total files")!;
const totalsRow = Number(totalsLabelRow.ref.slice(1));
check("total files counted", cellAt(`B${totalsRow}`)?.value, 4);
check("successfully processed", cellAt(`B${totalsRow + 1}`)?.value, 1);
check("partially processed", cellAt(`B${totalsRow + 2}`)?.value, 1);
check("failed counted", cellAt(`B${totalsRow + 3}`)?.value, 1);
check("quota blocked counted", cellAt(`B${totalsRow + 4}`)?.value, 1);

// Empty batch must not throw.
const empty = buildCommercialBatchWorksheetModel([], SIZING, new Date("2026-08-12T00:00:00Z"));
check("empty batch still builds", empty.cells.some((c) => c.value === "Total files"), true);

console.log("\nAll commercialBatchWorksheetModel checks passed.");
