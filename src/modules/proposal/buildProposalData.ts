// Proposal Maker — editable proposal document data model.
// Seeds a single `ProposalData` object from the current form/BOQ/finance
// state (see ProposalMaker.tsx). Every field here is what the editable
// preview renders and edits in place; exports (PDF / Word) read from it,
// never from the form directly.

import { BOQItem, Catalogue, PricingSummary, ProposalInputs, ProposalMeta } from "./types";
import { EngineResult } from "./proposalEngine";
import { numberToWords, formatProposalDate, computePaybackPeriod, todayISO } from "./calculations";
import { ABOUT_US, SCOPE_SECTIONS, PROJECT_HIGHLIGHTS, PROJECT_HIGHLIGHTS_TAIL, SERVICE_GUARANTEE, ROLES_RESPONSIBILITIES, buildTermsRows, ANNEXURE_SECTIONS } from "./proposalContent";
import headerBannerUrl from "./assets/proposal-header-banner.jpg";
import footerPanelUrl from "./assets/proposal-footer-panel.jpg";
import coverPhotoUrl from "./assets/proposal-cover-photo.jpg";
import systemSchematicUrl from "./assets/proposal-system-schematic.jpg";
import gallery1Url from "./assets/proposal-gallery-1.jpg";
import gallery2Url from "./assets/proposal-gallery-2.jpg";
import gallery3Url from "./assets/proposal-gallery-3.jpg";
import gallery4Url from "./assets/proposal-gallery-4.jpg";
import { structureTypeLabel } from "./structureTypes";

export const Money = (n: number): string => "₹ " + Math.round(n).toLocaleString("en-IN") + "/-";

export interface ProposalPricing {
  capacityKw: number;
  ratePerKw: number;
  gstRatePct: number;
  subsidy: number;
  discountPct: number;
  // computed — kept in sync by recomputePricing()
  subTotal: number;
  gst: number;
  total: number;
  effective: number;
  discountAmt: number;
  finalAfterDiscount: number;
  amountInWords: string;
}

// The editable proposal's own pricing formula — deliberately simpler than
// the full BOQ/finance engines (calculations.ts / proposalEngine.ts) that
// seed its initial values. Those engines take a dozen+ form inputs no
// document editor should ask a user to re-enter; once the proposal is open
// for editing, capacity/rate/GST/subsidy/discount are the only levers, and
// this is the exact arithmetic the real proposal document uses to total them.
export function recomputePricing(p: Pick<ProposalPricing, "capacityKw" | "ratePerKw" | "gstRatePct" | "subsidy" | "discountPct">): ProposalPricing {
  const subTotal = Math.round(p.ratePerKw * p.capacityKw);
  const gst = Math.round((subTotal * p.gstRatePct) / 100);
  const total = subTotal + gst;
  const effective = total - p.subsidy;
  const discountAmt = Math.round((effective * p.discountPct) / 100);
  const finalAfterDiscount = effective - discountAmt;
  return { ...p, subTotal, gst, total, effective, discountAmt, finalAfterDiscount, amountInWords: numberToWords(total) };
}

export interface ProposalBomRow {
  category: string;
  item: string;
  spec: string;
  make: string;
  qty: string;
}

export interface ProposalRoleRow {
  activity: string;
  responsibility: string;
}

export interface ProposalOmRow {
  frequency: string;
  scope: string;
}

export interface ProposalScopeSection {
  title: string;
  items: string[];
}

export interface ProposalImages {
  header: string;
  footer: string;
  cover: string;
  schematic: string;
  gallery: string[];
}

export interface ProposalTermRow {
  term: string;
  details: string;
}

export interface ProposalAnnexureSection {
  title: string;
  body: string;
}

export interface ProposalData {
  // header / cover
  customerName: string;
  contactNo: string;
  proposalNo: string;
  proposedOn: string;
  address: string;
  images: ProposalImages;

