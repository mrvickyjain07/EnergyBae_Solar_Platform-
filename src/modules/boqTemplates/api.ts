// src/modules/boqTemplates/api.ts — client row types for the BOQ Templates module (fetch helper shared with Projects).
import type { TemplateDocument } from "./templateRules";
import type { OverheadCharges } from "../proposal/types";
export { api } from "../projects/api";

export interface CapacityRange { id: string; label: string; min_kw: number; max_kw: number | null; sort_order: number }

export interface VersionSummary { id: string; version: number; status: "draft" | "published"; published_at: string | null; created_at: string }

export interface BoqTemplate {
  id: string;
  capacity_range_id: string;
  name: string;
  system_type: string | null;
  structure_type: string | null;
  panel_type: string | null;
  is_default: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TemplateListItem extends BoqTemplate { versions: VersionSummary[] }

export interface TemplateVersion extends VersionSummary {
  template_id: string;
  definition: TemplateDocument;
  created_by_name: string | null;
  published_by_name: string | null;
  updated_at: string;
}

export interface TemplatesResponse { ranges: CapacityRange[]; templates: TemplateListItem[]; companyDefaults: OverheadCharges }
export interface TemplateDetail { template: BoqTemplate; versions: TemplateVersion[]; companyDefaults: OverheadCharges }

export const latestOf = (versions: VersionSummary[]) => versions.reduce<VersionSummary | null>((a, v) => (!a || v.version > a.version ? v : a), null);
export const latestPublished = (versions: VersionSummary[]) => versions.filter((v) => v.status === "published").reduce<VersionSummary | null>((a, v) => (!a || v.version > a.version ? v : a), null);
