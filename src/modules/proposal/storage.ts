// Proposal Maker — localStorage persistence.
// Follows the app's existing pattern (direct localStorage calls wrapped in
// try/catch, no hook abstraction — see ThemeContext.tsx / GoogleSheetsExportModal.tsx)
// rather than introducing a new useLocalStorage hook the rest of the app doesn't use.

import { BOQOverrides, Catalogue, ProposalInputs, ProposalMeta, SystemType } from "./types";
import { DEFAULT_CATALOGUE, LOCALSTORAGE_CATALOGUE_KEY, LOCALSTORAGE_DRAFT_KEY } from "./defaultCatalogue";
import { DEFAULT_FINANCE_SETTINGS, FinanceSettings } from "./components/FinancialAnalysis";
import { ProposalData } from "./buildProposalData";
import { ProposalItemRow, ProposalStatus, ReviewStatus } from "./proposalRecord";

const LOCALSTORAGE_SYSTEM_TYPE_KEY = "eb_system_type";
const LOCALSTORAGE_PROPOSAL_DATA_KEY = "eb_proposal_data";
// Full computed document state from the "Preview / Print" editor (ProposalEditor.tsx)
// — every field already resolved (pricing math, amount-in-words, BOM rows, images).
// The standalone proposal-editor.html tool reads this key to prefill itself, so it
// never re-implements the pricing engine in a second, drift-prone copy.
const LOCALSTORAGE_PROPOSAL_EDITOR_DATA_KEY = "eb_proposal_editor_data";
// Handoff key read by the standalone proposal-editor.html tool's own prefill
// IIFE (see that file's `localStorage.getItem('energybae_proposal_data')`)
// — its field names are fixed by that file, not ours, so don't rename this.
const LOCALSTORAGE_STANDALONE_EDITOR_KEY = "energybae_proposal_data";
const VALID_SYSTEM_TYPES: SystemType[] = ["On-Grid", "Off-Grid", "Hybrid"];

export interface ProposalDraft {
  inputs: ProposalInputs;
  meta: ProposalMeta;
  overrides: BOQOverrides;
  savedAt: string;
  // Optional — absent on drafts saved before the Financial Analysis engine
  // existed, so loadDraft() falls back to DEFAULT_FINANCE_SETTINGS for those.
  financeSettings?: FinanceSettings;
}

export async function loadCatalogueAsync(): Promise<Catalogue> {
  try {
    const res = await fetch("/api/catalogue");
    if (!res.ok) throw new Error(`GET /api/catalogue failed: ${res.status}`);
    const { catalogue } = await res.json();
    if (catalogue) return mergeCatalogue(catalogue as Partial<Catalogue>);
    // No row saved yet (fresh server, catalogue_state empty) — this is a
    // success response, not an error, so it doesn't hit the catch below.
    // Treat it the same as the offline fallback: local copy, else defaults.
    // Otherwise this branch would silently PUT DEFAULT_CATALOGUE back as the
    // shared row and permanently discard whatever this browser had saved.
    return mergeCatalogue(readLocalCatalogue());
  } catch {
    // Network/server down — fall back to whatever local copy exists so the
    // app still opens; the next successful save re-syncs the backend.
    return mergeCatalogue(readLocalCatalogue());
  }
}

function readLocalCatalogue(): Partial<Catalogue> | null {
  try {
    const raw = localStorage.getItem(LOCALSTORAGE_CATALOGUE_KEY);
    if (raw) return JSON.parse(raw) as Partial<Catalogue>;
  } catch {
    // ignore
  }
  return null;
}

// Merge whatever was resolved (API row, localStorage fallback, or nothing)
// onto DEFAULT_CATALOGUE so newly-added catalogue sections never crash on an
// older saved copy — same shape the pre-migration loadCatalogue() used.
function mergeCatalogue(parsed: Partial<Catalogue> | null): Catalogue {
  if (!parsed) return structuredCloneCat(DEFAULT_CATALOGUE);
  return {
    panels: parsed.panels?.length ? parsed.panels : DEFAULT_CATALOGUE.panels,
    acdb: parsed.acdb?.length ? parsed.acdb : DEFAULT_CATALOGUE.acdb,
    dcdb: parsed.dcdb?.length ? parsed.dcdb : DEFAULT_CATALOGUE.dcdb,
    batteries: parsed.batteries?.length ? parsed.batteries : DEFAULT_CATALOGUE.batteries,
    bos: { ...DEFAULT_CATALOGUE.bos, ...(parsed.bos || {}) },
    bosNames: { ...DEFAULT_CATALOGUE.bosNames, ...(parsed.bosNames || {}) },
    customBOS: parsed.customBOS || [],
    charges: { ...DEFAULT_CATALOGUE.charges, ...(parsed.charges || {}) },
  };
}