  // cover letter
  coverGreeting: string;
  coverBody: string[];
  unitCostLabel: string;

  // signatory
  signatoryName: string;
  signatoryTitle: string;
  signatoryMobile: string;
  signatoryEmail: string;

  // about us
  aboutUs: string[];

  // scope of work
  scopeSections: ProposalScopeSection[];

  // project summary
  sanctionedLoad: string;
  loadIncrease: string;
  moduleType: string;
  inverterType: string;
  irradiation: string;
  annualGeneration: string;
  installationType: string;
  paybackPeriod: string;
  lifetimeSavings: string;
  shadowFreeArea: string;

  // pricing
  pricing: ProposalPricing;
  extraChargesNote: string;
  amcFreeNote: string;
  insuranceFreeNote: string;
  note: string[];

  // AMC
  amcAdditional: string;
  cleaningCharges: string;
  amcEscalation: string;
  paymentSchedule: string;
  omScope: ProposalOmRow[];

  // highlights
  highlights: string[];
  serviceGuarantee: string[];
  highlightsTail: string[];

  // bill of material
  bom: ProposalBomRow[];

  // roles & responsibilities
  roles: ProposalRoleRow[];

  // terms & conditions
  termsRows: ProposalTermRow[];

  // annexure
  annexureDisclaimer: string;
  annexureSections: ProposalAnnexureSection[];
}

