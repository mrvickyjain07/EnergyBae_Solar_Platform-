import React, { useState } from "react";
import { BillingHistoryItem } from "../types";
import { Zap, Sun, Award } from "lucide-react";

interface SizingChartProps {
  history: BillingHistoryItem[];
  solarSizeKw: number;
}

export default function SizingChart({ history, solarSizeKw }: SizingChartProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (!history || history.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-slate-500 text-xs italic bg-slate-900/15 rounded-xl border border-slate-900">
        No consumption historical logs mapped yet.
      </div>
    );
  }

  // Find max value to calibrate height scale
  const maxConsumption = Math.max(...history.map(h => h.consumption), 200);
  
  // 1 kW solar generates an estimated ~125 kWh/month in Maharashtra
  const estimatedMonthlySolarYield = Math.round(solarSizeKw * 125);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold font-display text-slate-200 tracking-tight flex items-center">
          <Zap className="w-4 h-4 mr-1.5 text-yellow-400" /> Historic Grid Consumption vs Proposed Solar Offset
        </h3>
        
        {/* Legend */}
        <div className="flex items-center space-x-4 text-[10px] font-mono">
          <div className="flex items-center">
            <span className="w-3 h-3 rounded bg-sky-500/80 mr-1.5 inline-block"></span>
            <span className="text-slate-400">Grid Units Consumed (kWh)</span>
          </div>
          <div className="flex items-center">
            <span className="w-3 h-3 rounded bg-emerald-500/80 border border-emerald-400/30 mr-1.5 inline-block"></span>
            <span className="text-slate-400">Solar Generation Offset ({estimatedMonthlySolarYield} kWh)</span>
          </div>
        </div>
      </div>

      <div className="glass-panel rounded-2xl p-5 border-slate-800/60 relative overflow-hidden">
        {/* Ambient background glow inside chart */}
        <div className="absolute -left-10 -bottom-10 w-24 h-24 rounded-full bg-sky-500/10 blur-xl"></div>
        <div className="absolute -right-10 -top-10 w-24 h-24 rounded-full bg-emerald-500/10 blur-xl"></div>

        {/* SVG Core Chart */}
        <div className="relative h-56 w-full mt-2">
          {/* Grid lines (Y axis) */}
          <div className="absolute inset-x-0 top-0 h-full flex flex-col justify-between pointer-events-none select-none">
            {[0, 0.25, 0.5, 0.75, 1].map((p, idx) => {
              const val = Math.round(maxConsumption * (1 - p));
              return (
                <div key={idx} className="w-full flex items-center text-[10px] font-mono text-slate-600 border-t border-slate-900/60 pt-0.5">
                  <span className="w-10 pr-2 text-right shrink-0">{val}</span>
                  <div className="flex-1 border-b border-dashed border-slate-800/40"></div>
                </div>
              );
            })}
          </div>

          {/* Bar Chart mapping columns */}
          <div className="absolute left-10 right-0 bottom-6 top-2 flex items-end justify-between px-2 gap-2 h-44">
            {history.map((item, idx) => {
              const utilityHeightPct = (item.consumption / maxConsumption) * 100;
              const solarHeightPct = (estimatedMonthlySolarYield / maxConsumption) * 100;
              const isProposedOffsetSufficient = estimatedMonthlySolarYield >= item.consumption;

              return (
                <div 
                  key={idx} 
                  ref={null}
                  onMouseEnter={() => setHoveredIdx(idx)}
                  onMouseLeave={() => setHoveredIdx(null)}
                  className="flex-1 flex items-end justify-center h-full relative cursor-pointer"
                >
                  {/* Grid Consumption Bar (Blue Glass) */}
                  <div 
                    style={{ height: `${utilityHeightPct}%` }}
                    className={`w-full max-w-[14px] rounded-t-sm transition-all duration-300 relative ${
                      hoveredIdx === idx 
                        ? "bg-gradient-to-t from-sky-600 to-sky-400 shadow-[0_0_12px_rgba(56,189,248,0.4)]" 
                        : "bg-sky-500/30 border-t border-sky-450/40"
                    }`}
                  >
                    {/* Tiny accent tip dot */}
                    <div className="absolute top-0 inset-x-0 h-0.5 bg-sky-300 rounded-t-sm" />
                  </div>

                  {/* Proposed Solar Yield Offset line / panel segment */}
                  <div 
                    style={{ height: `${Math.min(solarHeightPct, 100)}%` }}
                    className={`w-1 shadow-[0_0_8px_rgba(16,185,129,0.2)] ml-1 rounded-t-sm transition-all duration-300 relative ${
                      hoveredIdx === idx 
                        ? "bg-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.5)]" 
                        : "bg-emerald-500/20 border-t border-emerald-400/30"
                    }`}
                  >
                    <div className="absolute top-0 inset-x-0 h-0.5 bg-emerald-400" />
                  </div>

                  {/* Interactive Dynamic Hover Tooltip inside the chart column */}
                  {hoveredIdx === idx && (
                    <div className="absolute bottom-[105%] left-1/2 -translate-x-1/2 bg-slate-950/95 border border-sky-500/40 px-3 py-2 rounded-xl shadow-2xl z-20 min-w-[140px] pointer-events-none text-left backdrop-blur-lg">
                      <p className="text-[10px] text-slate-400 font-semibold font-display uppercase tracking-wider mb-1">{item.month}</p>
                      
                      <div className="space-y-1 text-xs">
                        <div className="flex justify-between gap-4">
                          <span className="text-slate-400">Grid Load:</span>
                          <span className="text-sky-400 font-mono font-medium">{item.consumption} Units</span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-slate-400">Solar Offset:</span>
                          <span className="text-emerald-400 font-mono font-medium">+{estimatedMonthlySolarYield} Units</span>
                        </div>
                        <div className="border-t border-slate-800/60 my-1 pt-1 flex justify-between gap-4 text-[10px] font-mono">
                          <span className="text-slate-500">Proposed Net:</span>
                          <span className={isProposedOffsetSufficient ? "text-emerald-400 font-medium" : "text-amber-400"}>
                            {isProposedOffsetSufficient ? "100% Free" : `-${Math.max(0, item.consumption - estimatedMonthlySolarYield)} Units`}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Month labels (X axis) */}
          <div className="absolute bottom-0 left-10 right-0 h-5 flex justify-between items-center px-2">
            {history.map((item, idx) => (
              <span key={idx} className="flex-1 text-center text-[9px] font-mono text-slate-500 tracking-tighter truncate">
                {item.month.split(" ")[0]}
              </span>
            ))}
          </div>
        </div>

        {/* Dynamic environmental summary badge */}
        <div className="mt-4 pt-3 border-t border-slate-800/40 flex items-center justify-between text-xs text-slate-400">
          <span className="flex items-center text-emerald-400 font-medium">
            <Award className="w-3.5 h-3.5 mr-1.5" /> Est. average solar coverage: 
            <span className="text-white ml-1 font-semibold">
              {Math.min(100, Math.round((estimatedMonthlySolarYield / (history.reduce((a, b) => a + b.consumption, 0) / history.length)) * 100))}%
            </span>
          </span>
          <span className="text-[10px] text-slate-500 font-mono">Peak months: Mar - May</span>
        </div>
      </div>
    </div>
  );
}