export async function saveCatalogueAsync(cat: Catalogue): Promise<Catalogue> {
  // Mirror to localStorage too — cheap offline fallback for loadCatalogueAsync above.
  try {
    localStorage.setItem(LOCALSTORAGE_CATALOGUE_KEY, JSON.stringify(cat));
  } catch {
    // ignore quota/private-mode failures
  }
  const res = await fetch("/api/catalogue", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ catalogue: cat }),
  });
  if (!res.ok) throw new Error(`PUT /api/catalogue failed: ${res.status}`);
  const { catalogue } = await res.json();
  return catalogue as Catalogue;
}

export async function resetCatalogueAsync(): Promise<Catalogue> {
  const fresh = structuredCloneCat(DEFAULT_CATALOGUE);
  return saveCatalogueAsync(fresh);
}

export function structuredCloneCat(cat: Catalogue): Catalogue {
  return JSON.parse(JSON.stringify(cat));
}

export function loadDraft(): ProposalDraft | null {
  try {
    const raw = localStorage.getItem(LOCALSTORAGE_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ProposalDraft;
    return { ...parsed, financeSettings: parsed.financeSettings || DEFAULT_FINANCE_SETTINGS };
  } catch {
    return null;
  }
}

export function saveDraft(draft: ProposalDraft): void {
  try {
    localStorage.setItem(LOCALSTORAGE_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Ignore — draft save is a convenience, not critical path.
  }
}

// Everything this browser caches that belongs to ONE company: the offline
// catalogue copy (loadCatalogueAsync falls back to it — it would show the
// previous company's prices), the autosaved BOQ draft, and the editor
// handoffs. The system-type preference is a UI preference, not company data,
// so it stays.
function clearTenantLocalData(): void {
  for (const key of [
    LOCALSTORAGE_CATALOGUE_KEY,
    LOCALSTORAGE_DRAFT_KEY,
    LOCALSTORAGE_PROPOSAL_DATA_KEY,
    LOCALSTORAGE_PROPOSAL_EDITOR_DATA_KEY,
    LOCALSTORAGE_STANDALONE_EDITOR_KEY,
  ]) {
    try {
      localStorage.removeItem(key);
    } catch {
      // storage blocked — nothing cached to leak
    }
  }
}

const LOCALSTORAGE_ACTIVE_ORG_KEY = "eb_active_org";

/**
 * Call once a session's company is known, BEFORE anything reads the caches
 * above. Clears them only when a different company than last time is using
 * this browser — covers switching, a colleague from another company signing
 * in, and an expired session with no logout — while a same-company re-login
 * keeps its unsaved draft.
 */
export function syncTenantCache(organizationId: string): void {
  try {
    if (localStorage.getItem(LOCALSTORAGE_ACTIVE_ORG_KEY) !== organizationId) {
      clearTenantLocalData();
      localStorage.setItem(LOCALSTORAGE_ACTIVE_ORG_KEY, organizationId);
    }
  } catch {
    // storage blocked — nothing is cached, so nothing can leak
  }
}

export function clearDraft(): void {
  try {
    localStorage.removeItem(LOCALSTORAGE_DRAFT_KEY);
  } catch {
    // no-op
  }
}

// ─── System Type (☀️ On-Grid / 🔋 Off-Grid / ⚡ Hybrid) ─────────────────────
// Persisted standalone (in addition to living on ProposalInputs / the draft)
// so the selector's last choice survives even before a full draft exists.
export function loadSystemType(): SystemType {
  try {
    const raw = localStorage.getItem(LOCALSTORAGE_SYSTEM_TYPE_KEY);
    if (raw && (VALID_SYSTEM_TYPES as string[]).includes(raw)) return raw as SystemType;
  } catch {
    // ignore
  }
  return "On-Grid";
}

export function saveSystemType(value: SystemType): void {
  try {
    localStorage.setItem(LOCALSTORAGE_SYSTEM_TYPE_KEY, value);
  } catch {
    // ignore
  }
}

// ─── Proposal data snapshot for a future public/print proposal page ────────
// Mirrors the current inputs + meta under a dedicated key (separate from the
// autosave draft) with an explicit `system_type` field so any page reading
// this key doesn't need to know about the camelCase ProposalInputs shape.
export function saveProposalData(inputs: ProposalInputs, meta: ProposalMeta): void {
  try {
    localStorage.setItem(
      LOCALSTORAGE_PROPOSAL_DATA_KEY,
      JSON.stringify({ ...inputs, ...meta, system_type: inputs.systemType })
    );
  } catch {
    // ignore
  }
}

// ─── Full editable-document snapshot for the standalone Proposal Editor ────
// Called on every edit inside ProposalEditor.tsx so the standalone tool's
// prefill always reflects the latest on-screen state, live.
export function saveProposalEditorData(data: ProposalData): void {
  try {
    localStorage.setItem(LOCALSTORAGE_PROPOSAL_EDITOR_DATA_KEY, JSON.stringify(data));
  } catch {
    // Ignore quota/private-mode failures — the in-app editor still works fine.
  }
}

// ─── Handoff to the standalone proposal-editor.html tool ───────────────────
// Maps our computed ProposalData onto that file's flat field names so its
// prefill IIFE picks them up (it tries several alt names per field).
export function saveStandaloneEditorHandoff(data: ProposalData): void {
  try {
    const p = data.pricing;
    localStorage.setItem(
      LOCALSTORAGE_STANDALONE_EDITOR_KEY,
      JSON.stringify({
        customerName: data.customerName,
        contact: data.contactNo,
        address1: data.address,
        proposalNo: data.proposalNo,
        proposedOn: data.proposedOn,
        systemCapacity: p.capacityKw,
        pricePerKw: p.ratePerKw,
        subTotal: p.subTotal,
        gstAmount: p.gst,
        totalCost: p.total,
        amountInWords: p.amountInWords,
        pmsgySubsidy: p.subsidy,
        totalEffective: p.effective,
      })
    );
  } catch {
    // Ignore quota/private-mode failures — the standalone tool just opens blank.
  }
}

// ─── Saved proposals (Supabase-backed, D21) ─────────────────────────────────
// Multi-proposal save/load, distinct from the single autosave draft above.
// Save is an upsert by proposalNo; the server freezes the computed BOQ +
// pricing summary at save time (see proposalsApi.ts) so a FINAL proposal
// never drifts when catalogue prices change later.

export interface ProposalListEntry {
  proposal_no: string;
  customer_name: string;
  status: ProposalStatus;
  total_effective: number | null;
  updated_at: string;
  created_by_name: string | null;
  review_status: ReviewStatus;
  review_note: string | null;
}

export interface SavedProposal {
  proposal_no: string;
  proposal_date: string;
  status: ProposalStatus;
  customer_name: string;
  inputs: ProposalInputs;
  overrides: BOQOverrides;
  finance_settings: FinanceSettings | null;
  pricing_summary: unknown;
  updated_at: string;
  project_id?: string | null;
  project_system_id?: string | null;
}

export async function saveProposalAsync(
  proposalNo: string,
  meta: ProposalMeta,
  inputs: ProposalInputs,
  overrides: BOQOverrides,
  financeSettings: FinanceSettings,
  status: ProposalStatus
): Promise<void> {
  const res = await fetch("/api/proposals", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ proposalNo, meta, inputs, overrides, financeSettings, status }),
  });
  // Surface the server's message (permission refusal, stale project link…)
  // instead of a bare status code.
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || `Saving failed (${res.status}).`);
}

