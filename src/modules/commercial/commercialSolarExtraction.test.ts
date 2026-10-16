// Guards the existing-solar sanitizer backstop: hasSolar must never be true
// without a real capacity or generation number behind it, no matter what the
// model's raw boolean says. Mirrors the four real MSEDCL test bills.
import assert from "node:assert/strict";
import { sanitizeCommercialData } from "./commercialApi";

function check(label: string, actual: unknown, expected: unknown) {
  assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`);
  console.log(`  ok  ${label}`);
}

const baseRaw = {
  consumerNo: "170000000000",
  connectionType: "HT",
  billingMonth: "Jun-2026",
  billingHistory: [],
  todSlots: [],
};

// 170019040260 — HT-IV with nameplate + generation evidence.
{
  const out = sanitizeCommercialData({
    ...baseRaw,
    hasSolar: true,
    solarCapacityKw: 407,
    solarGenerationUnits: 29309,
    solarSourceField: "ht_nameplate",
  });
  check("HT with solar: hasSolar", out.hasSolar, true);
  check("HT with solar: capacity", out.solarCapacityKw, 407);
  check("HT with solar: source", out.solarSourceField, "ht_nameplate");
}

// 170859055310 — HT-IV, solar row entirely absent from the bill.
{
  const out = sanitizeCommercialData({
    ...baseRaw,
    hasSolar: false,
    solarCapacityKw: 0,
    solarGenerationUnits: 0,
    solarSourceField: "none",
  });
  check("HT no solar: hasSolar", out.hasSolar, false);
  check("HT no solar: capacity", out.solarCapacityKw, "");
  check("HT no solar: source", out.solarSourceField, "none");
}

// 170850070400 / 170854989203 — LT bills, "Solar Generation Capacity (KW)" label present but blank.
{
  const out = sanitizeCommercialData({
    ...baseRaw,
    connectionType: "LT",
    hasSolar: false,
    solarCapacityKw: 0,
    solarGenerationUnits: 0,
    solarSourceField: "lt_nameplate",
  });
  check("LT blank: hasSolar", out.hasSolar, false);
  check("LT blank: source", out.solarSourceField, "lt_nameplate");
}

// Backstop: model claims hasSolar=true but reports no capacity/generation at all
// (e.g. hallucinated from an adjacent field) — must be forced back to false.
{
  const out = sanitizeCommercialData({
    ...baseRaw,
    hasSolar: true,
    solarCapacityKw: 0,
    solarGenerationUnits: 0,
    solarSourceField: "ht_nameplate",
  });
  check("unbacked hasSolar claim is rejected", out.hasSolar, false);
}
