import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Calculator,
  Database,
  RotateCcw,
  Save,
  FolderKanban,
  Unlink,
} from "lucide-react";
import type { StartBoqRequest } from "../projects/ProjectWorkspace";
import ProposalForm from "./components/ProposalForm";
import BoqGeneration from "./components/BoqGeneration";
import PriceDatabase, { PriceDbCategory } from "./components/PriceDatabase";
import { InverterCandidate } from "./matchInverter";
import SummaryStrip from "./components/SummaryStrip";
import StepNav, { CalcStep, STEP_LABELS, StepFooter } from "./components/StepNav";
import ReviewExportStep from "./components/ReviewExportStep";
import ProposalEditor from "./components/ProposalEditor";
import ToastStack, { ToastKind, ToastState } from "./components/Toast";
import QuickCalculator from "./components/QuickCalculator";
import { buildEngineInputs, DEFAULT_FINANCE_SETTINGS, FinanceSettings } from "./components/FinancialAnalysis";
import { calculateProposal, DEFAULT_ASSUMPTIONS, EngineAssumptions } from "./proposalEngine";
import { BOQOverrides, Catalogue, ProposalInputs, ProposalMeta, buildBlankProposalInputs } from "./types";
import { calcBOQ, computePricingSummary, generateProposalNumber, todayISO } from "./calculations";
import {
  loadCatalogueAsync,
  saveCatalogueAsync,
  resetCatalogueAsync,
  loadDraft,
  saveDraft,
  clearDraft,
  loadSystemType,
  saveSystemType,
  saveProposalData,
  saveStandaloneEditorHandoff,
  structuredCloneCat,
  saveProposalAsync,
  loadProposalAsync,
  listProposalsAsync,
  ProposalListEntry,
} from "./storage";
import { DEFAULT_CATALOGUE } from "./defaultCatalogue";
import { useAuth } from "../../contexts/AuthContext";
import { buildProposalData } from "./buildProposalData";
import { downloadProposalExcel } from "./exportExcel";
import { validateForExport } from "./exportDocx";
import "./proposal-maker.css";

let toastId = 0;

export interface ProposalNavRequest {
  view: "calculator" | "database";
  step?: CalcStep;
  db?: PriceDbCategory;
  nonce: number;
}