export async function loadProposalAsync(proposalNo: string): Promise<{ proposal: SavedProposal; items: ProposalItemRow[] }> {
  const res = await fetch(`/api/proposals/${encodeURIComponent(proposalNo)}`);
  if (!res.ok) throw new Error(`GET /api/proposals/${proposalNo} failed: ${res.status}`);
  return res.json();
}

export async function listProposalsAsync(): Promise<ProposalListEntry[]> {
  const res = await fetch("/api/proposals");
  if (!res.ok) throw new Error(`GET /api/proposals failed: ${res.status}`);
  const { proposals } = await res.json();
  return proposals as ProposalListEntry[];
}

/** expectedUpdatedAt = the updated_at of the version being reviewed; the server refuses (409) if it has changed since. */
export async function reviewProposalAsync(proposalNo: string, status: Exclude<ReviewStatus, "none">, note: string, expectedUpdatedAt: string): Promise<void> {
  const res = await fetch(`/api/proposals/${encodeURIComponent(proposalNo)}/review`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, note, expectedUpdatedAt }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || `Saving the review failed (${res.status}).`);
}

export async function deleteProposalAsync(proposalNo: string): Promise<void> {
  const res = await fetch(`/api/proposals/${encodeURIComponent(proposalNo)}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`DELETE /api/proposals/${proposalNo} failed: ${res.status}`);
}

export function loadProposalEditorData(): ProposalData | null {
  try {
    const raw = localStorage.getItem(LOCALSTORAGE_PROPOSAL_EDITOR_DATA_KEY);
    return raw ? (JSON.parse(raw) as ProposalData) : null;
  } catch {
    return null;
  }
}
