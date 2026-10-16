import React, { useEffect, useMemo } from "react";
import { AnimatePresence, motion } from "motion/react";
import { User, Sliders, Zap, BatteryCharging, Building2, Landmark, Cable, Sparkles, Sun, LayoutGrid, BadgeIndianRupee, Globe, Rows3, TriangleRight, Building, Warehouse, Mountain, Wand2, PencilLine, Home, Store, Factory, CircleSlash, ShieldCheck, Shield, ShieldOff } from "lucide-react";
import { computeEarthingPits, normalizeEarthingType } from "../earthingRules";
import { Catalogue, ProposalInputs, ProposalMeta } from "../types";
import { generateProposalNumber, fmtINR } from "../calculations";
import { findBestInverter, InverterCandidate, InverterMatch } from "../matchInverter";
import { sanitizePrice } from "../sanitizePrice";
import { COMMON_PANEL_BRANDS, COMMON_PANEL_WPS } from "../panelDefaults";
import { ChoiceField, FieldGrid, SectionCard, SelectField, TextAreaField, TextField } from "./FormField";
import SearchableSelect from "./SearchableSelect";
import StructureDetails from "./StructureDetails";
import { STRUCTURE_TYPE_DEFS, applyStructureType, type StructureCode } from "../structureTypes";

const STRUCTURE_ICONS: Record<StructureCode, React.ComponentType<{ className?: string }>> = { "S-F": Warehouse, "S-T": TriangleRight, "N-E": Rows3, E: Building, GM: Mountain };
import { CalcStep } from "./StepNav";

interface ProposalFormProps {
  inputs: ProposalInputs;
  setInputs: React.Dispatch<React.SetStateAction<ProposalInputs>>;
  meta: ProposalMeta;
  setMeta: React.Dispatch<React.SetStateAction<ProposalMeta>>;
  catalogue: Catalogue;
  inverterPrices: InverterCandidate[];
  attemptedSubmit: boolean;
  onRegenerateProposalNo: () => void;
  step: CalcStep;
}

interface WireOption { internal_name: string; price_per_m: number; size_sqmm: number | null; cores: number | null }

// Company -> specific product picker for one cable BOQ row, scoped to the
// wire_prices category that row's engineering spec actually calls for (see
// calcBOQ in calculations.ts) — so this is deliberately not a free category
// choice, just Company then Wire within the fixed category.
function WireCableSelect({ label, wireType, brand, wireName, onChange }: {
  label: string;
  wireType: string;
  brand: string;
  wireName: string;
  onChange: (brand: string, wireName: string, unitCost: number) => void;
}) {
  const [brands, setBrands] = React.useState<string[]>([]);
  const [wires, setWires] = React.useState<WireOption[]>([]);

  useEffect(() => {
    fetch(`/api/wire-prices?type=${encodeURIComponent(wireType)}`)
      .then((r) => r.json())
      .then((d) => setBrands(Array.from(new Set((d.rows ?? []).map((r: any) => r.brand).filter(Boolean))).sort() as string[]))
      .catch(() => {});
  }, [wireType]);

  useEffect(() => {
    if (!brand) { setWires([]); return; }
    fetch(`/api/wire-prices?type=${encodeURIComponent(wireType)}&brand=${encodeURIComponent(brand)}`)
      .then((r) => r.json())
      .then((d) => setWires(d.rows ?? []))
      .catch(() => {});
  }, [wireType, brand]);

  // Sorted by conductor size then core count — the catalogue's own naming
  // sorts "10 sqmm" before "2 sqmm" alphabetically, which is unreadable when
  // you're hunting for a size.
  const sortedWires = React.useMemo(
    () => [...wires].sort((a, b) => (a.size_sqmm ?? 0) - (b.size_sqmm ?? 0) || (a.cores ?? 0) - (b.cores ?? 0)),
    [wires]
  );

  return (
    <div className="grid grid-cols-3 gap-3">
      <SelectField label={`${label} Company`} value={brand} onChange={(e) => onChange(e.target.value, "", 0)}>
        <option value="">Select an option</option>
        {brands.map((b) => <option key={b} value={b}>{b}</option>)}
      </SelectField>
      <div className="col-span-2">
        <SearchableSelect
          label={`${label} (₹/m, from wire prices)`}
          value={wireName}
          disabled={!brand}
          placeholder={brand ? "Select a wire" : "Select a company first"}
          options={sortedWires.map((w) => ({
            value: w.internal_name,
            label: w.internal_name,
            hint: `₹${w.price_per_m}/m`,
          }))}
          onSelect={(v) => {
            const w = wires.find((x) => x.internal_name === v);
            onChange(brand, v, w ? w.price_per_m : 0);
          }}
        />
      </div>
    </div>
  );
}

