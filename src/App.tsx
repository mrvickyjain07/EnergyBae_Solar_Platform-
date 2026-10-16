import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import ScannerHeader from "./components/ScannerHeader";
import BillEnhancer from "./components/BillEnhancer";
import ComparativeSheet, { SlotData } from "./components/ComparativeSheet";
import GoogleSheetsExportModal from "./components/GoogleSheetsExportModal";
import AnimatedNumber from "./components/AnimatedNumber";
import OverviewDashboard from "./components/OverviewDashboard";
import ScanProgress from "./components/ScanProgress";
import BillAnalysisHero, { fadeUp, stagger } from "./components/BillAnalysisHero";
import SegmentedTabs from "./components/SegmentedTabs";
import type { CommercialMode } from "./modules/commercial/CommercialWorkspace";
import { useProposalFeed } from "./useProposalFeed";
import type { ScanStep } from "./scanSteps";

// Same hand-off points the residential progress simulation already uses.
const RESIDENTIAL_SCAN_STEPS: ScanStep[] = [
  { label: "Reading the uploaded document", start: 0 },
  { label: "Extracting bill fields with AI", start: 15 },
  { label: "Decoding the MSEDCL tariff category", start: 40 },
  { label: "Validating the extracted numbers", start: 65 },
];
import type { ExternalBillFile } from "./modules/commercial/CommercialBillAnalysis";
import { Home, Building, Factory, ChevronRight } from "lucide-react";

type BillCategory = 'home' | 'society' | 'commercial';
// Price DB categories that live on the Pricing page; the rest are Catalogue.
const PRICING_DB: ReadonlySet<PriceDbCategory> = new Set<PriceDbCategory>(["wires", "charges"]);

const BILL_CATEGORIES: { id: BillCategory; label: string; hint: string; icon: typeof Home }[] = [
  { id: 'home', label: 'Home', hint: 'Residential LT bill', icon: Home },
  { id: 'society', label: 'Society', hint: 'Housing society / common meter', icon: Building },
  { id: 'commercial', label: 'Commercial & Industrial', hint: 'LT/HT, TOD, contract demand', icon: Factory },
];
// The picker shows two cards — one per backend pipeline. Home and Society run
// the identical residential pipeline (/api/extract + worksheetModel); Society
// only sets the customer type on save, so it's a sub-switch, not a card.
const BILL_CARDS: { id: 'residential' | 'commercial'; label: string; hint: string; icon: typeof Home }[] = [
  { id: 'residential', label: 'Residential', hint: 'Home or housing society · LT bill', icon: Home },
  { id: 'commercial', label: 'Commercial & Industrial', hint: 'LT/HT, TOD, contract demand', icon: Factory },
];
import CommercialWorkspace from "./modules/commercial/CommercialWorkspace";
import ProposalMaker, { ProposalNavRequest } from "./modules/proposal/ProposalMaker";
import type { NavTarget } from "./components/CommandPalette";
import UserManagement from "./modules/auth/UserManagement";
import ProposalsPage, { ProposalsView } from "./components/ProposalsPage";
import PlannedModule, { PlannedRoute } from "./components/PlannedModule";
import RolesPage from "./components/RolesPage";
import ProjectsPage from "./modules/projects/ProjectsPage";
import ProjectWorkspace, { StartBoqRequest } from "./modules/projects/ProjectWorkspace";
import CustomersPage from "./modules/projects/CustomersPage";
import BoqTemplatesPage from "./modules/boqTemplates/BoqTemplatesPage";
import { BillSaveBar, SavedBillsPanel } from "./modules/projects/BillProjectLink";
import SocietyBatchAnalysis from "./modules/society/SocietyBatchAnalysis";
import { billCustomerType } from "./modules/projects/billAnalysisRules";
import type { BillAnalysis } from "./modules/projects/api";
import type { CommercialAnalysisResult } from "./modules/commercial/CommercialBillAnalysis";
import SettingsPage from "./components/SettingsPage";
import WorkflowMap from "./components/WorkflowMap";
import EmptyState from "./components/ui/EmptyState";
import { ROUTES, canAccess, PROPOSAL_MAKER_ROUTES, SCANNER_ROUTES, type AppRoute } from "./navigation";
import type { PriceDbCategory } from "./modules/proposal/components/PriceDatabase";
import { useAuth } from "./contexts/AuthContext";
import { buildBlankSlotData } from "./defaultData";
import { ExtractedBillData } from "./types";
import { WORKSHEET_DIVISOR } from "./worksheetModel";
import { 
  Sun, 
  Trash2, 
  AlertTriangle, 
  FileSpreadsheet, 
  RefreshCw,
  Check,
  Plus, 
  Sliders, 
  User, 
  Hash, 
  Layers, 
  Zap, 
  Coins, 
  Heart, 
  Compass, 
  Clock, 
  AlertCircle,
  HelpCircle,
  TrendingUp,
  ShieldCheck,
  FileText,
  Activity,
  Award,
  Sparkles,
  Lock
} from "lucide-react";

