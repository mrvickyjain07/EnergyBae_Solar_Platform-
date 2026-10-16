// src/modules/projects/projectRules.ts
// Pure rules for Customers / Projects / Solar Systems, shared by the API
// (validation at the trust boundary) and the UI (same messages, prefill).
// Split out so they're testable without React or a database.
import type { ProposalInputs, SystemType } from "../proposal/types";

export const CUSTOMER_TYPES = [
  { value: "INDIVIDUAL_HOUSE", label: "Individual house" },
  { value: "RESIDENTIAL_SOCIETY", label: "Housing society" },
  { value: "COMMERCIAL", label: "Commercial" },
  { value: "INDUSTRIAL", label: "Industrial" },
] as const;
export type CustomerType = (typeof CUSTOMER_TYPES)[number]["value"];

/** Pipeline order — also the Kanban lane order (migration 0021). `lost` is off the line. */
export const PROJECT_STATUSES = [
  { value: "lead", label: "Enquiry" },
  { value: "site_visit", label: "Site Visit" },
  { value: "proposal", label: "Proposal" },
  { value: "won", label: "Won" },
  { value: "installation", label: "Installation" },
  { value: "completed", label: "Completed" },
  { value: "lost", label: "Lost" },
] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number]["value"];

/** Stage-gated work. Each action unlocks at its stage and stays unlocked after; nothing is unlocked on a lost project. */
export const STAGE_ACTIONS = [
  { action: "bill", label: "Analyze bill", from: "lead" },
  { action: "boq", label: "Quick BOQ", from: "site_visit" },
  { action: "proposal", label: "Proposal", from: "proposal" },
] as const satisfies readonly { action: string; label: string; from: ProjectStatus }[];
export type StageAction = (typeof STAGE_ACTIONS)[number]["action"];

const stageIndex = (s: ProjectStatus) => PROJECT_STATUSES.findIndex((x) => x.value === s);
export const isUnlocked = (status: ProjectStatus, action: StageAction) => {
  const a = STAGE_ACTIONS.find((x) => x.action === action)!;
  return status !== "lost" && stageIndex(status) >= stageIndex(a.from);
};
export const stageUnlocks = (status: ProjectStatus) => STAGE_ACTIONS.filter((a) => isUnlocked(status, a.action));
/** "Unlocks at Site Visit" — the label of the stage an action needs. */
export const unlockStageLabel = (action: StageAction) =>
  PROJECT_STATUSES.find((s) => s.value === STAGE_ACTIONS.find((a) => a.action === action)!.from)!.label;

export const SYSTEM_TYPES: SystemType[] = ["On-Grid", "Off-Grid", "Hybrid"];
// Structure types live in ../proposal/structureTypes.ts (stored as codes; older label values stay valid).

export interface CustomerInput {
  name: string;
  customer_type: CustomerType;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  gstin: string | null;
  notes: string | null;
}

export interface ProjectInput {
  customer_id: string;
  name: string;
  status: ProjectStatus;
  site_address: string | null;
  notes: string | null;
}

export interface SystemInput {
  name: string;
  site_address: string | null;
  capacity_kw: number | null;
  system_type: SystemType;
  phase: 1 | 3 | null;
  structure_type: string | null;
  panel_brand: string | null;
  panel_wp: number | null;
  inverter_brand: string | null;
  notes: string | null;
}

type Result<T> = { ok: true; value: T } | { ok: false; error: string };
const ok = <T,>(value: T): Result<T> => ({ ok: true, value });
const fail = (error: string): Result<never> => ({ ok: false, error });

function text(v: unknown, max: number): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}
function num(v: unknown): number | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** Validates a full customer (create) or a partial one (update, `partial: true`). */
export function validateCustomer(raw: any, partial = false): Result<Partial<CustomerInput>> {
  const out: Partial<CustomerInput> = {};
  const name = text(raw?.name, 120);
  if (name !== undefined) out.name = name ?? "";
  if (!partial || raw?.name !== undefined) {
    if (!out.name) return fail("Customer name is required.");
  }
  if (raw?.customer_type !== undefined) {
    if (!CUSTOMER_TYPES.some((t) => t.value === raw.customer_type)) return fail("Unknown customer type.");
    out.customer_type = raw.customer_type;
  } else if (!partial) out.customer_type = "INDIVIDUAL_HOUSE";
  for (const [k, max] of [["contact_name", 120], ["phone", 30], ["address", 500], ["gstin", 20], ["notes", 2000]] as const) {
    const v = text(raw?.[k], max);
    if (v !== undefined) out[k] = v;
  }
  const email = text(raw?.email, 200);
  if (email !== undefined) {
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("That email address doesn't look right.");
    out.email = email ? email.toLowerCase() : null;
  }
  if (out.gstin && !/^[0-9A-Z]{15}$/.test(out.gstin.toUpperCase())) return fail("GSTIN must be 15 letters/digits.");
  if (out.gstin) out.gstin = out.gstin.toUpperCase();
  return ok(out);
}

