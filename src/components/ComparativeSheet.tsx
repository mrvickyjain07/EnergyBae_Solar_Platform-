import React from "react";
import { Copy, FileSpreadsheet, RefreshCw, Sparkles, HelpCircle } from "lucide-react";

export interface BillHistoryRow {
  month: string;
  units: number | "";
  billAmount: number | "";
  unitCost: number | "";
}

export interface SlotData {
  consumerName: string;
  consumerNumber: string;
  fixedCharges: number | "";
  sanctionedLoadKw: number | "";
  connectionType: string;
  contractDemandKva: string;
  history: BillHistoryRow[];
}

interface ComparativeSheetProps {
  slot1: SlotData;
  slot2: SlotData;
  solarPanelUsed: number;
  setSlot1: React.Dispatch<React.SetStateAction<SlotData>>;
  setSlot2: React.Dispatch<React.SetStateAction<SlotData>>;
  setSolarPanelUsed: (val: number) => void;
  onDownloadXlsx: () => void;
}

export default function ComparativeSheet({
  slot1,
  slot2,
  solarPanelUsed,
  setSlot1,
  setSlot2,
  setSolarPanelUsed,
  onDownloadXlsx,
}: ComparativeSheetProps) {

  // Mathematical recalculations (matching EXACT spreadsheet factors: DIVISOR = 106.060606)
  const DIVISOR = 106.060606;

  // Helper calculation functions for Slot 1
  const s1UnitsList = slot1.history.map(h => typeof h.units === "number" ? h.units : 0);
  const s1BillList = slot1.history.map(h => typeof h.billAmount === "number" ? h.billAmount : 0);
  const s1CostList = slot1.history.map(h => typeof h.unitCost === "number" ? h.unitCost : 0);

  const s1AvgUnits = s1UnitsList.reduce((a, b) => a + b, 0) / Math.max(1, slot1.history.length);
  // Average bill (ignoring 0 values)
  const s1ValidBills = slot1.history.filter(h => typeof h.billAmount === "number" && h.billAmount > 0);
  const s1AvgBill = s1ValidBills.length > 0 
    ? s1ValidBills.reduce((acc, current) => acc + (current.billAmount as number), 0) / s1ValidBills.length 
    : 0;

  const s1ValidCosts = slot1.history.filter(h => typeof h.unitCost === "number" && h.unitCost > 0);
  const s1AvgCost = s1ValidCosts.length > 0 
    ? s1ValidCosts.reduce((acc, current) => acc + (current.unitCost as number), 0) / s1ValidCosts.length 
    : 0;

  const s1Kw = s1AvgUnits / DIVISOR;
  const s1PanelsFraction = (s1Kw * 1000) / (solarPanelUsed || 600);
  const s1PanelsInt = Math.ceil(s1PanelsFraction);
  const s1Capacity = (s1PanelsInt * (solarPanelUsed || 600)) / 1000;


  // Helper calculation functions for Slot 2
  const s2UnitsList = slot2.history.map(h => typeof h.units === "number" ? h.units : 0);
  const s2BillList = slot2.history.map(h => typeof h.billAmount === "number" ? h.billAmount : 0);
  const s2CostList = slot2.history.map(h => typeof h.unitCost === "number" ? h.unitCost : 0);

  const s2AvgUnits = s2UnitsList.reduce((a, b) => a + b, 0) / Math.max(1, slot2.history.length);
  
  const s2ValidBills = slot2.history.filter(h => typeof h.billAmount === "number" && h.billAmount > 0);
  const s2AvgBill = s2ValidBills.length > 0 
    ? s2ValidBills.reduce((acc, current) => acc + (current.billAmount as number), 0) / s2ValidBills.length 
    : 0;

  const s2ValidCosts = slot2.history.filter(h => typeof h.unitCost === "number" && h.unitCost > 0);
  const s2AvgCost = s2ValidCosts.length > 0 
    ? s2ValidCosts.reduce((acc, current) => acc + (current.unitCost as number), 0) / s2ValidCosts.length 
    : 0;

  const s2Kw = s2AvgUnits / DIVISOR;
  const s2PanelsFraction = (s2Kw * 1000) / (solarPanelUsed || 600);
  const s2PanelsInt = Math.ceil(s2PanelsFraction);
  const s2Capacity = (s2PanelsInt * (solarPanelUsed || 600)) / 1000;


  // Totals calculations
  const totalCapacity = s1Capacity + s2Capacity;
  const totalPanels = s1PanelsInt + s2PanelsInt;

  // Handler for modifying values live
  const handleS1HistoryChange = (index: number, key: keyof BillHistoryRow, value: any) => {
    const updated = [...slot1.history];
    updated[index] = { ...updated[index], [key]: value };
    setSlot1({ ...slot1, history: updated });
  };

  const handleS2HistoryChange = (index: number, key: keyof BillHistoryRow, value: any) => {
    const updated = [...slot2.history];
    updated[index] = { ...updated[index], [key]: value };
    setSlot2({ ...slot2, history: updated });
  };

  return (
    <div className="space-y-6">
      
      {/* Dynamic explanatory alert bar info */}
      <div className="glass-panel p-4.5 rounded-2xl border-amber-500/10 bg-amber-500/5 text-left flex items-start gap-3 transition-colors duration-300">
        <div className="p-2 bg-amber-500/15 text-amber-500 rounded-xl border border-amber-500/20">
          <Sparkles className="w-4 h-4" />
        </div>
        <div className="space-y-1">
          <h4 className="text-xs font-bold text-amber-500 font-display uppercase tracking-wide">Dynamic Solar Load Ledger Sheet (Maharashtra Rules)</h4>
          <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed transition-colors duration-300">
            This live visual worksheet mimics the precise architecture of your <b>Pranay HOME</b> Excel model. Every cell labeled with grid indices is fully customizable. Try typing raw units, changing fixed charges, or updating the solar panel model size <b>(Cell C7)</b> — calculations update instantly with proper net metering quotients.
          </p>
        </div>
      </div>

      {/* Spreadsheet grid viewer framework */}
      <div className="glass-panel rounded-2xl border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden shadow-2xl relative transition-colors duration-300">
        <div className="absolute top-2 left-4 text-[9px] text-[var(--text-muted)] font-mono tracking-widest uppercase transition-colors duration-300">WORKSHEEET PAYLOAD VIEWER • Pranay HOME</div>
        
        {/* Core Spreadsheet Window */}
        <div className="overflow-x-auto w-full pt-6">
          <table className="w-full text-xs font-mono border-collapse min-w-[1000px] border-[var(--border-subtle)] text-[var(--text-secondary)] transition-colors duration-300">
            {/* Headers row (A, B, C, D...) */}
            <thead>
              <tr className="bg-[var(--bg-card)] border-b border-[var(--border-subtle)] transition-colors duration-300">
                <th className="w-12 bg-[var(--bg-surface)] py-1 text-center border-r border-[var(--border-subtle)] text-[var(--text-muted)] text-[10px] font-bold"></th>
                {["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"].map((col, idx) => (
                  <th key={idx} className="px-3 py-1 text-center border-r border-[var(--border-subtle)] text-[var(--text-muted)] text-[10px] font-bold uppercase select-none transition-colors duration-300">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            
            <tbody>
              {/* Row 1: Consumer Name */}
              <tr className="border-b border-[var(--border-subtle)] transition-colors duration-300">
                <td className="bg-[var(--bg-surface)] text-[var(--text-muted)] font-bold text-[9px] text-center border-r border-[var(--border-subtle)] select-none">1</td>
                <td className="border-r border-[var(--border-subtle)] px-2 py-1.5 font-bold font-sans bg-amber-500/10 text-amber-500">Consumer Name</td>
                <td className="border-r border-[var(--border-subtle)] px-2 py-1.5"></td>
                <td colSpan={3} className="border-r border-[var(--border-subtle)] px-3 py-1 text-left bg-[var(--hover-bg)]">
                  <input
                    type="text"
                    value={slot1.consumerName}
                    onChange={(e) => setSlot1({ ...slot1, consumerName: e.target.value })}
                    className="w-full bg-transparent text-[var(--text-primary)] font-sans font-bold border-none focus:outline-none focus:ring-1 focus:ring-[var(--accent-blue)]/50 rounded px-1"
                  />
                </td>
                <td className="border-r border-[var(--border-subtle)] px-2"></td>
                <td colSpan={3} className="border-r border-[var(--border-subtle)] px-3 py-1 text-left bg-[var(--hover-bg)]">
                  <input
                    type="text"
                    value={slot2.consumerName}
                    onChange={(e) => setSlot2({ ...slot2, consumerName: e.target.value })}
                    className="w-full bg-transparent text-[var(--text-primary)] font-sans font-bold border-none focus:outline-none focus:ring-1 focus:ring-[var(--accent-green)]/50 rounded px-1"
                  />
                </td>
              </tr>

              {/* Row 2: Consumer No */}
              <tr className="border-b border-[var(--border-subtle)] transition-colors duration-300">
                <td className="bg-[var(--bg-surface)] text-[var(--text-muted)] font-bold text-[9px] text-center border-r border-[var(--border-subtle)] select-none">2</td>
                <td className="border-r border-[var(--border-subtle)] px-2 py-1.5 font-bold font-sans bg-amber-500/10 text-amber-500">Consumer No</td>
                <td className="border-r border-[var(--border-subtle)] px-2"></td>
                <td colSpan={3} className="border-r border-[var(--border-subtle)] px-3 py-1 text-left bg-[var(--hover-bg)]/50">
                  <input
                    type="text"
                    value={slot1.consumerNumber}
                    onChange={(e) => setSlot1({ ...slot1, consumerNumber: e.target.value })}
                    className="w-full bg-transparent text-[var(--text-primary)] border-none focus:outline-none focus:ring-1 focus:ring-[var(--accent-blue)]/50 rounded px-1 font-mono"
                  />
                </td>
                <td className="border-r border-[var(--border-subtle)] px-2"></td>
                <td colSpan={3} className="border-r border-[var(--border-subtle)] px-3 py-1 text-left bg-[var(--hover-bg)]/50">
                  <input
                    type="text"
                    value={slot2.consumerNumber}
                    onChange={(e) => setSlot2({ ...slot2, consumerNumber: e.target.value })}
                    className="w-full bg-transparent text-[var(--text-primary)] border-none focus:outline-none focus:ring-1 focus:ring-[var(--accent-green)]/50 rounded px-1 font-mono"
                  />
                </td>
              </tr>

              {/* Row 3: Fixed Charges */}
              <tr className="border-b border-[var(--border-subtle)] transition-colors duration-300">
                <td className="bg-[var(--bg-surface)] text-[var(--text-muted)] font-bold text-[9px] text-center border-r border-[var(--border-subtle)] select-none">3</td>
                <td className="border-r border-[var(--border-subtle)] px-2 py-1.5 font-bold font-sans bg-amber-500/10 text-amber-500">Fixed Charges</td>
                <td className="border-r border-[var(--border-subtle)] px-2"></td>
                <td colSpan={3} className="border-r border-[var(--border-subtle)] px-3 py-1 text-left">
                  <input
                    type="number"
                    value={slot1.fixedCharges}
                    onChange={(e) => setSlot1({ ...slot1, fixedCharges: e.target.value === "" ? "" : Number(e.target.value) })}
                    className="w-24 bg-[var(--hover-bg)] border-none focus:outline-none focus:ring-1 focus:ring-[var(--accent-blue)]/50 rounded px-1 hover:bg-[var(--bg-surface)] transition text-[var(--text-primary)]"
                  />
                </td>
                <td className="border-r border-[var(--border-subtle)] px-2"></td>
                <td colSpan={3} className="border-r border-[var(--border-subtle)] px-3 py-1 text-left">
                  <input
                    type="number"
                    value={slot2.fixedCharges}
                    onChange={(e) => setSlot2({ ...slot2, fixedCharges: e.target.value === "" ? "" : Number(e.target.value) })}
                    className="w-24 bg-[var(--hover-bg)] border-none focus:outline-none focus:ring-1 focus:ring-[var(--accent-green)]/50 rounded px-1 hover:bg-[var(--bg-surface)] transition text-[var(--text-primary)]"
                  />
                </td>
              </tr>

              {/* Row 4: Sanct. Load */}
              <tr className="border-b border-[var(--border-subtle)] transition-colors duration-300">
                <td className="bg-[var(--bg-surface)] text-[var(--text-muted)] font-bold text-[9px] text-center border-r border-[var(--border-subtle)] select-none">4</td>
                <td className="border-r border-[var(--border-subtle)] px-2 py-1.5 font-bold font-sans bg-amber-500/10 text-amber-500">Sanct. Load (kW)</td>
                <td className="border-r border-[var(--border-subtle)] px-2"></td>
                <td colSpan={3} className="border-r border-[var(--border-subtle)] px-3 py-1 text-left">
                  <input
                    type="number"
                    step="0.01"
                    value={slot1.sanctionedLoadKw}
                    onChange={(e) => setSlot1({ ...slot1, sanctionedLoadKw: e.target.value === "" ? "" : Number(e.target.value) })}
                    className="w-24 bg-[var(--hover-bg)] border-none focus:outline-none focus:ring-1 focus:ring-[var(--accent-blue)]/50 rounded px-1 hover:bg-[var(--bg-surface)] transition font-bold text-[var(--text-primary)]"
                  /> KW
                </td>
                <td className="border-r border-[var(--border-subtle)] px-2"></td>
                <td colSpan={3} className="border-r border-[var(--border-subtle)] px-3 py-1 text-left">
                  <input
                    type="number"
                    step="0.01"
                    value={slot2.sanctionedLoadKw}
                    onChange={(e) => setSlot2({ ...slot2, sanctionedLoadKw: e.target.value === "" ? "" : Number(e.target.value) })}
                    className="w-24 bg-[var(--hover-bg)] border-none focus:outline-none focus:ring-1 focus:ring-[var(--accent-green)]/50 rounded px-1 hover:bg-[var(--bg-surface)] transition font-bold text-[var(--text-primary)]"
                  /> KW
                </td>
              </tr>

              {/* Row 5: Connection Type */}
              <tr className="border-b border-[var(--border-subtle)] transition-colors duration-300">
                <td className="bg-[var(--bg-surface)] text-[var(--text-muted)] font-bold text-[9px] text-center border-r border-[var(--border-subtle)] select-none">5</td>
                <td className="border-r border-[var(--border-subtle)] px-2 py-1.5 font-bold font-sans bg-amber-500/10 text-amber-500">Connection Type</td>
                <td className="border-r border-[var(--border-subtle)] px-2"></td>
                <td colSpan={3} className="border-r border-[var(--border-subtle)] px-3 py-1 text-left bg-[var(--bg-surface)]/50">
                  <input
                    type="text"
                    value={slot1.connectionType}
                    onChange={(e) => setSlot1({ ...slot1, connectionType: e.target.value })}
                    className="w-full bg-transparent text-[var(--text-primary)] border-none focus:outline-none focus:ring-1 focus:ring-[var(--accent-blue)]/50 rounded px-1"
                  />
                </td>
                <td className="border-r border-[var(--border-subtle)] px-2"></td>
                <td colSpan={3} className="border-r border-[var(--border-subtle)] px-3 py-1 text-left bg-[var(--bg-surface)]/50">
                  <input
                    type="text"
                    value={slot2.connectionType}
                    onChange={(e) => setSlot2({ ...slot2, connectionType: e.target.value })}
                    className="w-full bg-transparent text-[var(--text-primary)] border-none focus:outline-none focus:ring-1 focus:ring-[var(--accent-green)]/50 rounded px-1"
                  />
                </td>
              </tr>

              {/* Row 6: Contract Demand */}
              <tr className="border-b border-[var(--border-subtle)] transition-colors duration-300">
                <td className="bg-[var(--bg-surface)] text-[var(--text-muted)] font-bold text-[9px] text-center border-r border-[var(--border-subtle)] select-none">6</td>
                <td colSpan={10} className="px-3 py-1 text-left text-[11px] text-[var(--text-secondary)]">
                  Contract Demand (KVA) : <input type="text" placeholder="---" value={slot1.contractDemandKva} onChange={(e) => setSlot1({...slot1, contractDemandKva: e.target.value})} className="bg-[var(--hover-bg)] px-2 py-0.5 rounded w-20 text-[var(--text-primary)] font-mono text-center border-none ml-2" />
                </td>
              </tr>

              {/* Row 7: Solar Panel Setting (Cell C7) */}
              <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]/50 transition-colors duration-300">
                <td className="bg-[var(--bg-surface)] text-[var(--text-muted)] font-bold text-[9px] text-center border-r border-[var(--border-subtle)] select-none">7</td>
                <td className="border-r border-[var(--border-subtle)] px-2 py-1 font-bold bg-amber-500/10 text-amber-500">Solar Pannel used</td>
                <td className="border-r border-[var(--border-subtle)] px-3 py-1 bg-amber-500/20 text-center text-amber-500 font-bold">
                  <input
                    type="number"
                    value={solarPanelUsed}
                    onChange={(e) => setSolarPanelUsed(Math.max(10, Number(e.target.value) || 600))}
                    className="w-16 bg-transparent text-center border-none focus:ring-1 focus:ring-amber-500 font-bold focus:outline-none text-amber-500"
                  />
                </td>
                <td colSpan={8} className="px-3 py-1 text-[11px] text-[var(--text-muted)] text-left font-sans italic">
                  Watts (Typically 600W. Changes calculated sizing dynamically)
                </td>
              </tr>

              {/* Row 8: Table Header row */}
              <tr className="bg-[var(--bg-surface)] text-[var(--text-primary)] border-b border-[var(--border-subtle)] font-bold text-center text-[11px] transition-colors duration-300">
                <td className="bg-[var(--bg-surface)] text-[var(--text-muted)] font-bold text-[9px] text-center border-r border-[var(--border-subtle)] select-none">8</td>
                <td className="px-2 py-1.5 border-r border-[var(--border-subtle)] font-sans bg-amber-500/10 text-amber-500">Sr.No</td>
                <td className="px-2 py-1.5 border-r border-[var(--border-subtle)] bg-[var(--hover-bg)]">Month</td>
                <td className="px-2 py-1.5 border-r border-[var(--border-subtle)] bg-[var(--accent-blue)]/10 text-[var(--accent-blue)]">Units</td>
                <td className="px-2 py-1.5 border-r border-[var(--border-subtle)] bg-[var(--accent-blue)]/10 text-[var(--accent-blue)]">Bill Amount</td>
                <td className="px-2 py-1.5 border-r border-[var(--border-subtle)] bg-[var(--accent-blue)]/10 text-[var(--accent-blue)]">Unit Cost</td>
                <td className="px-2 py-1.5 border-r border-[var(--border-subtle)] bg-[var(--hover-bg)]">Month</td>
                <td className="px-2 py-1.5 border-r border-[var(--border-subtle)] bg-[var(--accent-green)]/10 text-[var(--accent-green)]">Units</td>
                <td className="px-2 py-1.5 border-r border-[var(--border-subtle)] bg-[var(--accent-green)]/10 text-[var(--accent-green)]">Bill Amount</td>
                <td colSpan={2} className="px-2 py-1.5 bg-[var(--accent-green)]/10 text-[var(--accent-green)]">Unit Cost</td>
              </tr>

              {/* Month Data Rows 9 to 20 */}
              {slot1.history.map((h1, idx) => {
                const h2 = slot2.history[idx] || { month: h1.month, units: "", billAmount: "", unitCost: "" };
                const rowNum = 9 + idx;
                const srNo = 2 + idx;

                return (
                  <tr key={idx} className="border-b border-[var(--border-subtle)] hover:bg-[var(--hover-bg)] transition-all font-mono">
                    <td className="bg-[var(--bg-surface)] text-[var(--text-muted)] font-bold text-[9px] text-center border-r border-[var(--border-subtle)] select-none">{rowNum}</td>
                    
                    {/* B: Sr.No */}
                    <td className="border-r border-[var(--border-subtle)] text-center text-[var(--text-muted)] font-bold">{srNo}</td>
                    
                    {/* C: Consumer 1 Month */}
                    <td className="border-r border-[var(--border-subtle)] px-2 py-1 text-left text-[var(--text-primary)] font-sans text-[11px]">{h1.month}</td>
                    
                    {/* D: Consumer 1 Units */}
                    <td className="border-r border-[var(--border-subtle)] px-2 text-right bg-[var(--accent-blue)]/5">
                      <input
                        type="number"
                        value={h1.units}
                        onChange={(e) => handleS1HistoryChange(idx, "units", e.target.value === "" ? "" : Number(e.target.value))}
                        className="w-full bg-transparent text-right text-[var(--accent-blue)] font-semibold border-none focus:outline-none focus:ring-1 focus:ring-[var(--accent-blue)]/30 rounded"
                      />
                    </td>
                    
                    {/* E: Consumer 1 Bill Amount */}
                    <td className="border-r border-[var(--border-subtle)] px-2 text-right">
                      <input
                        type="number"
                        step="0.01"
                        value={h1.billAmount}
                        placeholder="--"
                        onChange={(e) => handleS1HistoryChange(idx, "billAmount", e.target.value === "" ? "" : Number(e.target.value))}
                        className="w-full bg-transparent text-right text-[var(--text-primary)] border-none focus:outline-none focus:ring-1 focus:ring-[var(--accent-blue)]/30 rounded"
                      />
                    </td>

                    {/* F: Consumer 1 Unit Cost */}
                    <td className="border-r border-[var(--border-subtle)] px-2 text-right">
                      <input
                        type="number"
                        step="0.001"
                        value={h1.unitCost}
                        placeholder="--"
                        onChange={(e) => handleS1HistoryChange(idx, "unitCost", e.target.value === "" ? "" : Number(e.target.value))}
                        className="w-full bg-transparent text-right text-[var(--text-secondary)] border-none focus:outline-none focus:ring-1 focus:ring-[var(--accent-blue)]/30 rounded"
                      />
                    </td>

                    {/* G: Consumer 2 Month */}
                    <td className="border-r border-[var(--border-subtle)] px-2 py-1 text-left text-[var(--text-primary)] font-sans text-[11px]">{h2.month}</td>

                    {/* H: Consumer 2 Units */}
                    <td className="border-r border-[var(--border-subtle)] px-2 text-right bg-[var(--accent-green)]/5">
                      <input
                        type="number"
                        value={h2.units}
                        onChange={(e) => handleS2HistoryChange(idx, "units", e.target.value === "" ? "" : Number(e.target.value))}
                        className="w-full bg-transparent text-right text-[var(--accent-green)] font-semibold border-none focus:outline-none focus:ring-1 focus:ring-[var(--accent-green)]/30 rounded"
                      />
                    </td>

                    {/* I: Consumer 2 Bill Amount */}
                    <td className="border-r border-[var(--border-subtle)] px-2 text-right">
                      <input
                        type="number"
                        step="0.01"
                        value={h2.billAmount}
                        placeholder="--"
                        onChange={(e) => handleS2HistoryChange(idx, "billAmount", e.target.value === "" ? "" : Number(e.target.value))}
                        className="w-full bg-transparent text-right text-[var(--text-primary)] border-none focus:outline-none focus:ring-1 focus:ring-[var(--accent-green)]/30 rounded"
                      />
                    </td>

                    {/* J: Consumer 2 Unit Cost */}
                    <td colSpan={2} className="px-2 text-right">
                      <input
                        type="number"
                        step="0.001"
                        value={h2.unitCost}
                        placeholder="--"
                        onChange={(e) => handleS2HistoryChange(idx, "unitCost", e.target.value === "" ? "" : Number(e.target.value))}
                        className="w-full bg-transparent text-right text-[var(--text-secondary)] border-none focus:outline-none focus:ring-1 focus:ring-[var(--accent-green)]/30 rounded"
                      />
                    </td>
                  </tr>
                );
              })}

              {/* Row 21: Sr.No 14 (blank spacer) */}
              <tr className="border-b border-[var(--border-subtle)]/50 h-6 transition-colors duration-300">
                <td className="bg-[var(--bg-surface)] text-[var(--text-muted)] font-bold text-[9px] text-center border-r border-[var(--border-subtle)] select-none">21</td>
                <td className="border-r border-[var(--border-subtle)] text-center font-bold text-[var(--text-muted)]">14</td>
                <td colSpan={9}></td>
              </tr>

              {/* Row 22: Average */}
              <tr className="border-b border-[var(--border-strong)] bg-[var(--hover-bg)] font-bold transition-colors duration-300">
                <td className="bg-[var(--bg-surface)] text-[var(--text-muted)] font-bold text-[9px] text-center border-r border-[var(--border-subtle)] select-none">22</td>
                <td className="border-r border-[var(--border-subtle)] px-2 py-1 bg-amber-500/5 text-amber-500">Average</td>
                <td className="border-r border-[var(--border-subtle)]"></td>
                <td className="border-r border-[var(--border-subtle)] px-2 text-right text-[var(--accent-blue)] font-semibold">{s1AvgUnits.toFixed(2)}</td>
                <td className="border-r border-[var(--border-subtle)] px-2 text-right text-[var(--text-primary)]">{s1AvgBill > 0 ? s1AvgBill.toFixed(2) : ""}</td>
                <td className="border-r border-[var(--border-subtle)] px-2 text-right text-[var(--text-secondary)]">{s1AvgCost > 0 ? s1AvgCost.toFixed(3) : ""}</td>
                <td className="border-r border-[var(--border-subtle)] px-2 py-1 bg-amber-500/5 text-amber-500">Average</td>
                <td className="border-r border-[var(--border-subtle)] px-2 text-right text-[var(--accent-green)] font-semibold">{s2AvgUnits.toFixed(2)}</td>
                <td className="border-r border-[var(--border-subtle)] px-2 text-right text-[var(--text-primary)]">{s2AvgBill > 0 ? s2AvgBill.toFixed(2) : ""}</td>
                <td colSpan={2} className="px-2 text-right text-[var(--text-secondary)]">{s2AvgCost > 0 ? s2AvgCost.toFixed(6) : ""}</td>
              </tr>

              {/* Row 23: kW capacity need */}
              <tr className="border-b border-[var(--border-subtle)] font-bold transition-colors duration-300">
                <td className="bg-[var(--bg-surface)] text-[var(--text-muted)] font-bold text-[9px] text-center border-r border-[var(--border-subtle)] select-none">23</td>
                <td className="border-r border-[var(--border-subtle)] px-2 py-1 text-[var(--text-primary)]">kW</td>
                <td className="border-r border-[var(--border-subtle)]"></td>
                <td className="border-r border-[var(--border-subtle)] px-2 text-right text-[var(--accent-blue)] font-sans">{s1Kw.toFixed(9)}</td>
                <td colSpan={2} className="border-r border-[var(--border-subtle)] px-2 text-[10px] text-[var(--text-muted)]">(=Average/106.06)</td>
                <td className="border-r border-[var(--border-subtle)] px-2 py-1 text-[var(--text-primary)]">kW</td>
                <td className="border-r border-[var(--border-subtle)] px-2 text-right text-[var(--accent-green)] font-sans">{s2Kw.toFixed(9)}</td>
                <td colSpan={3} className="px-2 text-[10px] text-[var(--text-muted)]">(=Average/106.06)</td>
              </tr>

              {/* Row 24: Solar Panels sizing fraction */}
              <tr className="border-b border-[var(--border-subtle)] font-medium transition-colors duration-300">
                <td className="bg-[var(--bg-surface)] text-[var(--text-muted)] font-bold text-[9px] text-center border-r border-[var(--border-subtle)] select-none">24</td>
                <td className="border-r border-[var(--border-subtle)] px-2 py-1 text-[var(--text-secondary)]">Solar Panels</td>
                <td className="border-r border-[var(--border-subtle)]"></td>
                <td className="border-r border-[var(--border-subtle)] px-2 text-right text-[var(--accent-blue)] font-sans opacity-90">{s1PanelsFraction.toFixed(9)}</td>
                <td colSpan={2} className="border-r border-[var(--border-subtle)] px-2 text-[9px] text-[var(--text-muted)]">(=kW*1000/C7)</td>
                <td className="border-r border-[var(--border-subtle)] px-2 py-1 text-[var(--text-secondary)]">Solar Panels</td>
                <td className="border-r border-[var(--border-subtle)] px-2 text-right text-[var(--accent-green)] font-sans opacity-90">{s2PanelsFraction.toFixed(9)}</td>
                <td colSpan={3} className="px-2 text-[9px] text-[var(--text-muted)]">(=kW*1000/C7)</td>
              </tr>

              {/* Row 25: Solar capacity in KW (YELLOW HIGHLIGHT) */}
              <tr className="border-b border-[var(--border-subtle)] font-bold transition-colors duration-300">
                <td className="bg-[var(--bg-surface)] text-[var(--text-muted)] font-bold text-[9px] text-center border-r border-[var(--border-subtle)] select-none">25</td>
                <td className="border-r border-[var(--border-subtle)] px-2 py-1.5 bg-amber-500/10 text-amber-500">Solar capacity</td>
                <td className="border-r border-[var(--border-subtle)]"></td>
                <td className="border-r border-[var(--border-subtle)] px-3 py-1.5 text-right bg-amber-500/20 text-amber-500 text-sm font-sans tracking-tight">
                  {s1Capacity.toFixed(1)}
                </td>
                <td colSpan={2} className="border-r border-[var(--border-subtle)] px-2 text-[9px] text-[var(--text-muted)]">(=Panels*C7/1000)</td>
                <td className="border-r border-[var(--border-subtle)] px-2 py-1.5 bg-amber-500/10 text-amber-500">Solar capacity</td>
                <td className="border-r border-[var(--border-subtle)] px-3 py-1.5 text-right bg-amber-500/20 text-amber-500 text-sm font-sans tracking-tight">
                  {s2Capacity.toFixed(1)}
                </td>
                <td colSpan={3} className="px-2 text-[9px] text-[var(--text-muted)]">(=Panels*C7/1000)</td>
              </tr>

              {/* Row 26: Number of panels rounded (GREEN HIGHLIGHT) */}
              <tr className="border-b border-[var(--border-subtle)] font-bold transition-colors duration-300">
                <td className="bg-[var(--bg-surface)] text-[var(--text-muted)] font-bold text-[9px] text-center border-r border-[var(--border-subtle)] select-none">26</td>
                <td className="border-r border-[var(--border-subtle)] px-2 py-1.5 bg-[var(--accent-green)]/10 text-[var(--accent-green)]">Number of Panels</td>
                <td className="border-r border-[var(--border-subtle)]"></td>
                <td className="border-r border-[var(--border-subtle)] px-3 py-1.5 text-right bg-[var(--accent-green)]/20 text-[var(--accent-green)] text-sm font-sans">
                  {s1PanelsInt}
                </td>
                <td colSpan={2} className="border-r border-[var(--border-subtle)] px-2 text-[9px] text-[var(--text-muted)]">(=ROUNDUP(Panels,0))</td>
                <td className="border-r border-[var(--border-subtle)] px-2 py-1.5 bg-[var(--accent-green)]/10 text-[var(--accent-green)]">Number of Panels</td>
                <td className="border-r border-[var(--border-subtle)] px-3 py-1.5 text-right bg-[var(--accent-green)]/20 text-[var(--accent-green)] text-sm font-sans">
                  {s2PanelsInt}
                </td>
                <td colSpan={3} className="px-2 text-[9px] text-[var(--text-muted)]">(=ROUNDUP(Panels,0))</td>
              </tr>

              {/* Row 27-28 Spacer */}
              <tr className="border-none h-4"><td colSpan={11}></td></tr>
              <tr className="border-none h-4"><td colSpan={11}></td></tr>

              {/* Row 29: Total solar capacity */}
              <tr className="border-b border-t border-[var(--border-strong)] bg-[var(--hover-bg)] font-bold text-sm transition-colors duration-300">
                <td className="bg-[var(--bg-surface)] text-[var(--text-muted)] font-bold text-[9px] text-center border-r border-[var(--border-subtle)] select-none">29</td>
                <td className="border-r border-[var(--border-subtle)]"></td>
                <td colSpan={2} className="border-r border-[var(--border-subtle)] px-3 py-2 text-left text-amber-500 text-xs uppercase font-sans">
                  Total solar capacity kWp
                </td>
                <td className="px-4 py-2 text-left bg-amber-500/20 text-amber-500 font-sans font-black text-base">
                  {totalCapacity.toFixed(1)} kW
                </td>
                <td colSpan={6} className="text-left text-[11px] text-[var(--text-muted)] pl-3">(= Capacity 1 + Capacity 2)</td>
              </tr>

              {/* Row 30: Total number of panels */}
              <tr className="border-b border-[var(--border-strong)] bg-[var(--hover-bg)] font-bold text-sm transition-colors duration-300">
                <td className="bg-[var(--bg-surface)] text-[var(--text-muted)] font-bold text-[9px] text-center border-r border-[var(--border-subtle)] select-none">30</td>
                <td className="border-r border-[var(--border-subtle)]"></td>
                <td colSpan={2} className="border-r border-[var(--border-subtle)] px-3 py-2 text-left text-[var(--accent-green)] text-xs uppercase font-sans">
                  Number of solar panels
                </td>
                <td className="px-4 py-2 text-left bg-[var(--accent-green)]/20 text-[var(--accent-green)] font-sans font-black text-base">
                  {totalPanels}
                </td>
                <td colSpan={6} className="text-left text-[11px] text-[var(--text-muted)] pl-3">(= Panels 1 + Panels 2)</td>
              </tr>

            </tbody>
          </table>
        </div>
        
        {/* Footer controls inside spreadsheet */}
        <div className="p-4 bg-[var(--hover-bg)] border-t border-[var(--border-subtle)] flex justify-between items-center flex-wrap gap-4 select-none transition-colors duration-300">
          <div className="text-[11px] text-[var(--text-muted)]">
            DIVISOR CONSTANT: <span className="font-bold text-[var(--text-primary)]">106.060606</span> (MSEDCL Standard coefficient)
          </div>
          <button
            type="button"
            onClick={onDownloadXlsx}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#4eae0e] to-[#044d90] text-xs font-bold text-white hover:opacity-90 shadow-lg flex items-center gap-1.5 transition duration-200 cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4 text-white" />
            Download Compiled Excel Sheet (.xlsx)
          </button>
        </div>
      </div>
    </div>
  );
}
