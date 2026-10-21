// src/modules/commercial/chargeMapping.ts
// Printed bill lines → canonical charge fields, in code, not in the AI prompt.
//
// Why: asked to sort amounts into 11 named fields, the model shifted a whole
// column on a photographed bill (TOD's ₹71.99 landed in FAC, ED's ₹591.49 in
// both ED and ToSE, ToSE in "other"). Copying "label + amount on the same
// printed row" is a simpler task for it, and the label → category decision
// becomes a deterministic, testable alias table here. Each line keeps its
// printed label and signed amount (the evidence); unknown labels are left
// "unmapped" and flagged, never forced into a category.
//
// Aliases are utility-neutral where possible; utility-specific names (MSEDCL
// "TOD Tariff EC", "BILL AS PER MERC") are listed as such. Add new utilities
// here — calculations never see labels.
import type { CommercialBillData, CommercialTodSlotReading, TodSlotId } from "./types";

export const CHARGE_CATEGORIES = [
  "energy", "tod", "demand", "fixed", "fac", "ed", "tose", "wheeling", "other",
  "arrears", "interest", "credit",
  "currentTotal", "billAmount", "afterDue",
  "lateFeeIfLate", "conditional", "subtotal", "unmapped",
] as const;
export type ChargeCategory = (typeof CHARGE_CATEGORIES)[number];

export interface ChargeLine {
  label: string; // as printed
  amount: number; // as printed, signed
  category: ChargeCategory;
}

