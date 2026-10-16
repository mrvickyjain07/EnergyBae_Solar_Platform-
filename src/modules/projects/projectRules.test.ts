// src/modules/projects/projectRules.test.ts
// Run with: npx tsx src/modules/projects/projectRules.test.ts
import assert from "node:assert/strict";
import { validateCustomer, validateProject, validateSystem, projectTotals, systemToProposalInputs, isUnlocked, stageUnlocks, unlockStageLabel } from "./projectRules";

let passed = 0;
function check(label: string, actual: unknown, expected: unknown) {
  assert.deepEqual(actual, expected, `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  passed++;
  console.log(`  ok — ${label}`);
}
const err = (r: { ok: boolean; error?: string }) => (r.ok ? null : r.error);

// customers
check("customer needs a name", err(validateCustomer({ name: "  " })), "Customer name is required.");
check("customer defaults to individual house", validateCustomer({ name: "Asha" }).ok && (validateCustomer({ name: "Asha" }) as any).value.customer_type, "INDIVIDUAL_HOUSE");
check("unknown customer type rejected", err(validateCustomer({ name: "A", customer_type: "PALACE" })), "Unknown customer type.");
check("bad email rejected", err(validateCustomer({ name: "A", email: "not-an-email" })), "That email address doesn't look right.");
check("email lowercased", (validateCustomer({ name: "A", email: "Asha@Mail.IN" }) as any).value.email, "asha@mail.in");
check("gstin uppercased and checked", (validateCustomer({ name: "A", gstin: "27aapfu0939f1zv" }) as any).value.gstin, "27AAPFU0939F1ZV");
check("short gstin rejected", err(validateCustomer({ name: "A", gstin: "123" })), "GSTIN must be 15 letters/digits.");
check("blank optional field becomes null", (validateCustomer({ name: "A", phone: "  " }) as any).value.phone, null);
check("partial update without name is fine", validateCustomer({ phone: "98" }, true).ok, true);
check("partial update can't blank the name", err(validateCustomer({ name: "" }, true)), "Customer name is required.");

// projects
check("project needs a customer", err(validateProject({ name: "Roof" })), "Pick a customer.");
check("project defaults to lead", (validateProject({ name: "Roof", customer_id: "c1" }) as any).value.status, "lead");
check("unknown status rejected", err(validateProject({ status: "maybe" }, true)), "Unknown project status.");

// systems
check("system needs a name", err(validateSystem({ capacity_kw: 5 })), 'Give the system a name, e.g. "Main rooftop".');
check("capacity must be positive", err(validateSystem({ name: "S", capacity_kw: 0 })), "Capacity must be between 0 and 100,000 kW.");
check("capacity from string", (validateSystem({ name: "S", capacity_kw: "4.8" }) as any).value.capacity_kw, 4.8);
check("capacity can be left blank", (validateSystem({ name: "S", capacity_kw: "" }) as any).value.capacity_kw, null);
check("non-numeric capacity rejected", err(validateSystem({ name: "S", capacity_kw: "five" })), "Capacity must be a number.");
check("phase 2 rejected", err(validateSystem({ name: "S", phase: 2 })), "Phase must be 1 or 3.");
check("phase from string", (validateSystem({ name: "S", phase: "3" }) as any).value.phase, 3);
check("panel wattage sanity", err(validateSystem({ name: "S", panel_wp: 5 })), "Panel wattage should be between 50 and 1000 Wp.");
check("system type defaults to on-grid", (validateSystem({ name: "S" }) as any).value.system_type, "On-Grid");

// totals — the ABC Industries example: 50 kW factory + 20 kW warehouse
check("project total across systems", projectTotals([{ capacity_kw: 50 }, { capacity_kw: 20 }]), { systemCount: 2, totalKw: 70, unsized: 0 });
check("unsized systems counted separately", projectTotals([{ capacity_kw: 4.8 }, { capacity_kw: null }]), { systemCount: 2, totalKw: 4.8, unsized: 1 });
check("no float drift in totals", projectTotals([{ capacity_kw: 0.1 }, { capacity_kw: 0.2 }]).totalKw, 0.3);

// prefill
const customer = { name: "ABC Industries", phone: "9800000000", address: "HQ, Pune", customer_type: "INDUSTRIAL" as const };
const sys = { capacity_kw: 50, system_type: "On-Grid" as const, phase: 3 as const, structure_type: "Elevated", panel_brand: "Waaree", panel_wp: 545, inverter_brand: "Solis", site_address: "Plot 7, Chakan" };
check("prefill maps system decisions into the calculator", systemToProposalInputs(customer, sys), {
  customerName: "ABC Industries", systemType: "On-Grid", financeCustomerType: "INDUSTRIAL", contactNumber: "9800000000",
  customerAddress: "Plot 7, Chakan", capacity: 50, phase: "3-Phase", structureType: "Elevated", panelBrand: "Waaree", panelWp: 545, inverterBrand: "Solis",
});
check("site address falls back to project, then customer", systemToProposalInputs(customer, { ...sys, site_address: null }, null).customerAddress, "HQ, Pune");
check("blank system fields aren't sent (calculator keeps its defaults)", Object.keys(systemToProposalInputs({ ...customer, phone: null }, { capacity_kw: null, system_type: "Hybrid", phase: null, structure_type: null, panel_brand: null, panel_wp: null, inverter_brand: null, site_address: null })).sort(), ["customerAddress", "customerName", "financeCustomerType", "systemType"]);

// stage gates
check("enquiry unlocks only bill analysis", stageUnlocks("lead").map((a) => a.action), ["bill"]);
check("site visit unlocks BOQ", isUnlocked("site_visit", "boq"), true);
check("site visit does not unlock proposal", isUnlocked("site_visit", "proposal"), false);
check("later stages keep earlier unlocks", stageUnlocks("installation").map((a) => a.action), ["bill", "boq", "proposal"]);
check("lost locks everything", stageUnlocks("lost"), []);
check("unlock hint names the stage", unlockStageLabel("boq"), "Site Visit");
check("site_visit is a valid status", (validateProject({ status: "site_visit" }, true) as any).value.status, "site_visit");
check("old active status rejected", err(validateProject({ status: "active" }, true)), "Unknown project status.");

console.log(`\n${passed} passed`);
