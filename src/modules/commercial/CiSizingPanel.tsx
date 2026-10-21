// src/modules/commercial/CiSizingPanel.tsx
// Sizing assumptions and results for C&I bills, shared by Single bill and
// Several bills so both show the same engine (consumptionSizing.analyseCommercial)
// the same way. Everything here is display + the three editable assumptions;
// no arithmetic lives in this file.
//
// The office workbook's formula (decided 2026-10-21, commercialCalculations §05):
// average of the printed history months × 12 × (1 + margin) ÷ yield = calculated
// capacity; × TOD consideration (B+C share +10 %) = the recommended capacity in
// whole panels. Every step and assumption is shown and editable.
import React from "react";
import AnimatedNumber from "../../components/AnimatedNumber";
import type { BaselineStrategy, SizingSettings } from "./commercialCalculations";
import { sizeSolar, type CiAnalysis } from "./consumptionSizing";

const fmtINR = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
const fmtNum = (n: number) => Math.round(n).toLocaleString("en-IN");
const kwp = (n: number, dp = 1) => (n > 0 ? `${n.toFixed(dp)} kWp` : "--");

interface Props {
  a: CiAnalysis;
  settings: SizingSettings;
  onChange: (patch: Partial<SizingSettings>) => void;
}

export default function CiSizingPanel({ a, settings, onChange }: Props) {
  const { baseline: b, pipeline: p, tod, energyRate } = a;
  const numIn = (key: "specificYield" | "offsetPct" | "marginPct", fallback: number) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ [key]: e.target.value === "" ? fallback : Math.max(0, Number(e.target.value) || 0) });
  const hasTod = tod.utilisableFraction > 0;
  const fromHistory = b?.source === "history";
  const mb = a.meterBaseline, hb = a.historyBaseline;
  const option = (label: string, base: typeof b) => base ? `${label} — ${fmtNum(base.annualKwh)} kWh/yr` : `${label} — not available`;
  const todUnit = a.latest?.billingHistoryUnit === "kVAh" ? "billed kVAh" : "billed units";
  const constraints = sizeSolar(b, {
    specificYieldKwhPerKwp: settings.specificYield, offsets: [settings.offsetPct / 100],
    sanctionedLoadKw: a.sanctioned.kw, contractDemandKva: typeof a.latest?.contractDemand === "number" ? a.latest.contractDemand : null,
    existingSolarKw: typeof a.latest?.solarCapacityKw === "number" ? a.latest.solarCapacityKw : null,
  }).constraints;

  return (
    <>
      {/* §05 Energy baseline and sizing */}
      <div className="sec">
        <span className="sec-lbl">§ 05 — Energy Baseline &amp; Solar Sizing</span>
        <div className="sec-line" />
        <span className="badge">{fromHistory ? "Billing history average" : "Meter reading (kWh)"}</span>
      </div>

      <div className="card">
        <div className="card-h"><span className="card-t">Sizing assumptions</span></div>
        <div className="card-b">
          <div className="f" style={{ marginBottom: 12 }}><div className="flbl">Consumption baseline</div>
            <select className="inp" value={settings.baseline ?? "auto"} onChange={(e) => onChange({ baseline: e.target.value as BaselineStrategy })}>
              <option value="auto">Automatic — {fromHistory ? "billing history" : "meter reading"}</option>
              <option value="history">{option("Billing-history average (printed months)", hb)}</option>
              <option value="meter" disabled={!mb}>{option(`Meter reading (${mb ? `${mb.periods} bill${mb.periods === 1 ? "" : "s"}` : "no kWh"})`, mb)}</option>
            </select>
            <div className="hint">{hb
              ? `Automatic uses the average of the printed billing-history months (${a.latest?.billingHistoryUnit === "kVAh" ? "billed kVAh" : "as printed"}) when there are 6+ of them, as in the office workbook.`
              : "No readable billing-history months — sized on the meter reading."}</div></div>
          <div className="fr3">
            <div className="f"><div className="flbl">Assumed annual specific yield (kWh/kWp/yr)</div>
              <input className="inp" type="number" min={0} value={settings.specificYield} onChange={numIn("specificYield", 0)} />
              <div className="hint">An assumption, not a measurement: adjust for the actual site, tilt, shading and system losses.</div></div>
            <div className="f"><div className="flbl">Energy offset target (%)</div>
              <input className="inp" type="number" min={0} value={settings.offsetPct} onChange={numIn("offsetPct", 100)} />
              <div className="hint">Share of annual consumption the plant should generate.</div></div>
            <div className="f"><div className="flbl">Sizing margin (%)</div>
              <input className="inp" type="number" min={0} value={settings.marginPct} onChange={numIn("marginPct", 0)} />
              <div className="hint">{settings.marginPct > 0 ? `× ${(1 + settings.marginPct / 100).toFixed(2)} — adds ${kwp(p.marginKwp, 2)} (workbook: 10 %).` : "0 % = no margin (workbook uses 10 %)."}</div></div>
          </div>
        </div>
      </div>

      <div className="pipe">
        {[
          fromHistory
            ? { n: "01", k: "MONTHLY AVERAGE", v: `${b!.avgMonthlyKwh.toFixed(2)} units`, s: `${b!.periods} printed months` }
            : { n: "01", k: "ACTIVE ENERGY", v: b ? `${fmtNum(b.totalKwh)} kWh` : "--", s: b ? `${b.periods} period${b.periods === 1 ? "" : "s"}${b.totalDays ? ` · ${b.totalDays} days` : ""}` : "no valid kWh yet" },
          { n: "02", k: "ANNUAL", v: b ? `${fmtNum(b.annualKwh)}` : "--", s: b?.annualBasis ?? "" },
          { n: "03", k: `× ${(1 + settings.marginPct / 100).toFixed(2)} ÷ ${settings.specificYield || "?"}`, v: kwp(p.solarCapacityRawKwp, 3), s: "calculated solar capacity" },
          { n: "04", k: "TOD SHARE (B+C)", v: hasTod ? tod.utilisableFraction.toFixed(4) : "--", s: hasTod ? "06–17 h tariff bands" : "no complete TOD table" },
          { n: "05", k: "TOD CONSIDERATION", v: hasTod ? p.todConsideration.toFixed(4) : "--", s: "share +10 %" },
          { n: "06", k: "TOD CAPACITY", v: hasTod ? kwp(p.todSolarCapacityKwp, 3) : "--", s: "consideration × calculated" },
          { n: "07", k: "PANELS", v: p.recommendedPanels > 0 ? `${p.recommendedPanels} → ${p.recommendedKwp.toFixed(1)} kWp` : "--", s: `${settings.panelWatt} W each, rounded` },
          { n: "08", k: "GENERATION / YR", v: p.solarGenPerYearKwh > 0 ? `${fmtNum(p.solarGenPerYearKwh)} kWh` : "--", s: "recommended × yield" },
        ].map((s) => (
          <div key={s.n} className={`ps ${s.v !== "--" ? "done" : "pend"}`}>
            <div className="ps-n">STEP {s.n}</div>
            <div className="ps-k">{s.k}</div>
            <div className="ps-v">{s.v}</div>
            <div className="ps-n" style={{ marginTop: 2 }}>{s.s}</div>
          </div>
        ))}
      </div>
      {(b?.notes.length || !(settings.specificYield > 0) || a.baselineIssue) && (
        <div className="vals" style={{ marginTop: 8 }}>
          {a.baselineIssue && <div className="vl err"><div className="vdot" />Not sized: {a.baselineIssue}</div>}
          {!(settings.specificYield > 0) && <div className="vl err"><div className="vdot" />Enter an annual specific yield to size the plant.</div>}
          {b?.notes.map((n) => <div key={n} className="vl warn"><div className="vdot" />{n}</div>)}
        </div>
      )}

      {/* §06 Output */}
      <div className="sec">
        <span className="sec-lbl">§ 06 — Output (preliminary)</span>
        <div className="sec-line" />
        {b && <span className="badge">{b.confidence} confidence · {b.periods} period{b.periods === 1 ? "" : "s"}</span>}
      </div>
      <div className="g4">
        <div className="res rg">
          <div className="rl">Actual solar capacity (recommended)</div>
          <div className="rv cg"><AnimatedNumber value={p.recommendedKwp} decimals={1} /></div>
          <div className="ru">kWp</div>
          <div className="rs">{p.recommendedPanels > 0 ? `${p.recommendedPanels} panels · ${p.recommendedBasis === "tod" ? "TOD consideration × calculated capacity" : "full calculated capacity (no TOD table)"}` : "-- panels"}</div>
        </div>
        <div className="res rpurp">
          <div className="rl">TOD share (B+C)</div>
          <div className="rv cp">{hasTod ? <AnimatedNumber value={tod.utilisableFraction * 100} decimals={2} /> : "--"}</div>
          <div className="ru">%</div>
          <div className="rs">{hasTod ? `06–17 h tariff bands, ${todUnit} · +10 % = ${(p.todConsideration * 100).toFixed(2)} %`
            : tod.missing.length ? `slot ${tod.missing.join(", ")} blank — enter it in § 04`
            : tod.unreconciled ? `slots add up to ${fmtNum(tod.totalUnits)}, not the bill's kWh/kVAh — fix § 04`
            : "no TOD data on bill"}</div>
        </div>
        <div className="res rp">
          <div className="rl">Calculated solar capacity</div>
          <div className="rv cc"><AnimatedNumber value={p.solarCapacityRawKwp} decimals={1} /></div>
          <div className="ru">kWp</div>
          <div className="rs">{p.fullPanels > 0 ? `avg × 12 × ${(1 + settings.marginPct / 100).toFixed(2)} ÷ ${settings.specificYield} · ${p.fullPanels} panels before TOD` : "-- panels"}</div>
        </div>
        <div className="res ra">
          <div className="rl">Indicative annual saving</div>
          <div className="rv ca">{p.annualSavingAvgRate > 0 ? fmtINR(p.annualSavingAvgRate) : "--"}</div>
          <div className="ru">₹ / year</div>
          <div className="rs">{energyRate > 0 ? `generation × ₹${energyRate.toFixed(2)}/kWh (variable charges ÷ kWh)` : a.rateIssue ?? "needs energy charges and kWh"}</div>
        </div>
      </div>

      <div className="g3" style={{ marginBottom: 20 }}>
        <div className="card">
          <div className="card-h"><span className="card-t">Load &amp; demand</span></div>
          <div className="card-b">
            <div className="cr-row"><span className="cr-name">Sanctioned load (as printed)</span><span className="cc">{a.sanctioned.originalValue !== null ? `${a.sanctioned.originalValue} ${a.sanctioned.originalUnit === "unknown" ? "(unit?)" : a.sanctioned.originalUnit}` : "--"}</span></div>
            <div className="cr-row"><span className="cr-name">Sanctioned load (kW)</span><span className="cc">{a.sanctioned.kw !== null ? `${a.sanctioned.kw} kW` : "--"}</span></div>
            {a.sanctioned.method === "HP × 0.746" && <div className="cr-row"><span className="cr-name">Conversion</span><span className="cp">HP × 0.746</span></div>}
            {a.connected.originalValue !== null && <div className="cr-row"><span className="cr-name">Connected load</span><span className="cc">{a.connected.originalValue} {a.connected.originalUnit === "unknown" ? "(unit?)" : a.connected.originalUnit}{a.connected.kw !== null && a.connected.originalUnit !== "kW" ? ` = ${a.connected.kw} kW` : ""}</span></div>}
            <div className="cr-row"><span className="cr-name">Contract demand</span><span className="cc">{typeof a.latest?.contractDemand === "number" ? `${a.latest.contractDemand} kVA` : "--"}</span></div>
            {(a.sanctioned.warning || a.connected.warning) && <div className="hint" style={{ color: "var(--amber)" }}>{a.sanctioned.warning ?? a.connected.warning}</div>}
          </div>
        </div>
        <div className="card">
          <div className="card-h"><span className="card-t">Still to verify</span></div>
          <div className="card-b">
            {constraints.map((c) => <div key={c} className="hint" style={{ marginBottom: 6 }}>• {c}</div>)}
          </div>
        </div>
        <div className="card">
          <div className="card-h"><span className="card-t">Savings &amp; payback (indicative)</span></div>
          <div className="card-b">
            <div className="cr-row"><span className="cr-name">Energy rate (energy + TOD + FAC + wheeling + ED + ToSE) ÷ kWh</span><span className="cc">{energyRate > 0 ? `₹${energyRate.toFixed(2)}/kWh` : "--"}</span></div>
            <div className="cr-row"><span className="cr-name">Generation / year (recommended kWp × yield)</span><span className="cc">{p.solarGenPerYearKwh > 0 ? `${fmtNum(p.solarGenPerYearKwh)} kWh` : "--"}</span></div>
            <div className="cr-row"><span className="cr-name">Annual saving (avg rate)</span><span className="cg">{p.annualSavingAvgRate > 0 ? fmtINR(p.annualSavingAvgRate) : "--"}</span></div>
            <div className="cr-row"><span className="cr-name">Annual saving (ROUNDUP rate)</span><span className="cg">{p.annualSavingRoundUpRate > 0 ? fmtINR(p.annualSavingRoundUpRate) : "--"}</span></div>
            <div className="cr-row">
              <span className="cr-name">System cost (₹)</span>
              <input className="cr-inp" type="number" placeholder="Optional" value={settings.systemCost === "" ? "" : String(settings.systemCost)} onChange={(e) => onChange({ systemCost: e.target.value === "" ? "" : Number(e.target.value) })} />
            </div>
            <div className="cr-row"><span className="cr-name">Simple payback</span><span className="ca">{p.simplePaybackYears !== null ? `${p.simplePaybackYears.toFixed(1)} yrs` : "--"}</span></div>
            <div className="hint">Demand and fixed charges are left out of the rate — they do not fall with kWh. Treat as an estimate.</div>
          </div>
        </div>
      </div>
    </>
  );
}
