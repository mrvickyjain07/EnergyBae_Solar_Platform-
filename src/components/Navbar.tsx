import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Sun, 
  Sparkles, 
  Bell, 
  User, 
  ChevronDown, 
  Laptop, 
  Wifi, 
  Check, 
  Settings,
  HelpCircle,
  Menu,
  FileSpreadsheet
} from "lucide-react";

interface NavbarProps {
  activeTab: 'overview' | 'ocr' | 'sizing';
  setActiveTab: (tab: 'overview' | 'ocr' | 'sizing') => void;
  fileName: string | null;
  hasExtractedData: boolean;
  onClear: () => void;
}

export default function Navbar({
  activeTab,
  setActiveTab,
  fileName,
  hasExtractedData,
  onClear
}: NavbarProps) {
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  const notifications = [
    { id: 1, title: "EnergyBae Active", desc: "Using high-precision Multimodal vision parameters for MSEDCL audits.", time: "Just now" },
    { id: 2, title: "Maharashtra Solar Slab Updated", desc: "Grid offset calibrated at ~125 Units/kW.", time: "1 hr ago" }
  ];

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-800/50 bg-[#080d16]/75 backdrop-blur-md select-none">
      <div className="max-w-7xl mx-auto px-4 md:px-8 h-16 flex items-center justify-between">
        
        {/* Left: Branded Label Info */}
        <div className="flex items-center space-x-3">
          {/* EnergyBae Mini Logo Card */}
          <div className="bg-white px-2 py-1 rounded-lg border border-slate-800 flex flex-row items-center justify-center shadow-lg h-9">
            <svg className="w-8 h-6 shrink-0" viewBox="0 0 130 100" fill="none" xmlns="http://www.w3.org/2000/svg">
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
            <div className="ml-1.5 flex flex-col justify-center select-none text-left leading-none">
              <span className="text-[12px] font-display font-extrabold text-[#4eae0e] tracking-tight leading-none">ENERGY<span className="text-[#044d90]">BAE</span></span>
              <span className="text-[6px] text-slate-500 font-mono tracking-wider font-semibold leading-none mt-0.5">energybae.in</span>
            </div>
          </div>
        </div>

        {/* Center: Interactive Tabs bar list */}
        <nav className="hidden md:flex items-center space-x-1.5 bg-slate-900/60 p-1 rounded-xl border border-slate-800/60">
          {(['overview', 'ocr', 'sizing'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold font-display transition-all relative cursor-pointer ${
                activeTab === tab 
                  ? "bg-slate-950 text-sky-400 border border-slate-800 shadow shadow-sky-950" 
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <span className="capitalize">{tab === 'ocr' ? 'AI OCR Scanner' : tab === 'sizing' ? 'Solar Analytics' : tab}</span>
            </button>
          ))}
        </nav>

        {/* Right: Actions, lights counters */}
        <div className="flex items-center space-x-3.5">
          {/* Status badge */}
          <div className="flex items-center space-x-1.5 bg-slate-950/40 border border-slate-800 px-2.5 py-1 rounded-lg text-[10px] font-mono text-emerald-400">
            <Wifi className="w-3 h-3 animate-pulse" />
            <span className="hidden sm:inline">LIVE GRID</span>
          </div>

          {/* Notifications Trigger */}
          <div className="relative">
            <button 
              onClick={() => {
                setShowNotifications(!showNotifications);
                setShowProfileMenu(false);
              }}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-900 rounded-lg border border-slate-800/40 transition relative cursor-pointer"
            >
              <Bell className="w-4 h-4" />
              <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-sky-500 rounded-full"></span>
            </button>

            {/* Notification drop layout */}
            <AnimatePresence>
              {showNotifications && (
                <motion.div 
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute right-0 mt-2.5 w-72 bg-slate-950 border border-slate-800/80 rounded-2xl p-4 shadow-2xl z-50 text-left backdrop-blur-xl"
                >
                  <div className="flex justify-between items-center pb-2 border-b border-slate-800/40 mb-2">
                    <span className="text-xs font-bold text-white uppercase tracking-wider font-display">Notifications</span>
                    <span className="text-[10px] text-sky-400 cursor-pointer font-mono">Mark all read</span>
                  </div>
                  <div className="space-y-3">
                    {notifications.map((n) => (
                      <div key={n.id} className="text-xs leading-relaxed space-y-0.5 border-b border-slate-900 pb-2 last:border-0 last:pb-0">
                        <div className="font-semibold text-slate-200">{n.title}</div>
                        <div className="text-slate-400 text-[11px]">{n.desc}</div>
                        <div className="text-[9px] text-slate-500 font-mono mt-0.5">{n.time}</div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* User profile dropdown avatar summary */}
          <div className="relative">
            <button 
              onClick={() => {
                setShowProfileMenu(!showProfileMenu);
                setShowNotifications(false);
              }}
              className="flex items-center space-x-1 text-slate-400 hover:text-white hover:bg-slate-900 p-1.5 rounded-lg border border-slate-800/40 transition cursor-pointer"
            >
              <div className="w-5 h-5 rounded-full bg-sky-500/10 border border-sky-400/30 flex items-center justify-center text-sky-400 font-mono text-[10px] font-bold">EB</div>
              <ChevronDown className="w-3 h-3 text-slate-500" />
            </button>

            <AnimatePresence>
              {showProfileMenu && (
                <motion.div 
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute right-0 mt-2.5 w-56 bg-slate-950 border border-slate-800/80 rounded-2xl p-3 shadow-2xl z-50 text-left font-sans"
                >
                  <div className="px-2.5 py-1.5 border-b border-slate-900 text-xs">
                    <div className="font-semibold text-white">Registered Associate</div>
                    <div className="text-[10px] text-slate-500 font-mono mt-0.5 truncate font-semibold">vj937379@gmail.com</div>
                  </div>
                  <div className="py-2.5 space-y-1.5">
                    <button className="w-full text-left px-2.5 py-1.5 rounded text-xs text-slate-300 hover:bg-slate-900 transition flex items-center gap-2">
                       Security Permissions
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

        </div>

      </div>
    </header>
  );
}
