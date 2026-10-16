// src/modules/boqEngine/ruleEngine.ts
// BOQ template rule interpreter (Phase 5A).
//
// A BOQ template is DATA: named quantities, then line items whose qty / unit
// cost / text are expressions over those quantities. Expressions are a small
// typed JSON tree evaluated by this file — there is no eval(), no formula
// strings and no user code. Anything a tree can't express directly goes
// through CALCS, a fixed registry of existing, tested functions (catalogue
// lookups, earthing rule), so templates stored in a database later can only
// ever call code we wrote.
//
// Evaluation reproduces JavaScript semantics exactly (truthiness for `or`,
// IEEE arithmetic, operator order as written) because the first template,
// legacy-v1 (legacyV1.ts), must equal calcBOQ() bit for bit — see
// legacyParity.test.ts. The per-quote behaviour shared by every template
// (overrides, removals, sanitizePrice, custom catalogue items) lives in
// runTemplate(), not in the templates.

import type { BOQItem, BOQOverrides, Catalogue } from "../proposal/types";
import { BOS_ITEM_DEFS } from "../proposal/defaultCatalogue";
import { getACDB, getDCDB, getDCSize, inputOr } from "../proposal/calculations";
import { computeEarthingPits, normalizeEarthingType } from "../proposal/earthingRules";
import { sanitizePrice } from "../proposal/sanitizePrice";
import { structureTypeLabel } from "../proposal/structureTypes";

export type Value = number | string;

export type Expr =
  | { lit: number | string }
  /** Raw input value; `num` = calcBOQ's n() ("" → 0), `int` = Math.trunc(n()). */
  | { input: string; as?: "num" | "int" }
  /** A quantity defined earlier in the template. */
  | { ref: string }
  | { op: "add" | "sub" | "mul" | "div"; args: [Expr, Expr] }
  /** JavaScript `a || b`. */
  | { op: "or"; args: [Expr, Expr] }
  | { op: "ceil" | "trunc" | "round"; arg: Expr }
  | { op: "if"; cond: Cond; then: Expr; else: Expr }
  /** Template-literal concatenation (String() of each part). */
  | { op: "concat"; parts: Expr[] }
  | { calc: CalcId; args: Expr[]; field?: string }
  /** Catalogue BOS unit price, cat.bos[key]. */
  | { bos: string }
  /** Editable BOS display name (Price Database), with the built-in label as fallback. */
  | { bosName: string };

export type Cond =
  | { op: "gt" | "lt" | "eq" | "ne"; args: [Expr, Expr] }
  | { op: "and"; all: Cond[] }
  | { op: "truthy"; arg: Expr };

export interface TemplateItem {
  /** Stable key: override map key (qty = ov[key], cost = ov["c"+key], removed = ov["x"+key]). */
  key: string;
  sr: number;
  group: string;
  name: Expr;
  spec: Expr;
  make: Expr;
  unit: string;
  qty: Expr;
  unitCost: Expr;
}

export interface TemplateDefinition {
  id: string;
  /** Evaluated in order; each may reference only quantities above it. */
  quantities: { key: string; expr: Expr }[];
  items: TemplateItem[];
  /** Append the catalogue's custom BOS items after the template items (current Price DB behaviour). */
  customCatalogueItems?: { startSr: number; spec: string; make: string; defaultGroup: string; defaultName: string; defaultUnit: string };
}

type Ctx = { inputs: Record<string, unknown>; cat: Catalogue; values: Record<string, Value> };

// Same fallback calcBOQ uses for catalogues saved before bosNames existed.
const BOS_LABEL_FALLBACK: Record<string, string> = Object.fromEntries(BOS_ITEM_DEFS.map((d) => [d.key, d.label]));

const n = (v: any) => (v === "" ? 0 : v);

/** The only functions a template can call. Each wraps existing, separately tested code. */
const CALCS = {
  earthingPits: (_c: Ctx, inverters: unknown, type: unknown) => computeEarthingPits(inverters, type),
  earthingType: (_c: Ctx, type: unknown) => normalizeEarthingType(type),
  dcCableSize: (_c: Ctx, current: any) => getDCSize(current),
  acdb: (c: Ctx, cap: any, phase: any) => getACDB(c.cat, cap, phase),
  dcdb: (c: Ctx, strings: any, vStr: any) => getDCDB(c.cat, strings, vStr),
  inputOr: (_c: Ctx, v: any, d: any) => inputOr(v, d),
  structureLabel: (_c: Ctx, v: any) => structureTypeLabel(v),
} as const;
export type CalcId = keyof typeof CALCS;