export default function App() {
  const { user, loading: authLoading, can, signedIn } = useAuth();

  // Current page — the IA lives in navigation.ts. 'bill-analysis' is the
  // merged Home/Society/C&I scanner; its residential state is declared in this
  // component. The commercial module and the Proposal Maker own their own
  // state and never touch it.
  // Standalone scanner: opens on Bill Analysis, and any route outside
  // SCANNER_ROUTES (e.g. "Open project" from a saved bill) stays on it.
  const [route, setRouteState] = useState<AppRoute>('bill-analysis');
  const setRoute = (r: AppRoute) => setRouteState(SCANNER_ROUTES.has(r) ? r : 'bill-analysis');
  const [proposalsView, setProposalsView] = useState<ProposalsView>('list');
  // The Proposal Maker is mounted on first visit and then kept mounted (hidden)
  // so its live BOQ draft survives moving between BOQ, Catalogue and Pricing.
  const [proposalMakerMounted, setProposalMakerMounted] = useState(false);
  // Projects: null = the list, else the open project workspace.
  const [openProjectId, setOpenProjectId] = useState<string | null>(null);
  const [boqStartRequest, setBoqStartRequest] = useState<(StartBoqRequest & { nonce: number }) | null>(null);

  // Flow states
  const [fileData, setFileData] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  // OCR Progress logs
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [pipelineStage, setPipelineStage] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // Set when the server reports both the primary and backup Gemini keys
  // failed (code: "EXTRACTION_UNAVAILABLE") — lets the user skip OCR entirely
  // and fill in the bill fields by hand in the worksheet instead of being stuck.
  const [manualEntryAvailable, setManualEntryAvailable] = useState<boolean>(false);
  
  // Extracted metrics
  const [extractedData, setExtractedData] = useState<ExtractedBillData | null>(null);
  const [confidenceScore, setConfidenceScore] = useState<number>(94.5);
  const [showResults, setShowResults] = useState<boolean>(false);

  // Single dynamic slot matching the company worksheet
  const [slot1, setSlot1] = useState<SlotData>(buildBlankSlotData());
  const [solarPanelUsed, setSolarPanelUsed] = useState<number>(600);

  const [hoveredOverlayField, setHoveredOverlayField] = useState<string | null>(null);
  const [showGoogleSheetsModal, setShowGoogleSheetsModal] = useState<boolean>(false);
  // One shared proposals read for the header bell + sidebar review badge.
  // Declared before the auth early-returns below (rules of hooks).
  const { proposals: feedProposals, refresh: refreshFeed } = useProposalFeed(!!user);
  // Set by the header search palette; ProposalMaker loads it when it changes.
  const [proposalOpenRequest, setProposalOpenRequest] = useState<{ proposalNo: string; nonce: number } | null>(null);
  // Sub-location reported by the Proposal Maker (breadcrumb), and jump
  // requests into it from the search palette.
  const [proposalLocation, setProposalLocation] = useState<string[]>([]);
  const [proposalNavRequest, setProposalNavRequest] = useState<ProposalNavRequest | null>(null);

  // Unified Bill Analysis: the user picks a category and uploads once; the
  // category decides which (still separate) backend pipeline scans it —
  // Home/Society → /api/extract (residential), Commercial & Industrial →
  // /api/commercial/extract (via CommercialWorkspace).
  const [billCategory, setBillCategory] = useState<BillCategory>('home');
  const [commercialScan, setCommercialScan] = useState<ExternalBillFile | null>(null);
  const isCommercial = billCategory === 'commercial';
  // Single bill vs several bills — one switch, one upload interface. Batch
  // only exists for Commercial & Industrial (no residential batch pipeline).
  const [commercialMode, setCommercialMode] = useState<CommercialMode>('single');
  const commercialBatchMode = isCommercial && commercialMode === 'batch';
  // Housing society, several bills (one per meter) — its own batch screen, same residential pipeline.
  const [societyMode, setSocietyMode] = useState<CommercialMode>('single');
  const societyBatchMode = billCategory === 'society' && societyMode === 'batch';
  // Bill → Project (migration 0018). A saved bill is standalone or linked to
  // a project; the target is preselected when the user came from a project's
  // "Analyze bill" or reopened a saved bill. billPhase comes from the scan
  // (the worksheet has no phase field). commercialResult is handed up by the
  // C&I module — this page saves it, never recomputes it.
  const [billTargetProjectId, setBillTargetProjectId] = useState<string | null>(null);
  const [billPhase, setBillPhase] = useState<1 | 3 | null>(null);
  const [commercialResult, setCommercialResult] = useState<CommercialAnalysisResult | null>(null);
  // Bumped on every new analysis (resets the save bar) / every save (reloads the saved list).
  const [billSession, setBillSession] = useState(0);
  const [billsVersion, setBillsVersion] = useState(0);

  // Header breadcrumb below the page title. Pages without sub-sections fall
  // back to their description inside Navbar.
  // The Proposal Maker reports ["BOQ Calculator" | "Price Database", sub...];
  // the page title already names the first level, so drop it.
  const breadcrumb: string[] =
    route === 'bill-analysis'
      ? [BILL_CATEGORIES.find((c) => c.id === billCategory)?.label ?? "", ...(isCommercial ? [commercialMode === 'batch' ? 'Several bills' : 'Single bill'] : societyBatchMode ? ['Several bills'] : [])]
      : PROPOSAL_MAKER_ROUTES.has(route)
        ? proposalLocation.slice(1)
        : route === 'proposals' && proposalsView === 'reviews'
          ? ["Review queue"]
          : [];

  const go = (next: AppRoute, db?: PriceDbCategory, step?: ProposalNavRequest["step"]) => {
    if (!SCANNER_ROUTES.has(next)) return setRoute('bill-analysis');
    if (PROPOSAL_MAKER_ROUTES.has(next)) {
      setProposalMakerMounted(true);
      setProposalNavRequest(
        next === 'boq'
          ? { view: 'calculator', step, nonce: Date.now() }
          : { view: 'database', db: db ?? (next === 'pricing' ? 'charges' : 'inverters'), nonce: Date.now() },
      );
    }
    if (next === 'proposals') setProposalsView('list');
    if (next === 'projects') setOpenProjectId(null);
    setRoute(next);
  };

  const openProject = (projectId: string) => {
    setOpenProjectId(projectId);
    setRoute('projects');
  };

  const analyzeBillForProject = (projectId: string) => {
    setBillTargetProjectId(projectId);
    setRoute('bill-analysis');
  };

  // Home/Society only — the C&I module takes no saved state back in.
  const openSavedBill = (b: BillAnalysis) => {
    if (!('slot' in b.data)) return;
    setBillCategory(b.category === 'society' ? 'society' : 'home');
    setSlot1(b.data.slot);
    setSolarPanelUsed(b.data.solarPanelUsed);
    setBillPhase(b.phase);
    setBillTargetProjectId(b.project_id);
    setBillSession((n) => n + 1);
    setErrorMsg(null);
    setIsLoading(false);
    setShowResults(true);
    setRoute('bill-analysis');
  };

  const startBoqForSystem = (req: StartBoqRequest) => {
    setBoqStartRequest({ ...req, nonce: Date.now() });
    go('boq');
  };

  const openProposal = (proposalNo: string) => {
    setProposalOpenRequest({ proposalNo, nonce: Date.now() });
    go('boq');
  };

  // Jump targets from the header search palette.
  const handleNavigate = (t: NavTarget) => {
    if (t.tab === 'ocr') {
      setBillCategory(t.category);
      if (t.mode) setCommercialMode(t.mode);
      setRoute('bill-analysis');
    } else if (t.view === 'database') {
      go(t.db && PRICING_DB.has(t.db) ? 'pricing' : 'catalogue', t.db);
    } else {
      go('boq', undefined, t.step);
    }
  };

  const handleScanBill = () => {
    if (!fileData || !fileName) return;
    if (isCommercial) {
      setCommercialResult(null);
      setBillSession((n) => n + 1);
      setCommercialScan({ data: fileData, name: fileName, nonce: Date.now() });
    }
    else startExtraction(fileName, fileData, false);
  };

  // Handle uploaded bill data
  const handleFileLoaded = (base64: string, name: string) => {
    setFileData(base64);
    setFileName(name);
    // Clear residual states
    setExtractedData(null);
    setShowResults(false);
    setErrorMsg(null);
    // Route user directly to OCR tab to trigger action!
    setRoute('bill-analysis');
  };

  // Fast path trigger using the sample bill
  const handleRunSample = () => {
    setFileName("Samplebill1.jpeg");
    setFileData("SAMPLE_BILL_PLACEHOLDER");
    setExtractedData(null);
    setShowResults(false);
    setErrorMsg(null);
    setRoute('bill-analysis');
    
    // Trigger automatic extraction pipeline
    startExtraction("Samplebill1.jpeg", "SAMPLE_BILL_PLACEHOLDER", true);
  };

  const startExtraction = async (name: string, data: string, isSample: boolean = false) => {
    if (!data) return;
    setIsLoading(true);
    setProgress(5);
    setPipelineStage("Initiating cognitive document channel...");
    setErrorMsg(null);
    setManualEntryAvailable(false);

    // Staggered pipeline steps matching Enterprise log feel
    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev < 15) {
          setPipelineStage("Ingestion: Registering raw image vector arrays...");
          return prev + 4;
        } else if (prev < 40) {
          setPipelineStage("AI Vision: Feeding multimodal buffers to the vision model...");
          return prev + 6;
        } else if (prev < 65) {
          setPipelineStage("Cognitive OCR: Parsing Marathi tariff layers and customer labels...");
          return prev + 5;
        } else if (prev < 90) {
          setPipelineStage("Verification: Executing solar load mapping constraints...");
          return prev + 3;
        } else {
          return prev;
        }
      });
    }, 120);

    try {
      const response = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileData: data,
          fileName: name,
          isSample: isSample
        })
      });

      const res = await response.json();
      clearInterval(progressInterval);

      if (res.success) {
        setProgress(100);
        setPipelineStage("Extraction completed successfully!");
        setExtractedData(res.data);
        setBillPhase(res.data?.phaseType === '3-Phase' ? 3 : res.data?.phaseType === '1-Phase' ? 1 : null);
        setBillSession((n) => n + 1);
        setConfidenceScore(res.confidenceScore || 94.5);
        
        // Construct dynamic list for comparative ledger matching Excel formulas.
        // unitCost arrives pre-computed by the server from the bill's own tariff
        // slab table (never a naive amount/units division — see tariffCalculator.ts).
        if (res.data) {
          const freshHistory = (res.data.billingHistory && res.data.billingHistory.length > 0)
            ? res.data.billingHistory.map((item: any) => ({
                month: item.month,
                units: typeof item.consumption === "number" ? item.consumption : "",
                billAmount: typeof item.amount === "number" ? item.amount : "",
                unitCost: typeof item.unitCost === "number" ? item.unitCost : ""
              }))
            : buildBlankSlotData().history; // Back up with structured calendar rows if history empty

          setSlot1({
            consumerName: res.data.consumerName || "",
            consumerNumber: res.data.consumerNumber || "",
            fixedCharges: typeof res.data.fixedCharges === "number" && res.data.fixedCharges > 0 ? res.data.fixedCharges : "",
            sanctionedLoadKw: res.data.sanctionedLoadKw || "",
            connectionType: res.data.connectionType || "",
            contractDemandKva: "",
            history: freshHistory
          });
        }

        // Premium Staggered transition — worksheet now lives on this same tab,
        // so no tab switch is needed once extraction completes.
        setTimeout(() => {
          setIsLoading(false);
          setShowResults(true);
        }, 800);
      } else {
        clearInterval(progressInterval);
        setIsLoading(false);
        setErrorMsg(res.error || "Deep parsing failed. Check model configs.");
        setManualEntryAvailable(res.code === "EXTRACTION_UNAVAILABLE");
      }
    } catch (err: any) {
      clearInterval(progressInterval);
      setIsLoading(false);
      setErrorMsg(err.message || "Server connection failed.");
    }
  };

  // Trigger manual extraction when starting on an manually uploaded file
  const handleExtractClick = () => {
    if (!fileData || !fileName) return;
    startExtraction(fileName, fileData, false);
  };

  // Trigger Excel file downloading from backend (Fidelity comparative side-by-side)
  const handleExcelDownload = async () => {
    try {
      const response = await fetch("/api/download-excel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slot1Data: slot1,
          solarPanelUsed: solarPanelUsed
        })
      });

      if (!response.ok) throw new Error("Failed to compile target excel file.");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `EnergyBae_SolarSizing_Workbook.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error("Download error", err);
      alert("Error occurred downloading generated Excel workbook: " + err.message);
    }
  };

  // Perform a manual property update in react state (auditing inputs)
  const updateExtractedField = (field: keyof ExtractedBillData, value: any) => {
    if (!extractedData) return;
    setExtractedData({
      ...extractedData,
      [field]: value
    });
  };

  // Clear loaded files
  const handleClear = () => {
    setFileData(null);
    setFileName(null);
    setExtractedData(null);
    setShowResults(false);
    setErrorMsg(null);
    setBillTargetProjectId(null);
    setBillPhase(null);
    setBillSession((n) => n + 1);
    setRoute('bill-analysis');
  };

  if (authLoading) {
    return <div className="flex h-screen w-screen items-center justify-center bg-[var(--bg-surface)]" />;
  }
  // Public scanner: no sign-in at all — everyone is the guest (AuthContext).
  if (!user) return null;

  return (
    <div className="relative flex h-screen w-screen flex-col overflow-hidden bg-[var(--bg-primary)] font-sans antialiased text-[var(--text-primary)] transition-colors duration-300">

      {/* Standalone scanner: brand + theme toggle only — no sidebar, search, notifications or account menu. */}
      <ScannerHeader />

      <div className="flex-1 overflow-y-auto relative min-w-0">

        {/* Content Workspace */}
        <main className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto w-full relative z-10 transition-all duration-300">
          
          {/* Active File Action Header Banner */}
          {fileName && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass-panel flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-5 py-4 rounded-2xl"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-lg bg-[var(--hover-bg)] flex items-center justify-center shrink-0">
                  <FileSpreadsheet className="w-5 h-5 text-[var(--text-secondary)]" />
                </div>
                <div className="min-w-0">
                  <span className="text-xs text-[var(--text-muted)] block">Source document</span>
                  <span className="text-sm text-[var(--text-primary)] font-medium block mt-0.5 truncate">{fileName}</span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleClear}
                  className="h-9 px-3.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] text-sm font-medium text-[var(--text-secondary)] hover:text-red-500 hover:bg-[var(--hover-bg)] flex items-center gap-2 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" /> Clear
                </button>

                {/* On Home & Society the upload card's own footer carries this. */}
                {!showResults && !isLoading && route !== 'bill-analysis' && (
                  <button
                    type="button"
                    onClick={handleExtractClick}
                    className="h-9 px-4 rounded-lg bg-[var(--accent-solid)] text-sm font-medium text-white hover:opacity-90 shadow-sm flex items-center gap-2 cursor-pointer"
                  >
                    <Sparkles className="w-4 h-4" /> Begin extraction
                  </button>
                )}
              </div>
            </motion.div>
          )}

          {/* TAB ROUTING RENDERS */}
          <AnimatePresence mode="wait">
            
            {/* DASHBOARD */}
            {route === 'dashboard' && (
              <motion.div
                key="dashboard"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
              >
                <OverviewDashboard
                  userName={user.name}
                  onAnalyseBill={() => setRoute('bill-analysis')}
                  onTrySample={handleRunSample}
                  onNewProposal={() => go('boq')}
                  workflow={<WorkflowMap onGo={go} />}
                />
              </motion.div>
            )}

            {/* TAB: OCR SCANNERS VIEW */}
            {route === 'bill-analysis' && (
              <motion.div
                key="ocr-tab"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="space-y-6"
              >
                {/* Hero - headline, dusk photo, jump-to-upload pill, live step card */}
                <BillAnalysisHero
                  step={(isCommercial ? !!commercialScan : showResults) ? 3 : fileName ? 2 : 1}
                  onJumpToUpload={() => document.getElementById('bill-upload')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                  // The bundled sample is a residential bill.
                  onTrySample={!isCommercial && !showResults ? handleRunSample : undefined}
                  sampleDisabled={isLoading}
                />

                {isLoading && !isCommercial ? (
                  <ScanProgress
                    title="Reading your bill"
                    steps={RESIDENTIAL_SCAN_STEPS}
                    progress={progress}
                    preview={fileData}
                    fileName={fileName}
                  />
                ) : (
                  <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-5">
                    {/* Step 1 - bill category. Decides the extraction pipeline. */}
                    <motion.div variants={fadeUp}>
                      <p className="text-sm font-semibold text-[var(--text-primary)] mb-2.5">Select bill category</p>
                      <div role="radiogroup" aria-label="Bill category" className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {BILL_CARDS.map((c) => {
                          const active = (c.id === 'commercial') === isCommercial;
                          const Icon = c.icon;
                          return (
                            <motion.button
                              key={c.id}
                              type="button"
                              role="radio"
                              aria-checked={active}
                              onClick={() => setBillCategory((prev) => (c.id === 'commercial' ? 'commercial' : prev === 'commercial' ? 'home' : prev))}
                              whileHover={{ y: -3 }}
                              whileTap={{ scale: 0.98 }}
                              transition={{ type: "spring", stiffness: 400, damping: 26 }}
                              className={`relative flex items-center gap-3.5 p-4 pr-11 rounded-2xl border text-left cursor-pointer transition-[border-color,background-color,box-shadow] duration-200 outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-green)] ${
                                active
                                  ? "border-[var(--accent-green)] bg-[var(--accent-green)]/[0.08] shadow-[0_0_0_1px_var(--accent-green),0_12px_32px_-12px_color-mix(in_srgb,var(--accent-green)_45%,transparent)]"
                                  : "border-[var(--border-subtle)] bg-[var(--bg-card)] hover:border-[var(--border-strong)]"
                              }`}
                            >
                              <span
                                aria-hidden
                                className={`absolute top-1/2 -translate-y-1/2 right-4 size-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                                  active ? "border-[var(--accent-green)] bg-[var(--accent-solid)]" : "border-[var(--border-strong)]"
                                }`}
                              >
                                {active && <motion.span layoutId="bill-cat-dot" className="size-2 rounded-full bg-white" />}
                              </span>
                              <div className={`size-11 shrink-0 rounded-xl flex items-center justify-center transition-colors ${active ? "bg-[var(--accent-solid)] text-white shadow-lg shadow-[color-mix(in_srgb,var(--accent-solid)_40%,transparent)]" : "bg-[var(--hover-bg)] text-[var(--text-secondary)]"}`}>
                                <Icon className="w-5 h-5" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-[15px] font-semibold text-[var(--text-primary)]">{c.label}</p>
                                <p className="text-sm text-[var(--text-muted)] mt-0.5">{c.hint}</p>
                              </div>
                            </motion.button>
                          );
                        })}
                      </div>
                    </motion.div>

                    {/* Residential: house vs society — same analysis, only the customer type on save differs. */}
                    {!isCommercial && (
                      <motion.div variants={fadeUp} className="flex flex-wrap items-center gap-3">
                        <SegmentedTabs<BillCategory>
                          ariaLabel="Residential type"
                          value={billCategory}
                          onChange={setBillCategory}
                          options={[
                            { value: 'home', label: 'House', icon: Home },
                            { value: 'society', label: 'Housing society', icon: Building },
                          ]}
                        />
                        {billCategory === 'society' && (
                          <SegmentedTabs<CommercialMode>
                            ariaLabel="How many society bills"
                            value={societyMode}
                            onChange={setSocietyMode}
                            options={[
                              { value: 'single', label: 'Single bill', icon: FileText },
                              { value: 'batch', label: 'Several bills', icon: Layers },
                            ]}
                          />
                        )}
                        <span className="text-xs text-[var(--text-muted)]">
                          {societyBatchMode ? 'One bill per meter — each is sized, then added up.' : 'Same analysis for a house or a housing society.'}
                        </span>
                      </motion.div>
                    )}

                    {/* Single vs several bills — the ONE switch for the upload
                        interface below (Commercial & Industrial only). */}
                    {isCommercial && (
                      <motion.div variants={fadeUp} className="flex flex-wrap items-center justify-between gap-3">
                        <SegmentedTabs<CommercialMode>
                          ariaLabel="How many bills"
                          value={commercialMode}
                          onChange={setCommercialMode}
                          options={[
                            { value: 'single', label: 'Single bill', icon: FileText },
                            { value: 'batch', label: 'Several bills', icon: Layers },
                          ]}
                        />
                        <p className="text-sm text-[var(--text-muted)]">
                          {commercialMode === 'batch' ? 'Analyse many bills together and export them onto one sheet.' : 'Scan one bill and review every extracted field.'}
                        </p>
                      </motion.div>
                    )}

                    {societyBatchMode && (
                      <motion.div variants={fadeUp}>
                        <SocietyBatchAnalysis presetProjectId={billTargetProjectId} onSaved={() => setBillsVersion((n) => n + 1)} onOpenProject={openProject} />
                      </motion.div>
                    )}

                    {/* Step 2 - the bill itself. Empty: the illustrated drop zone
                        (its own dashed card). Loaded: file row inside a card with
                        the Scan bill footer. */}
                    {/* Hidden (not unmounted) while commercial batch mode shows
                        its own multi-file upload — one upload box at a time. */}
                    <motion.div variants={fadeUp} className={`${commercialBatchMode || societyBatchMode ? "hidden" : ""} ${fileName ? "glass-panel rounded-2xl overflow-hidden" : ""}`}>
                      <div className={fileName ? "p-6 space-y-5" : "space-y-5"}>
                        <BillEnhancer
                          onFileLoaded={handleFileLoaded}
                          isLoading={isLoading}
                          selectedFileName={fileName}
                          fileSrc={fileData}
                        />

                      {/* Residential error (the commercial pipeline shows its own below) */}
                      {errorMsg && !isCommercial && (
                        <div className="p-4 rounded-xl border border-red-500/30 bg-red-500/10 flex items-start gap-3 text-sm">
                          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-red-500" />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-[var(--text-primary)]">Extraction failed</p>
                            <p className="mt-1 text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap break-words">{errorMsg}</p>
                            <div className="flex flex-wrap items-center gap-2 mt-3">
                              <button
                                type="button"
                                onClick={handleExtractClick}
                                disabled={isLoading || !fileData}
                                className="h-8 px-3 inline-flex items-center gap-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-medium cursor-pointer disabled:opacity-40"
                              >
                                <RefreshCw className="w-3.5 h-3.5" /> Retry extraction
                              </button>
                              {manualEntryAvailable ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    // The worksheet is hidden until a scan succeeds; manual
                                    // entry is the one other way to open it.
                                    setShowResults(true);
                                    setTimeout(() => document.getElementById('sizing-sheet')?.scrollIntoView({ behavior: 'smooth' }), 50);
                                  }}
                                  className="h-8 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-primary)] hover:bg-[var(--hover-bg)] text-xs font-medium cursor-pointer"
                                >
                                  Enter bill details manually
                                </button>
                              ) : (
                                <span className="text-xs text-[var(--text-muted)]">Or try the sample bill to test the pipeline.</span>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                      </div>

                      {fileName && (isCommercial || !showResults) && (
                        <div className="px-6 py-4 border-t border-[var(--border-subtle)] bg-[var(--bg-primary)] flex items-center justify-between gap-3">
                          <span className="text-xs text-[var(--text-muted)] truncate">
                            Will scan as <span className="font-medium text-[var(--text-secondary)]">{BILL_CATEGORIES.find((c) => c.id === billCategory)?.label}</span>
                          </span>
                          <button
                            type="button"
                            onClick={handleScanBill}
                            className="h-10 px-5 inline-flex items-center gap-2 rounded-lg bg-[var(--accent-solid)] text-sm font-medium text-white hover:opacity-90 shadow-sm cursor-pointer shrink-0"
                          >
                            <Sparkles className="w-4 h-4" /> Scan bill
                          </button>
                        </div>
                      )}
                    </motion.div>

                  </motion.div>
                )}
                {/* Home & Society sizing worksheet (residential categories only) */}
                {/* Only after a successful scan (or manual entry) — before that
                    the page is just category + upload. */}
                {!isLoading && !isCommercial && !societyBatchMode && showResults && (
                <div id="sizing-sheet" className="space-y-6">

                  {/* KPI row — above the worksheet it summarises (dashboard
                      convention), driven live by the worksheet's edits. */}
                  {(() => {
                    const activeSlotData = slot1;
                    const validMonths = activeSlotData.history.filter(h => typeof h.units === "number");
                    const latestMonth = validMonths.length > 0 ? validMonths[validMonths.length - 1] : activeSlotData.history[activeSlotData.history.length - 1];
                    const activeUnits = latestMonth && typeof latestMonth.units === "number" ? latestMonth.units : 0;
                    const activeBill = latestMonth && typeof latestMonth.billAmount === "number" ? latestMonth.billAmount : 0;

                    const slotUnitsList = activeSlotData.history.map(h => typeof h.units === "number" ? h.units : 0);
                    const avgSlotUnits = validMonths.length > 0 ? slotUnitsList.reduce((a, b) => a + b, 0) / validMonths.length : 0;
                    const calculatedKw = avgSlotUnits / WORKSHEET_DIVISOR;
                    const panelsInt = calculatedKw > 0 ? Math.ceil((calculatedKw * 1000) / (solarPanelUsed || 600)) : 0;
                    const finalCap = (panelsInt * (solarPanelUsed || 600)) / 1000;
                    const annualYield = finalCap * 1350; // Maharashtra Sizing parameter multiplier estimate
                    const annualSavings = Math.round(annualYield * (typeof latestMonth.unitCost === "number" && latestMonth.unitCost > 0 ? latestMonth.unitCost : 8));

                    return (
                      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
                        {[
                          { title: "Latest units", value: activeUnits, suffix: " kWh", detail: `${latestMonth?.month || "Jan"} bill`, icon: Zap },
                          { title: "Current bill", value: activeBill, prefix: "₹", detail: "Net payable", icon: Coins },
                          { title: "Recommended size", value: finalCap, decimals: 1, suffix: " kW", detail: "Rooftop PV capacity", icon: Sliders },
                          { title: "Panels required", value: panelsInt, suffix: "", detail: `${solarPanelUsed} W panels`, icon: ShieldCheck },
                          { title: "Sanctioned load", value: typeof activeSlotData.sanctionedLoadKw === "number" ? activeSlotData.sanctionedLoadKw : 1.0, decimals: 1, suffix: " kW", detail: "Grid agreement", icon: Clock },
                        ].map((item) => {
                          const Icon = item.icon;
                          return (
                            <div key={item.title} className="glass-panel rounded-2xl p-5">
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-medium text-[var(--text-secondary)]">{item.title}</span>
                                <Icon className="w-5 h-5 text-[var(--text-muted)]" aria-hidden />
                              </div>
                              <p className="mt-3 text-2xl font-semibold tracking-tight tabular-nums text-[var(--text-primary)] truncate">
                                <AnimatedNumber value={item.value} decimals={item.decimals ?? 0} prefix={item.prefix} suffix={item.suffix} />
                              </p>
                              <p className="mt-1 text-xs text-[var(--text-muted)]">{item.detail}</p>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}

                  {/* Bill → Project: save the reviewed worksheet as it stands.
                      Employees only — the public guest has no account to save to. */}
                  {signedIn && (
                  <BillSaveBar
                    key={`home-${billSession}`}
                    bill={{ category: billCategory, phase: billPhase, source_file_name: fileName, data: { slot: slot1, solarPanelUsed } }}
                    seed={{ customer: { name: slot1.consumerName, address: extractedData?.consumerAddress || null, customer_type: billCustomerType(billCategory) }, siteAddress: extractedData?.consumerAddress }}
                    presetProjectId={billTargetProjectId}
                    onSaved={(b) => { setBillTargetProjectId(b.project_id); setBillsVersion((n) => n + 1); }}
                    onOpenProject={openProject}
                  />
                  )}

                  {/* INTERACTIVE EXCEL WORKSHEET CONTAINER */}
                  <ComparativeSheet
                    slot1={slot1}
                    solarPanelUsed={solarPanelUsed}
                    setSlot1={setSlot1}
                    setSolarPanelUsed={setSolarPanelUsed}
                    onDownloadXlsx={handleExcelDownload}
                  />

                  <GoogleSheetsExportModal
                    open={showGoogleSheetsModal}
                    onClose={() => setShowGoogleSheetsModal(false)}
                    slot1={slot1}
                    solarPanelUsed={solarPanelUsed}
                  />

                </div>
                )}

                {/* Commercial & Industrial results — the independent commercial
                    module (own OCR, state, Excel/Sheets export), fed by the
                    upload card above. Kept mounted and only hidden, so
                    switching category back and forth never discards an
                    extracted commercial worksheet. */}
                {signedIn && isCommercial && commercialResult && (
                  <BillSaveBar
                    key={`ci-${commercialMode}-${billSession}`}
                    bill={{ category: 'commercial', source_file_name: commercialResult.bills ? `${commercialResult.bills.length} bills` : commercialResult.data.filename || fileName, data: commercialResult }}
                    seed={{ customer: { name: commercialResult.data.consumerName, address: commercialResult.data.address || null, customer_type: billCustomerType('commercial', commercialResult.data.category) }, siteAddress: commercialResult.data.address }}
                    presetProjectId={billTargetProjectId}
                    onSaved={(b) => { setBillTargetProjectId(b.project_id); setBillsVersion((n) => n + 1); }}
                    onOpenProject={openProject}
                  />
                )}
                <div style={{ display: isCommercial ? 'block' : 'none' }}>
                  <CommercialWorkspace externalFile={commercialScan} hideUploader mode={commercialMode} onResult={setCommercialResult} />
                </div>

                {signedIn && <SavedBillsPanel refreshKey={billsVersion} onOpenBill={openSavedBill} onOpenProject={openProject} />}
              </motion.div>
            )}

            {/* PROPOSALS — real saved quotes + admin review queue */}
            {route === 'proposals' && (
              <motion.div key="proposals" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -15 }}>
                <ProposalsPage
                  proposals={feedProposals}
                  canReview={can('proposal.approve')}
                  view={proposalsView}
                  onViewChange={setProposalsView}
                  onOpen={openProposal}
                  onNew={() => go('boq')}
                  onRetry={refreshFeed}
                />
              </motion.div>
            )}

            {route === 'projects' && can('project.view') && (
              <motion.div key={openProjectId ? `project-${openProjectId}` : "projects"} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -15 }}>
                {openProjectId ? (
                  <ProjectWorkspace projectId={openProjectId} onBack={() => setOpenProjectId(null)} onStartBoq={startBoqForSystem} onOpenProposal={openProposal} onAnalyzeBill={analyzeBillForProject} onOpenBill={openSavedBill} />
                ) : (
                  <ProjectsPage onOpen={openProject} />
                )}
              </motion.div>
            )}

            {route === 'customers' && can('customer.view') && (
              <motion.div key="customers" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -15 }}>
                <CustomersPage onOpenProject={openProject} />
              </motion.div>
            )}

            {route === 'boq-templates' && can('boq_template.view') && (
              <motion.div key="boq-templates" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -15 }}>
                <BoqTemplatesPage />
              </motion.div>
            )}

            {route === 'team' && can('user.view') && (
              <motion.div key="team" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -15 }} className="space-y-6">
                <UserManagement />
              </motion.div>
            )}

            {route === 'roles' && can('role.view') && (
              <motion.div key="roles" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -15 }}>
                <RolesPage onGo={go} />
              </motion.div>
            )}

            {route === 'settings' && (
              <motion.div key="settings" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -15 }}>
                <SettingsPage />
              </motion.div>
            )}

            {ROUTES[route].status === 'planned' && (
              <motion.div key={`planned-${route}`} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -15 }}>
                <PlannedModule route={route as PlannedRoute} onGo={go} />
              </motion.div>
            )}

            {!canAccess(route, can) && (
              <motion.div key={`denied-${route}`} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -15 }}>
                <EmptyState icons={[Lock]} title="You don't have access to this" description={`Your role doesn't include ${ROUTES[route].label}. Ask your company admin if you need it.`} />
              </motion.div>
            )}

          </AnimatePresence>

          {/* BOQ · Catalogue · Pricing — one Proposal Maker instance, kept
              mounted (hidden) after first visit so the live BOQ draft, undo
              history and loaded price lists survive switching pages. */}
          {proposalMakerMounted && (
            <div hidden={!(PROPOSAL_MAKER_ROUTES.has(route) && canAccess(route, can))} className="space-y-6">
              <ProposalMaker
                openRequest={proposalOpenRequest}
                navRequest={proposalNavRequest}
                onLocationChange={setProposalLocation}
                hideViewTabs
                startRequest={boqStartRequest}
                onOpenProject={openProject}
              />
            </div>
          )}

        </main>

      </div>

    </div>
  );
}
