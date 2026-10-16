// Proposal Maker — data contracts.
// Fully independent from Residential (src/types.ts) and Commercial
// (src/modules/commercial/types.ts) modules. Ported from the standalone
// energybae_boq_v2.html BOQ/proposal generator and re-shaped into typed,
// modular contracts for the Bill Analysis app.

export interface CatalogueRowBase {
  id: number;
  category?: string;
}

export interface PanelCatalogueRow extends CatalogueRowBase {
  brand: string;
  wp: number;
  pricePerWp: number;
  type: "DCR" | "NDCR";
}

export interface AcdbCatalogueRow extends CatalogueRowBase {
  capMin: number;
  capMax: number;
  phase: 1 | 3;
  spec: string;
  price: number;
}

export interface DcdbCatalogueRow extends CatalogueRowBase {
  spd: number;
  io: string;
  voltage: number;
  price: number;
}

export type BatteryType = "Lead Acid" | "Lithium Ion";

export interface BatteryCatalogueRow extends CatalogueRowBase {
  make: string;
  type: BatteryType;
  ah: number;
  v: number;
  model: string;
  warranty: string;
  cost: number;
  price: number;
  mrp: number;
}

export interface BosPrices {
  dcCable: number;
  acCable: number;
  earthCable6: number;
  earthCable25: number;
  earthPit: number;
  mc4: number;
  la: number;
  mcb: number;
  lugCuRing6: number;
  lugCuPin6: number;
  lugAlRing16: number;
  lugCuRing4: number;
  anchorBolt: number;
  nutBolt: number;
  tape: number;
  cableTie: number;
  conduit: number;
  teeBend: number;
  cableTag: number;
  ferrule: number;
  bracing: number;
  walkway: number;
  alStructure: number;
  uClamp: number;
  zClamp: number;
  gland: number;
  birdSpike: number;
  jBolt: number;
  parnali: number;
  sprinkler: number;
}

export interface CustomBosItem {
  id: number;
  label: string;
  unit: string;
  price: number;
  /** BOQ category this item belongs to. Optional so catalogues saved before
   *  per-category custom items still load — those fall back to
   *  "Optional / Special", which is where they've always appeared. */
  group?: string;
}

export interface OverheadCharges {
  installation: number; // ₹/kW
  transport: number; // % of material
  liaisoning: number; // ₹/kW
  profit: number; // %
  gst: number; // %
  subsidy: number; // ₹ fixed (DCR only)
}

export interface Catalogue {
  panels: PanelCatalogueRow[];
  acdb: AcdbCatalogueRow[];
  dcdb: DcdbCatalogueRow[];
  batteries: BatteryCatalogueRow[];
  bos: BosPrices;
  // Editable display names for each default BOS item — keyed the same as
  // `bos`, so renaming an item here flows straight into the BOQ line
  // description without touching the price/quantity formulas.
  bosNames: Record<keyof BosPrices, string>;
  customBOS: CustomBosItem[];
  charges: OverheadCharges;
}

export const CATEGORIES = [
  "Main Equipment",
  "Protection Devices",
  "DC Side",
  "AC Side",
  "Earthing & Lightning",
  "Lugs & Terminals",
  "Hardware",
  "Conduit & Accessories",
  "Structure",
  "Optional / Special",
] as const;

// ─── Proposal / customer / system inputs ───────────────────────────────────

export type SystemType = "On-Grid" | "Off-Grid" | "Hybrid";

export type FinanceCustomerType = "RESIDENTIAL_SOCIETY" | "INDIVIDUAL_HOUSE" | "COMMERCIAL" | "INDUSTRIAL" | "";
export type FinanceProjectType = "SUBSIDY" | "NON_SUBSIDY" | "";

export interface ProposalInputs {
  systemType: SystemType;

  customerName: string;
  contactNumber: string;
  customerAddress: string;
  sanctionedLoad: number | "";
  unitCost: number | "";

  // Financial engine inputs (subsidy / AD / GST-benefit / payback) — see
  // proposalEngine.ts. Independent of the BOQ pricing fields above.
  financeCustomerType: FinanceCustomerType;
  financeProjectType: FinanceProjectType;
  adApplicable: boolean;
  gstRegistered: boolean;
  connections: number | "";
  extraCost: number | "";

  capacity: number | "";
  phase: "1-Phase" | "3-Phase" | "";
  panelType: "DCR" | "NDCR" | "";
  panelBrand: string;
  panelWp: number | "";
  panelPriceWp: number | "";
  structureType: string;