export function evalExpr(e: Expr, c: Ctx): any {
  if ("lit" in e) return e.lit;
  if ("input" in e) {
    const v = c.inputs[e.input];
    return e.as === "num" ? n(v) : e.as === "int" ? Math.trunc(n(v)) : v;
  }
  if ("ref" in e) {
    if (!(e.ref in c.values)) throw new Error(`Unknown quantity "${e.ref}"`);
    return c.values[e.ref];
  }
  if ("calc" in e) {
    const fn = CALCS[e.calc] as (c: Ctx, ...a: any[]) => any;
    if (!fn) throw new Error(`Unknown calc "${e.calc}"`);
    const out = fn(c, ...e.args.map((a) => evalExpr(a, c)));
    return e.field ? out[e.field] : out;
  }
  if ("bos" in e) return (c.cat.bos as any)[e.bos];
  if ("bosName" in e) return (c.cat.bosNames as any)?.[e.bosName] || BOS_LABEL_FALLBACK[e.bosName] || e.bosName;
  switch (e.op) {
    case "add": return evalExpr(e.args[0], c) + evalExpr(e.args[1], c);
    case "sub": return evalExpr(e.args[0], c) - evalExpr(e.args[1], c);
    case "mul": return evalExpr(e.args[0], c) * evalExpr(e.args[1], c);
    case "div": return evalExpr(e.args[0], c) / evalExpr(e.args[1], c);
    case "or": return evalExpr(e.args[0], c) || evalExpr(e.args[1], c);
    case "ceil": return Math.ceil(evalExpr(e.arg, c));
    case "trunc": return Math.trunc(evalExpr(e.arg, c));
    case "round": return Math.round(evalExpr(e.arg, c));
    case "if": return evalCond(e.cond, c) ? evalExpr(e.then, c) : evalExpr(e.else, c);
    case "concat": return e.parts.map((p) => `${evalExpr(p, c)}`).join("");
  }
  throw new Error(`Unknown expression ${JSON.stringify(e)}`);
}

function evalCond(k: Cond, c: Ctx): boolean {
  switch (k.op) {
    case "gt": return evalExpr(k.args[0], c) > evalExpr(k.args[1], c);
    case "lt": return evalExpr(k.args[0], c) < evalExpr(k.args[1], c);
    case "eq": return evalExpr(k.args[0], c) === evalExpr(k.args[1], c);
    case "ne": return evalExpr(k.args[0], c) !== evalExpr(k.args[1], c);
    case "and": return k.all.every((x) => evalCond(x, c));
    case "truthy": return !!evalExpr(k.arg, c);
  }
  throw new Error(`Unknown condition ${JSON.stringify(k)}`);
}

export interface TemplateResult {
  items: BOQItem[];
  /** Every named quantity — the "why" behind each line (explainability / trace). */
  values: Record<string, Value>;
}

/** Generates the BOQ for one system from a template. Same contract as calcBOQ(inputs, catalogue, overrides). */
export function runTemplate(def: TemplateDefinition, inputs: object, cat: Catalogue, ov: BOQOverrides): TemplateResult {
  const c: Ctx = { inputs: inputs as Record<string, unknown>, cat, values: {} };
  for (const q of def.quantities) c.values[q.key] = evalExpr(q.expr, c);
  const o = (k: string, d: any) => (ov[k] !== undefined ? ov[k] : d);

  const items: BOQItem[] = def.items.map((it) => ({
    sr: it.sr,
    group: it.group,
    name: evalExpr(it.name, c),
    spec: evalExpr(it.spec, c),
    make: evalExpr(it.make, c),
    unit: it.unit,
    qty: o(it.key, evalExpr(it.qty, c)),
    unitCost: o(`c${it.key}`, evalExpr(it.unitCost, c)),
    price: 0,
  }));

  const cc = def.customCatalogueItems;
  if (cc) {
    (cat.customBOS || []).forEach((ci, idx) => {
      const sr = cc.startSr + idx;
      items.push({
        sr,
        group: ci.group || cc.defaultGroup,
        name: ci.label || cc.defaultName,
        spec: cc.spec,
        make: cc.make,
        unit: ci.unit || cc.defaultUnit,
        qty: o(String(sr), 0),
        unitCost: o(`c${sr}`, ci.price || 0),
        price: 0,
      });
    });
  }

  // One choke point for every qty / cost, whatever its source (rule, form input, override).
  items.forEach((it) => {
    it.qty = sanitizePrice(it.qty);
    it.unitCost = sanitizePrice(it.unitCost);
    it.price = it.qty * it.unitCost;
  });
  return { items: items.filter((it) => !ov[`x${it.sr}`]), values: c.values };
}

// ── Static validation (for definitions that will later come from a database) ──

const BIN = new Set(["add", "sub", "mul", "div", "or"]);
const UN = new Set(["ceil", "trunc", "round"]);

