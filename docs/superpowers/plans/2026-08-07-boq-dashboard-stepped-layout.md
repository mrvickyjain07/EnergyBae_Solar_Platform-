# BOQ Dashboard Stepped Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the "calculator" tab's single long scroll (Customer/Meta form → System config → BOQ table → Pricing summary → Finance panel → export buttons, all mounted at once) with a 5-step dashboard (Customer & Proposal → System Configuration → BOQ → Pricing & Subsidy → Review & Export), plus one persistent summary strip shown on every step.

**Architecture:** This is a render-layer restructuring only — the state model stays exactly as-is. Investigation of the current code (`ProposalMaker.tsx`, `ProposalForm.tsx`) confirmed all five pieces of calculator-tab state (`inputs`, `meta`, `overrides`, `financeSettings`, `catalogue`) are already lifted to `ProposalMaker.tsx` and are consumed by three memoized calc pipelines (`boq`, `summary`, `financeResult`), the `validate()` gate, and all three export handlers (`handleDownloadExcel`, `handleOpenStandaloneEditor`, autosave). Splitting that state into per-step-local state would break those contracts, so this plan does not touch it — it only adds a `currentStep` UI state and gates which existing (or newly extracted) components render for the active step. `ProposalForm.tsx` keeps its single set of hooks/handlers and gains a `step` prop that gates which of its existing `SectionCard`s render — no new components own form state.

**Tech Stack:** React 19 · `motion/react` (already used for the existing tab-switch animation and battery-section collapse) · existing `AnimatedNumber`/`SectionCard`/`FieldGrid` components — no new dependency.

## Global Constraints

- Do not change `ProposalInputs`, `ProposalMeta`, `BOQOverrides`, `FinanceSettings`, or `Catalogue` shapes, and do not move any of `ProposalMaker.tsx`'s existing state ownership. Every `useState`/`useMemo`/`useEffect` currently in `ProposalMaker.tsx` (autosave, catalogue load/save, `boq`/`summary`/`financeResult` memoization, `validate()`) stays exactly where it is.
- `ProposalForm.tsx` keeps its current props, hooks, and auto-lookup `useEffect`s unchanged — only its JSX return gets step-gated. Do not split it into multiple components with independent state; that would require lifting new shared state and risks desyncing the auto-lookup effects from the fields they populate.
- `BOQTable.tsx`, `PricingSummary.tsx`, `FinancialAnalysis.tsx` are reused with zero internal changes — they simply get rendered conditionally by step instead of unconditionally.
- "Persistent summary strip" means shown on every step (Customer, System, BOQ, Pricing, Review) — not CSS `position: sticky` while scrolling. The outer page layout (sidebar/scroll container) wasn't verified to support sticky positioning safely in this investigation, so this plan scopes it to "always rendered, not scroll-attached." Upgrading to true sticky positioning is a follow-up once someone can verify it in a live browser.
- Step navigation is unrestricted — any step is clickable at any time, matching the existing lack of hard sequential gating in this codebase (the only validation gate, `validate()`, already runs at export time in Step 5, not per-step advancement). Do not add new per-step validation gating.
- No new dependencies.

---

## Task 1: `SummaryStrip` — persistent summary component

**Files:**
- Create: `src/modules/proposal/components/SummaryStrip.tsx`

**Interfaces:**
- Consumes: `AnimatedNumber` (`src/components/AnimatedNumber.tsx`, already used identically in `PricingSummary.tsx`), `ProposalInputs`/`PricingSummary` types from `../types`.
- Produces: `export default function SummaryStrip({ inputs, summary, numPanels }: { inputs: ProposalInputs; summary: PricingSummaryType; numPanels: number })` — a 4-card stat strip (System Capacity, No. of Panels, Material Cost, After Subsidy/Final Amount), visually matching the existing stat-card block already in `PricingSummary.tsx:36-60` (same `AnimatedNumber` usage, same `glass-panel` card styling) but extracted into its own always-rendered component.

- [ ] **Step 1: Write the component**