export function validateProject(raw: any, partial = false): Result<Partial<ProjectInput>> {
  const out: Partial<ProjectInput> = {};
  if (raw?.customer_id !== undefined || !partial) {
    if (typeof raw?.customer_id !== "string" || !raw.customer_id) return fail("Pick a customer.");
    out.customer_id = raw.customer_id;
  }
  const name = text(raw?.name, 160);
  if (name !== undefined) out.name = name ?? "";
  if ((!partial || raw?.name !== undefined) && !out.name) return fail("Project name is required.");
  if (raw?.status !== undefined) {
    if (!PROJECT_STATUSES.some((s) => s.value === raw.status)) return fail("Unknown project status.");
    out.status = raw.status;
  } else if (!partial) out.status = "lead";
  for (const [k, max] of [["site_address", 500], ["notes", 2000]] as const) {
    const v = text(raw?.[k], max);
    if (v !== undefined) out[k] = v;
  }
  return ok(out);
}

export function validateSystem(raw: any, partial = false): Result<Partial<SystemInput>> {
  const out: Partial<SystemInput> = {};
  const name = text(raw?.name, 120);
  if (name !== undefined) out.name = name ?? "";
  if ((!partial || raw?.name !== undefined) && !out.name) return fail("Give the system a name, e.g. \"Main rooftop\".");

  const cap = num(raw?.capacity_kw);
  if (cap === undefined && raw?.capacity_kw !== undefined) return fail("Capacity must be a number.");
  if (cap !== undefined) {
    if (cap !== null && (cap <= 0 || cap > 100000)) return fail("Capacity must be between 0 and 100,000 kW.");
    out.capacity_kw = cap;
  }
  const wp = num(raw?.panel_wp);
  if (wp === undefined && raw?.panel_wp !== undefined) return fail("Panel wattage must be a number.");
  if (wp !== undefined) {
    if (wp !== null && (wp < 50 || wp > 1000)) return fail("Panel wattage should be between 50 and 1000 Wp.");
    out.panel_wp = wp;
  }
  if (raw?.system_type !== undefined) {
    if (!SYSTEM_TYPES.includes(raw.system_type)) return fail("Unknown system type.");
    out.system_type = raw.system_type;
  } else if (!partial) out.system_type = "On-Grid";
  if (raw?.phase !== undefined) {
    const p = raw.phase === null || raw.phase === "" ? null : Number(raw.phase);
    if (p !== null && p !== 1 && p !== 3) return fail("Phase must be 1 or 3.");
    out.phase = p as 1 | 3 | null;
  }
  for (const [k, max] of [["site_address", 500], ["structure_type", 60], ["panel_brand", 80], ["inverter_brand", 80], ["notes", 2000]] as const) {
    const v = text(raw?.[k], max);
    if (v !== undefined) out[k] = v;
  }
  return ok(out);
}

export interface SystemRow extends SystemInput { id: string; project_id: string; sort_order: number }
export interface CustomerRow extends CustomerInput { id: string; archived_at: string | null }

/** Project totals across its systems (systems without a capacity don't count). */
export function projectTotals(systems: Pick<SystemRow, "capacity_kw">[]) {
  const sized = systems.filter((s) => typeof s.capacity_kw === "number");
  return {
    systemCount: systems.length,
    totalKw: Math.round(sized.reduce((sum, s) => sum + (s.capacity_kw as number), 0) * 100) / 100,
    unsized: systems.length - sized.length,
  };
}

/**
 * Fields a system can fill in the BOQ calculator. Everything else in
 * ProposalInputs (cable runs, floors, strings, pricing) stays for the BOQ step
 * — the project holds decisions, not engineering results.
 */
export function systemToProposalInputs(
  customer: Pick<CustomerRow, "name" | "phone" | "address" | "customer_type">,
  system: Pick<SystemRow, "capacity_kw" | "system_type" | "phase" | "structure_type" | "panel_brand" | "panel_wp" | "inverter_brand" | "site_address">,
  projectSiteAddress?: string | null,
): Partial<ProposalInputs> {
  const out: Partial<ProposalInputs> = {
    customerName: customer.name,
    systemType: system.system_type,
    financeCustomerType: customer.customer_type,
  };
  if (customer.phone) out.contactNumber = customer.phone;
  const address = system.site_address || projectSiteAddress || customer.address;
  if (address) out.customerAddress = address;
  if (typeof system.capacity_kw === "number") out.capacity = system.capacity_kw;
  if (system.phase) out.phase = system.phase === 3 ? "3-Phase" : "1-Phase";
  if (system.structure_type) out.structureType = system.structure_type;
  if (system.panel_brand) out.panelBrand = system.panel_brand;
  if (typeof system.panel_wp === "number") out.panelWp = system.panel_wp;
  if (system.inverter_brand) out.inverterBrand = system.inverter_brand;
  return out;
}