/** First match wins, so the more specific patterns come first. */
const ALIASES: [ChargeCategory, RegExp][] = [
  ["afterDue", /payable\s+after|if\s+paid\s+after|after\s+due\s+date|या\s*तारखे\s*नंतर/i],
  ["conditional", /if\s+paid\s+(up\s*to|upto|on\s+or\s+before|by)|prompt\s+(payment|discount)|digital\s+payment\s+discount/i],
  ["currentTotal", /total\s+current\s+bill|current\s+bill\s+total|current\s+month\s+bill/i],
  ["subtotal", /bill\s+as\s+per\s+merc|sub[\s-]*total|\be\.?\s?d\.?\s+on\b|\bduty\s+on\b|amount\s+in\s+words/i], // "E.D. on Rs." is the duty's base, not a charge
  ["billAmount", /total\s+bill\s+amount|net\s+bill\s+amount|bill\s+amount\s*\(?\s*rounded|amount\s+payable(?!\s+after)|net\s+payable|पूर्णांक\s*देयक/i],
  ["lateFeeIfLate", /delayed\s+payment|late\s+payment|\bd\.?\s?p\.?\s?c\b/i],
  ["credit", /s\.?\s?d\.?\s+interest|interest\s+on\s+(security|s\.?\s?d)/i], // security-deposit interest is paid TO the consumer
  ["interest", /interest/i],
  ["arrears", /arrear|previous\s+(outstanding|balance|dues)|outstanding\s+amount|थकबाकी/i],
  ["other", /p\.?\s*f\.?\s*(penal|incentive|penalty)|power\s+factor\s+(penal|incentive)|excess\s+demand|debit\s+(bill\s+)?adj|meter\s+(rent|charge)|other\s+charges?/i],
  ["tod", /\bt\.?o\.?d\b|time\s+of\s+day/i],
  ["credit", /credit|rebate|subsidy|go[\s-]*green|e[\s-]*bill\s+discount|discount/i],
  ["fixed", /fixed\s+charge|स्थिर\s*आकार/i],
  ["demand", /demand\s+charge|kva\s+charge|capacity\s+charge/i],
  ["wheeling", /wheeling/i],
  ["fac", /\bf\.?a\.?c\b|fuel\s+(adj|cost|surcharge)|\bfppc?a\b|\bfppas\b|\bfca\b|इंधन\s*समायोजन/i],
  ["ed", /electricity\s+duty|\be\.?\s?d\.?\b(?!\s*code)|विद्युत\s*शुल्क/i],
  ["tose", /tax\s+on\s+sale|\bto\.?s\.?e\b|sales?\s+tax|वीज\s*विक्री\s*कर/i],
  ["energy", /energy\s+charge|consumption\s+charge|unit\s+charge|ऊर्जा\s*आकार|वीज\s*आकार/i],
];

export function categorize(label: string): ChargeCategory {
  const t = String(label ?? "").trim();
  for (const [cat, re] of ALIASES) if (re.test(t)) return cat;
  return "unmapped";
}

/** Model output → typed lines; drops rows without a label or a number. */
export function toChargeLines(raw: unknown): ChargeLine[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((r: any) => {
    const label = typeof r?.label === "string" ? r.label.trim().slice(0, 120) : "";
    const amount = Number(r?.amount);
    if (!label || !Number.isFinite(amount)) return [];
    return [{ label, amount: Math.round(amount * 100) / 100, category: categorize(label) }];
  });
}

const sumOf = (lines: ChargeLine[], cat: ChargeCategory): number | "" => {
  const hit = lines.filter((l) => l.category === cat);
  return hit.length ? Math.round(hit.reduce((s, l) => s + l.amount, 0) * 100) / 100 : "";
};
/** Positive amount or "" (missing). A printed 0.00 stays a real 0 — "" only when no such line exists. */
const nonNeg = (v: number | ""): number | "" => (v === "" ? "" : Math.max(0, v));
/** Totals are single printed figures: the first line of that kind (the header often repeats them). */
const firstOf = (lines: ChargeLine[], cat: ChargeCategory): number | "" => lines.find((l) => l.category === cat)?.amount ?? "";

export type MappedCharges = Pick<CommercialBillData,
  "energyCharges" | "todCharges" | "demandCharges" | "fixedCharges" | "fac" | "ed" | "tose" | "wheelingCharges" | "otherCharges"
  | "arrears" | "creditAdjustment" | "delayedPayment" | "currentBillTotal" | "billAmount" | "amountAfterDue">;

/**
 * Canonical charge fields from printed lines. Signs: a negative arrears line is
 * a credit; credit lines count as positive credits however they're printed; the
 * "delayed payment charges" figure is the late fee that applies only if paid
 * late, so it is never added to the current bill (delayedPayment stays "").
 */
export function mapChargeLines(lines: ChargeLine[]): MappedCharges {
  const arrearsNet = (Number(sumOf(lines, "arrears")) || 0) + (Number(sumOf(lines, "interest")) || 0);
  const hasArrears = lines.some((l) => l.category === "arrears" || l.category === "interest");
  const creditLines = lines.filter((l) => l.category === "credit");
  const credit = creditLines.reduce((s, l) => s + Math.abs(l.amount), 0) + (arrearsNet < 0 ? -arrearsNet : 0);
  return {
    energyCharges: nonNeg(sumOf(lines, "energy")),
    todCharges: sumOf(lines, "tod"), // signed: a rebate is negative
    demandCharges: nonNeg(sumOf(lines, "demand")),
    fixedCharges: nonNeg(sumOf(lines, "fixed")),
    fac: sumOf(lines, "fac"), // FAC can be a credit in some months
    ed: nonNeg(sumOf(lines, "ed")),
    tose: nonNeg(sumOf(lines, "tose")),
    wheelingCharges: nonNeg(sumOf(lines, "wheeling")),
    otherCharges: sumOf(lines, "other"),
    arrears: hasArrears ? Math.max(0, Math.round(arrearsNet * 100) / 100) : "",
    creditAdjustment: creditLines.length || arrearsNet < 0 ? Math.round(credit * 100) / 100 : "",
    delayedPayment: "",
    currentBillTotal: nonNeg(firstOf(lines, "currentTotal")),
    billAmount: nonNeg(firstOf(lines, "billAmount")),
    amountAfterDue: nonNeg(firstOf(lines, "afterDue")),
  };
}

/** Same non-zero amount on two differently-categorised lines — usually one value read into the wrong row. */
export function duplicateAmounts(lines: ChargeLine[]): string[] {
  const money = lines.filter((l) => !["currentTotal", "billAmount", "afterDue", "subtotal", "conditional"].includes(l.category) && l.amount !== 0);
  const out: string[] = [];
  for (let i = 0; i < money.length; i++) for (let j = i + 1; j < money.length; j++) {
    if (money[i].amount === money[j].amount && money[i].category !== money[j].category) out.push(`"${money[i].label}" and "${money[j].label}" both read as ₹${money[i].amount}`);
  }
  return out;
}

// ───────────────────────── TOD rows ─────────────────────────

export interface TodRow {
  timeRange: string; // as printed
  units: number | ""; // "" = unreadable, 0 = printed zero
  charge: number | ""; // signed
  rate?: number | ""; // ₹ per unit as printed, signed (a rebate band is negative)
  slot: TodSlotId | null; // null = a band the 4-slot schedule doesn't have
}

/** MSEDCL's four bands by start–end hour. Another schedule maps to null (flagged), never forced. */
const BANDS: Record<string, TodSlotId> = { "0-6": "A", "6-9": "B", "9-17": "C", "17-24": "D", "17-0": "D" };

export function slotOf(timeRange: string): TodSlotId | null {
  const m = String(timeRange ?? "").match(/(\d{1,2})\s*[:.]?\s*(\d{2})?\s*(?:hrs?)?\s*(?:-|–|to)\s*(\d{1,2})\s*[:.]?\s*(\d{2})?/i);
  if (!m) return null;
  if ((m[2] && m[2] !== "00") || (m[4] && m[4] !== "00")) return null;
  return BANDS[`${Number(m[1])}-${Number(m[3])}`] ?? null;
}

const cell = (v: unknown): number | "" => {
  if (v === null || v === undefined || v === "") return "";
  const x = Number(v);
  return Number.isFinite(x) ? x : "";
};

export function toTodRows(raw: unknown): TodRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((r: any) => {
    const timeRange = typeof r?.timeRange === "string" ? r.timeRange.trim().slice(0, 40) : "";
    if (!timeRange) return [];
    const units = cell(r?.units);
    return [{ timeRange, units: units === "" ? "" : Math.max(0, units), charge: cell(r?.charge), rate: cell(r?.rate), slot: slotOf(timeRange) }];
  });
}

