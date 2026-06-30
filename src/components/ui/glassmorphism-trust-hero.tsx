import React from "react";
import { motion } from "motion/react";
import {
  ArrowRight,
  Sparkles,
  Zap,
  ShieldCheck,
  User,
  Hash,
  Calendar,
  CheckCircle2,
  Wifi,
  BatteryFull,
} from "lucide-react";

// Sample bill fields shown in the scan mockup. Consumer identity is masked/generic
// here since this is marketing chrome, not a real extraction result.
const SCAN_SAMPLE = {
  consumerName: "EnergyBae",
  consumerNumberMasked: "0820 •••• •••• 40",
  billingMonth: "January 2026",
  units: 123,
  billAmount: 1120,
  accuracy: 97.4,
};

interface HeroSectionProps {
  /** Called when the user wants to jump straight to the AI OCR scanner. */
  onLaunchScanner: () => void;
  /** Called when the user wants to try the bundled sample bill. */
  onTrySample: () => void;
}

// --- MAIN COMPONENT ---
export default function HeroSection({ onLaunchScanner, onTrySample }: HeroSectionProps) {
  return (
    <div className="liquid-mesh-bg relative w-full rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] overflow-hidden font-sans shadow-2xl transition-colors duration-300">
      {/* Scoped animations */}
      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .glassmorphism-hero .animate-fade-in {
          animation: fadeSlideIn 0.8s ease-out forwards;
          opacity: 0;
        }
        .glassmorphism-hero .delay-100 { animation-delay: 0.1s; }
        .glassmorphism-hero .delay-200 { animation-delay: 0.2s; }
        .glassmorphism-hero .delay-300 { animation-delay: 0.3s; }
        .glassmorphism-hero .delay-400 { animation-delay: 0.4s; }
        .glassmorphism-hero .delay-500 { animation-delay: 0.5s; }
      `}</style>

      <div className="glassmorphism-hero">
        <div className="relative z-10 mx-auto max-w-7xl px-4 pt-6 pb-12 sm:px-6 md:pt-8 md:pb-16 lg:px-8">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:gap-8 items-start">

            {/* --- LEFT COLUMN --- */}
            <div className="lg:col-span-7 flex flex-col justify-center space-y-6">

              {/* Badge */}
              <div className="animate-fade-in delay-100">
                <div className="inline-flex items-center gap-2 rounded-full border border-[var(--accent-green)]/20 bg-[var(--accent-green)]/10 px-3 py-1.5 backdrop-blur-md transition-colors hover:bg-[var(--accent-green)]/15">
                  <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-[var(--accent-green)] flex items-center gap-2">
                    MSEDCL-Compliant Sizing Engine
                    <ShieldCheck className="w-3.5 h-3.5 text-[var(--accent-green-light)]" />
                  </span>
                </div>
              </div>

              {/* Heading */}
              <h1
                className="animate-fade-in delay-200 text-5xl sm:text-6xl lg:text-7xl xl:text-8xl font-medium tracking-tighter leading-[0.9] font-display"
                style={{
                  maskImage: "linear-gradient(180deg, black 0%, black 80%, transparent 100%)",
                  WebkitMaskImage: "linear-gradient(180deg, black 0%, black 80%, transparent 100%)"
                }}
              >
                Solar Sizing,<br />
                <span className="bg-gradient-to-br from-[var(--accent-green)] via-[var(--accent-green-light)] to-[var(--accent-green)] bg-clip-text text-transparent">
                  Engineered by AI
                </span><br />
                Not Guesswork
              </h1>

              {/* CTA Buttons */}
              <div className="animate-fade-in delay-400 flex flex-col sm:flex-row gap-4">
                <button
                  type="button"
                  onClick={onLaunchScanner}
                  className="group inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[var(--accent-green)] to-sky-400 px-8 py-4 text-sm font-semibold text-white transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
                >
                  Launch AI OCR Scanner
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                </button>

                <button
                  type="button"
                  onClick={onTrySample}
                  className="group inline-flex items-center justify-center gap-2 rounded-full border border-[var(--border-strong)] bg-[var(--hover-bg)] px-8 py-4 text-sm font-semibold text-[var(--text-primary)] backdrop-blur-sm transition-colors hover:bg-[var(--accent-green)]/10 hover:border-[var(--accent-green)]/30 cursor-pointer"
                >
                  <Sparkles className="w-4 h-4 fill-current text-[var(--accent-green-light)]" />
                  Try with Sample Bill
                </button>
              </div>
            </div>

            {/* --- RIGHT COLUMN: live bill-scan mockup --- */}
            <div className="lg:col-span-5 lg:mt-6 flex justify-center">
              <div className="glass-panel animate-fade-in delay-500 relative w-full max-w-[360px] overflow-hidden rounded-3xl p-4 sm:p-6 md:p-8 min-h-[400px] sm:min-h-[460px] flex items-center justify-center">
                <div className="absolute top-0 right-0 -mr-16 -mt-16 h-64 w-64 rounded-full bg-[var(--accent-green)]/10 blur-3xl pointer-events-none" />
                <div className="absolute bottom-0 left-0 -ml-10 -mb-10 h-48 w-48 rounded-full bg-[var(--accent-green-light)]/10 blur-3xl pointer-events-none" />

                {/* Phone frame */}
                <div className="relative z-10 w-[180px] sm:w-[200px] md:w-[220px] aspect-[9/19] rounded-[2rem] border-4 border-[var(--border-strong)] bg-[var(--bg-primary)] shadow-2xl overflow-hidden">
                  {/* Status bar */}
                  <div className="flex items-center justify-between px-4 pt-3 text-[9px] font-mono text-[var(--text-muted)]">
                    <span>9:01</span>
                    <span className="flex items-center gap-1">
                      <Wifi className="w-2.5 h-2.5" />
                      <BatteryFull className="w-3 h-3" />
                    </span>
                  </div>
                  <div className="px-3 pt-1.5 pb-2 text-[10px] font-semibold text-[var(--accent-green)] flex items-center justify-center gap-1.5">
                    <Zap className="w-3 h-3" /> Scanning Bill...
                  </div>

                  {/* Bill preview card with animated scan beam */}
                  <div className="mx-3 relative overflow-hidden rounded-xl bg-white text-zinc-800 p-3 text-[7.5px] leading-tight shadow-inner">
                    <div className="flex items-center gap-1 font-bold text-[10px] text-emerald-600">
                      <Zap className="w-3 h-3" /> EnergyBae
                    </div>
                    <div className="mt-1 font-semibold text-zinc-700">MSEDCL Electricity Bill</div>
                    <div className="mt-1.5 space-y-0.5 text-zinc-500">
                      <div>Consumer: <b className="text-zinc-700">{SCAN_SAMPLE.consumerName}</b></div>
                      <div>Consumer No: {SCAN_SAMPLE.consumerNumberMasked}</div>
                      <div>Billing Month: {SCAN_SAMPLE.billingMonth}</div>
                      <div>Units: {SCAN_SAMPLE.units} kWh</div>
                      <div className="font-bold text-zinc-700">Bill Amount: ₹{SCAN_SAMPLE.billAmount.toLocaleString()}</div>
                    </div>

                    {/* Corner scan brackets */}
                    <div className="absolute top-1 left-1 w-2.5 h-2.5 border-t-2 border-l-2 border-[var(--accent-green)] rounded-tl" />
                    <div className="absolute top-1 right-1 w-2.5 h-2.5 border-t-2 border-r-2 border-[var(--accent-green)] rounded-tr" />
                    <div className="absolute bottom-1 left-1 w-2.5 h-2.5 border-b-2 border-l-2 border-[var(--accent-green)] rounded-bl" />
                    <div className="absolute bottom-1 right-1 w-2.5 h-2.5 border-b-2 border-r-2 border-[var(--accent-green)] rounded-br" />

                    {/* Animated scanning beam — animates the transform (y), not
                        top/layout, so it's GPU-compositable and doesn't repaint
                        the page on every frame. */}
                    <motion.div
                      className="absolute inset-x-0 top-0 h-8 bg-gradient-to-b from-transparent via-[var(--accent-green)]/35 to-transparent"
                      initial={{ y: -16 }}
                      animate={{ y: 140 }}
                      transition={{ duration: 2.2, repeat: Infinity, ease: "linear" }}
                    />
                  </div>

                  {/* Home indicator */}
                  <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-12 h-1 rounded-full bg-[var(--border-strong)]" />
                </div>

                {/* Floating extracted-data card */}
                <motion.div
                  initial={{ opacity: 0, x: 20, y: 10 }}
                  animate={{ opacity: 1, x: 0, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.8 }}
                  className="glass-panel absolute right-4 bottom-8 z-20 w-[168px] rounded-2xl p-3 space-y-1.5 text-[10px] shadow-xl"
                >
                  <div className="flex items-center gap-1.5 text-[var(--accent-green)] font-semibold mb-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Extracted Data
                  </div>
                  <div className="flex items-center gap-1.5 text-[var(--text-secondary)]">
                    <User className="w-3 h-3 text-[var(--text-muted)] shrink-0" /> {SCAN_SAMPLE.consumerName}
                  </div>
                  <div className="flex items-center gap-1.5 text-[var(--text-secondary)]">
                    <Hash className="w-3 h-3 text-[var(--text-muted)] shrink-0" /> {SCAN_SAMPLE.consumerNumberMasked}
                  </div>
                  <div className="flex items-center gap-1.5 text-[var(--text-secondary)]">
                    <Calendar className="w-3 h-3 text-[var(--text-muted)] shrink-0" /> {SCAN_SAMPLE.billingMonth}
                  </div>
                  <div className="flex items-center gap-1.5 text-[var(--text-secondary)]">
                    <Zap className="w-3 h-3 text-[var(--text-muted)] shrink-0" /> {SCAN_SAMPLE.units} kWh
                  </div>
                  <div className="pt-1.5 mt-1 border-t border-[var(--border-subtle)] flex items-center gap-1.5 text-[var(--accent-green)] font-bold">
                    <CheckCircle2 className="w-3.5 h-3.5" /> {SCAN_SAMPLE.accuracy}% Accuracy
                  </div>
                </motion.div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
