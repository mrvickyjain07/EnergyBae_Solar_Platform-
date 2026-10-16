// src/modules/projects/api.ts — client fetch helpers + row types for the Projects module.
import type { CustomerType, ProjectStatus, SystemRow } from "./projectRules";
import type { BillAnalysisInput } from "./billAnalysisRules";

export interface Customer {
  id: string;
  name: string;
  customer_type: CustomerType;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  gstin: string | null;
  notes: string | null;
  archived_at: string | null;
  project_count?: number;
}

export interface ProjectListItem {
  id: string;
  name: string;
  status: ProjectStatus;
  site_address: string | null;
  archived_at: string | null;
  updated_at: string;
  customer: { id: string; name: string; customer_type: CustomerType } | null;
  systemCount: number;
  totalKw: number;
  unsized: number;
  proposal_count: number;
}

export interface Project {
  id: string;
  name: string;
  status: ProjectStatus;
  site_address: string | null;
  notes: string | null;
  customer_id: string;
  archived_at: string | null;
  updated_at: string;
}

export type ProjectSystem = SystemRow;

export interface LinkedProposal {
  proposal_no: string;
  status: "draft" | "final";
  review_status: "none" | "approved" | "needs_changes";
  capacity_kw: number | null;
  total_effective: number | null;
  updated_at: string;
  project_system_id: string | null;
}

export interface BillAnalysis extends BillAnalysisInput {
  id: string;
  /** null = standalone (not linked to a project). */
  project_id: string | null;
  created_at: string;
  /** Only on GET /api/bill-analyses. */
  project?: { id: string; name: string } | null;
}

export interface ProjectDetail {
  project: Project;
  customer: Customer;
  systems: ProjectSystem[];
  proposals: LinkedProposal[];
  billAnalyses: BillAnalysis[];
  totals: { systemCount: number; totalKw: number; unsized: number };
}

export async function api<T>(url: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(url, {
    method: init?.method ?? "GET",
    headers: init?.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || "Something went wrong. Try again.");
  return json as T;
}
