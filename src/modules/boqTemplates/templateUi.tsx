// src/modules/boqTemplates/templateUi.tsx — small presentational pieces shared by the templates page and editor.
import React from "react";
import { FileCheck2, FilePen } from "lucide-react";
import { structureTypeLabel } from "../proposal/structureTypes";

export function VersionBadge({ status, version }: { status: "draft" | "published"; version: number }) {
  return status === "published" ? (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-[var(--success-text)]"><FileCheck2 className="w-3 h-3" /> v{version} Published</span>
  ) : (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[var(--solar)]/12 text-[var(--solar-text)]"><FilePen className="w-3 h-3" /> v{version} Draft</span>
  );
}

export const variantChips = (t: { system_type: string | null; structure_type: string | null; panel_type: string | null }) =>
  [t.system_type, structureTypeLabel(t.structure_type), t.panel_type].filter(Boolean) as string[];
