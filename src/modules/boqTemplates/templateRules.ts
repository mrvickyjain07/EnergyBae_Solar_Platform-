// src/modules/boqTemplates/templateRules.ts
// Pure rules for BOQ templates (Phase 5C): the versioned template DOCUMENT
// stored in boq_template_versions.definition, its validator, the seeded
// "current calculator" document, and capacity-range validation. Shared by the
// API (trust boundary) and the UI (same messages). No fs / React / DB.
//
// A template document separates three things:
//   engine     — HOW quantities are calculated. Only "legacy-v1" exists today
//                (src/modules/boqEngine/legacyV1.ts = calcBOQ, parity-tested).
//                "rules" (a 5A rule-engine definition) is accepted for the
//                future template engine but nothing authors it yet.
//   defaults   — configurable engineering defaults (cable spares, structure,
//                earthing type, ACDB rule). null = "not set / engine decides".
//   commercial — commercial settings. Rates that exist as company defaults
//                (Price DB charges) are null = INHERIT the company default;
//                a number overrides it for this template version.
// Nothing here is read by the live BOQ calculator yet; template-driven
// generation is Phase 5E.

import { validateDefinition, type TemplateDefinition } from "../boqEngine/ruleEngine";

export const TEMPLATE_SCHEMA = 1 as const;
export const BUILTIN_ENGINES = { "legacy-v1": "Current BOQ calculator (legacy-v1)" } as const;
export type BuiltinEngineId = keyof typeof BUILTIN_ENGINES;
export type EngineRef = { kind: "builtin"; id: BuiltinEngineId } | { kind: "rules"; definition: TemplateDefinition };

export const EARTHING_TYPES = ["ESE", "Conventional", "NA"] as const;
export type EarthingType = (typeof EARTHING_TYPES)[number];
export const ACDB_RULES = [
  { value: "per_inverter", label: "One per inverter" },
  { value: "one_per_system", label: "One per system" },
] as const;
export type AcdbRule = (typeof ACDB_RULES)[number]["value"];
export const QUOTE_SEQUENCES = [
  { value: "approved-v1", label: "Rounded quote rate × kW, then GST (approved)" },
  { value: "legacy-v1", label: "GST on the unrounded total (current calculator)" },
] as const;
export type QuoteSequence = (typeof QUOTE_SEQUENCES)[number]["value"];

/** Defined in the product spec but NOT in any source workbook — no rule may use them until the business defines them. */
export const CLARIFICATION_REQUIRED = ["F", "B", "SH", "Prestructure"] as const;
/** Meanings confirmed 2026-10-12. Their formulas are still unconfirmed (register D1). */
export const CLARIFICATION_MEANINGS: Partial<Record<(typeof CLARIFICATION_REQUIRED)[number], string>> = { F: "Front", B: "Back", SH: "Shed Height" };

type N = number | null;
export interface CableDefaults {
  dcSpareM: N; acSpareM: N; earthStructureSpareM: N; earthInverterSpareM: N; laSpareM: N;
  acInverterToAcdbPerInverterM: N;
}
export interface StructureDefaults {
  uClamps: N; zClamps: N; walkwayM: N; ladderBracingM: N; laQty: N; purlinExtraM: N;
  supportLengthM: N; rafterLengthM: N; frontLegHeightFt: N; backLegHeightFt: N; rafterCount: N; legCount: N;
}
export interface CommercialSettings {
  /** null = inherit the company default (Price DB charges). */
  installationPerKw: N; liaisoningPerKw: N; transportPct: N; profitPct: N; gstPct: N;
  /** insurance = subTotal × coverMultiplier ÷ 1000 × factorA × factorB + fixedAmount (workbook form). */
  insurance: { coverMultiplier: number; factorA: number; factorB: number; fixedAmount: number };
  quoteAdjustmentPerW: number;
  quoteSequence: QuoteSequence;
}
export interface TemplateDocument {
  schema: typeof TEMPLATE_SCHEMA;
  engine: EngineRef;
  defaults: { cable: CableDefaults; structure: StructureDefaults; earthing: { type: EarthingType }; acdb: { rule: AcdbRule } };
  commercial: CommercialSettings;
  notes: string;
}

