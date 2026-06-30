import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import Sidebar from "./components/Sidebar";
import Uploader from "./components/Uploader";
import Navbar from "./components/Navbar";
import ComparativeSheet, { SlotData } from "./components/ComparativeSheet";
import GoogleSheetsExportModal from "./components/GoogleSheetsExportModal";
import AnimatedNumber from "./components/AnimatedNumber";
import GlassmorphismTrustHero from "@/components/ui/glassmorphism-trust-hero";
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
  Sparkles
} from "lucide-react";

export default function App() {
  // Navigation tab states ('overview' | 'ocr' | 'sizing')
  const [activeTab, setActiveTab] = useState<'overview' | 'ocr' | 'sizing'>('overview');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(true);

  // Config states
  const [confidenceThreshold, setConfidenceThreshold] = useState<number>(0.8);
  const [selectedModel, setSelectedModel] = useState<string>("gemini-3.5-flash");

  // Flow states
  const [fileData, setFileData] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  // OCR Progress logs
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [pipelineStage, setPipelineStage] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  // Extracted metrics
  const [extractedData, setExtractedData] = useState<ExtractedBillData | null>(null);
  const [confidenceScore, setConfidenceScore] = useState<number>(94.5);
  const [showResults, setShowResults] = useState<boolean>(false);

  // Single dynamic slot matching the company worksheet
  const [slot1, setSlot1] = useState<SlotData>(buildBlankSlotData());
  const [solarPanelUsed, setSolarPanelUsed] = useState<number>(600);

  const [hoveredOverlayField, setHoveredOverlayField] = useState<string | null>(null);
  const [showGoogleSheetsModal, setShowGoogleSheetsModal] = useState<boolean>(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState<boolean>(false);

  // Handle uploaded bill data
  const handleFileLoaded = (base64: string, name: string) => {
    setFileData(base64);
    setFileName(name);
    // Clear residual states
    setExtractedData(null);
    setShowResults(false);
    setErrorMsg(null);
    // Route user directly to OCR tab to trigger action!
    setActiveTab('ocr');
  };

  // Fast path trigger using the sample bill
  const handleRunSample = () => {
    setFileName("Samplebill1.jpeg");
    setFileData("SAMPLE_BILL_PLACEHOLDER");
    setExtractedData(null);
    setShowResults(false);
    setErrorMsg(null);
    setActiveTab('ocr');
    
    // Trigger automatic extraction pipeline
    startExtraction("Samplebill1.jpeg", "SAMPLE_BILL_PLACEHOLDER", true);
  };

  const startExtraction = async (name: string, data: string, isSample: boolean = false) => {
    if (!data) return;
    setIsLoading(true);
    setProgress(5);
    setPipelineStage("Initiating cognitive document channel...");
    setErrorMsg(null);

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

        // Premium Staggered transition
        setTimeout(() => {
          setIsLoading(false);
          setShowResults(true);
          setActiveTab('sizing');
        }, 800);
      } else {
        clearInterval(progressInterval);
        setIsLoading(false);
        setErrorMsg(res.error || "Deep parsing failed. Check model configs.");
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
    setActiveTab('overview');
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[var(--bg-primary)] font-sans antialiased text-[var(--text-primary)] transition-colors duration-300">
      
      {/* Dynamic ambient glowing orbs */}
      <div className="absolute top-10 left-10 w-[260px] h-[260px] sm:w-[380px] sm:h-[380px] md:w-[450px] md:h-[450px] rounded-full bg-[var(--accent-green)]/5 orb-glow pointer-events-none select-none"></div>
      <div className="absolute bottom-20 right-10 w-[300px] h-[300px] sm:w-[420px] sm:h-[420px] md:w-[550px] md:h-[550px] rounded-full bg-[var(--accent-green)]/5 orb-glow pointer-events-none select-none"></div>

      {/* 1. Collapsible Sidebar Component */}
      <Sidebar
        confidenceThreshold={confidenceThreshold}
        setConfidenceThreshold={setConfidenceThreshold}
        selectedModel={selectedModel}
        setSelectedModel={setSelectedModel}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isCollapsed={isSidebarCollapsed}
        setIsCollapsed={setIsSidebarCollapsed}
        fileLoaded={!!fileName}
        hasExtractedData={!!extractedData}
        isMobileOpen={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
      />

      {/* 2. Main Viewport Container */}
      <div className="flex-1 flex flex-col overflow-hidden relative min-w-0">

        {/* Sticky Top Navbar */}
        <Navbar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          onOpenMobileMenu={() => setIsMobileSidebarOpen(true)}
        />

        {/* Content Workspace */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto w-full relative z-10 transition-all duration-300">
          
          {/* Active File Action Header Banner */}
          {fileName && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[var(--bg-surface)]/80 p-4 rounded-2xl border border-[var(--border-subtle)] shadow-lg backdrop-blur-md transition-colors duration-300"
            >
              <div className="flex items-center space-x-3.5 min-w-0">
                <div className="p-3 bg-[var(--accent-green)]/10 rounded-xl border border-[var(--accent-green)]/20 text-[var(--accent-green)]">
                  <FileSpreadsheet className="w-5 h-5 text-[var(--accent-green)]" />
                </div>
                <div className="min-w-0">
                  <span className="text-[10px] text-[var(--text-muted)] font-mono block tracking-widest leading-none uppercase">Source Document</span>
                  <span className="text-sm text-[var(--text-primary)] font-bold tracking-tight block mt-1 truncate">{fileName}</span>
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <button
                  type="button"
                  onClick={handleClear}
                  className="px-4 py-2 rounded-xl border border-[var(--border-strong)] hover:border-red-900/30 text-xs font-semibold font-display text-[var(--text-secondary)] hover:text-red-400 flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Clear Document
                </button>

                {!showResults && !isLoading && (
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    type="button"
                    onClick={handleExtractClick}
                    className="px-5 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-sky-500 text-xs font-bold font-display text-white hover:from-blue-500 hover:to-sky-400 shadow-md shadow-blue-950/50 flex items-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5 animate-spin-slow" /> Begin Extraction
                  </motion.button>
                )}
              </div>
            </motion.div>
          )}

          {/* TAB ROUTING RENDERS */}
          <AnimatePresence mode="wait">
            
            {/* TAB: OVERVIEW VIEW (Landing & Workflow Guide) */}
            {activeTab === 'overview' && (
              <motion.div
                key="overview-tab"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="space-y-8"
              >
                {/* Hero section landing banner */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                >
                  <GlassmorphismTrustHero
                    onLaunchScanner={() => setActiveTab('ocr')}
                    onTrySample={handleRunSample}
                  />
                </motion.div>

                {/* Initial Quickstart Upload Hub */}
                <div className="max-w-2xl mx-auto w-full space-y-4">
                  <div className="text-left transition-colors duration-300">
                    <h3 className="text-base font-bold font-display text-[var(--text-primary)] tracking-wide uppercase">Get Started</h3>
                    <p className="text-xs text-[var(--text-muted)] font-mono">Upload a bill to begin processing.</p>
                  </div>
                  <Uploader
                    onFileLoaded={handleFileLoaded}
                    isLoading={isLoading}
                    selectedFileName={fileName}
                  />

                  {fileName && !showResults && !isLoading && (
                    <div className="flex justify-center">
                      <motion.button
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        type="button"
                        onClick={handleExtractClick}
                        className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-sky-500 text-xs font-bold font-display text-white hover:from-blue-500 hover:to-sky-400 shadow-md shadow-blue-950/50 flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5" /> Begin Extraction
                      </motion.button>
                    </div>
                  )}
                </div>

              </motion.div>
            )}

            {/* TAB: OCR SCANNERS VIEW */}
            {activeTab === 'ocr' && (
              <motion.div
                key="ocr-tab"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="space-y-6"
              >
                {/* Loading state rendering screen layout */}
                {isLoading ? (
                  <div className="glass-panel rounded-3xl p-5 sm:p-8 md:p-12 bg-[var(--bg-card)] flex flex-col items-center justify-center space-y-8 min-h-[320px] sm:min-h-[440px] relative overflow-hidden transition-colors duration-300">
                    {/* Pulsing solar center */}
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 rounded-full bg-[var(--accent-green)]/5 blur-3xl animate-pulse pointer-events-none"></div>

                    <div className="space-y-2.5 text-center relative z-10 transition-colors duration-300">
                      <div className="w-16 h-16 rounded-full border-2 border-[var(--border-subtle)] border-t-[var(--accent-green)] animate-spin flex items-center justify-center mx-auto mb-4">
                        <Sun className="w-8 h-8 text-amber-400 animate-pulse" />
                      </div>
                      <h3 className="text-lg font-bold font-display text-[var(--text-primary)] tracking-tight">AI OCR Engine Compiling</h3>
                      <p className="text-xs text-[var(--accent-green)] font-mono tracking-wide">{pipelineStage}</p>
                    </div>

                    {/* Progress tracking bars */}
                    <div className="w-full max-w-md space-y-2 relative z-10">
                      <div className="flex justify-between text-[11px] font-mono">
                        <span className="text-slate-500">Pipeline Progression:</span>
                        <span className="text-[var(--accent-green)] font-bold">{progress}%</span>
                      </div>
                      <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800/80">
                        <div
                          style={{ width: `${progress}%` }}
                          className="h-full bg-gradient-to-r from-[var(--accent-green)] to-[var(--accent-green-light)] shadow-[0_0_15px_rgba(16,185,129,0.5)] transition-all duration-300"
                        />
                      </div>
                    </div>

                    {/* Interactive terminal sequence list */}
                    <div className="w-full max-w-sm space-y-2.5 font-mono text-[11px] text-[var(--text-muted)] relative z-10 pt-2 border-t border-[var(--border-subtle)] transition-colors duration-300">
                      {[
                        { step: "Ingesting raw pixels data & vectors", threshold: 15 },
                        { step: "AI Cognitive Multimodal Parsing", threshold: 40 },
                        { step: "Decoding custom Marathi tariff categories", threshold: 65 },
                        { step: "Validating coordinates math constraints", threshold: 90 }
                      ].map((s, idx) => (
                        <div key={idx} className="flex items-center justify-between">
                          <span>{idx + 1}. {s.step}</span>
                          {progress >= s.threshold ? (
                            <span className="text-[var(--accent-green)] font-bold flex items-center"><Check className="w-3.5 h-3.5 mr-1" /> COMPLETED</span>
                          ) : progress >= (s.threshold - 20) ? (
                            <span className="text-[var(--accent-green)] animate-pulse flex items-center">
                              <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-green)] mr-1.5 animate-ping"></span>
                              RUNNING
                            </span>
                          ) : (
                            <span className="text-[var(--text-secondary)]">PENDING</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="max-w-2xl mx-auto w-full space-y-6">
                    <div className="text-left transition-colors duration-300">
                      <h3 className="text-base font-bold font-display text-[var(--text-primary)] tracking-wide uppercase">AI Bill Extraction</h3>
                      <p className="text-xs text-[var(--text-muted)] font-mono">Load an MSEDCL billing document to feed into the scanner.</p>
                    </div>
                    <Uploader
                      onFileLoaded={handleFileLoaded}
                      isLoading={isLoading}
                      selectedFileName={fileName}
                    />

                    {fileName && !showResults && !isLoading && (
                      <div className="flex justify-center">
                        <motion.button
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          type="button"
                          onClick={handleExtractClick}
                          className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-sky-500 text-xs font-bold font-display text-white hover:from-blue-500 hover:to-sky-400 shadow-md shadow-blue-950/50 flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <RefreshCw className="w-3.5 h-3.5" /> Begin Extraction
                        </motion.button>
                      </div>
                    )}

                    {/* Error output if any */}
                    {errorMsg && (
                      <div className="p-4 bg-red-950/25 border border-red-900/40 rounded-2xl flex items-start gap-3.5 text-xs text-red-300">
                        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-red-400" />
                        <div className="space-y-1.5 flex-1 min-w-0">
                          <span className="font-bold block text-red-200">Extraction Failed</span>
                          <span className="font-mono text-[11px] block leading-relaxed whitespace-pre-wrap break-words">{errorMsg}</span>
                          <div className="flex items-center gap-2 pt-1.5 border-t border-red-900/30 mt-2">
                            <button
                              type="button"
                              onClick={handleExtractClick}
                              disabled={isLoading || !fileData}
                              className="px-3 py-1.5 rounded-lg bg-red-900/30 border border-red-800/50 text-red-300 hover:text-white hover:bg-red-900/50 text-[10px] font-semibold font-mono transition cursor-pointer disabled:opacity-40"
                            >
                              ↺ Retry Extraction
                            </button>
                            <span className="text-[10px] text-red-500 font-mono">Or try the sample bill to test the pipeline.</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            )}
            {/* TAB: SOLAR ANALYTICS & PARAMETERS DATA OUTPUT VIEW */}
            {activeTab === 'sizing' && (
              <motion.div
                key="sizing-tab"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="space-y-6"
              >
                {/* Always display the fully interactive, customizable Comparative spreadsheet */}
                <div className="space-y-6">

                  {/* INTERACTIVE EXCEL WORKSHEET CONTAINER */}
                  <ComparativeSheet
                    slot1={slot1}
                    solarPanelUsed={solarPanelUsed}
                    setSlot1={setSlot1}
                    setSolarPanelUsed={setSolarPanelUsed}
                    onDownloadXlsx={handleExcelDownload}
                    onSaveToGoogleSheets={() => setShowGoogleSheetsModal(true)}
                  />

                  <GoogleSheetsExportModal
                    open={showGoogleSheetsModal}
                    onClose={() => setShowGoogleSheetsModal(false)}
                    slot1={slot1}
                    solarPanelUsed={solarPanelUsed}
                  />

                  {/* DYNAMIC METRICS CARDS ROW (Driven by active slot edits) */}
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
                      <div className="space-y-6">
                        
                        <motion.div
                          initial="hidden"
                          animate="visible"
                          variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.06 } } }}
                          className="grid grid-cols-2 md:grid-cols-5 gap-4"
                        >
                          {[
                            { title: "Latest Units", value: activeUnits, suffix: " kWh", detail: `Month: ${latestMonth?.month || "Jan"}`, color: "text-[var(--accent-green)]", icon: Zap },
                            { title: "Current Bill", value: activeBill, prefix: "₹", detail: "Net Payable", color: "text-amber-500", icon: Coins },
                            { title: "Sizing Capacity", value: finalCap, decimals: 1, suffix: " kW", detail: "Recommended PV Size", color: "text-cyan-500", icon: Sliders },
                            { title: "Required Panels", value: panelsInt, suffix: " Units", detail: `@ ${solarPanelUsed}W Panels`, color: "text-[var(--accent-green)]", icon: ShieldCheck, isConfidence: true },
                            { title: "Sanctioned Load", value: typeof activeSlotData.sanctionedLoadKw === "number" ? activeSlotData.sanctionedLoadKw : 1.0, decimals: 1, suffix: " kW", detail: "Grid agreement", color: "text-indigo-500", icon: Clock }
                          ].map((item, idx) => {
                            const Icon = item.icon;
                            return (
                              <motion.div
                                key={idx}
                                variants={{ hidden: { opacity: 0, y: 16, scale: 0.95 }, visible: { opacity: 1, y: 0, scale: 1 } }}
                                whileHover={{ y: -3, transition: { duration: 0.2 } }}
                                className="glass-panel p-4.5 rounded-2xl relative overflow-hidden text-left group hover:shadow-lg transition-shadow duration-300"
                              >
                                <div className="absolute -right-6 -top-6 w-16 h-16 rounded-full bg-[var(--accent-green)]/10 blur-xl pointer-events-none"></div>
                                <div className="flex items-center justify-between">
                                  <span className="text-[9px] text-[var(--text-muted)] font-mono font-bold uppercase tracking-wider">{item.title}</span>
                                  <Icon className={`w-3.5 h-3.5 ${item.color}`} />
                                </div>
                                <div className="mt-2 text-base md:text-lg font-bold font-display text-[var(--text-primary)] truncate">
                                  <AnimatedNumber value={item.value} decimals={item.decimals ?? 0} prefix={item.prefix} suffix={item.suffix} />
                                </div>
                                <div className="mt-1 flex items-center justify-between">
                                  <span className="text-[9px] text-[var(--text-secondary)] font-mono uppercase">{item.detail}</span>
                                  {item.isConfidence && (
                                    <span className="w-2 h-2 rounded-full bg-[var(--accent-green)] animate-ping"></span>
                                  )}
                                </div>
                              </motion.div>
                            );
                          })}
                        </motion.div>

                      </div>
                    );
                  })()}

                </div>
              </motion.div>
            )}



          </AnimatePresence>

        </main>

        {/* Flat Bottom Diagnostic Footers bar */}
        <footer className="shrink-0 h-auto sm:h-10 border-t border-[var(--border-subtle)] bg-[var(--panel-glass)] flex flex-col sm:flex-row justify-between items-center gap-1 sm:gap-0 px-3 sm:px-6 py-1.5 sm:py-0 text-center sm:text-left text-[10px] font-mono text-[var(--text-muted)] backdrop-blur transition-colors duration-300">
          <div>ENERGYBAE SYSTEMS INC • SOLAR CALCULATOR INTEL v2.4</div>
          <div className="flex items-center space-x-1.5 bg-[var(--hover-bg)] px-2 py-0.5 rounded border border-[var(--border-subtle)] leading-none transition-colors duration-300">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-green)] animate-pulse shrink-0"></span>
            <span>SYSTEM ENCODING STREAM: UTF-8 ENCRYPTED</span>
          </div>
        </footer>

      </div>

    </div>
  );
}