```typescript
// src/modules/proposal/components/SummaryStrip.tsx
// Persistent summary strip shown above every calculator step — same stat
// cards PricingSummary.tsx already shows (matTotal, capacity, etc.), just
// extracted so they're visible before the user reaches the Pricing step.
// Deliberately not deduplicated with PricingSummary's own copy: touching
// that component isn't needed for this and keeping it separate is the
// smaller, lower-risk diff.
import React from "react";
import AnimatedNumber from "../../../components/AnimatedNumber";
import { PricingSummary as PricingSummaryType, ProposalInputs } from "../types";

interface Props {
  inputs: ProposalInputs;
  summary: PricingSummaryType;
  numPanels: number;
}

export default function SummaryStrip({ inputs, summary, numPanels }: Props) {
  const B1 = inputs.capacity === "" ? 0 : inputs.capacity;
  const items = [
    { title: "System Capacity", value: B1, suffix: " kW", detail: inputs.phase || "Phase not selected", color: "text-[var(--accent-green)]" },
    { title: "No. of Panels", value: numPanels, suffix: "", detail: `${inputs.panelBrand || "—"} ${inputs.panelWp ? inputs.panelWp + " Wp" : ""}`, color: "text-cyan-500" },
    { title: "Material Cost", value: summary.matTotal / 100000, decimals: 2, suffix: "L", prefix: "₹", detail: "Before overheads & GST", color: "text-amber-500" },
    {
      title: summary.isDCR ? "After Subsidy" : "Final Amount",
      value: (summary.discountAmt > 0 ? summary.finalAfterDiscount : summary.effective) / 100000,
      decimals: 2,
      suffix: "L",
      prefix: "₹",
      detail: summary.isDCR ? "Subsidy ₹78k deducted" : "NDCR — No subsidy",
      color: "text-[var(--accent-green)]",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {items.map((item, idx) => (
        <div key={idx} className="glass-panel rounded-2xl p-4 bg-[var(--bg-card)] relative overflow-hidden">
          <div className="absolute -right-6 -top-6 w-16 h-16 rounded-full bg-[var(--accent-green)]/10 blur-xl pointer-events-none" />
          <div className="text-[9px] text-[var(--text-muted)] font-mono font-bold uppercase tracking-wider">{item.title}</div>
          <div className={`mt-1.5 text-lg font-bold font-display truncate ${item.color}`}>
            <AnimatedNumber value={item.value} decimals={item.decimals ?? 0} prefix={item.prefix} suffix={item.suffix} />
          </div>
          <div className="mt-1 text-[9px] text-[var(--text-secondary)] font-mono uppercase truncate">{item.detail}</div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Manual verification**

Run: `npm run lint`
Expected: no new `error TS` lines beyond the current baseline (confirm via `git stash` the new file, run lint, compare, `git stash pop` — same technique used throughout the prior wire-price plans).

- [ ] **Step 3: Commit**

```bash
git add src/modules/proposal/components/SummaryStrip.tsx
git commit -m "feat: add persistent SummaryStrip component for the calculator dashboard"
```

---

## Task 2: `StepNav` — 5-step navigation

**Files:**
- Create: `src/modules/proposal/components/StepNav.tsx`

**Interfaces:**
- Produces: `export type CalcStep = "customer" | "system" | "boq" | "pricing" | "review";` and `export default function StepNav({ current, onSelect }: { current: CalcStep; onSelect: (step: CalcStep) => void })` — renders 5 clickable step pills, all always enabled (no completion-gating, per Global Constraints), visually matching the existing internal tab bar pattern already in `ProposalMaker.tsx:217-245` (same `motion.span layoutId` active-pill animation).

- [ ] **Step 1: Write the component**

```typescript
// src/modules/proposal/components/StepNav.tsx
// 5-step nav for the calculator dashboard. All steps are always clickable —
// there's no completion-gating today (the only validation, validate(), runs
// at export time in the Review step, not per-step-advancement), so this
// stays a plain step switcher rather than a wizard with locked-until-valid
// steps.
import React from "react";
import { motion } from "motion/react";
import { User, Sliders, ClipboardList as BOQIcon, Coins, CheckCircle2 } from "lucide-react";

export type CalcStep = "customer" | "system" | "boq" | "pricing" | "review";