/** Rows → the four slots by printed time band. A slot with no row stays "" (missing), never 0. */
export function slotsFromTodRows(rows: TodRow[]): CommercialTodSlotReading[] {
  return (["A", "B", "C", "D"] as TodSlotId[]).map((slot) => {
    const hit = rows.filter((r) => r.slot === slot);
    if (!hit.length || hit.some((r) => r.units === "")) return { slot, units: "" };
    return { slot, units: hit.reduce((s, r) => s + (r.units as number), 0) };
  });
}

// ───────────────────────── Fix suggestions ─────────────────────────

export type SuggestField = "fac" | "tose" | "wheelingCharges";
export interface ChargeSuggestion { field: SuggestField; value: number; reason: string }
const FIELD_OF: Partial<Record<ChargeCategory, SuggestField>> = { fac: "fac", tose: "tose", wheeling: "wheelingCharges" };

/**
 * A per-unit charge line prints its own rate ("FAC @ 0.30 Ps/U", "Wheeling Charges @1.60"). When that line
 * was read wrong and rate × billed units closes the gap between the charge lines and the printed Total
 * Current Bill (within ₹1), the corrected value is offered — the user applies it; nothing is filled in.
 * Rates are tried both as ₹/unit and paise/unit, because bills label them inconsistently (MSEDCL's FAC says
 * "Ps/U" but is ₹/unit).
 */
export function chargeSuggestions(lines: ChargeLine[], current: Partial<Record<SuggestField, number | "">>, units: number, gap: number): ChargeSuggestion[] {
  if (!(units > 0) || Math.abs(gap) <= 1) return [];
  const out: ChargeSuggestion[] = [];
  for (const l of lines) {
    const field = FIELD_OF[l.category];
    const m = l.label.match(/@\s*(-?\d+(?:\.\d+)?)/);
    if (!field || !m || /%/.test(l.label)) continue;
    const now = Number(current[field]) || 0;
    for (const perUnit of [Number(m[1]), Number(m[1]) / 100]) {
      const expected = Math.round(perUnit * units * 100) / 100;
      if (Math.abs(expected - now) > 1 && Math.abs(expected - now - gap) <= 1) {
        out.push({ field, value: expected, reason: `${l.label} × ${units} units = ₹${expected} — closes the ₹${Math.round(gap * 100) / 100} gap` });
        break;
      }
    }
  }
  return out;
}

export interface TodSuggestion { slot: TodSlotId; value: number; exact: boolean; reason: string }

/**
 * Fixes for a TOD table that doesn't add up to the bill's total, offered for the user to apply:
 *  1. Exact — a band with a printed rate and charge must have units = charge ÷ rate (MSEDCL C: −446.03 ÷
 *     −1.565 = 285, read as 289). Only offered when the quotient is a whole number (±0.05), i.e. the row
 *     itself proves it.
 *  2. Estimate — after (1), if exactly one slot is still 0 or blank, it's the bill total minus the others
 *     (a 0.0000-rate band read as 0). Labelled an estimate: it's only right if the other slots are.
 * Nothing is offered when the slots already add up.
 */
export function todSuggestions(rows: TodRow[], slots: CommercialTodSlotReading[], totals: { kwh: number; kvah: number }): TodSuggestion[] {
  const now = new Map(slots.map((s) => [s.slot, s.units] as const));
  const sum = (m: Map<TodSlotId, number | "">) => [...m.values()].reduce<number>((s, u) => s + (Number(u) || 0), 0);
  const fits = (x: number) => [totals.kwh, totals.kvah].some((t) => t > 0 && Math.abs(x - t) <= Math.max(2, t * 0.01));
  if (fits(sum(now))) return [];
  const out: TodSuggestion[] = [];
  const work = new Map(now);
  for (const r of rows) {
    if (!r.slot || typeof r.rate !== "number" || r.rate === 0 || typeof r.charge !== "number" || r.charge === 0) continue;
    const q = r.charge / r.rate;
    const units = Math.round(q);
    if (units <= 0 || Math.abs(q - units) > 0.05 || units === Number(now.get(r.slot))) continue;
    out.push({ slot: r.slot, value: units, exact: true, reason: `printed charge ₹${r.charge} ÷ rate ${r.rate} = ${units} units` });
    work.set(r.slot, units);
  }
  const open = [...work.entries()].filter(([, u]) => !(Number(u) > 0));
  const total = totals.kwh > 0 ? totals.kwh : totals.kvah;
  if (open.length === 1 && total > 0 && !fits(sum(work))) {
    const rest = total - sum(work);
    if (rest > 0) out.push({ slot: open[0][0], value: Math.round(rest), exact: false,
      reason: `estimate: bill total ${Math.round(total)} − the other slots — only right if they are; confirm on the bill` });
  }
  return out;
}