/** Field metadata — one place for labels, units and bounds (API validation + UI forms). */
export const CABLE_FIELDS: { key: keyof CableDefaults; label: string; unit: string; max: number }[] = [
  { key: "dcSpareM", label: "DC cable spare", unit: "m", max: 1000 },
  { key: "acSpareM", label: "AC cable spare", unit: "m", max: 1000 },
  { key: "earthStructureSpareM", label: "Structure earthing spare", unit: "m", max: 1000 },
  { key: "earthInverterSpareM", label: "Inverter earthing spare", unit: "m", max: 1000 },
  { key: "laSpareM", label: "LA earthing spare", unit: "m", max: 1000 },
  { key: "acInverterToAcdbPerInverterM", label: "Inverter → ACDB cable per inverter", unit: "m", max: 1000 },
];
export const STRUCTURE_FIELDS: { key: keyof StructureDefaults; label: string; unit: string; max: number }[] = [
  { key: "uClamps", label: "U-clamps", unit: "nos", max: 100000 },
  { key: "zClamps", label: "Z-clamps", unit: "nos", max: 100000 },
  { key: "walkwayM", label: "Walkway", unit: "m", max: 10000 },
  { key: "ladderBracingM", label: "Ladder & cross bracing", unit: "m", max: 10000 },
  { key: "laQty", label: "Lightning arrester", unit: "nos", max: 100 },
  { key: "purlinExtraM", label: "Purlin extra", unit: "m", max: 10000 },
  { key: "supportLengthM", label: "Support length per leg", unit: "m", max: 100 },
  { key: "rafterLengthM", label: "Rafter length", unit: "m", max: 100 },
  { key: "frontLegHeightFt", label: "Front leg height", unit: "ft", max: 100 },
  { key: "backLegHeightFt", label: "Back leg height", unit: "ft", max: 100 },
  { key: "rafterCount", label: "Rafter count", unit: "nos", max: 10000 },
  { key: "legCount", label: "Leg count", unit: "nos", max: 10000 },
];
export const COMMERCIAL_RATE_FIELDS: { key: "installationPerKw" | "liaisoningPerKw" | "transportPct" | "profitPct" | "gstPct"; label: string; unit: string; max: number; companyKey: "installation" | "liaisoning" | "transport" | "profit" | "gst" }[] = [
  { key: "installationPerKw", label: "Installation", unit: "₹/kW", max: 1_000_000, companyKey: "installation" },
  { key: "liaisoningPerKw", label: "Liaisoning", unit: "₹/kW", max: 1_000_000, companyKey: "liaisoning" },
  { key: "transportPct", label: "Transport", unit: "% of material", max: 100, companyKey: "transport" },
  { key: "profitPct", label: "Profit", unit: "%", max: 99, companyKey: "profit" },
  { key: "gstPct", label: "GST", unit: "%", max: 100, companyKey: "gst" },
];

const nulls = <K extends string>(keys: readonly { key: K }[]) => Object.fromEntries(keys.map((f) => [f.key, null])) as Record<K, null>;

/**
 * The seeded "Standard (current calculator)" document. It records what
 * legacy-v1 actually does (fixed spares +15 / +40 m, 5 m inverter→ACDB per
 * inverter, walkway 5 m, bracing 18 m, one LA, one ACDB per system, ESE when
 * blank, insurance ×1.2÷1000×3×5, first quote +₹2/W, GST on the unrounded
 * total) and inherits the company's Price DB rates. It deliberately does NOT
 * adopt any workbook variant or the approved template-v1 corrections — those
 * belong to a new engine version.
 * KEEP IN SYNC with seed_boq_templates() in 0019_boq_templates.sql
 * (boqTemplates.integration.test.ts compares the two).
 */
