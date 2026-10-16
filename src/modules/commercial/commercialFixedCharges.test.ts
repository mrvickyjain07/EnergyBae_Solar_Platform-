// Demand charges are NOT fixed charges (decided 2026-10-15; the old backstop
// copied them across and showed ₹31,500 demand as "Fixed Charges"). Each
// printed line lives in exactly one field.
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

// No distinct "Fixed Charges" line printed — stays blank, demand is not copied in.
{
  const out = sanitizeCommercialData({ ...baseRaw, demandCharges: 217100, fixedCharges: 0 });
  check("no Fixed Charges line → blank, not demand", out.fixedCharges, "");
  check("demandCharges itself unaffected", out.demandCharges, 217100);
}

// A distinct Fixed Charges line IS printed — must win over demandCharges, not be overwritten.
{
  const out = sanitizeCommercialData({ ...baseRaw, demandCharges: 217100, fixedCharges: 5000 });
  check("distinct fixedCharges line wins", out.fixedCharges, 5000);
}

// The model copied Demand Charges into fixedCharges — undone.
{
  const out = sanitizeCommercialData({ ...baseRaw, demandCharges: 31500, fixedCharges: 31500 });
  check("demand copied into fixed is removed", [out.fixedCharges, out.demandCharges], ["", 31500]);
}

// Neither is printed — stays blank, never invents a number.
{
  const out = sanitizeCommercialData({ ...baseRaw, demandCharges: 0, fixedCharges: 0 });
  check("both absent stays blank", out.fixedCharges, "");
}
