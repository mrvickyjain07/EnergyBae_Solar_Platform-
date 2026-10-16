// src/modules/commercial/CiSizingPanel.tsx
// Sizing assumptions and results for C&I bills, shared by Single bill and
// Several bills so both show the same engine (consumptionSizing.analyseCommercial)
// the same way. Everything here is display + the three editable assumptions;
// no arithmetic lives in this file.
//
// What it must make obvious (decided 2026-10-15): sizing uses active energy in
// kWh only; the yield is an editable assumption; the optional margin defaults
// to 0 % and its effect is shown; the offset target is separate from it; and the
// theoretical energy-based size is not the installable capacity. The TOD figure
// is a tariff-band proxy (billed units, low confidence), shown apart from it.
import React from "react";
import AnimatedNumber from "../../components/AnimatedNumber";
import type { SizingSettings } from "./commercialCalculations";
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
        <span className="badge">Active energy (kWh) only</span>
      </div>

      <div className="card">
        <div className="card-h"><span className="card-t">Sizing assumptions</span></div>
        <div className="card-b">
          <div className="fr3">
            <div className="f"><div className="flbl">Assumed annual specific yield (kWh/kWp/yr)</div>
              <input className="inp" type="number" min={0} value={settings.specificYield} onChange={numIn("specificYield", 0)} />
              <div className="hint">An assumption, not a measurement: adjust for the actual site, tilt, shading and system losses.</div></div>
            <div className="f"><div className="flbl">Energy offset target (%)</div>
              <input className="inp" type="number" min={0} value={settings.offsetPct} onChange={numIn("offsetPct", 100)} />
              <div className="hint">Share of annual consumption the plant should generate.</div></div>
            <div className="f"><div className="flbl">Additional sizing margin (%)</div>
              <input className="inp" type="number" min={0} value={settings.marginPct} onChange={numIn("marginPct", 0)} />
              <div className="hint">{settings.marginPct > 0 ? `Adds ${kwp(p.marginKwp, 2)} to the theoretical size.` : "Optional; 0 % = no margin applied."}</div></div>
          </div>
        </div>
      </div>

      <div className="pipe">
        {[
          { n: "01", k: "ACTIVE ENERGY", v: b ? `${fmtNum(b.totalKwh)} kWh` : "--", s: b ? `${b.periods} period${b.periods === 1 ? "" : "s"}` : "no valid kWh yet" },
          { n: "02", k: "READING DAYS", v: b?.totalDays ? `${b.totalDays} days` : "--", s: b ? (b.totalDays ? "from reading dates" : "dates missing") : "" },
          { n: "03", k: "ANNUAL kWh", v: b ? `${fmtNum(b.annualKwh)} kWh` : "--", s: b?.annualBasis ?? "" },
          { n: "04", k: `TARGET (${settings.offsetPct}%)`, v: p.targetKwh > 0 ? `${fmtNum(p.targetKwh)} kWh` : "--", s: "annual × offset" },
          { n: "05", k: "THEORETICAL", v: kwp(p.theoreticalKwp, 2), s: `÷ ${settings.specificYield || "?"} kWh/kWp` },
          { n: "06", k: `+ MARGIN (${settings.marginPct}%)`, v: kwp(p.solarCapacityRawKwp, 2), s: p.marginKwp > 0 ? `+${p.marginKwp.toFixed(2)} kWp` : "no margin" },
          { n: "07", k: "PANELS", v: p.fullPanels > 0 ? `${p.fullPanels} → ${p.fullKwp.toFixed(1)} kWp` : "--", s: `${settings.panelWatt} W each` },
          { n: "08", k: "GENERATION / YR", v: p.solarGenPerYearKwh > 0 ? `${fmtNum(p.solarGenPerYearKwh)} kWh` : "--", s: "panels × yield" },
        ].map((s) => (
          <div key={s.n} className={`ps ${s.v !== "--" ? "done" : "pend"}`}>
            <div className="ps-n">STEP {s.n}</div>
            <div className="ps-k">{s.k}</div>
            <div className="ps-v">{s.v}</div>
            <div className="ps-n" style={{ marginTop: 2 }}>{s.s}</div>
          </div>
        ))}
      </div>
      {(b?.notes.length || !(settings.specificYield > 0)) && (
        <div className="vals" style={{ marginTop: 8 }}>
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
        <div className="res rp">
          <div className="rl">Theoretical energy-based</div>
          <div className="rv cc"><AnimatedNumber value={p.fullKwp} decimals={1} /></div>
          <div className="ru">kWp</div>
          <div className="rs">{p.fullPanels > 0 ? `${p.fullPanels} panels · offsets ${settings.offsetPct}% of kWh · not yet installable` : "-- panels"}</div>
        </div>
        <div className="res rpurp">
          <div className="rl">TOD band proxy · low confidence</div>
          <div className="rv cp">{hasTod ? <AnimatedNumber value={tod.utilisableFraction * 100} decimals={2} /> : "--"}</div>
          <div className="ru">%</div>
          <div className="rs">{hasTod ? `06–17 h tariff bands, ${todUnit} — not measured daytime load` : "no TOD data on bill"}</div>
        </div>
        <div className="res rg">
          <div className="rl">TOD proxy capacity · low confidence</div>
          <div className="rv cg">{hasTod ? <AnimatedNumber value={p.todKwp} decimals={1} /> : "--"}</div>
          <div className="ru">kWp</div>
          <div className="rs">theoretical × band share · indicative only, not a recommendation</div>
        </div>
        <div className="res ra">
          <div className="rl">Indicative annual saving</div>
          <div className="rv ca">{p.annualSavingAvgRate > 0 ? fmtINR(p.annualSavingAvgRate) : "--"}</div>
          <div className="ru">₹ / year</div>
          <div className="rs">{energyRate > 0 ? `generation × ₹${energyRate.toFixed(2)}/kWh (variable charges ÷ kWh)` : "needs energy charges and kWh"}</div>
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
            <div className="cr-row"><span className="cr-name">Generation / year (theoretical kWp × yield)</span><span className="cc">{p.solarGenPerYearKwh > 0 ? `${fmtNum(p.solarGenPerYearKwh)} kWh` : "--"}</span></div>
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