/** Returns every problem found; [] means the definition is safe to run. */
export function validateDefinition(def: TemplateDefinition): string[] {
  const errors: string[] = [];
  const known = new Set<string>();
  const checkCond = (k: any, where: string) => {
    if (!k || typeof k !== "object") return errors.push(`${where}: condition is not an object`);
    if (["gt", "lt", "eq", "ne"].includes(k.op) && Array.isArray(k.args) && k.args.length === 2) return k.args.forEach((a: any) => check(a, where));
    if (k.op === "and" && Array.isArray(k.all)) return k.all.forEach((x: any) => checkCond(x, where));
    if (k.op === "truthy") return check(k.arg, where);
    errors.push(`${where}: unknown condition ${JSON.stringify(k).slice(0, 60)}`);
  };
  const check = (e: any, where: string): void => {
    if (!e || typeof e !== "object") { errors.push(`${where}: expression is not an object`); return; }
    if ("lit" in e) { if (typeof e.lit !== "number" && typeof e.lit !== "string") errors.push(`${where}: bad literal`); return; }
    if ("input" in e) { if (typeof e.input !== "string" || (e.as && e.as !== "num" && e.as !== "int")) errors.push(`${where}: bad input`); return; }
    if ("ref" in e) { if (!known.has(e.ref)) errors.push(`${where}: "${e.ref}" is used before it is defined`); return; }
    if ("calc" in e) { if (!(e.calc in CALCS)) errors.push(`${where}: unknown calc "${e.calc}"`); (e.args ?? []).forEach((a: any) => check(a, where)); return; }
    if ("bos" in e || "bosName" in e) return;
    if (BIN.has(e.op) && Array.isArray(e.args) && e.args.length === 2) return e.args.forEach((a: any) => check(a, where));
    if (UN.has(e.op)) return check(e.arg, where);
    if (e.op === "if") { checkCond(e.cond, where); check(e.then, where); check(e.else, where); return; }
    if (e.op === "concat" && Array.isArray(e.parts)) return e.parts.forEach((p: any) => check(p, where));
    errors.push(`${where}: unknown expression ${JSON.stringify(e).slice(0, 60)}`);
  };
  for (const q of def.quantities ?? []) {
    if (known.has(q.key)) errors.push(`quantity "${q.key}" is defined twice`);
    check(q.expr, `quantity ${q.key}`);
    known.add(q.key);
  }
  const keys = new Set<string>();
  for (const it of def.items ?? []) {
    if (keys.has(it.key)) errors.push(`item key "${it.key}" is used twice`);
    keys.add(it.key);
    for (const f of ["name", "spec", "make", "qty", "unitCost"] as const) check(it[f], `item ${it.key}.${f}`);
  }
  return errors;
}

// ── Human-readable form (reports now, the "why is this quantity X" UI later) ──

const SYM = { add: "+", sub: "−", mul: "×", div: "÷", or: "||" } as const;

export function formatExpr(e: Expr): string {
  if ("lit" in e) return typeof e.lit === "string" ? JSON.stringify(e.lit) : String(e.lit);
  if ("input" in e) return e.as === "int" ? `int(${e.input})` : e.as === "num" ? `num(${e.input})` : e.input;
  if ("ref" in e) return e.ref;
  if ("calc" in e) return `${e.calc}(${e.args.map(formatExpr).join(", ")})${e.field ? "." + e.field : ""}`;
  if ("bos" in e) return `catalogue.bos.${e.bos}`;
  if ("bosName" in e) return `name(${e.bosName})`;
  switch (e.op) {
    case "add": case "sub": case "mul": case "div": case "or":
      return `(${formatExpr(e.args[0])} ${SYM[e.op]} ${formatExpr(e.args[1])})`;
    case "ceil": case "trunc": case "round": return `${e.op}(${formatExpr(e.arg)})`;
    case "if": return `(${formatCond(e.cond)} ? ${formatExpr(e.then)} : ${formatExpr(e.else)})`;
    case "concat": return e.parts.map(formatExpr).join(" + ");
  }
  return JSON.stringify(e);
}

function formatCond(k: Cond): string {
  switch (k.op) {
    case "gt": return `${formatExpr(k.args[0])} > ${formatExpr(k.args[1])}`;
    case "lt": return `${formatExpr(k.args[0])} < ${formatExpr(k.args[1])}`;
    case "eq": return `${formatExpr(k.args[0])} = ${formatExpr(k.args[1])}`;
    case "ne": return `${formatExpr(k.args[0])} ≠ ${formatExpr(k.args[1])}`;
    case "and": return k.all.map(formatCond).join(" and ");
    case "truthy": return `${formatExpr(k.arg)} is set`;
  }
}