export function buildProposalData(inp: ProposalInputs, cat: Catalogue, boq: BOQItem[], summary: PricingSummary, meta: ProposalMeta, financeResult: EngineResult | null): ProposalData {
  const B1 = inp.capacity === "" ? 0 : inp.capacity;
  const sanctLoad = inp.sanctionedLoad === "" ? 0 : inp.sanctionedLoad;
  const loadInc = Math.max(0, B1 - sanctLoad);
  const unitCost = inp.unitCost === "" ? 0 : inp.unitCost;
  const gstPct = cat.charges.gst || 8.9;

  const engineOk = financeResult && financeResult.ok ? financeResult : null;
  const payback = engineOk ? `${engineOk.paybackYears}y ${engineOk.paybackMonths}m` : computePaybackPeriod(summary);
  const lifeSavings = engineOk ? engineOk.lifetimeSavings : summary.lifeSavings;
  const annualGen = engineOk ? engineOk.annualGenerationKwh : summary.annualGen;
  const shadowArea = engineOk ? engineOk.shadowFreeAreaSqft : summary.shadowArea;

  const panelSpec = `${inp.panelWp || B1} Wp Mono PERC ${inp.panelType || "DCR"} (${inp.panelBrand || "As selected"} or as equivalent)`;
  const invSpec = `${inp.inverterSize || B1} kW (${inp.inverterBrand || "As selected"} or as equivalent)`;
  const installationType = inp.structUpperFt !== "" ? `${inp.structUpperFt} feet` : structureTypeLabel(inp.structureType) || "Shed / Roof Mounted Structure";

  const bom: ProposalBomRow[] = boq
    .filter((i) => i.qty > 0 && i.price > 0)
    .map((i) => ({ category: i.group, item: i.name, spec: i.spec, make: i.make, qty: `${i.qty} ${i.unit}` }));

  return {
    customerName: inp.customerName,
    contactNo: inp.contactNumber,
    proposalNo: meta.proposalNo,
    proposedOn: formatProposalDate(meta.proposalDate || todayISO()),
    address: inp.customerAddress,
    images: { header: headerBannerUrl, footer: footerPanelUrl, cover: coverPhotoUrl, schematic: systemSchematicUrl, gallery: [gallery1Url, gallery2Url, gallery3Url, gallery4Url] },

    coverGreeting: "Dear Sir,",
    coverBody: [
      "Greetings for EnergyBae…!!!",
      "This is with reference to our discussion regarding your requirement of a solar power plant. Based on our preliminary analysis from the discussions and bill analysis, we have found the following:",
      "Based on the above data, it is highly recommended that you should opt for a solar power plant at the earliest as the current cost of energy is very high and would continue to increase over the years.",
      "A solar power plant on the other hand provides an excellent hedge against future energy cost escalations as well as saving the environment from harmful greenhouse gases.",
      "We are submitting our detailed proposal for your reference and look forward to working with you closely.",
      "If you have any questions or concerns, please do not hesitate to contact us.",
    ],
    unitCostLabel: `₹${unitCost}/kWh`,

    signatoryName: "Akshay Jain",
    signatoryTitle: "Co-founder, EnergyBae Private Limited",
    signatoryMobile: "+91 7507991787",
    signatoryEmail: "info@energybae.in",

    aboutUs: [...ABOUT_US],
    scopeSections: SCOPE_SECTIONS.map((s) => ({ title: s.title, items: [...s.items] })),

    sanctionedLoad: sanctLoad > 0 ? `${sanctLoad} kW` : "NA",
    loadIncrease: loadInc > 0 ? `${loadInc} kW` : "NA",
    moduleType: panelSpec,
    inverterType: invSpec,
    irradiation: "2047.2 kWh/m²",
    annualGeneration: `${Math.round(annualGen).toLocaleString("en-IN")} kWh`,
    installationType,
    paybackPeriod: payback,
    lifetimeSavings: `${Money(lifeSavings)} (${engineOk ? engineOk.assumptions.systemLifeYears : 25} years)`,
    shadowFreeArea: `${Math.round(shadowArea)} sq. ft.`,

    pricing: recomputePricing({
      capacityKw: B1,
      ratePerKw: Math.round(summary.rateKW * 100) / 100,
      gstRatePct: gstPct,
      subsidy: summary.subsidy,
      // Form's Discount field removed — start the document at 0 (see calcBOQ's
      // pricing summary). The proposal editor can still add one per document.
      discountPct: 0,
    }),
    extraChargesNote: "MSEB Load Increase charges (Approx. ₹1000/kW)",
    amcFreeNote: "5 Years FREE",
    insuranceFreeNote: "5 Years FREE",
    note: ["Walkway and access ladder is included."],

    amcAdditional: "₹ 3,000 + 18% (GST) (from 6th year onward)",
    cleaningCharges: "₹ 12,000 + 18% (GST) (1st year)",
    amcEscalation: "+5%/year",
    paymentSchedule: "At the Beginning of the Year",
    omScope: [
      { frequency: "9 times/ year (If opted for)", scope: "Panel Cleaning" },
      { frequency: "4 times/ year", scope: "Inverter Health Check, Cabling check, Earthing Check, Panel Check, Structure Stability Check and Fix" },
      { frequency: "Weekly", scope: "Remote monitoring through the Internet" },
    ],

    highlights: [...PROJECT_HIGHLIGHTS],
    serviceGuarantee: [...SERVICE_GUARANTEE],
    highlightsTail: [...PROJECT_HIGHLIGHTS_TAIL],

    bom,
    roles: ROLES_RESPONSIBILITIES.map(([, activity, responsibility]) => ({ activity, responsibility })),

    termsRows: buildTermsRows(gstPct).map((r) => ({
      term: r.term,
      details: r.bullets.map((b) => (b.lvl ? "  – " : "") + b.text).join("\n"),
    })),

    annexureDisclaimer: "Annexure-I: Working Methodology and Workflow for the Solar Rooftop Project. This is only an indicative document and is not binding.",
    annexureSections: ANNEXURE_SECTIONS.map((s, idx) => ({
      title: `${idx + 1}. ${s.title}`,
      body: [...(s.plain || []), ...(s.numbered || []).map((t, i) => `${idx + 1}.${i + 1}. ${t}`), ...(s.bullets || []).map((t) => `• ${t}`)].join("\n\n"),
    })),
  };
}