export const LEGACY_SEED_DOCUMENT: TemplateDocument = {
  schema: TEMPLATE_SCHEMA,
  engine: { kind: "builtin", id: "legacy-v1" },
  defaults: {
    cable: { dcSpareM: 15, acSpareM: 40, earthStructureSpareM: 40, earthInverterSpareM: 40, laSpareM: 40, acInverterToAcdbPerInverterM: 5 },
    structure: { ...nulls(STRUCTURE_FIELDS), walkwayM: 5, ladderBracingM: 18, laQty: 1 },
    earthing: { type: "ESE" },
    acdb: { rule: "one_per_system" },
  },
  commercial: {
    installationPerKw: null, liaisoningPerKw: null, transportPct: null, profitPct: null, gstPct: null,
    insurance: { coverMultiplier: 1.2, factorA: 3, factorB: 5, fixedAmount: 0 },
    quoteAdjustmentPerW: 2,
    quoteSequence: "legacy-v1",
  },
  notes: "",
};

type Result<T> = { ok: true; value: T } | { ok: false; error: string };
const fail = (error: string): Result<never> => ({ ok: false, error });
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

function numField(raw: unknown, label: string, min: number, max: number, nullable: boolean): Result<number | null> {
  if (raw === null || raw === undefined || raw === "") return nullable ? { ok: true, value: null } : fail(`${label} is required.`);
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return fail(`${label} must be a number.`);
  if (n < min || n > max) return fail(`${label} must be between ${min} and ${max}.`);
  return { ok: true, value: n };
}

/** Validates a document from the client. Unknown keys are dropped; every field is checked. */
export function validateTemplateDocument(raw: unknown): Result<TemplateDocument> {
  if (!isObj(raw)) return fail("Template definition is missing.");
  if (JSON.stringify(raw).length > 200_000) return fail("Template definition is too large.");
  if (raw.schema !== TEMPLATE_SCHEMA) return fail("Unsupported template definition version.");

  let engine: EngineRef;
  const e = raw.engine;
  if (isObj(e) && e.kind === "builtin" && typeof e.id === "string" && e.id in BUILTIN_ENGINES) engine = { kind: "builtin", id: e.id as BuiltinEngineId };
  else if (isObj(e) && e.kind === "rules" && isObj(e.definition)) {
    const errors = validateDefinition(e.definition as unknown as TemplateDefinition);
    if (errors.length) return fail(`Calculation rules are invalid: ${errors[0]}`);
    engine = { kind: "rules", definition: e.definition as unknown as TemplateDefinition };
  } else return fail("Unknown calculation engine.");

  const d = isObj(raw.defaults) ? raw.defaults : {};
  const cableIn = isObj(d.cable) ? d.cable : {};
  const structIn = isObj(d.structure) ? d.structure : {};
  const cable = {} as CableDefaults;
  for (const f of CABLE_FIELDS) {
    const r = numField(cableIn[f.key], f.label, 0, f.max, true);
    if ("error" in r) return fail(r.error);
    cable[f.key] = r.value;
  }
  const structure = {} as StructureDefaults;
  for (const f of STRUCTURE_FIELDS) {
    const r = numField(structIn[f.key], f.label, 0, f.max, true);
    if ("error" in r) return fail(r.error);
    structure[f.key] = r.value;
  }
  const earthingType = isObj(d.earthing) ? d.earthing.type : undefined;
  if (!EARTHING_TYPES.includes(earthingType as EarthingType)) return fail("Earthing type must be ESE, Conventional or NA.");
  const acdbRule = isObj(d.acdb) ? d.acdb.rule : undefined;
  if (!ACDB_RULES.some((r) => r.value === acdbRule)) return fail("Unknown ACDB rule.");

  const c = isObj(raw.commercial) ? raw.commercial : {};
  const commercial = {} as CommercialSettings;
  for (const f of COMMERCIAL_RATE_FIELDS) {
    const r = numField(c[f.key], f.label, 0, f.max, true);
    if ("error" in r) return fail(r.error);
    commercial[f.key] = r.value;
  }
  const ins = isObj(c.insurance) ? c.insurance : {};
  const insurance = {} as CommercialSettings["insurance"];
  for (const [k, label, max] of [["coverMultiplier", "Insurance cover multiplier", 10], ["factorA", "Insurance factor A", 100], ["factorB", "Insurance factor B", 100], ["fixedAmount", "Insurance fixed amount", 100_000_000]] as const) {
    const r = numField(ins[k], label, 0, max, false);
    if ("error" in r) return fail(r.error);
    insurance[k] = r.value as number;
  }
  commercial.insurance = insurance;
  const adj = numField(c.quoteAdjustmentPerW, "Quote adjustment", -1000, 1000, false);
  if ("error" in adj) return fail(adj.error);
  commercial.quoteAdjustmentPerW = adj.value as number;
  if (!QUOTE_SEQUENCES.some((s) => s.value === c.quoteSequence)) return fail("Unknown quote sequence.");
  commercial.quoteSequence = c.quoteSequence as QuoteSequence;

  const notes = typeof raw.notes === "string" ? raw.notes.slice(0, 5000) : "";
  return { ok: true, value: { schema: TEMPLATE_SCHEMA, engine, defaults: { cable, structure, earthing: { type: earthingType as EarthingType }, acdb: { rule: acdbRule as AcdbRule } }, commercial, notes } };
}

