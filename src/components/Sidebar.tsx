import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Sun, 
  HelpCircle, 
  CheckCircle, 
  AlertCircle, 
  Mail, 
  Phone, 
  Globe, 
  MapPin, 
  Cpu, 
  Settings as SettingsIcon, 
  ChevronDown, 
  ChevronUp, 
  Zap,
  BookOpen,
  LayoutDashboard,
  FileScan,
  TrendingUp,
  Sliders,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Layers,
  Heart
} from "lucide-react";

interface SidebarProps {
  confidenceThreshold: number;
  setConfidenceThreshold: (val: number) => void;
  selectedModel: string;
  setSelectedModel: (model: string) => void;
  activeTab: 'overview' | 'ocr' | 'sizing';
  setActiveTab: (tab: 'overview' | 'ocr' | 'sizing') => void;
  isCollapsed: boolean;
  setIsCollapsed: (val: boolean) => void;
  fileLoaded: boolean;
  hasExtractedData: boolean;
}

export default function Sidebar({
  confidenceThreshold,
  setConfidenceThreshold,
  selectedModel,
  setSelectedModel,
  activeTab,
  setActiveTab,
  isCollapsed,
  setIsCollapsed,
  fileLoaded,
  hasExtractedData
}: SidebarProps) {
  const [apiStatus, setApiStatus] = useState<{
    geminiConfigured: boolean;
    environmentMode: string;
    ocrEngine: string;
  } | null>(null);

  const [expandedSection, setExpandedSection] = useState<{
    about: boolean;
  }>({
    about: false,
  });

  // Fetch real server statuses on load
  useEffect(() => {
    fetch("/api/status")
      .then(r => r.json())
      .then(res => setApiStatus(res))
      .catch(err => {
        console.error("Failed to fetch server status metrics", err);
        setApiStatus({
          geminiConfigured: false,
          environmentMode: "development",
          ocrEngine: "Gemini Vision Multimodal (Disconnected)"
        });
      });
  }, []);

  const navItems = [
    { id: 'overview', name: 'Overview', icon: LayoutDashboard, badge: hasExtractedData ? "Live" : null, badgeColor: "bg-emerald-500/20 text-emerald-400" },
    { id: 'ocr', name: 'AI OCR Scanner', icon: FileScan, badge: fileLoaded ? "Loaded" : null, badgeColor: "bg-sky-500/20 text-sky-400" },
    { id: 'sizing', name: 'Solar Analytics', icon: TrendingUp, badge: hasExtractedData ? "Calculated" : null, badgeColor: "bg-amber-500/10 text-amber-400" }
  ] as const;

  return (
    <motion.aside 
      animate={{ width: isCollapsed ? "76px" : "320px" }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="border-r border-slate-800/60 bg-slate-950/80 flex flex-col h-screen shrink-0 text-slate-300 relative select-none backdrop-blur-xl z-30 overflow-hidden"
    >
      {/* Glow highlight in side pane */}
      <div className="absolute top-0 left-0 w-32 h-32 rounded-full bg-sky-500/5 blur-2xl pointer-events-none"></div>

      {/* 1. Header Branded Area */}
      <div className="p-4 border-b border-slate-800/40 flex flex-col items-center bg-slate-950/20 relative">
        <AnimatePresence mode="wait">
          {!isCollapsed ? (
            <motion.div 
              key="expanded"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="w-full flex flex-col items-center"
            >
              <div className="bg-white p-3.5 rounded-2xl shadow-xl shadow-black/40 border border-slate-700 flex flex-col items-center justify-center w-full max-w-[170px] aspect-[4/3] group hover:scale-[1.01] transition-all duration-300">
                <svg className="w-16 h-16" viewBox="0 0 130 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                  {/* Blue '3' */}
                  <path d="M 64 10 L 25 10 C 20 10, 15 11, 11 15 C 9 18, 10 23, 13 25 C 15 27, 17 25, 17 23 C 17 19, 21 18, 28 18 C 36 18, 44 23, 45 30 C 46 36, 42 40, 36 43 C 44 43, 49 43, 49 50 C 49 57, 44 57, 36 57 C 26 57, 21 59, 16 63 C 11 68, 10 74, 11 77 C 11 80, 14 85, 18 85 L 25 86 C 20 86, 15 85, 11 81 C 15 85, 20 86, 25 86 L 64 86 Z" fill="#044d90" />
                  {/* Leaf */}
                  <path d="M 45 48 C 37 43, 24 44, 19 48 C 26 53, 39 52, 45 48 Z" fill="#59c218" />
                  <path d="M 19 48 Q 32 47 45 47" stroke="#ffffff" strokeWidth="0.8" opacity="0.6" strokeLinecap="round" />
                  {/* Green 'B' */}
                  <path d="M 64 10 L 98 10 C 111 10, 120 18, 120 28 C 120 37, 112 43, 102 46 C 112 49, 120 55, 120 66 C 120 76, 111 86, 98 86 L 64 86 Z" fill="#4dbd10" />
                  {/* Top loop white cable */}
                  <path d="M 76 28 C 76 20, 108 20, 108 28 C 108 36, 76 36, 76 28" stroke="#ffffff" strokeWidth="6" strokeLinecap="round" fill="none" />
                  <rect x="94" y="32" width="7" height="5" rx="1.5" transform="rotate(30 94 32)" fill="#ffffff" />
                  <line x1="100.5" y1="36" x2="104.5" y2="38.5" stroke="#ffffff" strokeWidth="1.8" strokeLinecap="round" />
                  <line x1="98.5" y1="39.5" x2="102.5" y2="42" stroke="#ffffff" strokeWidth="1.8" strokeLinecap="round" />
                  {/* Bottom loop white cable */}
                  <path d="M 76 66 C 76 58, 108 58, 108 66 C 108 74, 76 74, 76 66" stroke="#ffffff" strokeWidth="6" strokeLinecap="round" fill="none" />
                  <rect x="78" y="58" width="8" height="6" rx="2" transform="rotate(-30 78 58)" fill="#ffffff" />
                  <rect x="73" y="61" width="5" height="3" rx="0.5" transform="rotate(-30 73 61)" fill="#4dbd10" />
                </svg>
                <div className="mt-1 text-center">
                  <h1 className="text-[#4eae0e] font-display font-extrabold text-base tracking-tight leading-none uppercase">ENERGY<span className="text-[#044d90]">BAE</span></h1>
                  <p className="text-[8px] text-slate-550 font-mono mt-0.5 tracking-wider font-semibold">www.energybae.in</p>
                </div>
              </div>
              <p className="mt-2.5 text-[10px] text-sky-400 font-mono tracking-widest font-semibold flex items-center bg-sky-950/30 px-3 py-1 rounded-full border border-sky-500/10">
                <Zap className="w-3.5 h-3.5 mr-1 text-[#4eae0e] animate-pulse" /> SOLAR INTEL ENGINE
              </p>
            </motion.div>
          ) : (
            <motion.div 
              key="collapsed"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.2 }}
              className="py-2 flex flex-col items-center justify-center cursor-pointer"
              onClick={() => setIsCollapsed(false)}
            >
              <div className="w-10 h-10 bg-gradient-to-br from-[#4eae0e] to-[#044d90] rounded-xl flex items-center justify-center shadow-lg shadow-emerald-900/20 hover:rotate-6 transition-transform">
                <Sun className="w-5 h-5 text-white animate-spin-slow" />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Mini Toggle Pin Button */}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-slate-900 border border-slate-800 text-slate-400 hover:text-white flex items-center justify-center shadow-xl hover:scale-105 active:scale-95 transition-all z-40 cursor-pointer"
        >
          {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* 2. Core Navigation List */}
      <div className="px-3 py-4 space-y-1.5 flex-1 overflow-y-auto">
        {!isCollapsed && (
          <div className="px-2 pb-2 text-[10px] font-mono font-semibold tracking-wider text-slate-500 uppercase">
            Platform Navigation
          </div>
        )}
        
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center justify-between rounded-xl px-3.5 py-3 text-sm font-medium transition-all relative group cursor-pointer ${
                isActive 
                  ? "bg-slate-900 text-white shadow-md border-l-2 border-sky-400 font-semibold" 
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/40"
              }`}
            >
              <div className="flex items-center space-x-3 min-w-0">
                <Icon className={`w-4 h-4 shrink-0 transition-colors ${isActive ? "text-sky-400" : "text-slate-500 group-hover:text-slate-400"}`} />
                {!isCollapsed && (
                  <motion.span 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="truncate font-display"
                  >
                    {item.name}
                  </motion.span>
                )}
              </div>

              {!isCollapsed && item.badge && (
                <span className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded-full ${item.badgeColor}`}>
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}

        {/* Dividing space */}
        {!isCollapsed && <div className="border-t border-slate-800/40 my-4" />}

        {/* Notice how Sizing Cores and API Terminals headers are removed completely */}
      </div>

      {/* 3. Collapsed Footer */}
      <div className="p-4 border-t border-slate-800/40 bg-slate-950/30 relative">
        {!isCollapsed ? (
          <div className="space-y-1 text-center">
            <div className="text-[10px] text-slate-500 font-mono tracking-widest uppercase">ENERGYBAE CORP PUNE</div>
            <div className="flex items-center justify-center space-x-2 text-[10px] text-slate-400 font-sans">
              <span className="flex items-center hover:text-sky-400 transition cursor-pointer"><Mail className="w-3 h-3 mr-1" /> info@energybae.in</span>
            </div>
          </div>
        ) : (
          <div className="flex justify-center">
            <Sun className="w-4 h-4 text-slate-600 animate-pulse" />
          </div>
        )}
      </div>
    </motion.aside>
  );
}