  inverterBrand: string;
  // Specific model picked from the inverter_prices catalogue (see
  // inverterPricesApi.ts / matchInverter.ts), same Brand -> specific-product
  // pattern as the wire selection below. Blank means no exact pick — Auto
  // mode's live match (findBestInverter) still drives inverterUnitCost.
  inverterModel: string;
  inverterSize: number | "";
  numInverters: number | "";
  inverterFloor: number | "";
  inverterUnitCost: number | "";
  inverterMode: "auto" | "manual";

  // Wire selection — Company + specific product picked from the wire_prices
  // catalogue (see wirePricesApi.ts), one slot per cable BOQ row. Blank means
  // "no product selected", so the BOQ falls back to the Price DB's flat
  // dcCable/acCable rate (see calculations.ts).
  dcCableBrand: string;
  dcCableWireName: string;
  dcCableUnitCost: number | "";
  acCableBrand: string;
  acCableWireName: string;
  acCableUnitCost: number | "";
  acCable2Brand: string;
  acCable2WireName: string;
  acCable2UnitCost: number | "";

  batteryMake: string;
  batteryType: string;
  batteryModel: string;
  batteryAh: number | "";
  batteryV: number | "";
  batteryUnitCost: number | "";
  numBatteries: number | "";

  buildingFloors: number | "";
  panelRows: number | "";
  numStrings: number | "";
  earthingPits: number | "";
  /** Lightning arrester. "" = ESE (the original BOQ row). Optional so
   *  proposals saved before this field existed still type-check/load. */
  laType?: "ESE" | "Conventional" | "NA" | "";

  /** Structure legs (anchor bolts = legs × 2 base plates × 4). Optional:
   *  older proposals load as 0. */
  structureLegs?: number | "";
  /** Spare cable metres added to each run. Blank = 15 (DC) / 40 (AC, earthing). */
  dcSpareM?: number | "";
  acSpareM?: number | "";
  earthSpareM?: number | "";

  structLowerFt: number | "";
  structUpperFt: number | "";
  shedArea: number | "";
  rubberSeal: number | "";

  discountPct: number | "";
}

export function buildBlankProposalInputs(): ProposalInputs {
  return {
    systemType: "On-Grid",
    customerName: "",
    contactNumber: "",
    customerAddress: "",
    sanctionedLoad: "",
    unitCost: "",
    financeCustomerType: "",
    financeProjectType: "",
    adApplicable: false,
    gstRegistered: false,
    connections: "",
    extraCost: "",
    capacity: "",
    phase: "",
    panelType: "",
    panelBrand: "",
    panelWp: "",
    panelPriceWp: "",
    structureType: "",
    inverterBrand: "",
    inverterModel: "",
    inverterSize: "",
    numInverters: "",
    inverterFloor: "",
    inverterUnitCost: "",
    inverterMode: "auto",
    dcCableBrand: "",
    dcCableWireName: "",
    dcCableUnitCost: "",
    acCableBrand: "",
    acCableWireName: "",
    acCableUnitCost: "",
    acCable2Brand: "",
    acCable2WireName: "",
    acCable2UnitCost: "",
    batteryMake: "",
    batteryType: "",
    batteryModel: "",
    batteryAh: "",
    batteryV: "",
    batteryUnitCost: "",
    numBatteries: "",
    buildingFloors: "",
    panelRows: "",
    numStrings: "",
    earthingPits: "",
    structLowerFt: "",
    structUpperFt: "",
    shedArea: "",
    rubberSeal: "",
    discountPct: "",
  };
}

export interface BOQItem {
  sr: number;
  group: string;
  name: string;
  spec: string;
  make: string;
  unit: string;
  qty: number;
  unitCost: number;
  price: number;
}

export interface BOQOverrides {
  [key: string]: number; // keyed by `sr` for qty overrides, `c${sr}` for unit-cost overrides
}

export interface ProposalMeta {
  proposalNo: string;
  proposalDate: string; // ISO yyyy-mm-dd
  /** Project/system this quote was started from (Projects module). Optional: standalone quotes have none. */
  projectId?: string | null;
  projectSystemId?: string | null;
  /** Display-only label for the link banner, e.g. "ABC Industries · Pune factory". */
  projectLabel?: string | null;
}

export interface PricingSummary {
  matTotal: number;
  install: number;
  transport: number;
  liaison: number;
  subTotal: number;
  insurance: number;
  profit: number;
  totalExGST: number;
  firstQuoteRate: number;
  gstAmt: number;
  final: number;
  discountAmt: number;
  finalAfterDiscount: number;
  isDCR: boolean;
  subsidy: number;
  effective: number;
  rateKW: number;
  annualGen: number;
  lifeSavings: number;
  shadowArea: number;
}