export default function ProposalMaker({ openRequest, navRequest, onLocationChange, hideViewTabs = false, startRequest, onOpenProject }: {
  openRequest?: { proposalNo: string; nonce: number } | null;
  /** Jump to a view/step/category from the header search. */
  navRequest?: ProposalNavRequest | null;
  /** Reports the current sub-location for the header breadcrumb. */
  onLocationChange?: (path: string[]) => void;
  /** The app shell's navigation picks calculator vs price database; hide the in-page switcher. */
  hideViewTabs?: boolean;
  /** Start a fresh BOQ pre-filled from a project's solar system (Projects module). */
  startRequest?: (StartBoqRequest & { nonce: number }) | null;
  onOpenProject?: (projectId: string) => void;
} = {}) {
  const { can } = useAuth();
  const canEditPrices = can("catalogue.update") || can("pricing.update");
  const [activeTab, setActiveTab] = useState<"calculator" | "database">("calculator");
  const [dbCategoryLabel, setDbCategoryLabel] = useState("");
  const [dbRequest, setDbRequest] = useState<{ id: PriceDbCategory; nonce: number } | null>(null);
  const [wireRefresh, setWireRefresh] = useState(0);
  const [inverterPriceRefresh, setInverterPriceRefresh] = useState(0);
  const [inverterPrices, setInverterPrices] = useState<InverterCandidate[]>([]);
  const [currentStep, setCurrentStep] = useState<CalcStep>("customer");
  const [catalogue, setCatalogue] = useState<Catalogue>(() => structuredCloneCat(DEFAULT_CATALOGUE));
  const [catalogueLoaded, setCatalogueLoaded] = useState(false);
  const [inputs, setInputs] = useState<ProposalInputs>(() => ({ ...buildBlankProposalInputs(), systemType: loadSystemType() }));
  const [meta, setMeta] = useState<ProposalMeta>(() => ({ proposalNo: "", proposalDate: todayISO() }));
  const [overrides, setOverrides] = useState<BOQOverrides>({});
  const [financeSettings, setFinanceSettings] = useState<FinanceSettings>(DEFAULT_FINANCE_SETTINGS);
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [toasts, setToasts] = useState<ToastState[]>([]);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [savedProposals, setSavedProposals] = useState<ProposalListEntry[]>([]);
  const hasHydrated = useRef(false);

  const refreshSavedProposals = () => {
    listProposalsAsync()
      .then(setSavedProposals)
      .catch(() => {
        // Best-effort — the Open picker just stays empty if the list fails.
      });
  };
  useEffect(refreshSavedProposals, []);

  // Save the current form to the shared backend as a new/updated named
  // proposal (D21) — distinct from the per-browser localStorage autosave
  // above. status "final" freezes the quote: reopening it later won't
  // recompute against future catalogue price changes.
  const handleSaveProposal = async (status: "draft" | "final") => {
    try {
      await saveProposalAsync(meta.proposalNo, meta, inputs, overrides, financeSettings, status);
      pushToast("success", status === "final" ? `Proposal ${meta.proposalNo} finalized and saved.` : `Proposal ${meta.proposalNo} saved as draft.`);
      refreshSavedProposals();
    } catch (err: any) {
      pushToast("error", err?.message || "Failed to save the proposal to the server.");
    }
  };

  const handleOpenProposal = async (proposalNo: string) => {
    if (!proposalNo) return;
    try {
      const { proposal } = await loadProposalAsync(proposalNo);
      setInputs({ ...buildBlankProposalInputs(), ...proposal.inputs, systemType: proposal.inputs.systemType || loadSystemType() });
      setMeta({
        proposalNo: proposal.proposal_no,
        proposalDate: proposal.proposal_date || todayISO(),
        projectId: proposal.project_id ?? null,
        projectSystemId: proposal.project_system_id ?? null,
        projectLabel: proposal.project_id ? "a project" : null,
      });
      setOverrides(proposal.overrides || {});
      setFinanceSettings(proposal.finance_settings || DEFAULT_FINANCE_SETTINGS);
      pushToast("info", `Loaded proposal ${proposal.proposal_no}.`);
    } catch {
      pushToast("error", "Failed to load that proposal.");
    }
  };

  // "Open this proposal" from the header search palette. The nonce makes
  // picking the same proposal twice reload it.
  useEffect(() => {
    if (!openRequest) return;
    setActiveTab("calculator");
    void handleOpenProposal(openRequest.proposalNo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openRequest?.nonce]);

  // "Start BOQ" from a project's solar system: a NEW proposal pre-filled with
  // the system's decisions, linked back to the project/system on save.
  const REPLACE_DRAFT_PROMPT = "Start a new BOQ for this system? Your current unsaved BOQ draft will be replaced (saved proposals are not affected).";
  const applyStartRequest = (req: StartBoqRequest) => {
    setInputs({ ...buildBlankProposalInputs(), systemType: loadSystemType(), ...req.inputs });
    setOverrides({});
    setFinanceSettings(DEFAULT_FINANCE_SETTINGS);
    setMeta({
      proposalNo: generateProposalNumber(),
      proposalDate: todayISO(),
      projectId: req.projectId,
      projectSystemId: req.projectSystemId,
      projectLabel: req.projectLabel,
    });
    setAttemptedSubmit(false);
    setActiveTab("calculator");
    setCurrentStep("customer");
    pushToast("info", `New BOQ started for ${req.projectLabel}.`);
  };

  // Later requests while mounted. The very first one (the request that
  // mounted this page) is handled by the hydration effect below, which is
  // the only place that knows whether a stored draft is about to be replaced.
  useEffect(() => {
    if (!startRequest || !hasHydrated.current) return;
    if (inputs.customerName.trim() && !window.confirm(REPLACE_DRAFT_PROMPT)) return;
    applyStartRequest(startRequest);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startRequest?.nonce]);

  useEffect(() => {
    if (!navRequest) return;
    // Price Database is admin-only; ignore a stale jump for employees.
    if (navRequest.view === "database" && !canEditPrices) return;
    setActiveTab(navRequest.view);
    if (navRequest.step) setCurrentStep(navRequest.step);
    if (navRequest.db) setDbRequest({ id: navRequest.db, nonce: navRequest.nonce });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navRequest?.nonce]);

  useEffect(() => {
    if (!onLocationChange) return;
    if (activeTab === "database") onLocationChange(["Price Database", dbCategoryLabel].filter(Boolean));
    else onLocationChange(["BOQ Calculator", STEP_LABELS[currentStep]]);
  }, [activeTab, currentStep, dbCategoryLabel, onLocationChange]);

  const pushToast = (kind: ToastKind, message: string) => {
    const id = ++toastId;
    setToasts((prev) => [...prev, { id, kind, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4500);
  };
  const dismissToast = (id: number) => setToasts((prev) => prev.filter((t) => t.id !== id));

  // Restore draft + assign a proposal number on first mount only — unless the
  // page was opened by "Start BOQ" on a project system, which starts fresh
  // (after confirming, if there's a real draft it would replace).
  useEffect(() => {
    const draft = loadDraft();
    if (startRequest && (!draft?.inputs.customerName?.trim() || window.confirm(REPLACE_DRAFT_PROMPT))) {
      applyStartRequest(startRequest);
    } else if (draft) {
      // Spread over a fresh blank so drafts saved before the finance fields
      // existed (financeCustomerType, connections, etc.) still hydrate cleanly.
      setInputs({ ...buildBlankProposalInputs(), ...draft.inputs, systemType: draft.inputs.systemType || loadSystemType() });
      setMeta(draft.meta);
      setOverrides(draft.overrides || {});
      setFinanceSettings(draft.financeSettings || DEFAULT_FINANCE_SETTINGS);
      pushToast("info", "Restored your last saved draft.");
    } else {
      setMeta((prev) => ({ ...prev, proposalNo: generateProposalNumber() }));
    }
    hasHydrated.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load catalogue from the shared backend on first mount.
  useEffect(() => {
    loadCatalogueAsync().then((c) => {
      setCatalogue(c);
      setCatalogueLoaded(true);
    });
  }, []);

  // Inverter prices are a separate table (inverter_prices, see
  // inverterPricesApi.ts) — loaded eagerly into memory once, then refreshed
  // after an upload, so ProposalForm's live auto-match effect can look them
  // up synchronously instead of a network round-trip per keystroke.
  useEffect(() => {
    fetch("/api/inverter-prices")
      .then((r) => r.json())
      .then((d) =>
        setInverterPrices(
          (d.rows ?? []).map((r: any) => ({ id: r.id, brand: r.brand, systemType: r.system_type, phase: r.phase, kw: r.kw, model: r.model, price: r.price, isActive: r.is_active }))
        )
      )
      .catch(() => {});
  }, [inverterPriceRefresh]);

  // Persist catalogue edits (debounced), after the initial load resolves.
  // ponytail: whole-blob last-write-wins, add updated_at precondition on PUT
  // if concurrent edits (two tabs, different fields) become a real problem.
  useEffect(() => {
    if (!catalogueLoaded) return; // don't save the placeholder back over a real backend row
    const t = setTimeout(() => {
      saveCatalogueAsync(catalogue).catch((err) => pushToast("error", "Could not save price changes: " + err.message));
    }, 900);
    return () => clearTimeout(t);
  }, [catalogue, catalogueLoaded]);

  // Autosave draft (debounced) whenever inputs/meta/overrides change, after hydration.
  useEffect(() => {
    if (!hasHydrated.current) return;
    const t = setTimeout(() => {
      saveDraft({ inputs, meta, overrides, financeSettings, savedAt: new Date().toISOString() });
      saveProposalData(inputs, meta);
      setLastSavedAt(new Date().toISOString());
    }, 900);
    return () => clearTimeout(t);
  }, [inputs, meta, overrides, financeSettings]);

  // System Type gets its own dedicated persistence key (eb_system_type) so
  // the selector's last choice survives even before any draft is saved.
  useEffect(() => {
    if (!hasHydrated.current) return;
    saveSystemType(inputs.systemType);
  }, [inputs.systemType]);

  const boq = useMemo(() => calcBOQ(inputs, catalogue, overrides), [inputs, catalogue, overrides]);
  const summary = useMemo(() => computePricingSummary(boq, inputs, catalogue), [boq, inputs, catalogue]);
  const numPanels = boq.find((i) => i.sr === 1)?.qty || 0;
  const numInverters = boq.find((i) => i.sr === 2)?.qty || 0;
  // Ticks in the step nav — the same required fields validate() checks.
  const stepsDone = {
    customer: !!inputs.customerName.trim(),
    system: inputs.capacity !== "" && !!inputs.phase && !!inputs.panelType && !!inputs.panelBrand && inputs.panelWp !== "",
  };

  const financeEngineInputs = useMemo(() => buildEngineInputs(inputs, summary, financeSettings.extraCostGstRate), [inputs, summary, financeSettings.extraCostGstRate]);
  const financeAssumptions: EngineAssumptions = useMemo(
    () => ({ ...DEFAULT_ASSUMPTIONS, gstEffectiveRate: (catalogue.charges.gst || 8.9) / 100, ...financeSettings.assumptionOverrides }),
    [catalogue.charges.gst, financeSettings.assumptionOverrides]
  );
  const financeResult = useMemo(
    () => (financeEngineInputs ? calculateProposal(financeEngineInputs, financeAssumptions, financeSettings.mode) : null),
    [financeEngineInputs, financeAssumptions, financeSettings.mode]
  );

  function validate(): boolean {
    setAttemptedSubmit(true);
    const missing: string[] = [];
    if (!inputs.customerName.trim()) missing.push("Customer Name");
    if (inputs.capacity === "") missing.push("Required Capacity");
    if (!inputs.phase) missing.push("System Phase");
    if (!inputs.panelType) missing.push("Panel Type");
    if (!inputs.panelBrand) missing.push("Panel Brand");
    if (inputs.panelWp === "") missing.push("Panel Wp");
    if (missing.length) {
      pushToast("error", `Please fill required fields: ${missing.join(", ")}`);
      setCurrentStep(!inputs.customerName.trim() ? "customer" : "system");
      return false;
    }
    return true;
  }

  function handleDownloadExcel() {
    if (!validate()) return;
    const engineCheck = validateForExport(inputs, boq, summary);
    if (!engineCheck.ok) {
      pushToast("error", `Cannot export — ${engineCheck.errors.join("; ")}`);
      return;
    }
    try {
      downloadProposalExcel(inputs, catalogue, boq, summary, meta, financeResult);
      pushToast("success", "BOQ Excel workbook downloaded.");
    } catch (err: any) {
      pushToast("error", "Error generating Excel workbook: " + (err?.message || "Unknown error"));
    }
  }

  function handleOpenStandaloneEditor() {
    if (!validate()) return;
    saveStandaloneEditorHandoff(buildProposalData(inputs, catalogue, boq, summary, meta, financeResult));
    window.open("/proposal-editor.html", "_blank", "noopener");
  }

  function handleSaveDraftNow() {
    saveDraft({ inputs, meta, overrides, financeSettings, savedAt: new Date().toISOString() });
    setLastSavedAt(new Date().toISOString());
    pushToast("success", "Draft saved to this browser.");
  }

  function handleResetProposal() {
    if (!window.confirm("Start a new proposal? This clears the current customer, BOQ overrides, and draft (the price catalogue is kept).")) return;
    setInputs({ ...buildBlankProposalInputs(), systemType: loadSystemType() });
    setOverrides({});
    setFinanceSettings(DEFAULT_FINANCE_SETTINGS);
    setMeta({ proposalNo: generateProposalNumber(), proposalDate: todayISO() });
    clearDraft();
    setAttemptedSubmit(false);
    pushToast("info", "Started a new proposal.");
  }

  function handleResetCatalogue() {
    if (!window.confirm("Reset ALL prices to factory defaults? This cannot be undone.")) return;
    resetCatalogueAsync()
      .then((fresh) => {
        setCatalogue(fresh);
        pushToast("info", "Price catalogue reset to factory defaults.");
      })
      .catch((err) => pushToast("error", "Could not reset price catalogue: " + err.message));
  }

  return (
    <div className="space-y-6">
      {/* Tab bar and draft actions share one row — the branding block that
          used to fill the left side was removed, so this reclaims that space
          instead of leaving the tabs on a line of their own. */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {hideViewTabs ? <div /> : (
        <div className="flex items-center gap-1.5 bg-[var(--hover-bg)] p-1 rounded-xl border border-[var(--border-subtle)] w-fit">
        {[
          { id: "calculator" as const, label: "BOQ Calculator", icon: Calculator },
          // Price Database is admin-only — hiding the tab is UX only, the
          // real enforcement is the requireAdmin-gated write routes in
          // server.ts (reads stay open since the calculator needs them).
          ...(canEditPrices ? [{ id: "database" as const, label: "Price Database", icon: Database }] : []),
        ].map((t) => {
          const Icon = t.icon;
          const isActive = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`relative flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold font-display transition-colors cursor-pointer ${
                isActive ? "text-[var(--accent-green)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              {isActive && (
                <motion.span
                  layoutId="proposalTabPill"
                  transition={{ type: "spring", stiffness: 400, damping: 32 }}
                  className="absolute inset-0 bg-gradient-to-br from-[var(--accent-green-light)]/15 to-[var(--bg-surface)] border border-[var(--accent-green)]/30 rounded-lg shadow-sm"
                />
              )}
              <Icon className="w-3.5 h-3.5 relative z-10" />
              <span className="relative z-10">{t.label}</span>
            </button>
          );
        })}
        </div>
        )}

        {activeTab === "calculator" && (
        <div className="flex items-center gap-2 flex-wrap">
          {lastSavedAt && <span className="text-[10px] text-[var(--text-muted)] font-mono hidden lg:inline">Draft autosaved {new Date(lastSavedAt).toLocaleTimeString()}</span>}
          <button type="button" onClick={handleSaveDraftNow} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[var(--border-strong)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)] text-xs font-semibold transition cursor-pointer">
            <Save className="w-3.5 h-3.5" /> Save Draft
          </button>
          <button type="button" onClick={handleResetProposal} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[var(--border-strong)] text-[var(--text-secondary)] hover:text-red-400 hover:border-red-900/30 text-xs font-semibold transition cursor-pointer">
            <RotateCcw className="w-3.5 h-3.5" /> New Proposal
          </button>
        </div>
        )}
      </div>

      {activeTab === "calculator" && meta.projectId && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--solar)]/40 bg-[var(--solar)]/[0.07] px-4 py-2.5 text-sm">
          <FolderKanban className="w-4 h-4 text-[var(--solar-text)] shrink-0" aria-hidden />
          <span className="min-w-0 flex-1 text-[var(--text-secondary)]">
            This BOQ belongs to <b className="text-[var(--text-primary)]">{meta.projectLabel || "a project"}</b> — saving links the proposal to it.
          </span>
          {onOpenProject && (
            <button type="button" onClick={() => onOpenProject(meta.projectId!)} className="text-xs font-medium text-[var(--solar-text)] hover:underline cursor-pointer">Open project</button>
          )}
          <button type="button" onClick={() => setMeta((m) => ({ ...m, projectId: null, projectSystemId: null, projectLabel: null }))}
            className="inline-flex items-center gap-1 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer">
            <Unlink className="w-3.5 h-3.5" /> Unlink
          </button>
        </div>
      )}

      <AnimatePresence mode="wait">
        {activeTab === "calculator" && (
          <motion.div key="calc-tab" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} className="space-y-4">
            <StepNav current={currentStep} onSelect={setCurrentStep} done={stepsDone} />

            {/* Live totals help while sizing; on the customer step they'd be all zeros,
                and the BOQ step has its own KPI cards. */}
            {(currentStep === "system" || currentStep === "review") && <SummaryStrip inputs={inputs} summary={summary} numPanels={numPanels} />}

            <ProposalForm step={currentStep} inputs={inputs} setInputs={setInputs} meta={meta} setMeta={setMeta} catalogue={catalogue} inverterPrices={inverterPrices} attemptedSubmit={attemptedSubmit} onRegenerateProposalNo={() => setMeta((p) => ({ ...p, proposalNo: generateProposalNumber() }))} />

            {(currentStep === "customer" || currentStep === "system") && <StepFooter current={currentStep} onSelect={setCurrentStep} />}

            <AnimatePresence mode="wait">
              {currentStep === "boq" && (
                <motion.div key="step-boq" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                  <BoqGeneration
                    inputs={inputs} meta={meta} boq={boq} overrides={overrides} setOverrides={setOverrides}
                    catalogue={catalogue} setCatalogue={setCatalogue} summary={summary}
                    numPanels={numPanels} numInverters={numInverters}
                    financeSettings={financeSettings} setFinanceSettings={setFinanceSettings}
                    canViewTemplates={can("boq_template.view")} canFinalize={can("proposal.finalize")}
                    onEditInputs={() => setCurrentStep("system")}
                    onSaveDraft={() => void handleSaveProposal("draft")}
                    onFinalize={() => { if (validate()) void handleSaveProposal("final"); }}
                    onOpenProject={onOpenProject}
                  />
                </motion.div>
              )}
              {currentStep === "review" && (
                <motion.div key="step-review" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                  <ReviewExportStep
                    inputs={inputs}
                    boq={boq}
                    summary={summary}
                    numPanels={numPanels}
                    numInverters={numInverters}
                    onDownloadExcel={handleDownloadExcel}
                    onOpenEditor={handleOpenStandaloneEditor}
                    savedProposals={savedProposals}
                    currentProposalNo={meta.proposalNo}
                    onSaveProposal={handleSaveProposal}
                    onOpenProposal={handleOpenProposal}
                    can={can}
                    proposalDate={meta.proposalDate}
                    onProposalDateChange={(d) => setMeta((m) => ({ ...m, proposalDate: d }))}
                    onRegenerateProposalNo={() => setMeta((m) => ({ ...m, proposalNo: generateProposalNumber() }))}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {activeTab === "database" && (
          <motion.div key="db-tab" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}>
            <PriceDatabase
              catalogue={catalogue}
              setCatalogue={setCatalogue}
              onReset={handleResetCatalogue}
              inverterPriceRefresh={inverterPriceRefresh}
              onInverterPricesImported={() => setInverterPriceRefresh((n) => n + 1)}
              wireRefresh={wireRefresh}
              onWirePricesImported={() => setWireRefresh((n) => n + 1)}
              onCategoryChange={setDbCategoryLabel}
              categoryRequest={dbRequest}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <ProposalEditor
        open={showPreview}
        onClose={() => setShowPreview(false)}
        inputs={inputs}
        meta={meta}
        catalogue={catalogue}
        boq={boq}
        summary={summary}
        financeResult={financeResult}
      />

      <ToastStack toasts={toasts} onDismiss={dismissToast} />
      <QuickCalculator />
    </div>
  );
}