// Brand -> specific-model picker for the Inverter section, scoped to
// whatever the current System Type + Phase actually has priced (see
// matchInverter.ts / inverter_prices) — same two-tier search pattern as
// WireCableSelect above, so browsing/searching works the same way in both
// places. Auto mode's live match still drives Unit Cost/Qty on its own; this
// is for browsing the DB and picking a specific model.
function InverterSelect({
  inverterPrices,
  systemType,
  phase,
  brand,
  model,
  onSelectBrand,
  onSelectModel,
}: {
  inverterPrices: InverterCandidate[];
  systemType: ProposalInputs["systemType"];
  phase: 1 | 3 | null;
  brand: string;
  model: string;
  onSelectBrand: (brand: string) => void;
  onSelectModel: (candidate: InverterCandidate) => void;
}) {
  const inScope = useMemo(
    () => inverterPrices.filter((c) => c.isActive && c.systemType === systemType && (phase === null || c.phase === phase)),
    [inverterPrices, systemType, phase]
  );
  const brands = useMemo(() => Array.from(new Set(inScope.map((c) => c.brand))).sort(), [inScope]);
  const models = useMemo(() => inScope.filter((c) => c.brand === brand).sort((a, b) => a.kw - b.kw), [inScope, brand]);

  return (
    <div className="grid grid-cols-2 gap-3">
      <SearchableSelect
        label="Inverter Brand"
        value={brand}
        placeholder={inScope.length ? "Select a brand" : "No inverter pricing available for this system type/phase"}
        options={brands.map((b) => ({ value: b, label: b }))}
        onSelect={onSelectBrand}
      />
      <SearchableSelect
        label="Model"
        value={model}
        disabled={!brand}
        placeholder={brand ? "Select a model" : "Select a brand first"}
        options={models.map((c) => ({ value: c.model, label: c.model, hint: `${c.kw} kW • ₹${c.price.toLocaleString("en-IN")}` }))}
        onSelect={(v) => {
          const c = models.find((x) => x.model === v);
          if (c) onSelectModel(c);
        }}
      />
    </div>
  );
}

const numOrEmpty = (v: number | "") => (v === "" ? "" : String(v));
// Same guard PriceDatabase.tsx uses on every price cell — negative/non-numeric
// input never lands in state, so it can't reach the BOQ math (Day 30).
const parseNum = (v: string): number | "" => (v === "" ? "" : sanitizePrice(v));

const MANUAL_OPTION = "__manual__";
const COMMON_BATTERY_MAKES = ["Luminous", "Exide", "Amaron", "Amara Raja", "Livguard", "Microtek", "Okaya", "Su-Kam"];
const COMMON_BATTERY_TYPES = ["Tubular", "Flat Plate (Lead Acid)", "SMF / VRLA", "Li-ion", "C10", "C20"];

