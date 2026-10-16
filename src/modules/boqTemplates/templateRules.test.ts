// src/modules/boqTemplates/templateRules.test.ts
// Run with: npx tsx src/modules/boqTemplates/templateRules.test.ts
import assert from "node:assert/strict";
import {
  DEFAULT_RANGES, LEGACY_SEED_DOCUMENT, matchTemplate, rangeContains, rangeRule, validateRanges, validateTemplateDocument, validateTemplateMeta,
  STRUCTURE_FIELDS, CABLE_FIELDS, CLARIFICATION_REQUIRED, type TemplateDocument,
} from "./templateRules";
import { LEGACY_V1 } from "../boqEngine/legacyV1";

let passed = 0;
function check(label: string, actual: unknown, expected: unknown) {
  assert.deepStrictEqual(actual, expected, `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  passed++;
  console.log(`  ok — ${label}`);
}
const err = (r: { ok: boolean; error?: string }) => (r.ok ? null : r.error);
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

// ── Capacity boundaries (approved: system capacity, (min, max]) ──
const which = (kw: number) => DEFAULT_RANGES.find((r) => rangeContains(r, kw))?.label ?? null;
check("1 kW → 1–6", which(1), "1–6 kW");
check("6 kW → 1–6 (≤ 6)", which(6), "1–6 kW");
check("6.01 kW → 7–20 (> 6)", which(6.01), "7–20 kW");
check("6.5 kW → 7–20", which(6.5), "7–20 kW");
check("20 kW → 7–20", which(20), "7–20 kW");
check("20.1 kW → 21–50", which(20.1), "21–50 kW");
check("50 kW → 21–50", which(50), "21–50 kW");
check("100 kW → 51–100", which(100), "51–100 kW");
check("100.5 kW → 100+", which(100.5), "100+ kW");
check("0 kW → no range", which(0), null);
check("every capacity in exactly one default range", [0.1, 3, 6, 7, 19.9, 20, 33, 50, 75, 100, 500].map((kw) => DEFAULT_RANGES.filter((r) => rangeContains(r, kw)).length), Array(11).fill(1));
check("the default set itself validates", err(validateRanges(DEFAULT_RANGES)), null);
check("rule text", DEFAULT_RANGES.map(rangeRule), ["≤ 6 kW", "> 6 – ≤ 20 kW", "> 20 – ≤ 50 kW", "> 50 – ≤ 100 kW", "> 100 kW"]);

// ── Range-set validation ──
const R = (label: string, min_kw: number, max_kw: number | null) => ({ label, min_kw, max_kw, sort_order: 0 });
check("empty set rejected", err(validateRanges([])), "Add at least one capacity range.");
check("must start at 0", err(validateRanges([R("a", 1, 6), R("b", 6, null)])), "The first range must start at 0 kW so every system capacity has a range.");
check("gap rejected", err(validateRanges([R("a", 0, 6), R("b", 7, null)])), 'Ranges must be contiguous: "a" ends at 6 kW but the next range starts at 7 kW.');
check("overlap rejected", err(validateRanges([R("a", 0, 10), R("b", 6, null)])), 'Ranges must be contiguous: "a" ends at 10 kW but the next range starts at 6 kW.');
check("last must be open-ended", err(validateRanges([R("a", 0, 6), R("b", 6, 20)])), 'The last range ("b") must be open-ended so large systems still have a range.');
check("open-ended only last", err(validateRanges([R("a", 0, null), R("b", 6, null)])), '"a" is open-ended, so it must be the last range.');
check("max must exceed min", err(validateRanges([R("a", 0, 0)])), '"a": upper bound must be above the lower bound.');
check("duplicate names rejected", err(validateRanges([R("a", 0, 6), R("A", 6, null)])), "Range names must be unique.");
check("blank name rejected", err(validateRanges([R(" ", 0, null)])), "Range 1 needs a name.");
const sorted = validateRanges([R("big", 6, null), { ...R("small", 0, 6), id: "x" } as any]);
check("sorted ascending, renumbered, id kept", sorted.ok && sorted.value.map((r) => [r.label, r.sort_order, r.id ?? null]), [["small", 1, "x"], ["big", 2, null]]);
check("custom boundaries allowed (data-driven)", err(validateRanges([R("Home", 0, 10), R("Business", 10, null)])), null);

// ── Template document ──
check("seed document is valid and unchanged by validation", validateTemplateDocument(LEGACY_SEED_DOCUMENT), { ok: true, value: LEGACY_SEED_DOCUMENT });
check("seed references the built-in legacy-v1 engine", LEGACY_SEED_DOCUMENT.engine, { kind: "builtin", id: "legacy-v1" });
check("seed inherits every company rate (null)", Object.values(LEGACY_SEED_DOCUMENT.commercial).filter((v) => v === null).length, 5);
check("seed records legacy-v1's fixed spares (15 DC, 40 others)", [LEGACY_SEED_DOCUMENT.defaults.cable.dcSpareM, LEGACY_SEED_DOCUMENT.defaults.cable.acSpareM], [15, 40]);
check("seed records legacy-v1's quote sequence", LEGACY_SEED_DOCUMENT.commercial.quoteSequence, "legacy-v1");
check("seed has no structure formula values it can't support", STRUCTURE_FIELDS.filter((f) => LEGACY_SEED_DOCUMENT.defaults.structure[f.key] !== null).map((f) => f.key), ["walkwayM", "ladderBracingM", "laQty"]);
// The seed's fixed values are exactly what legacy-v1 hard-codes (cross-check with the 5A definition data).
const q = (k: string) => JSON.stringify(LEGACY_V1.quantities.find((x) => x.key === k)?.expr);
const item = (sr: number) => JSON.stringify(LEGACY_V1.items.find((x) => x.sr === sr)?.qty);
check("legacy-v1 DC spare defaults to 15 (blank input)", q("dcSpare"), JSON.stringify({ calc: "inputOr", args: [{ input: "dcSpareM" }, { lit: 15 }] }));
check("legacy-v1 AC spare defaults to 40 (blank input)", q("acSpare"), JSON.stringify({ calc: "inputOr", args: [{ input: "acSpareM" }, { lit: 40 }] }));
check("legacy-v1 really uses 18 m bracing and 5 m walkway", [item(33).includes('{"lit":18}'), item(34).includes('{"lit":5}')], [true, true]);
check("legacy-v1 really uses one ACDB per system", item(6), JSON.stringify({ lit: 1 }));

const bad = (mut: (d: any) => void) => { const d = clone(LEGACY_SEED_DOCUMENT) as any; mut(d); return err(validateTemplateDocument(d)); };
check("unknown schema rejected", bad((d) => (d.schema = 2)), "Unsupported template definition version.");
check("unknown engine rejected", bad((d) => (d.engine = { kind: "builtin", id: "workbook-v9" })), "Unknown calculation engine.");
check("executable-looking engine rejected", bad((d) => (d.engine = { kind: "js", code: "process.exit()" })), "Unknown calculation engine.");
check("rules engine validated by the 5A validator", bad((d) => (d.engine = { kind: "rules", definition: { id: "x", quantities: [{ key: "a", expr: { calc: "eval", args: [] } }], items: [] } })), 'Calculation rules are invalid: quantity a: unknown calc "eval"');
check("a valid rules engine is accepted", bad((d) => (d.engine = { kind: "rules", definition: LEGACY_V1 })), null);
check("negative spare rejected", bad((d) => (d.defaults.cable.dcSpareM = -1)), "DC cable spare must be between 0 and 1000.");
check("non-numeric rejected", bad((d) => (d.defaults.structure.uClamps = "lots")), "U-clamps must be a number.");
check("bad earthing type rejected", bad((d) => (d.defaults.earthing.type = "Copper")), "Earthing type must be ESE, Conventional or NA.");
check("bad ACDB rule rejected", bad((d) => (d.defaults.acdb.rule = "two")), "Unknown ACDB rule.");
check("profit ≥ 100% rejected", bad((d) => (d.commercial.profitPct = 100)), "Profit must be between 0 and 99.");
check("GST over 100% rejected", bad((d) => (d.commercial.gstPct = 101)), "GST must be between 0 and 100.");
check("insurance factor required", bad((d) => (d.commercial.insurance.factorA = null)), "Insurance factor A is required.");
check("bad quote sequence rejected", bad((d) => (d.commercial.quoteSequence = "whatever")), "Unknown quote sequence.");
const edited = clone(LEGACY_SEED_DOCUMENT) as any;
Object.assign(edited.commercial, { installationPerKw: "4000", gstPct: 8.9, quoteSequence: "approved-v1" });
edited.defaults.structure.uClamps = 24;
edited.defaults.acdb.rule = "per_inverter";
edited.extra = "dropped";
const ev = validateTemplateDocument(edited) as { ok: true; value: TemplateDocument };
check("numeric strings coerced, overrides kept", [ev.value.commercial.installationPerKw, ev.value.commercial.gstPct, ev.value.defaults.structure.uClamps], [4000, 8.9, 24]);
check("approved quote sequence and per-inverter ACDB storable", [ev.value.commercial.quoteSequence, ev.value.defaults.acdb.rule], ["approved-v1", "per_inverter"]);
check("unknown keys dropped", "extra" in ev.value, false);
check("blank number → null (inherit / not set)", (validateTemplateDocument({ ...clone(LEGACY_SEED_DOCUMENT), commercial: { ...LEGACY_SEED_DOCUMENT.commercial, transportPct: "" } }) as any).value.commercial.transportPct, null);
check("all field lists have unique keys", [new Set(CABLE_FIELDS.map((f) => f.key)).size, new Set(STRUCTURE_FIELDS.map((f) => f.key)).size], [CABLE_FIELDS.length, STRUCTURE_FIELDS.length]);
check("F/B/SH/Prestructure are flagged, never fields", [...CLARIFICATION_REQUIRED].filter((k) => [...CABLE_FIELDS, ...STRUCTURE_FIELDS].some((f) => (f.key as string) === k)), []);

// ── Template metadata ──
check("name required", err(validateTemplateMeta({ name: " " })), "Template name is required.");
check("unknown system type rejected", err(validateTemplateMeta({ name: "x", system_type: "Solar+" })), "Unknown system type.");
check("unknown panel type rejected", err(validateTemplateMeta({ name: "x", panel_type: "Mono" })), "Unknown panel type.");
check("blank variants → null (any)", (validateTemplateMeta({ name: "x", system_type: "", panel_type: "" }) as any).value, { name: "x", system_type: null, panel_type: null });
check("partial update without name", err(validateTemplateMeta({ panel_type: "DCR" }, true)), null);

// ── Template match ──
const ranges = DEFAULT_RANGES.map((r, i) => ({ ...r, id: `r${i}` }));
const T = (id: string, range: string, v: Partial<{ system_type: string; structure_type: string; panel_type: string }>, is_default = false, archived = false) =>
  ({ id, capacity_range_id: range, system_type: null, structure_type: null, panel_type: null, ...v, is_default, archived_at: archived ? "2026-10-01" : null });
const tpls = [T("std", "r2", {}, true), T("ndcr", "r2", { panel_type: "NDCR" }), T("ndcr-ong", "r2", { panel_type: "NDCR", system_type: "On-Grid" }), T("dead", "r2", { panel_type: "DCR", system_type: "On-Grid", structure_type: "Elevated" }, false, true), T("small", "r0", {}, true)];
const sys = (kw: number, panel_type = "NDCR", system_type = "On-Grid", structure_type = "") => ({ kw, panel_type, system_type, structure_type });
const m = (s: ReturnType<typeof sys>) => { const r = matchTemplate(ranges, tpls, s); return [r.range?.id ?? null, r.template?.id ?? null]; };
check("most specific variant wins", m(sys(25.2)), ["r2", "ndcr-ong"]);
check("partial variant beats default", m(sys(25.2, "NDCR", "Hybrid")), ["r2", "ndcr"]);
check("no variant match → range default", m(sys(25.2, "DCR")), ["r2", "std"]);
check("archived templates ignored", m(sys(25.2, "DCR", "On-Grid", "elevated")), ["r2", "std"]);
check("variant compare ignores case/space", m(sys(25.2, " ndcr ", "on-grid")), ["r2", "ndcr-ong"]);
check("range with no templates → none", m(sys(75)), ["r3", null]);
check("0 kW → no range", m(sys(0)), [null, null]);
check("blank system variant never matches a set one", m(sys(25.2, "", "")), ["r2", "std"]);

console.log(`\n${passed} passed`);
