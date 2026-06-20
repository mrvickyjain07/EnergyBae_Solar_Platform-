import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import Sidebar from "./components/Sidebar";
import Uploader from "./components/Uploader";
import SizingChart from "./components/SizingChart";
import Navbar from "./components/Navbar";
import ComparativeSheet, { SlotData } from "./components/ComparativeSheet";
import { defaultSlot1Data, defaultSlot2Data } from "./defaultData";
import { ExtractedBillData, ConsumerSlot } from "./types";
import { 
  Sun, 
  Trash2, 
  AlertTriangle, 
  FileSpreadsheet, 
  RefreshCw, 
  ArrowRight, 
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
  Download,
  Eye,
  Minimize2,
  Maximize2,
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
  const [slot, setSlot] = useState<ConsumerSlot>("Column D");
  
  // OCR Progress logs
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [pipelineStage, setPipelineStage] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  // Extracted metrics
  const [extractedData, setExtractedData] = useState<ExtractedBillData | null>(null);
  const [confidenceScore, setConfidenceScore] = useState<number>(94.5);
  const [showResults, setShowResults] = useState<boolean>(false);

  // Twin dynamic slots matching the company worksheet
  const [slot1, setSlot1] = useState<SlotData>(defaultSlot1Data);
  const [slot2, setSlot2] = useState<SlotData>(defaultSlot2Data);
  const [solarPanelUsed, setSolarPanelUsed] = useState<number>(600);

  // Bill Image Zooming State
  const [isZoomed, setIsZoomed] = useState<boolean>(false);
  const [hoveredOverlayField, setHoveredOverlayField] = useState<string | null>(null);

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
          setPipelineStage("AI Vision: Feeding multimodal buffers to Google Gemini model...");
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
        
        // Construct dynamic list for comparative ledger matching Excel formulas
        if (res.data) {
          const freshHistory = (res.data.billingHistory && res.data.billingHistory.length > 0)
            ? res.data.billingHistory.map((item: any) => ({
                month: item.month,
                units: item.consumption || "",
                billAmount: item.amount || "",
                unitCost: (item.amount && item.consumption) ? Number((item.amount / item.consumption).toFixed(3)) : ""
              }))
            : defaultSlot1Data.history; // Back up with structured calendar rows if history empty

          const freshSlotPayload = {
            consumerName: res.data.consumerName || "Extracted Consumer",
            consumerNumber: res.data.consumerNumber || "Unknown",
            fixedCharges: 130, // standard default
            sanctionedLoadKw: res.data.sanctionedLoadKw || 1.0,
            connectionType: res.data.phaseType === "1-Phase" ? "90/LT I Res 1-Phase" : "90/LT I Res 3-Phase",
            contractDemandKva: "",
            history: freshHistory
          };

          if (slot === "Column D") {
            setSlot1(freshSlotPayload);
          } else {
            setSlot2(freshSlotPayload);
          }
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
          slot2Data: slot2,
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
      <div className="absolute top-10 left-10 w-[450px] h-[450px] rounded-full bg-[var(--accent-green)]/5 orb-glow pointer-events-none select-none"></div>
      <div className="absolute bottom-20 right-10 w-[550px] h-[550px] rounded-full bg-[var(--accent-blue)]/5 orb-glow pointer-events-none select-none"></div>

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
      />

      {/* 2. Main Viewport Container */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        
        {/* Sticky Top Navbar */}
        <Navbar 
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          fileName={fileName}
          hasExtractedData={!!extractedData}
          onClear={handleClear}
        />

        {/* Content Workspace */}
        <main className="flex-1 overflow-y-auto p-5 md:p-8 space-y-6 max-w-7xl mx-auto w-full relative z-10 transition-all duration-300 pb-16">
          
          {/* Active File Action Header Banner */}
          {fileName && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[var(--bg-surface)]/80 p-4 rounded-2xl border border-[var(--border-subtle)] shadow-lg backdrop-blur-md transition-colors duration-300"
            >
              <div className="flex items-center space-x-3.5 min-w-0">
                <div className="p-3 bg-[var(--accent-blue)]/10 rounded-xl border border-[var(--accent-blue)]/20 text-[var(--accent-blue)]">
                  <FileSpreadsheet className="w-5 h-5 text-[var(--accent-blue)]" />
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
                    className="px-5 py-2 rounded-xl bg-gradient-to-r from-sky-600 to-sky-500 text-xs font-bold font-display text-white hover:from-sky-500 hover:to-sky-400 shadow-md shadow-sky-950/50 flex items-center gap-1.5 cursor-pointer"
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
                <div className="relative rounded-3xl p-8 md:p-10 border border-[var(--border-subtle)] overflow-hidden bg-[var(--bg-surface)] shadow-2xl backdrop-blur-xl transition-colors duration-300">
                  {/* Decorative glowing background mesh */}
                  <div className="absolute top-0 right-0 w-80 h-80 rounded-full bg-[var(--accent-blue)]/5 blur-3xl pointer-events-none"></div>
                  <div className="absolute bottom-0 left-10 w-60 h-60 rounded-full bg-[var(--accent-green)]/5 blur-2xl pointer-events-none"></div>

                  <div className="max-w-2xl space-y-4">
                    <div className="inline-flex items-center space-x-2 px-3 py-1 bg-sky-950/40 rounded-full border border-sky-500/10 text-sky-400 text-xs font-mono font-medium tracking-wide">
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                      <span>Next-Generation Energy Intelligence</span>
                    </div>

                    <h2 className="text-3xl md:text-5xl font-extrabold font-display leading-tight text-[var(--text-primary)] tracking-tight transition-colors duration-300">
                      Simplify Solar Load Sizing With <span className="text-transparent bg-clip-text bg-gradient-to-r from-[var(--accent-blue)] to-[var(--accent-green)]">Cognitive AI</span>
                    </h2>

                    <p className="text-sm md:text-base text-[var(--text-secondary)] leading-relaxed max-w-xl transition-colors duration-300">
                      EnergyBae programmatically extracts raw high-contrast consumer bills, conducts micro-tariff audits, and compiles precision relational Excel workbook sheets instantly.
                    </p>

                    <div className="pt-4 flex flex-wrap items-center gap-4">
                      <button
                        onClick={() => setActiveTab('ocr')}
                        className="px-6 py-3 rounded-2xl bg-gradient-to-r from-sky-600 to-emerald-600 text-xs font-bold font-display text-white shadow-xl shadow-sky-950/40 hover:scale-[1.01] transition-transform flex items-center gap-2 cursor-pointer"
                      >
                        Launch AI OCR Scanner <ArrowRight className="w-4 h-4" />
                      </button>
                      <button
                        onClick={handleRunSample}
                        className="px-5 py-3 rounded-2xl border border-[var(--border-strong)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)] transition text-xs font-semibold font-display cursor-pointer"
                      >
                        Try with Sample Bill
                      </button>
                    </div>
                  </div>
                </div>

                {/* Workflow Roadmap steps design */}
                <div className="space-y-4">
                  <div className="text-center md:text-left transition-colors duration-300">
                    <h3 className="text-base font-extrabold font-display text-[var(--text-primary)] tracking-wide uppercase">Interactive Workflow Checklist</h3>
                    <p className="text-xs text-[var(--text-muted)]">Fast, streamlined sequence calculated to deliver robust results.</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    {[
                      { step: "01", title: "Ingest Bill", desc: "Upload high-contrast PDF scans or camera images of MSEDCL billing.", icon: FileSpreadsheet, color: "text-sky-400 bg-sky-900/15 border-sky-500/20" },
                      { step: "02", title: "Vision Scan", desc: "Multimodal models extract customer parameters & billing history.", icon: Eye, color: "text-violet-400 bg-violet-900/15 border-violet-500/20" },
                      { step: "03", title: "Custom Sizing", desc: "View auto-proposed solar PV capacity matched against grid offsets.", icon: Sun, color: "text-amber-400 bg-amber-900/15 border-amber-500/20" },
                      { step: "04", title: "Export Data", desc: "Download high-fidelity Excel sheets directly to active template slots.", icon: Download, color: "text-emerald-400 bg-emerald-900/15 border-emerald-500/20" }
                    ].map((item, id) => {
                      const Icon = item.icon;
                      return (
                        <div key={id} className="glass-panel p-6 rounded-2xl border-[var(--border-subtle)] leading-relaxed text-left flex flex-col justify-between aspect-[4/3] group hover:border-[var(--border-strong)] transition-all duration-300">
                          <div className="flex items-center justify-between">
                            <span className="text-lg font-mono font-bold text-[var(--text-secondary)]">{item.step}</span>
                            <div className={`p-2 rounded-xl border ${item.color}`}>
                              <Icon className="w-4 h-4" />
                            </div>
                          </div>
                          <div>
                            <h4 className="text-sm font-bold font-display text-[var(--text-primary)] mt-2">{item.title}</h4>
                            <p className="text-[11px] text-[var(--text-muted)] mt-1 lines-clamp-3 leading-normal">{item.desc}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Initial Quickstart Upload Hub */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                  <div className="space-y-4">
                    <div className="text-left transition-colors duration-300">
                      <h3 className="text-base font-bold font-display text-[var(--text-primary)] tracking-wide uppercase">Get Started</h3>
                      <p className="text-xs text-[var(--text-muted)] font-mono">Upload a bill to begin processing.</p>
                    </div>
                    <Uploader 
                      onFileLoaded={handleFileLoaded}
                      onRunSample={handleRunSample}
                      isLoading={isLoading}
                      selectedFileName={fileName}
                    />
                  </div>

                  {/* Aesthetic visual features card */}
                  <div className="glass-panel rounded-3xl p-6 bg-[var(--bg-card)] flex flex-col justify-between text-left h-full md:min-h-[350px] transition-colors duration-300">
                    <div className="space-y-4">
                      <div className="inline-flex items-center px-2.5 py-1 bg-[var(--accent-green)]/10 text-[var(--accent-green)] border border-[var(--accent-green)]/20 text-[10px] font-mono rounded transition-colors duration-300">
                        COMPLIANCE ASSURED
                      </div>
                      <h4 className="text-lg font-bold font-display text-[var(--text-primary)] leading-tight">Maharashtra State Solar Grid Sizing Matrix</h4>
                      <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                        The recommendation engine aligns with high-tech rules mapping. Built specifically for MSEDCL single-phase and multi-phase LT consumer guidelines, ensuring your proposals are 100% realistic and accurate.
                      </p>
                      
                      <div className="space-y-2 pt-2 border-t border-[var(--border-subtle)] text-[11px] text-[var(--text-secondary)] font-mono transition-colors duration-300">
                        <div className="flex items-center justify-between">
                          <span>Slab Rate Estimation:</span>
                          <span className="text-[var(--text-primary)]">LT-I Residential Gird</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Solar Peak Insolation:</span>
                          <span className="text-[var(--text-primary)]">Maharashtra (4.8 hrs/day)</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Estimated Solar Yield:</span>
                          <span className="text-[var(--accent-green)] font-semibold font-sans">~1350 kWh/kWp Yr</span>
                        </div>
                      </div>
                    </div>

                    <div className="pt-6 text-[10px] text-[var(--text-muted)] font-mono flex items-center justify-between transition-colors duration-300">
                      <span>SECURE LOGIC COMPILER</span>
                      <span>ACTIVE v2.4</span>
                    </div>
                  </div>
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
                  <div className="glass-panel rounded-3xl p-8 md:p-12 bg-[var(--bg-card)] flex flex-col items-center justify-center space-y-8 min-h-[440px] relative overflow-hidden transition-colors duration-300">
                    {/* Pulsing solar center */}
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 rounded-full bg-[var(--accent-blue)]/5 blur-3xl animate-pulse pointer-events-none"></div>

                    <div className="space-y-2.5 text-center relative z-10 transition-colors duration-300">
                      <div className="w-16 h-16 rounded-full border-2 border-[var(--border-subtle)] border-t-[var(--accent-blue)] animate-spin flex items-center justify-center mx-auto mb-4">
                        <Sun className="w-8 h-8 text-amber-400 animate-pulse" />
                      </div>
                      <h3 className="text-lg font-bold font-display text-[var(--text-primary)] tracking-tight">AI OCR Engine Compiling</h3>
                      <p className="text-xs text-[var(--accent-blue)] font-mono tracking-wide">{pipelineStage}</p>
                    </div>

                    {/* Progress tracking bars */}
                    <div className="w-full max-w-md space-y-2 relative z-10">
                      <div className="flex justify-between text-[11px] font-mono">
                        <span className="text-slate-500">Pipeline Progression:</span>
                        <span className="text-sky-400 font-bold">{progress}%</span>
                      </div>
                      <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800/80">
                        <div 
                          style={{ width: `${progress}%` }}
                          className="h-full bg-gradient-to-r from-sky-500 to-emerald-400 shadow-[0_0_15px_rgba(14,165,233,0.5)] transition-all duration-300"
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
                            <span className="text-[var(--accent-blue)] animate-pulse flex items-center">
                              <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-blue)] mr-1.5 animate-ping"></span>
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
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                    {/* Left Column: Upload box parameters */}
                    <div className="space-y-6">
                      <div className="text-left transition-colors duration-300">
                        <h3 className="text-base font-bold font-display text-[var(--text-primary)] tracking-wide uppercase">AI Bill Extraction</h3>
                        <p className="text-xs text-[var(--text-muted)] font-mono">Load an MSEDCL billing document to feed into the scanner.</p>
                      </div>
                      <Uploader 
                        onFileLoaded={handleFileLoaded}
                        onRunSample={handleRunSample}
                        isLoading={isLoading}
                        selectedFileName={fileName}
                      />

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

                    {/* Right Column: Visual utility bill mockup scanner display */}
                    <div className="glass-panel rounded-3xl p-6 bg-[var(--bg-card)] flex flex-col justify-between items-center relative overflow-hidden min-h-[380px] group select-none transition-colors duration-300">
                      <div className="absolute top-2 left-6 text-[9px] text-[var(--text-muted)] font-mono tracking-wider lowercase transition-colors duration-300">MSEDCL_RECEIPT_SCANNER_FRAME</div>
                      
                      {/* Stylized bill scanner representation */}
                      <div className="w-full max-w-[310px] aspect-[3/4] bg-[var(--hover-bg)] rounded-xl p-4.5 border border-[var(--border-strong)] overflow-hidden text-[10px] flex flex-col justify-between font-mono leading-tight shadow-2xl relative mt-4 transition-colors duration-300">
                        
                        {/* Target reticle scan lines */}
                        <div className="absolute inset-x-0 h-[1.5px] bg-gradient-to-r from-transparent via-[var(--accent-blue)] to-transparent top-1/4 shadow-[0_0_8px_rgba(56,189,248,0.7)] pointer-events-none animate-bounce"></div>

                        {/* High-contrast header */}
                        <div className="border-b border-[var(--border-subtle)] pb-2 flex items-center justify-between text-[var(--text-primary)] transition-colors duration-300">
                          <div>
                            <h4 className="font-bold text-xs">MSEDCL / महावितरण</h4>
                            <p className="text-[7px] text-[var(--text-muted)] mt-0.5 lowercase font-mono">bill_ocr_payload_matrix</p>
                          </div>
                          <div className="w-5 h-5 bg-[var(--accent-blue)]/10 text-[var(--accent-blue)] rounded border border-[var(--accent-blue)]/30 flex items-center justify-center text-[9px] font-bold">M</div>
                        </div>

                        {/* Content lines */}
                        <div className="my-3 space-y-2.5 flex-1 text-[9px] text-[var(--text-secondary)] relative transition-colors duration-300">
                          <div className="flex justify-between border-b border-[var(--border-subtle)] pb-1">
                            <span className="text-[var(--text-muted)]">Consumer No:</span>
                            <span className="font-bold text-[var(--text-primary)]">082050016140</span>
                          </div>
                          <div className="flex justify-between border-b border-[var(--border-subtle)] pb-1">
                            <span className="text-[var(--text-muted)]">Consumer Name:</span>
                            <span className="font-bold text-[var(--text-primary)] truncate max-w-[130px]">R. M. KHOBRAGADE</span>
                          </div>
                          <div className="flex justify-between border-b border-[var(--border-subtle)] pb-1">
                            <span className="text-[var(--text-muted)]">Sanctioned Load:</span>
                            <span className="font-bold text-[var(--text-primary)]">1.00 KW</span>
                          </div>
                          <div className="flex justify-between border-b border-[var(--border-subtle)] pb-1">
                            <span className="text-[var(--text-muted)]">Service Meter No:</span>
                            <span className="font-bold text-[var(--text-primary)]">439222232375</span>
                          </div>

                          {/* Historical cycle layout */}
                          <div className="pt-2 text-[8px] text-[var(--text-muted)] uppercase tracking-wider block">
                            Historical Readings Array [12M]
                          </div>
                        </div>

                        <div className="flex items-center justify-between border-t border-[var(--border-subtle)] pt-2 text-[8px] text-[var(--text-muted)] transition-colors duration-300">
                          <span>MSEDCL SECURE_BU_4612</span>
                          <span className="text-[var(--accent-green)] font-bold">READY TO MAP</span>
                        </div>
                      </div>

                      <div className="text-center space-y-1 z-10 mt-4 transition-colors duration-300">
                        <p className="text-xs text-[var(--text-primary)] font-semibold font-display">Targeted Coordinates Scanning Reticles</p>
                        <p className="text-[11px] text-[var(--text-secondary)] max-w-[280px]">
                          Cognitive vision maps layout coordinates instantly, converting analog terms to relational fields with extreme precision.
                        </p>
                      </div>
                    </div>
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
                  
                  {/* Active Destination Excel Slot Choice Bar */}
                  <div className="glass-panel p-5 rounded-2xl border-[var(--accent-green)]/10 bg-[var(--accent-green)]/5 flex flex-col md:flex-row shadow-[0_0_20px_rgba(16,185,129,0.05)] md:items-center justify-between gap-6 hover:border-[var(--accent-green)]/20 transition-all duration-300">
                    <div className="text-left">
                      <h3 className="text-xs font-bold font-display text-[var(--accent-green)] uppercase tracking-wider flex items-center gap-1.5 leading-none">
                        <FileSpreadsheet className="w-4 h-4 text-[var(--accent-green)]" /> ACTIVE TARGET DESTINATION EXCEL SHEET SLOT
                      </h3>
                      <p className="text-[11px] text-[var(--text-secondary)] mt-1 max-w-xl leading-normal">
                        Select which grid column details are target mapped when uploading or scanning bills. Slot 1 writes into Column D (Madhusham), and Slot 2 writes into Column H (Ranjana).
                      </p>
                    </div>

                    {/* Radios Choice */}
                    <div className="flex items-center space-x-3 shrink-0">
                      <button
                        type="button"
                        onClick={() => setSlot("Column D")}
                        className={`px-4 py-2.5 rounded-xl border font-bold font-display text-xs transition-all cursor-pointer ${
                          slot === "Column D" 
                            ? "bg-[var(--bg-surface)] border-[var(--accent-blue)] text-[var(--accent-blue)] shadow-[0_0_12px_rgba(14,165,233,0.15)]" 
                            : "bg-[var(--hover-bg)] border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                        }`}
                      >
                        Slot 1 (Column D)
                      </button>
                      <button
                        type="button"
                        onClick={() => setSlot("Column H")}
                        className={`px-4 py-2.5 rounded-xl border font-bold font-display text-xs transition-all cursor-pointer ${
                          slot === "Column H" 
                            ? "bg-[var(--bg-surface)] border-[var(--accent-green)] text-[var(--accent-green)] shadow-[0_0_12px_rgba(16,185,129,0.15)]" 
                            : "bg-[var(--hover-bg)] border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                        }`}
                      >
                        Slot 2 (Column H)
                      </button>
                    </div>
                  </div>

                  {/* INTERACTIVE EXCEL WORKSHEET CONTAINER */}
                  <ComparativeSheet
                    slot1={slot1}
                    slot2={slot2}
                    solarPanelUsed={solarPanelUsed}
                    setSlot1={setSlot1}
                    setSlot2={setSlot2}
                    setSolarPanelUsed={setSolarPanelUsed}
                    onDownloadXlsx={handleExcelDownload}
                  />

                  {/* DYNAMIC METRICS CARDS ROW (Driven by active slot edits) */}
                  {(() => {
                    const activeSlotData = slot === "Column D" ? slot1 : slot2;
                    const latestMonth = activeSlotData.history.find(h => typeof h.units === "number") || activeSlotData.history[activeSlotData.history.length - 1];
                    const activeUnits = latestMonth && typeof latestMonth.units === "number" ? latestMonth.units : 0;
                    const activeBill = latestMonth && typeof latestMonth.billAmount === "number" ? latestMonth.billAmount : 0;
                    
                    const slotUnitsList = activeSlotData.history.map(h => typeof h.units === "number" ? h.units : 0);
                    const avgSlotUnits = slotUnitsList.reduce((a, b) => a + b, 0) / Math.max(1, activeSlotData.history.length);
                    const calculatedKw = avgSlotUnits / 106.060606;
                    const panelsInt = Math.ceil((calculatedKw * 1000) / (solarPanelUsed || 600));
                    const finalCap = (panelsInt * (solarPanelUsed || 600)) / 1000;
                    const annualYield = finalCap * 1350; // Maharashtra Sizing parameter multiplier estimate
                    const annualSavings = Math.round(annualYield * (typeof latestMonth.unitCost === "number" ? latestMonth.unitCost : 8));

                    return (
                      <div className="space-y-6">
                        
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                          {[
                            { title: `${slot === "Column D" ? "Slot 1" : "Slot 2"} Units`, val: `${activeUnits} kWh`, detail: `Month: ${latestMonth?.month || "Jan"}`, color: "text-[var(--accent-blue)]", icon: Zap },
                            { title: "Current Bill", val: activeBill > 0 ? `₹${activeBill.toLocaleString()}` : "₹0", detail: "Net Payable", color: "text-amber-500", icon: Coins },
                            { title: "Sizing Capacity", val: `${finalCap.toFixed(1)} kW`, detail: "Recommended PV Size", color: "text-indigo-500", icon: Sliders },
                            { title: "Required Panels", val: `${panelsInt} Units`, detail: `@ ${solarPanelUsed}W Panels`, color: "text-[var(--accent-green)]", icon: ShieldCheck, isConfidence: true },
                            { title: "Sanctioned Load", val: activeSlotData.sanctionedLoadKw ? `${activeSlotData.sanctionedLoadKw} kW` : "1.0 kW", detail: "Grid agreement", color: "text-violet-500", icon: Clock }
                          ].map((item, idx) => {
                            const Icon = item.icon;
                            return (
                              <div key={idx} className="glass-panel p-4.5 rounded-2xl relative overflow-hidden text-left group hover:scale-[1.01] transition-all duration-300">
                                <div className="absolute -right-6 -top-6 w-16 h-16 rounded-full bg-[var(--accent-blue)]/10 blur-xl pointer-events-none"></div>
                                <div className="flex items-center justify-between">
                                  <span className="text-[9px] text-[var(--text-muted)] font-mono font-bold uppercase tracking-wider">{item.title}</span>
                                  <Icon className={`w-3.5 h-3.5 ${item.color}`} />
                                </div>
                                <div className="mt-2 text-base md:text-lg font-bold font-display text-[var(--text-primary)] truncate">{item.val}</div>
                                <div className="mt-1 flex items-center justify-between">
                                  <span className="text-[9px] text-[var(--text-secondary)] font-mono uppercase">{item.detail}</span>
                                  {item.isConfidence && (
                                    <span className="w-2 h-2 rounded-full bg-[var(--accent-green)] animate-ping"></span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Interactive targeted visual reticle overlays if data exists */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                          
                          {/* Sizing description overview */}
                          <div className="lg:col-span-2 glass-panel rounded-2xl p-6 text-left space-y-4 transition-colors duration-300">
                            <h3 className="text-xs font-bold font-display text-[var(--text-primary)] uppercase tracking-wider flex items-center gap-1.5 border-b border-[var(--border-subtle)] pb-3">
                              <Sparkles className="w-4 h-4 text-[var(--accent-blue)]" /> SIZING METRIC INSIGHTS
                            </h3>
                            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                              This billing ledger allows you to conduct comparative grid analysis to configure either residential solar setup or combined high-output solar plants. Our automated calculator maintains proper <b>Maharashtra MSEDCL</b> standards. Adding units increases the <i>kW demand load</i>, calculating additional panels dynamically.
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-mono">
                              <div className="p-3.5 bg-[var(--hover-bg)] border border-[var(--border-subtle)] rounded-xl space-y-1">
                                <span className="text-[var(--text-muted)] uppercase text-[9px] block">EST. SOLAR GENERATION OFFSET:</span>
                                <span className="text-[var(--accent-blue)] font-bold font-sans text-sm">+{annualYield.toLocaleString()} kWh / Year</span>
                              </div>
                              <div className="p-3.5 bg-[var(--hover-bg)] border border-[var(--border-subtle)] rounded-xl space-y-1">
                                <span className="text-[var(--text-muted)] uppercase text-[9px] block">FINANCIAL OUTFLOW SAVINGS:</span>
                                <span className="text-[var(--accent-green)] font-bold font-sans text-sm">₹{annualSavings.toLocaleString()} / Year</span>
                              </div>
                            </div>
                          </div>

                          {/* OCR reticle review panel */}
                          <div className="glass-panel p-4 rounded-2xl text-[var(--text-secondary)] space-y-3 overflow-hidden text-xs text-left transition-colors duration-300">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] text-[var(--text-muted)] font-mono uppercase tracking-wider flex items-center gap-1">
                                <Eye className="w-3.5 h-3.5 text-[var(--accent-blue)]" /> Cognitive RETICLES PREVIEW
                              </span>
                              <button 
                                onClick={() => setIsZoomed(!isZoomed)}
                                className="text-[var(--accent-blue)] hover:text-[var(--text-primary)] transition flex items-center gap-1 bg-[var(--accent-blue)]/10 border border-[var(--accent-blue)]/20 px-2 py-0.5 rounded cursor-pointer"
                              >
                                {isZoomed ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
                                <span className="text-[8px] font-mono uppercase">ZOOM</span>
                              </button>
                            </div>

                            {/* Bounding vision overlay */}
                            <div className={`relative bg-[var(--hover-bg)] rounded-xl overflow-hidden cursor-crosshair border border-[var(--border-subtle)] flex items-center justify-center transition-all duration-300 ${isZoomed ? "h-[360px]" : "h-[190px]"}`}>
                              <div className="absolute inset-0 pointer-events-none">
                                <div className="absolute border border-dashed border-[var(--accent-blue)] bg-[var(--accent-blue)]/5 top-[25%] left-[24%] right-[24%] h-[12%] rounded animate-pulse" />
                                <div className="absolute border border-dashed border-[var(--accent-green)] bg-[var(--accent-green)]/5 top-[44%] left-[24%] right-[44%] h-[12%] rounded" />
                                <div className="absolute border border-dashed border-violet-500 bg-violet-500/5 top-[63%] left-[10%] right-[34%] h-[12%] rounded" />
                              </div>

                              {fileData && fileData !== "SAMPLE_BILL_PLACEHOLDER" ? (
                                <img 
                                  src={fileData} 
                                  referrerPolicy="no-referrer"
                                  alt="Utility bill loaded scan" 
                                  className="w-full h-full object-contain"
                                />
                              ) : (
                                <div className="w-full h-full bg-[var(--bg-surface)] p-4 relative overflow-hidden flex flex-col justify-between font-mono text-[8px] text-[var(--text-secondary)] leading-tight transition-colors duration-300">
                                  <div className="border-b border-[var(--border-subtle)] pb-1.5 flex justify-between text-[var(--text-primary)]">
                                    <span>MSEDCL SCANNER PAYLOAD VIEW</span>
                                    <span className="text-[var(--accent-blue)] animate-pulse">{activeSlotData.consumerNumber}</span>
                                  </div>
                                  <div className="space-y-1 px-1">
                                    <div>Name: <span className="text-[var(--text-primary)] font-bold">{activeSlotData.consumerName}</span></div>
                                    <div>Class: <span className="text-[var(--text-primary)]">{activeSlotData.connectionType}</span></div>
                                    <div>Sanc. Load: <span className="text-[var(--accent-green)] font-bold">{activeSlotData.sanctionedLoadKw} kW</span></div>
                                    <div>Fixed Charge: <span className="text-[var(--text-primary)]">₹{activeSlotData.fixedCharges}</span></div>
                                  </div>
                                  <div className="border-t border-[var(--border-subtle)] pt-1 flex justify-between text-[7px]">
                                    <span>PEAK MONS: MARCH - MAY</span>
                                    <span className="text-[var(--accent-green)]">ACTIVE: {slot}</span>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>

                        </div>

                        {/* Sizing offload bar charts */}
                        <SizingChart 
                          history={activeSlotData.history.map(item => ({
                            month: item.month,
                            consumption: typeof item.units === "number" ? item.units : 0,
                            amount: typeof item.billAmount === "number" ? item.billAmount : 0
                          }))}
                          solarSizeKw={finalCap}
                        />

                      </div>
                    );
                  })()}

                </div>
              </motion.div>
            )}



          </AnimatePresence>

        </main>

        {/* Flat Bottom Diagnostic Footers bar */}
        <footer className="absolute bottom-0 left-0 right-0 h-10 border-t border-[var(--border-subtle)] bg-[var(--panel-glass)] flex justify-between items-center px-6 text-[10px] font-mono text-[var(--text-muted)] backdrop-blur transition-colors duration-300">
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