export default function ProposalForm({ inputs, setInputs, meta, setMeta, catalogue, inverterPrices, attemptedSubmit, onRegenerateProposalNo, step }: ProposalFormProps) {
  // Display only — the authoritative value is recomputed by calcBOQ (also on the server).
  const earthingPits = computeEarthingPits(inputs.numInverters, inputs.laType);
  const set = <K extends keyof ProposalInputs>(key: K) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const raw = e.target.value;
    setInputs((prev) => ({ ...prev, [key]: raw as any }));
  };
  const setNum = <K extends keyof ProposalInputs>(key: K) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setInputs((prev) => ({ ...prev, [key]: parseNum(e.target.value) as any }));
  };

  // Panel Brand/Wp: pick from a curated list or type your own. Price/Wp is
  // always typed in directly — there's no catalogue-driven auto-fill.
  const panelBrands = COMMON_PANEL_BRANDS;
  const panelWps = COMMON_PANEL_WPS;

  // Local UI state only (not part of ProposalInputs) — which control renders.
  // Lazy-initialized so a brand/Wp typed before this existed still opens in
  // manual mode instead of silently not matching any option.
  const [panelBrandMode, setPanelBrandMode] = React.useState<"list" | "manual">(() =>
    inputs.panelBrand && !panelBrands.includes(inputs.panelBrand) ? "manual" : "list"
  );
  const [panelWpMode, setPanelWpMode] = React.useState<"list" | "manual">(() =>
    inputs.panelWp !== "" && !panelWps.includes(Number(inputs.panelWp)) ? "manual" : "list"
  );

  // Auto mode: inverter unit cost + qty track the Inverter Price DB by
  // system type + phase + kW (+ brand, if given) — see matchInverter.ts.
  // Switching System Type re-runs this immediately so an incompatible
  // inverter is never silently kept. Manual mode leaves whatever the user
  // typed alone.
  const normalizedPhase: 1 | 3 | null = inputs.phase === "3-Phase" ? 3 : inputs.phase === "1-Phase" ? 1 : null;

  const inverterMatch: InverterMatch | null = useMemo(() => {
    if (!normalizedPhase || inputs.capacity === "") return null;
    return findBestInverter(inverterPrices, { systemType: inputs.systemType, phase: normalizedPhase, requiredCapacity: Number(inputs.capacity), brand: inputs.inverterBrand || undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inverterPrices, inputs.systemType, normalizedPhase, inputs.capacity, inputs.inverterBrand]);

  useEffect(() => {
    if (inputs.inverterMode !== "auto" || !inverterMatch?.candidate) return;
    const { candidate, quantity } = inverterMatch;
    setInputs((prev) =>
      prev.inverterUnitCost === candidate.price && prev.numInverters === quantity && prev.inverterModel === candidate.model && prev.inverterSize === candidate.kw
        ? prev
        : { ...prev, inverterUnitCost: candidate.price, numInverters: quantity, inverterModel: candidate.model, inverterSize: candidate.kw }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputs.inverterMode, inverterMatch]);

  // On-Grid systems carry no battery — clear any previously-entered battery
  // fields so a hidden section can't leave a stale battery cost in the BOQ.
  useEffect(() => {
    if (inputs.systemType !== "On-Grid") return;
    setInputs((prev) =>
      prev.batteryMake || prev.numBatteries !== ""
        ? { ...prev, batteryMake: "", batteryType: "", batteryModel: "", batteryAh: "", batteryV: "", batteryUnitCost: "", numBatteries: "" }
        : prev
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputs.systemType]);

  // Battery Make/Type: same curated-list-or-type-your-own pattern as Panel
  // Brand/Wp — no catalogue lookup, Ah/V/Unit Cost are always typed directly.
  const [battMakeMode, setBattMakeMode] = React.useState<"list" | "manual">(() =>
    inputs.batteryMake && inputs.batteryMake !== "None" && !COMMON_BATTERY_MAKES.includes(inputs.batteryMake) ? "manual" : "list"
  );
  const [battTypeMode, setBattTypeMode] = React.useState<"list" | "manual">(() =>
    inputs.batteryType && !COMMON_BATTERY_TYPES.includes(inputs.batteryType) ? "manual" : "list"
  );

  const showCustomerErr = attemptedSubmit && !inputs.customerName.trim();
  const showCapacityErr = attemptedSubmit && inputs.capacity === "";
  const showPhaseErr = attemptedSubmit && !inputs.phase;
  const showPanelTypeErr = attemptedSubmit && !inputs.panelType;
  const showPanelBrandErr = attemptedSubmit && !inputs.panelBrand;
  const showPanelWpErr = attemptedSubmit && inputs.panelWp === "";

  return (
    <div className={`grid grid-cols-1 gap-4 ${step === "customer" ? "lg:grid-cols-3 items-start" : "lg:grid-cols-2"}`}>
      {step === "customer" && (
        <>
      {/* Customer Info. Proposal No./date live on Review & Export, where the proposal is produced. */}
      <div className="lg:col-span-3">
      <SectionCard title="Customer Information" subtitle="Who this proposal is for" icon={User}>
        <FieldGrid>
          <TextField label="Customer Name" required invalid={showCustomerErr} errorText="Customer name is required" placeholder="Mr. / Ms. Full Name" value={inputs.customerName} onChange={set("customerName")} />
          <TextField label="Contact Number" placeholder="+91 XXXXX XXXXX" value={inputs.contactNumber} onChange={set("contactNumber")} />
        </FieldGrid>
        <TextAreaField label="Customer Address" placeholder="Full address..." value={inputs.customerAddress} onChange={set("customerAddress")} />
        <FieldGrid>
          <TextField label="Sanctioned Load (kW)" type="number" placeholder="0" value={numOrEmpty(inputs.sanctionedLoad)} onChange={setNum("sanctionedLoad")} />
          <TextField label="Unit Cost (₹/kWh)" type="number" placeholder="0" value={numOrEmpty(inputs.unitCost)} onChange={setNum("unitCost")} />
        </FieldGrid>
      </SectionCard>
      </div>
        </>
      )}
      {step === "system" && (
        <>
      {/* The system — the decisions every BOQ line depends on, as visible choices. */}
      <div className="lg:col-span-2">
      <SectionCard title="System" subtitle="Type, size and the choices every BOQ line depends on" icon={Sliders}>
        <ChoiceField<ProposalInputs["systemType"]> label="System Type" value={inputs.systemType} onChange={(v) => setInputs((prev) => ({ ...prev, systemType: v }))} options={[
          { value: "On-Grid", label: "On-Grid", description: "Grid-tied, no battery", icon: Sun },
          { value: "Off-Grid", label: "Off-Grid", description: "Battery backup, no grid", icon: BatteryCharging },
          { value: "Hybrid", label: "Hybrid", description: "Grid-tied with battery", icon: Zap },
        ]} />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,2fr)] gap-4 items-start">
          <TextField label="Required Capacity (kW)" required invalid={showCapacityErr} errorText="Capacity is required" type="number" placeholder="e.g. 3" value={numOrEmpty(inputs.capacity)} onChange={setNum("capacity")} />
          <ChoiceField<"1-Phase" | "3-Phase"> label="System Phase" required invalid={showPhaseErr} errorText="Select a phase" value={inputs.phase}
            onChange={(v) => setInputs((prev) => ({ ...prev, phase: v }))} options={[{ value: "1-Phase", label: "1-Phase" }, { value: "3-Phase", label: "3-Phase" }]} />
          <ChoiceField<"DCR" | "NDCR"> label="Panel Type" required invalid={showPanelTypeErr} errorText="Select a panel type" value={inputs.panelType}
            onChange={(v) => setInputs((prev) => ({ ...prev, panelType: v }))} options={[
              { value: "DCR", label: "DCR", description: "Domestic cells — subsidy applies", icon: BadgeIndianRupee },
              { value: "NDCR", label: "NDCR", description: "Non-domestic cells — no subsidy", icon: Globe },
            ]} />
        </div>
        <ChoiceField<StructureCode> label="Structure Type" value={inputs.structureType} onChange={(v) => setInputs((prev) => applyStructureType(prev, v))}
          options={STRUCTURE_TYPE_DEFS.map((d) => ({ value: d.code, label: d.label, description: d.description, icon: STRUCTURE_ICONS[d.code] }))} />
        <StructureDetails inputs={inputs} setNum={setNum} />
      </SectionCard>
      </div>

      {/* Panels */}
      <SectionCard title="Solar Panels" subtitle="Brand, wattage and price" icon={LayoutGrid}>
        <FieldGrid>
          <div>
            {panelBrandMode === "manual" ? (
              <>
                <TextField
                  label="Panel Brand"
                  required
                  invalid={showPanelBrandErr}
                  errorText="Enter a panel brand"
                  placeholder="Type brand name"
                  value={inputs.panelBrand}
                  onChange={set("panelBrand")}
                />
                <button
                  type="button"
                  onClick={() => { setPanelBrandMode("list"); setPanelWpMode("list"); setInputs((prev) => ({ ...prev, panelBrand: "", panelWp: "", panelPriceWp: "" })); }}
                  className="text-[9px] text-[var(--accent-green)] mt-1 hover:underline"
                >
                  ← Choose from list
                </button>
              </>
            ) : (
              <SelectField
                label="Panel Brand"
                required
                invalid={showPanelBrandErr}
                errorText="Select a panel brand"
                value={inputs.panelBrand}
                onChange={(e) => {
                  if (e.target.value === MANUAL_OPTION) {
                    setPanelBrandMode("manual");
                    setPanelWpMode("list");
                    setInputs((prev) => ({ ...prev, panelBrand: "", panelWp: "", panelPriceWp: "" }));
                  } else {
                    setPanelWpMode("list");
                    setInputs((prev) => ({ ...prev, panelBrand: e.target.value, panelWp: "", panelPriceWp: "" }));
                  }
                }}
              >
                <option value="">Select an option</option>
                {panelBrands.map((b) => (
                  <option key={b}>{b}</option>
                ))}
                <option value={MANUAL_OPTION}>+ Other (type manually)</option>
              </SelectField>
            )}
          </div>
        </FieldGrid>
        <FieldGrid>
          <div>
            {panelWpMode === "manual" ? (
              <>
                <TextField
                  label="Panel Wp"
                  required
                  invalid={showPanelWpErr}
                  errorText="Enter the panel Wp"
                  type="number"
                  placeholder="e.g. 600"
                  disabled={!inputs.panelBrand}
                  value={numOrEmpty(inputs.panelWp)}
                  onChange={setNum("panelWp")}
                />
                <button
                  type="button"
                  onClick={() => { setPanelWpMode("list"); setInputs((prev) => ({ ...prev, panelWp: "", panelPriceWp: "" })); }}
                  className="text-[9px] text-[var(--accent-green)] mt-1 hover:underline"
                >
                  ← Choose from list
                </button>
              </>
            ) : (
              <SelectField
                label="Panel Wp"
                required
                invalid={showPanelWpErr}
                errorText="Select a panel Wp"
                disabled={!inputs.panelBrand}
                value={numOrEmpty(inputs.panelWp)}
                onChange={(e) => {
                  if (e.target.value === MANUAL_OPTION) {
                    setPanelWpMode("manual");
                    setInputs((prev) => ({ ...prev, panelWp: "", panelPriceWp: "" }));
                  } else {
                    setNum("panelWp")(e);
                  }
                }}
              >
                <option value="">Select an option</option>
                {panelWps.map((wp) => (
                  <option key={wp} value={wp}>
                    {wp} Wp
                  </option>
                ))}
                <option value={MANUAL_OPTION}>+ Other (type manually)</option>
              </SelectField>
            )}
          </div>
          <TextField label="Price / Wp (₹)" type="number" placeholder="e.g. 25" value={numOrEmpty(inputs.panelPriceWp)} onChange={setNum("panelPriceWp")} />
        </FieldGrid>
      </SectionCard>

      {/* Inverter */}
      <SectionCard title="Inverter" subtitle="Model, quantity and price" icon={Zap}>
        <ChoiceField<"auto" | "manual"> label="Pricing" value={inputs.inverterMode} onChange={(m) => setInputs((prev) => ({ ...prev, inverterMode: m }))} options={[
          { value: "auto", label: "Auto", description: "Matched from your inverter price list", icon: Wand2 },
          { value: "manual", label: "Manual", description: "Type the brand and price yourself", icon: PencilLine },
        ]} />
        {inputs.inverterMode === "auto" ? (
          <InverterSelect
            inverterPrices={inverterPrices}
            systemType={inputs.systemType}
            phase={normalizedPhase}
            brand={inputs.inverterBrand}
            model={inputs.inverterModel}
            onSelectBrand={(b) => setInputs((prev) => ({ ...prev, inverterBrand: b, inverterModel: "" }))}
            onSelectModel={(c) => setInputs((prev) => ({ ...prev, inverterBrand: c.brand, inverterModel: c.model, inverterUnitCost: c.price, inverterSize: c.kw }))}
          />
        ) : (
          <TextField label="Inverter Brand" placeholder="e.g. Deye, Growatt, Solis" value={inputs.inverterBrand} onChange={set("inverterBrand")} />
        )}
        <div className="grid grid-cols-3 gap-3">
          <TextField label="Size (kW)" type="number" placeholder="Auto" value={numOrEmpty(inputs.inverterSize)} onChange={setNum("inverterSize")} />
          <TextField label="Qty" type="number" placeholder="0" value={numOrEmpty(inputs.numInverters)} onChange={setNum("numInverters")} />
          <TextField label="Floor No." type="number" placeholder="0" value={numOrEmpty(inputs.inverterFloor)} onChange={setNum("inverterFloor")} />
        </div>
        <TextField
          label="Unit Cost (₹)"
          hint={inputs.inverterMode === "auto" ? "AUTO" : undefined}
          type="number"
          placeholder={inputs.inverterMode === "auto" ? (inverterMatch && !inverterMatch.candidate ? "No matching price found" : "Auto-calculated from price list") : "Enter unit cost"}
          value={numOrEmpty(inputs.inverterUnitCost)}
          onChange={setNum("inverterUnitCost")}
        />
        {inputs.inverterMode === "auto" && inverterMatch && (
          <p className={`text-[10px] font-mono ${inverterMatch.candidate ? "text-[var(--text-muted)]" : "text-amber-500"}`}>
            {inverterMatch.candidate ? `Suggested: ${inverterMatch.reason}` : inverterMatch.reason}
          </p>
        )}
        {inputs.numInverters !== "" && inputs.inverterUnitCost !== "" && (
          <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-[var(--hover-bg)] border border-[var(--border-subtle)]">
            <span className="text-xs text-[var(--text-muted)]">
              Total ({inputs.numInverters} × {fmtINR(Number(inputs.inverterUnitCost))})
            </span>
            <span className="text-sm font-bold text-[var(--accent-green)] font-mono">{fmtINR(Number(inputs.numInverters) * Number(inputs.inverterUnitCost))}</span>
          </div>
        )}
      </SectionCard>

      {/* Project Type — customer/subsidy/tax inputs; drives the Savings & Subsidy tab on the BOQ step. */}
      <div className="lg:col-span-2">
      <SectionCard title="Project Type" subtitle="Customer, subsidy scheme and tax benefits" icon={Landmark}>
        <ChoiceField<Exclude<ProposalInputs["financeCustomerType"], "">> label="Customer Type" value={inputs.financeCustomerType}
          onChange={(v) => setInputs((prev) => ({ ...prev, financeCustomerType: v }))} options={[
            { value: "INDIVIDUAL_HOUSE", label: "Individual House", description: "A single home", icon: Home },
            { value: "RESIDENTIAL_SOCIETY", label: "Residential Society", description: "Housing society, common areas", icon: Building2 },
            { value: "COMMERCIAL", label: "Commercial", description: "Shops, offices, institutions", icon: Store },
            { value: "INDUSTRIAL", label: "Industrial", description: "Factories and plants", icon: Factory },
          ]} />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)] gap-4 items-start">
          <div className="sm:col-span-2 lg:col-span-1">
            <ChoiceField<Exclude<ProposalInputs["financeProjectType"], "">> label="Subsidy Scheme" value={inputs.financeProjectType}
              onChange={(v) => setInputs((prev) => ({ ...prev, financeProjectType: v }))} options={[
                { value: "SUBSIDY", label: "PM Surya Ghar", description: "Apply the government subsidy", icon: BadgeIndianRupee },
                { value: "NON_SUBSIDY", label: "No subsidy", description: "Full price, no subsidy claimed", icon: CircleSlash },
              ]} />
          </div>
          <ChoiceField label="Accelerated Depreciation" value={inputs.adApplicable ? "YES" : "NO"}
            onChange={(v) => setInputs((prev) => ({ ...prev, adApplicable: v === "YES" }))} options={[{ value: "NO", label: "No" }, { value: "YES", label: "Yes" }]} />
          <ChoiceField label="GST Registered" value={inputs.gstRegistered ? "YES" : "NO"}
            onChange={(v) => setInputs((prev) => ({ ...prev, gstRegistered: v === "YES" }))} options={[{ value: "NO", label: "No" }, { value: "YES", label: "Yes" }]} />
          <TextField label="No. of Connections" type="number" placeholder="1" value={numOrEmpty(inputs.connections)} onChange={setNum("connections")} />
          <TextField label="Building Floors" type="number" placeholder="0" value={numOrEmpty(inputs.buildingFloors)} onChange={setNum("buildingFloors")} />
        </div>
      </SectionCard>
      </div>

      {/* Wire picker section removed from this form for now (relocation
          pending). WireCableSelect above is kept intact for re-use — the
          wire catalogue itself still lives in Price DB → Wire Prices. */}

      {/* Battery — hidden entirely for On-Grid systems (no battery in a pure grid-tie install) */}
      <AnimatePresence initial={false}>
        {inputs.systemType !== "On-Grid" && (
          <motion.div
            key="battery-section"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <SectionCard title="Battery (Optional)" icon={BatteryCharging}>
              <div>
                {battMakeMode === "manual" ? (
                  <>
                    <TextField
                      label="Battery Make"
                      placeholder="Type brand name"
                      value={inputs.batteryMake}
                      onChange={(e) => setInputs((prev) => ({ ...prev, batteryMake: e.target.value }))}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setBattMakeMode("list");
                        setBattTypeMode("list");
                        setInputs((prev) => ({ ...prev, batteryMake: "", batteryType: "", batteryModel: "", batteryAh: "", batteryV: "", batteryUnitCost: "" }));
                      }}
                      className="text-[9px] text-[var(--accent-green)] mt-1 hover:underline"
                    >
                      ← Choose from list
                    </button>
                  </>
                ) : (
                  <SelectField
                    label="Battery Make"
                    value={inputs.batteryMake}
                    onChange={(e) => {
                      if (e.target.value === MANUAL_OPTION) {
                        setBattMakeMode("manual");
                        setBattTypeMode("list");
                        setInputs((prev) => ({ ...prev, batteryMake: "", batteryType: "", batteryModel: "", batteryAh: "", batteryV: "", batteryUnitCost: "" }));
                      } else {
                        setBattTypeMode("list");
                        setInputs((prev) => ({ ...prev, batteryMake: e.target.value, batteryType: "", batteryModel: "", batteryAh: "", batteryV: "", batteryUnitCost: "" }));
                      }
                    }}
                  >
                    <option value="">Select an option</option>
                    <option value="None">None</option>
                    {COMMON_BATTERY_MAKES.map((m) => (
                      <option key={m}>{m}</option>
                    ))}
                    <option value={MANUAL_OPTION}>+ Other (type manually)</option>
                  </SelectField>
                )}
              </div>
              {inputs.batteryMake && inputs.batteryMake !== "None" && (
                <>
                  <div>
                    {battTypeMode === "manual" ? (
                      <>
                        <TextField label="Battery Type" placeholder="Type battery type" value={inputs.batteryType} onChange={set("batteryType")} />
                        <button
                          type="button"
                          onClick={() => { setBattTypeMode("list"); setInputs((prev) => ({ ...prev, batteryType: "" })); }}
                          className="text-[9px] text-[var(--accent-green)] mt-1 hover:underline"
                        >
                          ← Choose from list
                        </button>
                      </>
                    ) : (
                      <SelectField
                        label="Battery Type"
                        value={inputs.batteryType}
                        onChange={(e) => {
                          if (e.target.value === MANUAL_OPTION) {
                            setBattTypeMode("manual");
                            setInputs((prev) => ({ ...prev, batteryType: "" }));
                          } else {
                            setInputs((prev) => ({ ...prev, batteryType: e.target.value }));
                          }
                        }}
                      >
                        <option value="">Select an option</option>
                        {COMMON_BATTERY_TYPES.map((t) => (
                          <option key={t}>{t}</option>
                        ))}
                        <option value={MANUAL_OPTION}>+ Other (type manually)</option>
                      </SelectField>
                    )}
                  </div>
                  <TextField label="Model (optional)" placeholder="e.g. SF-15042STJ" value={inputs.batteryModel} onChange={set("batteryModel")} />
                  <FieldGrid>
                    <TextField label="Ah" type="number" placeholder="0" value={numOrEmpty(inputs.batteryAh)} onChange={setNum("batteryAh")} />
                    <TextField label="Voltage (V)" type="number" placeholder="0" value={numOrEmpty(inputs.batteryV)} onChange={setNum("batteryV")} />
                  </FieldGrid>
                  <FieldGrid>
                    <TextField label="Qty" type="number" placeholder="0" value={numOrEmpty(inputs.numBatteries)} onChange={setNum("numBatteries")} />
                    <TextField label="Unit Cost (₹)" type="number" placeholder="0" value={numOrEmpty(inputs.batteryUnitCost)} onChange={setNum("batteryUnitCost")} />
                  </FieldGrid>
                </>
              )}
            </SectionCard>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Building & Installation */}
      {/* Installation — layout, structure and earthing in one full-width card
          (was Building & Installation + Structure Details). */}
      <div className="lg:col-span-2">
      <SectionCard title="Installation" subtitle="Layout, structure, lightning protection and earthing" icon={Building2}>
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
          {/* Building Floors moved up to the Project Type section. */}
          <TextField label="Panel Rows" type="number" placeholder="0" value={numOrEmpty(inputs.panelRows)} onChange={setNum("panelRows")} />
          <TextField label="No. of Strings" type="number" placeholder="0" value={numOrEmpty(inputs.numStrings)} onChange={setNum("numStrings")} />
          <TextField label="GI Shed Area (sqft)" type="number" placeholder="0" value={numOrEmpty(inputs.shedArea)} onChange={setNum("shedArea")} />
          <TextField label="Rubber Seal (MTS)" type="number" placeholder="0" value={numOrEmpty(inputs.rubberSeal)} onChange={setNum("rubberSeal")} />
          {/* Heights and Structure Legs moved to Structure Details (System card). Spares are added to each cable run; blank = default. */}
          <TextField label="DC Cable Spare (m)" type="number" placeholder="15" value={numOrEmpty(inputs.dcSpareM ?? "")} onChange={setNum("dcSpareM")} />
          <TextField label="AC Cable Spare (m)" type="number" placeholder="40" value={numOrEmpty(inputs.acSpareM ?? "")} onChange={setNum("acSpareM")} />
          <TextField label="Earthing Cable Spare (m)" type="number" placeholder="40" value={numOrEmpty(inputs.earthSpareM ?? "")} onChange={setNum("earthSpareM")} />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-4 items-start">
        {/* Earthing / LA type. Drives BOQ row 12 (LA), row 15 (LA earthing
            cable) and the earthing-pit count — see calcBOQ / earthingRules. */}
        <ChoiceField<"ESE" | "Conventional" | "NA"> label="Lightning Arrester (LA)" value={normalizeEarthingType(inputs.laType)}
          onChange={(v) => setInputs((prev) => ({ ...prev, laType: v }))} options={[
            { value: "ESE", label: "ESE", description: "Early streamer emission arrester", icon: ShieldCheck },
            { value: "Conventional", label: "Conventional", description: "Conventional lightning arrester", icon: Shield },
            { value: "NA", label: "Not required", description: "No lightning arrester", icon: ShieldOff },
          ]} />
          {/* Earthing pits are derived, not typed. The same rule runs on the
              server when the proposal is saved, so this is display only. */}
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-xs font-medium text-[var(--text-muted)]">Earthing Pits</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-[var(--accent-green)]/10 px-2 py-0.5 text-[11px] font-medium text-[var(--accent-green)]">
                <Sparkles className="w-3 h-3" /> Auto calculated
              </span>
            </div>
            <div
              aria-live="polite"
              className="h-[42px] px-3 flex items-center justify-between rounded-lg border border-dashed border-[var(--border-strong)] bg-[var(--hover-bg)]"
            >
              <motion.span
                key={earthingPits}
                initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}
                className="text-sm font-semibold tabular-nums text-[var(--text-primary)]"
              >
                {earthingPits}
              </motion.span>
              <span className="text-xs text-[var(--text-muted)] truncate ml-3">
                {Number(inputs.numInverters) > 0
                  ? `${inputs.numInverters} inverter${Number(inputs.numInverters) === 1 ? "" : "s"} · ${normalizeEarthingType(inputs.laType)}`
                  : "Enter the inverter qty to calculate"}
              </span>
            </div>
          </div>
        </div>
      </SectionCard>
      </div>
        </>
      )}
    </div>
  );
}