// ── Capacity ranges ─────────────────────────────────────────────────────────
// A range holds capacities in (min_kw, max_kw]; max_kw null = open-ended.
// Matched on SYSTEM (required) capacity — never on actual DC kWp.

export interface RangeInput { id?: string; label: string; min_kw: number; max_kw: number | null; sort_order: number }

export const DEFAULT_RANGES: Omit<RangeInput, "id">[] = [
  { label: "1–6 kW", min_kw: 0, max_kw: 6, sort_order: 1 },
  { label: "7–20 kW", min_kw: 6, max_kw: 20, sort_order: 2 },
  { label: "21–50 kW", min_kw: 20, max_kw: 50, sort_order: 3 },
  { label: "51–100 kW", min_kw: 50, max_kw: 100, sort_order: 4 },
  { label: "100+ kW", min_kw: 100, max_kw: null, sort_order: 5 },
];

export function rangeContains(r: Pick<RangeInput, "min_kw" | "max_kw">, systemKw: number): boolean {
  return systemKw > r.min_kw && (r.max_kw === null || systemKw <= r.max_kw);
}

/**
 * The whole set must cover every capacity above 0 exactly once: starts at 0,
 * contiguous (each min = previous max), ascending, only the last open-ended.
 * Returns ranges sorted, labels trimmed, sort_order renumbered 1..n.
 */
export function validateRanges(raw: unknown): Result<RangeInput[]> {
  if (!Array.isArray(raw) || raw.length === 0) return fail("Add at least one capacity range.");
  if (raw.length > 20) return fail("At most 20 capacity ranges.");
  const list: RangeInput[] = [];
  for (const [i, r] of raw.entries()) {
    if (!isObj(r)) return fail(`Range ${i + 1} is invalid.`);
    const label = typeof r.label === "string" ? r.label.trim().slice(0, 40) : "";
    if (!label) return fail(`Range ${i + 1} needs a name.`);
    const min = numField(r.min_kw, `"${label}" lower bound`, 0, 100000, false);
    if ("error" in min) return fail(min.error);
    const max = numField(r.max_kw, `"${label}" upper bound`, 0, 100000, true);
    if ("error" in max) return fail(max.error);
    if (max.value !== null && max.value <= (min.value as number)) return fail(`"${label}": upper bound must be above the lower bound.`);
    list.push({ ...(typeof r.id === "string" && r.id ? { id: r.id } : {}), label, min_kw: min.value as number, max_kw: max.value, sort_order: 0 });
  }
  list.sort((a, b) => a.min_kw - b.min_kw);
  if (list[0].min_kw !== 0) return fail("The first range must start at 0 kW so every system capacity has a range.");
  for (let i = 0; i < list.length; i++) {
    const r = list[i];
    const last = i === list.length - 1;
    if (r.max_kw === null && !last) return fail(`"${r.label}" is open-ended, so it must be the last range.`);
    if (last && r.max_kw !== null) return fail(`The last range ("${r.label}") must be open-ended so large systems still have a range.`);
    if (!last && list[i + 1].min_kw !== r.max_kw) return fail(`Ranges must be contiguous: "${r.label}" ends at ${r.max_kw} kW but the next range starts at ${list[i + 1].min_kw} kW.`);
    r.sort_order = i + 1;
  }
  if (new Set(list.map((r) => r.label.toLowerCase())).size !== list.length) return fail("Range names must be unique.");
  return { ok: true, value: list };
}

