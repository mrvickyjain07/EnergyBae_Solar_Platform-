// End-to-end check against "TOD E-bill analysis (1).xlsx" — the actual
// reference workbook, cell-for-cell, not just a re-derivation of its intent.
// This exists because a prior change removed the LT +10% TOD buffer entirely,
// which silently broke the sizing pipeline: the reference file's own cached
// K40/K42/K43 values prove the buffer DOES feed into Solar Capacity/Panels
// (K40 = K38*D40 where K38 = TOD Consideration * 1.1), even though a separate
// "TOD Consideration" (unbuffered) figure is also shown alongside it.
// Since 2026-10-15 the app applies NO hidden multiplier: the workbook's ×1.1
// sizing buffer is the optional, visible "additional sizing margin" (marginPct
// 10 here), and its LT TOD ×1.1 (K38 = I38 × 1.1) is no longer applied at all —
// the TOD share is a low-confidence tariff-band proxy. To prove the pipeline
// arithmetic still matches the workbook cell-for-cell, the test passes the
// workbook's hand-applied ×1.1 TOD figure explicitly (12-month average × 12
// stands in for annual kWh).
import assert from "node:assert/strict";
import { computeBillingStats, computeTodUtilisation, computeSizingPipeline, detectTodMode } from "./commercialCalculations";

function close(label: string, actual: number, expected: number, tol = 0.01) {
  const ok = Math.abs(actual - expected) <= tol;
  assert.ok(ok, `${label}: got ${actual}, want ~${expected} (±${tol})`);
  console.log(`  ok  ${label} (${actual})`);
}

// ── Consumer 170850070400 (LT-I A) — sheet columns B:F ──────────────────────
{
  const rows = [
    { monthLabel: "Apr-2025", units: 12944, billAmount: 266719.54 },
    { monthLabel: "May-2025", units: 12340, billAmount: 254140.89 },
    { monthLabel: "Jun-2025", units: 11635, billAmount: 239676.13 },
    { monthLabel: "Jul-2025", units: 12026, billAmount: 264736.33 },
    { monthLabel: "Aug-2025", units: 11982, billAmount: 272702.86 },
    { monthLabel: "Sep-2025", units: 11788, billAmount: 273774.85 },
    { monthLabel: "Oct-2025", units: 12836, billAmount: 284118.71 },
    { monthLabel: "Nov-2025", units: 13479, billAmount: 298510.75 },
    { monthLabel: "Dec-2025", units: 14106, billAmount: 315569.18 },
    { monthLabel: "Jan-2026", units: 13964, billAmount: 317383.57 },
    { monthLabel: "Feb-2026", units: 12952, billAmount: 298211.95 },
    { monthLabel: "Mar-2026", units: 13876, billAmount: 315972.6 },
    { monthLabel: "Apr-2026", units: 13987, billAmount: 324679.31 },
  ];
  const stats = computeBillingStats(rows, 2380);
  close("consumer1 avgUnits", stats.avgUnits, 12916.53846);

  const todMode = detectTodMode("LT");
  const tod = computeTodUtilisation(
    [{ slot: "A", units: 4455 }, { slot: "B", units: 4200 }, { slot: "C", units: 1928 }, { slot: "D", units: 3404 }],
    todMode
  );
  close("consumer1 utilisableFraction (TOD Consideration)", tod.utilisableFraction, 0.4381211125, 0.0001);
  assert.equal("bufferedFraction" in tod, false, "no hidden TOD multiplier");
  const workbookK38 = tod.utilisableFraction * 1.1; // the workbook's own hand-applied factor
  close("consumer1 workbook K38 (I38 × 1.1)", workbookK38, 0.4819332237, 0.0001);

  const pipeline = computeSizingPipeline({ annualKwh: stats.avgUnits * 12, offsetPct: 100, marginPct: 10, specificYield: 1400, todFraction: workbookK38, panelWattage: 600, ratePerKwh: stats.avgUnitCost, systemCost: 0 });
  close("consumer1 solarCapacityRawKwp", pipeline.solarCapacityRawKwp, 121.7845055);
  close("consumer1 fullPanels", pipeline.fullPanels, 203, 0);
  close("consumer1 fullKwp (Actual Solar capacity)", pipeline.fullKwp, 121.8);
  close("consumer1 todSolarCapacityKwp", pipeline.todSolarCapacityKwp, 58.69199933);
  close("consumer1 todPanels", pipeline.todPanels, 98, 0);
  close("consumer1 todKwp (Actual Solar capacity, TOD)", pipeline.todKwp, 58.8);
}

// ── Consumer 170854989203 (LT-II B) — sheet columns P:T ─────────────────────
{
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
    { monthLabel: "Mar-2026", units: 8960, billAmount: 169693.14 }, // flagged OUTLIER — must still count
    { monthLabel: "Apr-2026", units: 7254, billAmount: 155796.68 },
  ];
  const stats = computeBillingStats(rows, 8250);
  close("consumer2 avgUnits (includes outlier month)", stats.avgUnits, 6968.833333);

  const todMode = detectTodMode("LT");
  const tod = computeTodUtilisation(
    [{ slot: "A", units: 1873 }, { slot: "B", units: 1002 }, { slot: "C", units: 2723 }, { slot: "D", units: 2373 }],
    todMode
  );
  close("consumer2 utilisableFraction (TOD Consideration)", tod.utilisableFraction, 0.4673190315, 0.0001);
  const workbookK38 = tod.utilisableFraction * 1.1;
  close("consumer2 workbook K38 (I38 × 1.1)", workbookK38, 0.5140509346, 0.0001);

  const pipeline = computeSizingPipeline({ annualKwh: stats.avgUnits * 12, offsetPct: 100, marginPct: 10, specificYield: 1400, todFraction: workbookK38, panelWattage: 600, ratePerKwh: stats.avgUnitCost, systemCost: 0 });
  close("consumer2 solarCapacityRawKwp", pipeline.solarCapacityRawKwp, 65.70614286);
  close("consumer2 fullPanels", pipeline.fullPanels, 110, 0);
  close("consumer2 fullKwp", pipeline.fullKwp, 66);
  close("consumer2 todSolarCapacityKwp", pipeline.todSolarCapacityKwp, 33.77630415);
  close("consumer2 todPanels", pipeline.todPanels, 56, 0);
  close("consumer2 todKwp", pipeline.todKwp, 33.6);
}

// LT and HT alike: the TOD proxy is the plain B+C share, no multiplier.
{
  const slots = [{ slot: "A", units: 100 }, { slot: "B", units: 100 }, { slot: "C", units: 100 }, { slot: "D", units: 100 }] as const;
  close("LT TOD proxy = B+C share, unbuffered", computeTodUtilisation([...slots], detectTodMode("LT")).utilisableFraction, 0.5, 1e-9);
  close("HT TOD proxy = B+C share, unbuffered", computeTodUtilisation([...slots], detectTodMode("HT")).utilisableFraction, 0.5, 1e-9);
}