export const CALC_STEPS: { id: CalcStep; label: string; icon: typeof User }[] = [
  { id: "customer", label: "Customer & Proposal", icon: User },
  { id: "system", label: "System Configuration", icon: Sliders },
  { id: "boq", label: "BOQ", icon: BOQIcon },
  { id: "pricing", label: "Pricing & Subsidy", icon: Coins },
  { id: "review", label: "Review & Export", icon: CheckCircle2 },
];

interface Props {
  current: CalcStep;
  onSelect: (step: CalcStep) => void;
}

export default function StepNav({ current, onSelect }: Props) {
  return (
    <div className="flex items-center gap-1.5 bg-[var(--hover-bg)] p-1 rounded-xl border border-[var(--border-subtle)] overflow-x-auto">
      {CALC_STEPS.map((s) => {
        const Icon = s.icon;
        const isActive = current === s.id;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onSelect(s.id)}
            className={`relative flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold font-display transition-colors cursor-pointer whitespace-nowrap ${
              isActive ? "text-[var(--accent-green)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            {isActive && (
              <motion.span
                layoutId="calcStepPill"
                transition={{ type: "spring", stiffness: 400, damping: 32 }}
                className="absolute inset-0 bg-gradient-to-br from-[var(--accent-green-light)]/15 to-[var(--bg-surface)] border border-[var(--accent-green)]/30 rounded-lg shadow-sm"
              />
            )}
            <Icon className="w-3.5 h-3.5 relative z-10" />
            <span className="relative z-10">{s.label}</span>
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Manual verification**

Run: `npm run lint`
Expected: no new `error TS` lines beyond baseline.

- [ ] **Step 3: Commit**

```bash
git add src/modules/proposal/components/StepNav.tsx
git commit -m "feat: add StepNav component for the calculator dashboard"
```

---

## Task 3: Step-gate `ProposalForm.tsx`

**Files:**
- Modify: `src/modules/proposal/components/ProposalForm.tsx`

**Interfaces:**
- Consumes: `CalcStep` type from `./StepNav` (Task 2).
- Produces: `ProposalFormProps` gains one field: `step: CalcStep` (only `"customer"` and `"system"` are meaningful here — the component renders nothing for the other three step IDs, though it will never be mounted with them per Task 5's wiring).

- [ ] **Step 1: Add the prop and gate the JSX**

In `src/modules/proposal/components/ProposalForm.tsx`:

1. Add the import: `import { CalcStep } from "./StepNav";`
2. Add `step: CalcStep;` to `ProposalFormProps` (`ProposalForm.tsx:8-16`).
3. Destructure it in the function signature: `export default function ProposalForm({ inputs, setInputs, meta, setMeta, catalogue, attemptedSubmit, onRegenerateProposalNo, step }: ProposalFormProps) {`.
4. Change the `return` statement's JSX (currently `ProposalForm.tsx:88-300`, all 8 `SectionCard`s in one flat `<div className="grid ...">`) to wrap the existing cards in two conditional fragments, keeping every card's internal JSX byte-for-byte identical — only the grouping/gating changes:

```typescript
return (
  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
    {step === "customer" && (
      <>
        {/* Proposal Meta — unchanged JSX from the existing "Proposal Details" SectionCard */}
        {/* Customer Info — unchanged JSX from the existing "Customer Information" SectionCard */}
      </>
    )}
    {step === "system" && (
      <>
        {/* Policy, Subsidy & Tax Benefits — unchanged */}
        {/* System Configuration — unchanged */}
        {/* Inverter — unchanged */}
        {/* Battery (Optional) — unchanged, including its existing AnimatePresence wrapper */}
        {/* Building & Installation — unchanged */}
        {/* Structure Details — unchanged */}
      </>
    )}
  </div>
);
```

Concretely: take the existing "Proposal Meta" `SectionCard` (`ProposalForm.tsx:91-117`) and "Customer Info" `SectionCard` (`:120-128`) and move them, unmodified, inside the `{step === "customer" && (<>...</>)}` fragment. Take the "Policy, Subsidy & Tax Benefits" `SectionCard` (`:131-168`), "System Configuration" `SectionCard` (`:171-203`), "Inverter" `SectionCard` (`:206-214`), the battery `AnimatePresence` block (`:217-273`), "Building & Installation" `SectionCard` (`:276-285`), and "Structure Details" `SectionCard` (`:288-298`) and move them, unmodified, inside the `{step === "system" && (<>...</>)}` fragment. Do not change any card's internal content, field bindings, validation flags, or the `AnimatePresence`/`motion.div` battery-collapse logic — only which top-level conditional block each card sits in.

Every hook above the `return` (the four `useEffect`s at `:31-62`, the three `useMemo`s at `:64-72`, `pickBatteryModel` at `:74-81`, the four `showXErr` flags at `:83-86`) stays exactly where it is, unconditional — they must keep running regardless of which step is currently visible, since e.g. the panel price auto-lookup should still fire even while the user is on the Customer step.

- [ ] **Step 2: Manual verification**

Run: `npm run lint`
Expected: no new `error TS` lines beyond baseline.

- [ ] **Step 3: Commit**

```bash
git add src/modules/proposal/components/ProposalForm.tsx
git commit -m "feat: step-gate ProposalForm sections (customer vs system config)"
```

---

## Task 4: `ReviewExportStep` — Step 5 content

**Files:**
- Create: `src/modules/proposal/components/ReviewExportStep.tsx`

**Interfaces:**
- Consumes: `BOQItem`, `PricingSummary` (as `PricingSummaryType`), `ProposalInputs` types from `../types`; `fmtINR` from `../calculations`.
- Produces: `export default function ReviewExportStep({ inputs, boq, summary, numPanels, numInverters, onDownloadExcel, onOpenEditor }: Props)` — a compact recap card (customer, capacity/phase, panels/inverters, total payable) plus the existing two export buttons, relocated verbatim from `ProposalMaker.tsx`'s current inline "Export action bar" (`ProposalMaker.tsx:258-271`).

- [ ] **Step 1: Write the component**

```typescript
// src/modules/proposal/components/ReviewExportStep.tsx
// Step 5 of the calculator dashboard: a short recap plus the export actions
// that used to sit at the bottom of the single long scroll (ProposalMaker.tsx's
// old inline "Export action bar") — relocated here unchanged, since the
// buttons' onClick handlers and validation (validate(), validateForExport())
// stay owned by ProposalMaker and are just passed down as callbacks.
import React from "react";
import { motion } from "motion/react";
import { FileSpreadsheet, PencilLine } from "lucide-react";
import { BOQItem, PricingSummary as PricingSummaryType, ProposalInputs } from "../types";
import { fmtINR } from "../calculations";

interface Props {
  inputs: ProposalInputs;
  boq: BOQItem[];
  summary: PricingSummaryType;
  numPanels: number;
  numInverters: number;
  onDownloadExcel: () => void;
  onOpenEditor: () => void;
}

export default function ReviewExportStep({ inputs, boq, summary, numPanels, numInverters, onDownloadExcel, onOpenEditor }: Props) {
  const activeItems = boq.filter((i) => i.qty > 0).length;

  return (
    <div className="space-y-4">
      <div className="glass-panel rounded-2xl p-5 bg-[var(--bg-card)]">
        <h3 className="text-xs font-bold font-display text-[var(--text-primary)] uppercase tracking-wide mb-3">Review before export</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div>
            <div className="text-[var(--text-muted)] font-mono uppercase text-[9px]">Customer</div>
            <div className="font-semibold text-[var(--text-primary)] truncate">{inputs.customerName || "—"}</div>
          </div>
          <div>
            <div className="text-[var(--text-muted)] font-mono uppercase text-[9px]">Capacity</div>
            <div className="font-semibold text-[var(--text-primary)]">{inputs.capacity || "—"} kW · {inputs.phase || "—"}</div>
          </div>
          <div>
            <div className="text-[var(--text-muted)] font-mono uppercase text-[9px]">Panels / Inverters</div>
            <div className="font-semibold text-[var(--text-primary)]">{numPanels} / {numInverters}</div>
          </div>
          <div>
            <div className="text-[var(--text-muted)] font-mono uppercase text-[9px]">Total Payable</div>
            <div className="font-semibold text-[var(--accent-green)]">{fmtINR(summary.final)}</div>
          </div>
        </div>
        <p className="mt-3 text-[11px] text-[var(--text-muted)] font-mono">
          {numPanels > 0 ? `${numPanels} panels · ${numInverters} inverter(s) · ${activeItems} active line items` : "Fill in required fields to generate a live BOQ"}
        </p>
      </div>

      <div className="glass-panel rounded-2xl p-4 bg-[var(--bg-card)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="text-[11px] text-[var(--text-muted)] font-mono">Export the current proposal:</div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} type="button" onClick={onDownloadExcel} className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#4eae0e] to-[#2E7D32] text-white text-xs font-bold shadow-md flex items-center justify-center gap-1.5 cursor-pointer">
            <FileSpreadsheet className="w-4 h-4" /> Download BOQ (Excel)
          </motion.button>
          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} type="button" onClick={onOpenEditor} className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-sky-500 text-white text-xs font-bold shadow-md flex items-center justify-center gap-1.5 cursor-pointer">
            <PencilLine className="w-4 h-4" /> Edit Proposal
          </motion.button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Manual verification**

Run: `npm run lint`
Expected: no new `error TS` lines beyond baseline.

- [ ] **Step 3: Commit**

```bash
git add src/modules/proposal/components/ReviewExportStep.tsx
git commit -m "feat: add ReviewExportStep component (Step 5 recap + export actions)"
```

---

## Task 5: Wire the stepper into `ProposalMaker.tsx`

**Files:**
- Modify: `src/modules/proposal/ProposalMaker.tsx`

**Interfaces:**
- Consumes: `SummaryStrip` (Task 1), `StepNav`/`CalcStep`/`CALC_STEPS` (Task 2), the step-gated `ProposalForm` (Task 3), `ReviewExportStep` (Task 4).

- [ ] **Step 1: Add imports and `currentStep` state**

In `src/modules/proposal/ProposalMaker.tsx`:

1. Add imports near the existing component imports (after the `WirePriceList` import at line 18):
```typescript
import SummaryStrip from "./components/SummaryStrip";
import StepNav, { CalcStep } from "./components/StepNav";
import ReviewExportStep from "./components/ReviewExportStep";
```
2. Add state near the other `useState`s (after `wireRefresh` at line 36): `const [currentStep, setCurrentStep] = useState<CalcStep>("customer");`

- [ ] **Step 2: Replace the calculator tab's body**

Replace the current calculator tab body (`ProposalMaker.tsx:248-273`, everything inside `{activeTab === "calculator" && (<motion.div ...>...)}`) with:

```typescript
{activeTab === "calculator" && (
  <motion.div key="calc-tab" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} className="space-y-4">
    <SummaryStrip inputs={inputs} summary={summary} numPanels={numPanels} />

    <StepNav current={currentStep} onSelect={setCurrentStep} />

    <AnimatePresence mode="wait">
      {currentStep === "customer" && (
        <motion.div key="step-customer" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
          <ProposalForm step="customer" inputs={inputs} setInputs={setInputs} meta={meta} setMeta={setMeta} catalogue={catalogue} attemptedSubmit={attemptedSubmit} onRegenerateProposalNo={() => setMeta((p) => ({ ...p, proposalNo: generateProposalNumber() }))} />
        </motion.div>
      )}
      {currentStep === "system" && (
        <motion.div key="step-system" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
          <ProposalForm step="system" inputs={inputs} setInputs={setInputs} meta={meta} setMeta={setMeta} catalogue={catalogue} attemptedSubmit={attemptedSubmit} onRegenerateProposalNo={() => setMeta((p) => ({ ...p, proposalNo: generateProposalNumber() }))} />
        </motion.div>
      )}
      {currentStep === "boq" && (
        <motion.div key="step-boq" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
          <BOQTable boq={boq} overrides={overrides} setOverrides={setOverrides} catalogue={catalogue} setCatalogue={setCatalogue} matTotal={summary.matTotal} />
        </motion.div>
      )}
      {currentStep === "pricing" && (
        <motion.div key="step-pricing" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="space-y-6">
          <PricingSummary summary={summary} inputs={inputs} catalogue={catalogue} numPanels={numPanels} />
          <FinancialAnalysis inputs={inputs} summary={summary} catalogue={catalogue} settings={financeSettings} setSettings={setFinanceSettings} />
        </motion.div>
      )}
      {currentStep === "review" && (
        <motion.div key="step-review" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
          <ReviewExportStep inputs={inputs} boq={boq} summary={summary} numPanels={numPanels} numInverters={numInverters} onDownloadExcel={handleDownloadExcel} onOpenEditor={handleOpenStandaloneEditor} />
        </motion.div>
      )}
    </AnimatePresence>
  </motion.div>
)}
```

Note this removes the old inline "Export action bar" block (formerly `ProposalMaker.tsx:258-271`) — its JSX now lives in `ReviewExportStep.tsx` (Task 4), driven by the same `handleDownloadExcel`/`handleOpenStandaloneEditor` callbacks and the same `numPanels`/`numInverters`/`boq` values, just passed as props instead of closed over inline.

- [ ] **Step 3: Manual verification**

Run: `npm run lint`
Expected: no new `error TS` lines beyond baseline (confirm via the same before/after `git stash` diffing used throughout this codebase's prior plans).

No live browser tool is available in this environment (established in prior plans in this repo) — verify by full code-reading instead: re-read the final `ProposalMaker.tsx` calculator-tab block end to end and confirm (a) every one of the 5 `currentStep` branches references only props/handlers that already exist on `ProposalMaker` (no typos, no undefined variables — `boq`, `summary`, `financeResult`, `numPanels`, `numInverters`, `overrides`, `setOverrides`, `financeSettings`, `setFinanceSettings`, `handleDownloadExcel`, `handleOpenStandaloneEditor` are all already defined earlier in this same file, per the file as it exists before this task's edit), and (b) nothing outside the calculator-tab block (the `database`/`wires` tabs, the `ProposalEditor` modal, the header/save-draft bar) was touched.

Also confirm the draft-restore flow still works with the new step state: since `currentStep` is a fresh `useState("customer")` not persisted in `saveDraft`/`loadDraft`, a restored draft will always reopen on the Customer step regardless of where the user left off — note this explicitly in your report as an accepted, minor limitation (not silently missed): persisting `currentStep` in the draft would require touching `storage.ts`'s `DraftState` shape, which is out of scope for a pure layout task and can be a one-line follow-up if it turns out to matter in practice.

- [ ] **Step 4: Commit**

```bash
git add src/modules/proposal/ProposalMaker.tsx
git commit -m "feat: wire the 5-step dashboard into the calculator tab"
```

---

## Self-review

**Spec coverage** (against the goal — "stepped dashboard replacing the long scroll, plus a persistent summary strip, without breaking existing state/export/autosave contracts"):
- 5 steps (Customer & Proposal, System Configuration, BOQ, Pricing & Subsidy, Review & Export) ✅ Tasks 2, 5.
- Persistent summary strip (capacity, panels, material cost, after-subsidy) ✅ Task 1, scoped explicitly to "shown on every step" rather than CSS-sticky (stated limitation, not a silent gap).
- State model unchanged — `inputs`/`meta`/`overrides`/`financeSettings`/`catalogue` all stay owned by `ProposalMaker.tsx` ✅ Global Constraints + Task 3's approach (gate JSX, not state).
- Existing autosave, `validate()`, and all three export paths (`handleDownloadExcel`, `handleOpenStandaloneEditor`, `handleSaveDraftNow`) untouched — confirmed no code in any task modifies them, only `ReviewExportStep` (Task 4) receives two of them as new prop-callbacks instead of using them inline. ✅
- `BOQTable`, `PricingSummary`, `FinancialAnalysis` reused with zero internal changes ✅ Task 5 (import lines unchanged, just conditionally rendered).

**Placeholder scan:** no TBD/TODO markers. Task 5's Step 3 explicitly documents the `currentStep`-not-persisted-in-drafts limitation as a stated, deliberate scope cut with a named follow-up, not a silently-dropped requirement.

**Type consistency:** `CalcStep` (Task 2, exported from `StepNav.tsx`) is the single source of truth for step IDs — Task 3's `ProposalFormProps.step` and Task 5's `currentStep` state both use it, so there's no risk of a typo'd string literal silently mismatching between files.
