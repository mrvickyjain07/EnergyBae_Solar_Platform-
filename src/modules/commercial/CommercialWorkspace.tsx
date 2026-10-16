// Mode shell for Commercial & Industrial: single-bill analysis or batch
// analysis. A thin shell on purpose — CommercialBillAnalysis is not modified
// or wrapped in conditionals, so the single-bill flow behaves exactly as it
// did before this file existed.
//
// Both panes stay mounted and the inactive one is hidden, so switching does
// not discard a half-filled single-bill worksheet or a processed batch queue.
//
// On the unified Bill Analysis page the mode is CONTROLLED by the page's own
// Single / Several bills switch (App.tsx) — one upload interface, one switch.
// Standalone use keeps the built-in segmented control.
import React, { useEffect, useState } from "react";
import { FileText, Layers } from "lucide-react";
import CommercialBillAnalysis, { ExternalBillFile, CommercialAnalysisResult } from "./CommercialBillAnalysis";
import CommercialBatchAnalysis from "./CommercialBatchAnalysis";
import SegmentedTabs from "../../components/SegmentedTabs";

export type CommercialMode = "single" | "batch";

interface Props {
  /** Set by the unified Bill Analysis page; see CommercialBillAnalysis. */
  externalFile?: ExternalBillFile | null;
  hideUploader?: boolean;
  /** Controlled mode (unified page). Omit to use the built-in switch. */
  mode?: CommercialMode;
  /** The active mode's result for the parent to save (null: nothing to save yet). */
  onResult?: (result: CommercialAnalysisResult | null) => void;
}

export default function CommercialWorkspace({ externalFile, hideUploader, mode: controlledMode, onResult }: Props = {}) {
  const [ownMode, setOwnMode] = useState<CommercialMode>("single");
  const mode = controlledMode ?? ownMode;
  // Each pane reports its own result; the parent only ever sees the active mode's.
  const [results, setResults] = useState<Record<CommercialMode, CommercialAnalysisResult | null>>({ single: null, batch: null });
  useEffect(() => { onResult?.(results[mode]); }, [results, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-6">
      {controlledMode === undefined && (
        <SegmentedTabs<CommercialMode>
          ariaLabel="Analysis mode"
          value={mode}
          onChange={setOwnMode}
          options={[
            { value: "single", label: "Single bill", icon: FileText },
            { value: "batch", label: "Several bills", icon: Layers },
          ]}
        />
      )}

      {/* Explicit display, not the `hidden` attribute — `hidden` is only honoured
          while nothing else sets `display`, so a stray utility class on either
          pane would silently render both at once. */}
      <div style={{ display: mode === "single" ? "block" : "none" }}>
        <CommercialBillAnalysis externalFile={externalFile} hideUploader={hideUploader} onResult={(r) => setResults((p) => ({ ...p, single: r }))} />
      </div>
      <div style={{ display: mode === "batch" ? "block" : "none" }}>
        <CommercialBatchAnalysis onResult={(r) => setResults((p) => ({ ...p, batch: r }))} />
      </div>
    </div>
  );
}