/** "> 6 – ≤ 20 kW" — the exact rule, shown next to the friendly label. */
export const rangeRule = (r: Pick<RangeInput, "min_kw" | "max_kw">) =>
  r.max_kw === null ? `> ${r.min_kw} kW` : r.min_kw === 0 ? `≤ ${r.max_kw} kW` : `> ${r.min_kw} – ≤ ${r.max_kw} kW`;

// ── Template metadata ───────────────────────────────────────────────────────

export const SYSTEM_TYPES = ["On-Grid", "Off-Grid", "Hybrid"] as const;
export const PANEL_TYPES = ["DCR", "NDCR"] as const;

export interface TemplateMetaInput { name: string; system_type: string | null; structure_type: string | null; panel_type: string | null }

export function validateTemplateMeta(raw: any, partial = false): Result<Partial<TemplateMetaInput>> {
  const out: Partial<TemplateMetaInput> = {};
  if (raw?.name !== undefined || !partial) {
    const name = typeof raw?.name === "string" ? raw.name.trim().slice(0, 80) : "";
    if (!name) return fail("Template name is required.");
    out.name = name;
  }
  const pickNullable = (k: "system_type" | "structure_type" | "panel_type", allowed: readonly string[] | null) => {
    if (raw?.[k] === undefined) return null;
    const v = raw[k] === "" || raw[k] === null ? null : typeof raw[k] === "string" ? raw[k].trim().slice(0, 60) : undefined;
    if (v === undefined || (v !== null && allowed && !allowed.includes(v))) return `Unknown ${k.replace("_", " ")}.`;
    out[k] = v;
    return null;
  };
  const err = pickNullable("system_type", SYSTEM_TYPES) ?? pickNullable("structure_type", null) ?? pickNullable("panel_type", PANEL_TYPES);
  if (err) return fail(err);
  return { ok: true, value: out };
}

// ── Template match (display only — quotes still run calcBOQ until 5D/5E) ────

type Variants = { system_type: string | null; structure_type: string | null; panel_type: string | null };
const VARIANT_KEYS = ["system_type", "structure_type", "panel_type"] as const;
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Which template a system would use: the range holding its capacity, then
 * among live templates there, a template whose set variants all equal the
 * system's (null = any). Most specific wins; ties go to the range default.
 */
export function matchTemplate<R extends Pick<RangeInput, "min_kw" | "max_kw"> & { id: string }, T extends Variants & { capacity_range_id: string; is_default: boolean; archived_at: string | null }>(
  ranges: R[], templates: T[], system: { kw: number; system_type: string; structure_type: string; panel_type: string },
): { range: R | null; template: T | null } {
  const range = ranges.find((r) => rangeContains(r, system.kw)) ?? null;
  if (!range) return { range, template: null };
  let best: T | null = null;
  let bestScore = -1;
  for (const t of templates) {
    if (t.capacity_range_id !== range.id || t.archived_at) continue;
    const set = VARIANT_KEYS.filter((k) => t[k] !== null);
    if (!set.every((k) => system[k] && same(t[k] as string, system[k]))) continue;
    const score = set.length * 2 + (t.is_default ? 1 : 0);
    if (score > bestScore) { best = t; bestScore = score; }
  }
  return { range, template: best };
}
