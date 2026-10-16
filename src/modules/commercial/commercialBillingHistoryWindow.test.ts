// Row count must match the bill exactly: 13 months on the bill -> 13 rows,
// 12 -> 12, 5 -> 5. No truncation to a cap (used to drop the oldest month
// past 12) and no padding to a minimum (used to add blank filler rows on a
// newer consumer with less history) — the table is exactly what was
// extracted, nothing invented, nothing dropped.
import assert from "node:assert/strict";
import { buildBillingHistoryWindow, computeBillingStats } from "./commercialCalculations";

function check(label: string, actual: unknown, expected: unknown) {
  assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`);
  console.log(`  ok  ${label}`);
}

const row = (monthLabel: string, units = 100) => ({ monthLabel, units, billAmount: 1000 });

// 13 real months (the common case on an LT bill) — none should be dropped.
{
  const thirteen = [
    row("Mar-2025"), row("Apr-2025"), row("May-2025"), row("Jun-2025"),
    row("Jul-2025"), row("Aug-2025"), row("Sep-2025"), row("Oct-2025"),
    row("Nov-2025"), row("Dec-2025"), row("Jan-2026"), row("Feb-2026"), row("Mar-2026"),
  ];
  const result = buildBillingHistoryWindow(thirteen);
  check("keeps all 13 months, none dropped", result.length, 13);
  check("oldest month survives", result[0].monthLabel, "Mar-2025");
  check("most recent month lands last", result[result.length - 1].monthLabel, "Mar-2026");
}

// A real bill's own printed 13-row table (Apr-2025 → Apr-2026, wide seasonal
// swing 1992-8180 units) — none dropped, no month flagged as a bogus outlier.
{
  const printed = [
    row("Apr-2025", 2097), row("May-2025", 3181), row("Jun-2025", 4420), row("Jul-2025", 6468),
    row("Aug-2025", 6859), row("Sep-2025", 6507), row("Oct-2025", 4667), row("Nov-2025", 5603),
    row("Dec-2025", 7468), row("Jan-2026", 8180), row("Feb-2026", 4795), row("Mar-2026", 2397),
    row("Apr-2026", 1992),
  ];
  const result = buildBillingHistoryWindow(printed);
  check("real 13-row bill: all months kept", result.length, 13);

  const stats = computeBillingStats(result, "");
  check("real 13-row bill: valid months", stats.validCount, 13);
  check("real 13-row bill: no false outlier", stats.rows.some((r) => r.isOutlier), false);
  check("real 13-row bill: avgUnits", Number(stats.avgUnits.toFixed(2)), 4971.85);
}

// A 12-month bill shows exactly 12 rows.
{
  const twelve = [
    row("May-2025"), row("Jun-2025"), row("Jul-2025"), row("Aug-2025"),
    row("Sep-2025"), row("Oct-2025"), row("Nov-2025"), row("Dec-2025"),
    row("Jan-2026"), row("Feb-2026"), row("Mar-2026"), row("Apr-2026"),
  ];
  check("12-month bill: exactly 12 rows", buildBillingHistoryWindow(twelve).length, 12);
}

// A newer consumer with only 3 months of real history: no blank padding rows.
{
  const three = [row("Jan-2026"), row("Feb-2026"), row("Mar-2026")];
  const result = buildBillingHistoryWindow(three);
  check("3-month bill: exactly 3 rows, no padding", result.length, 3);
  check("no blank rows added", result.every((r) => r.monthLabel !== ""), true);
  check("real data still lands last", result[result.length - 1].monthLabel, "Mar-2026");
}
