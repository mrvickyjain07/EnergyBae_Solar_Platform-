// Guards the average calculation against silently excluding outlier months.
// isOutlier is a Status-column label (matches the "TOD E-bill analysis.xlsx"
// reference methodology) — it must not remove the month from the average,
// only a genuinely zero month should. Numbers below are the real 12-month
// history from consumer 170854989203 (Mar-2026 is the flagged outlier).
import assert from "node:assert/strict";
import { computeBillingStats } from "./commercialCalculations";

function check(label: string, actual: unknown, expected: unknown) {
  assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`);
  console.log(`  ok  ${label}`);
}

const rows = [
  { monthLabel: "May-2025", units: 7500, billAmount: 140108.76 },
  { monthLabel: "Jun-2025", units: 6854, billAmount: 126549.57 },
  { monthLabel: "Jul-2025", units: 5053, billAmount: 94237.5 },
  { monthLabel: "Aug-2025", units: 6239, billAmount: 121976.36 },
  { monthLabel: "Sep-2025", units: 6166, billAmount: 122850.75 },
  { monthLabel: "Oct-2025", units: 7329, billAmount: 137083.99 },
  { monthLabel: "Nov-2025", units: 6889, billAmount: 129471.29 },
  { monthLabel: "Dec-2025", units: 7175, billAmount: 136395.69 },
  { monthLabel: "Jan-2026", units: 6590, billAmount: 128245.11 },
  { monthLabel: "Feb-2026", units: 7617, billAmount: 161602.58 },
  { monthLabel: "Mar-2026", units: 8960, billAmount: 169693.14 }, // flagged OUTLIER
  { monthLabel: "Apr-2026", units: 7254.3, billAmount: 155800 }, // CURRENT
];

const stats = computeBillingStats(rows, 8250);

check("Mar-2026 is flagged as an outlier", stats.rows[10].isOutlier, true);
check("but the outlier month is still counted", stats.validCount, 12);
check(
  "avgUnits includes the outlier (matches plain AVERAGE, not exclusion)",
  Number(stats.avgUnits.toFixed(4)),
  6968.8583
);
