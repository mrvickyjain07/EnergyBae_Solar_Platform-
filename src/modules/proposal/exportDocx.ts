// Proposal Maker — client-side Word (.docx) proposal document export.
// Rebuilt to match the real, sent EnergyBae proposal 1:1 in structure,
// section order, table styling, heading casing/color, numbered lists, and
// running header/footer — using "Proposal - Mr. Santosh Gadkari - 3 kW
// On-grid Solar System.pdf" as the visual source of truth. Static company
// and legal copy is transcribed verbatim; every other value is dynamic.
//
// Built with the `docx` library + `file-saver`, with a JSZip post-process
// pass that strips Word-2010+ namespace attributes so the file opens
// cleanly in Word 2007+.

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  AlignmentType,
  ShadingType,
  TableLayoutType,
  VerticalAlign,
  Header,
  Footer,
  PageBreak,
  UnderlineType,
  ImageRun,
} from "docx";
import { saveAs } from "file-saver";
import JSZip from "jszip";
import { BOQItem, Catalogue, ProposalInputs, ProposalMeta, PricingSummary } from "./types";
import { numberToWords, formatProposalDate, computePaybackPeriod } from "./calculations";
import { EngineOutputs, EngineResult } from "./proposalEngine";
import { ABOUT_US, SCOPE_SECTIONS, PROJECT_HIGHLIGHTS, PROJECT_HIGHLIGHTS_TAIL, SERVICE_GUARANTEE, ROLES_RESPONSIBILITIES, buildTermsRows, ANNEXURE_SECTIONS } from "./proposalContent";
import headerBannerUrl from "./assets/proposal-header-banner.jpg";
import footerPanelUrl from "./assets/proposal-footer-panel.jpg";
import systemSchematicUrl from "./assets/proposal-system-schematic.jpg";
import coverPhotoUrl from "./assets/proposal-cover-photo.jpg";
import gallery1Url from "./assets/proposal-gallery-1.jpg";
import gallery2Url from "./assets/proposal-gallery-2.jpg";
import gallery3Url from "./assets/proposal-gallery-3.jpg";
import gallery4Url from "./assets/proposal-gallery-4.jpg";
import { structureTypeLabel } from "./structureTypes";

const BLUE = "1B75BC";
const GREEN = "2E7D32";
const BLACK = "000000";
const DARK = "1a1a1a";
const pt = (n: number) => n * 20;
const SERIF = "Cambria";

const formatMoney = (val: number) => "₹ " + Math.round(val).toLocaleString("en-IN") + "/-";
const thinBorder = { style: BorderStyle.SINGLE, size: 4, color: BLACK };
const cellBorders = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };

async function loadImageBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}

// ─── Paragraph building blocks ──────────────────────────────────────────────

// All-caps section headings as typed verbatim in the source doc (SYSTEM,
// SCOPE OF WORK, PROJECT SUMMARY, PROJECT PRICING, AMC CONTRACT DETAILS,
// PROJECT HIGHLIGHTS, BILL OF MATERIAL) — bold blue, no border/box.
function hdrCaps(text: string) {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, color: BLUE, size: pt(1.3) })],
    spacing: { before: 220, after: 90 },
  });
}
// Title-case headings as typed verbatim (About us:, Roles & Responsibilities,
// Terms & Conditions) — same bold blue treatment, original casing kept.
function hdrTitle(text: string) {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, color: BLUE, size: pt(1.3) })],
    spacing: { before: 220, after: 90 },
  });
}
function np(text: string, opts: { center?: boolean; bold?: boolean; italics?: boolean; underline?: boolean } = {}) {
  return new Paragraph({
    children: [new TextRun({ text, size: pt(1.05), color: DARK, bold: opts.bold, italics: opts.italics, underline: opts.underline ? { type: UnderlineType.SINGLE } : undefined })],
    spacing: { before: 40, after: 40 },
    alignment: opts.center ? AlignmentType.CENTER : AlignmentType.JUSTIFIED,
  });
}
function sp(count = 1) {
  return Array.from({ length: count }, () => new Paragraph({ children: [new TextRun("")], spacing: { before: 0, after: 40 } }));
}
function pb() {
  return new Paragraph({ children: [new PageBreak()] });
}
// Bulleted (●) and sub-bulleted (○) — used for Project Highlights, Terms &
// Conditions clause bodies. Word's default disc/circle bullet glyphs match.
function bl(text: string, lvl = 0) {
  return new Paragraph({ children: [new TextRun({ text, size: pt(1.05), color: DARK })], bullet: { level: lvl }, spacing: { before: 30, after: 30 } });
}
function blList(items: string[], lvl = 0) {
  return items.map((t) => bl(t, lvl));
}
// Manually-numbered list item ("1. Site survey...") — the real doc's Scope
// of Work / Annexure-I items are numbered, not bulleted.
function num(n: string | number, text: string, indent = 460) {
  return new Paragraph({
    children: [new TextRun({ text: `${n}. `, size: pt(1.05), color: DARK }), new TextRun({ text, size: pt(1.05), color: DARK })],
    spacing: { before: 30, after: 30 },
    indent: { left: indent, hanging: 260 },
  });
}
function numList(items: string[], startIndent = 460) {
  return items.map((t, i) => num(i + 1, t, startIndent));
}
function romanHdr(text: string) {
  return new Paragraph({ children: [new TextRun({ text, bold: true, size: pt(1.05), color: DARK })], spacing: { before: 100, after: 30 } });
}
function annexHdr(n: number, text: string) {
  return new Paragraph({ children: [new TextRun({ text: `${n}. ${text}`, bold: true, size: pt(1.05), color: DARK, allCaps: true })], spacing: { before: 140, after: 40 } });
}
function imgPara(data: Uint8Array, width: number, height: number, opts: { after?: number } = {}) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: opts.after ?? 100 },
    children: [new ImageRun({ data, type: "jpg", transformation: { width, height } })],
  });
}

// Plain black-bordered, white-background 2-col label/value table — matches
// Project Summary / Project Pricing / Cover-letter mini-table / AMC table.
interface PlainRow {
  label: string;
  value: string;
  bold?: boolean;
  color?: string;
}
function plainTable(rows: PlainRow[], labelWidth = 3400) {
  const valWidth = 9638 - labelWidth;
  return new Table({
    width: { size: 9638, type: WidthType.DXA },
    columnWidths: [labelWidth, valWidth],
    layout: TableLayoutType.FIXED,
    rows: rows.map(
      (r) =>
        new TableRow({
          children: [
            new TableCell({
              width: { size: labelWidth, type: WidthType.DXA },
              borders: cellBorders,
              margins: { top: 50, bottom: 50, left: 90, right: 90 },
              verticalAlign: VerticalAlign.CENTER,
              children: [new Paragraph({ children: [new TextRun({ text: r.label, size: pt(1.0), color: DARK })] })],
            }),
            new TableCell({
              width: { size: valWidth, type: WidthType.DXA },
              borders: cellBorders,
              margins: { top: 50, bottom: 50, left: 90, right: 90 },
              verticalAlign: VerticalAlign.CENTER,
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [new TextRun({ text: r.value, bold: !!r.bold, color: r.color || DARK, size: pt(1.0) })],
                }),
              ],
            }),
          ],
        })
    ),
  });
}

// Financial Analysis engine output (subsidy / AD / GST benefit / payback /
// lifetime savings) as PlainRow pairs, followed by the exact assumptions
// used — so the printed proposal is self-auditing against the numbers shown
// in the Financial Analysis panel before export.
function financeAuditRows(r: EngineOutputs): PlainRow[] {
  const isCI = r.inputs.customerType === "COMMERCIAL" || r.inputs.customerType === "INDUSTRIAL";
  const a = r.assumptions;
  const rows: PlainRow[] = [{ label: "Mode", value: r.mode === "legacy" ? "Legacy (Excel-exact)" : "Enhanced" }];
  if (isCI) {
    rows.push({ label: "Accelerated Depreciation Benefit", value: formatMoney(r.adBenefit) });
    rows.push({ label: "GST Input Credit Benefit", value: formatMoney(r.gstBenefit) });
  } else {
    rows.push({ label: "PM Surya Ghar Subsidy", value: `- ${formatMoney(r.subsidy)}`, color: GREEN });
  }
  rows.push({ label: "Total Effective Amount", value: formatMoney(r.totalEffectiveAmount), bold: true, color: GREEN });
  rows.push({ label: "Payback Period", value: `${r.paybackYears}y ${r.paybackMonths}m` });
  rows.push({ label: `Lifetime Savings (${a.systemLifeYears} yrs)`, value: formatMoney(r.lifetimeSavings) });
  if (r.mode === "enhanced") {
    rows.push({ label: `NPV @ ${(a.discountRate * 100).toFixed(1)}%`, value: r.npv !== undefined ? formatMoney(r.npv) : "—" });
    rows.push({ label: "IRR", value: r.irr != null ? `${(r.irr * 100).toFixed(1)}%` : "Did not converge" });
  }
  rows.push({ label: "Specific Yield / System Life", value: `${a.specificYield} kWh/kW/yr, ${a.systemLifeYears} yrs` });
  rows.push({ label: "Degradation / Tariff Escalation", value: `${(a.degradationYear1 * 100).toFixed(1)}% yr-1 + ${(a.degradationLinear * 100).toFixed(2)}%/yr / ${(a.tariffEscalation * 100).toFixed(1)}%/yr` });
  rows.push({ label: "Project GST / Extra-Cost GST Rate", value: `${(a.gstEffectiveRate * 100).toFixed(2)}% / ${(r.inputs.extraCostGstRate * 100).toFixed(1)}%` });
  rows.push({ label: "Commissioning Lag", value: `${a.commissioningLagYears} yrs` });
  rows.push({ label: "AD Depreciation / Tax Rate", value: `${(a.adDepreciationRate * 100).toFixed(0)}% WDV @ ${(a.adTaxRate * 100).toFixed(2)}%` });
  rows.push({ label: "Individual Subsidy Cap", value: `${a.subsidyIndividualCap.toLocaleString("en-IN")}/connection` });
  rows.push({ label: "Society Subsidy Rate", value: `Rs.${a.subsidySocietyPerKw.toLocaleString("en-IN")}/kW${r.mode === "enhanced" ? ` (capped ${a.subsidySocietyCapKw} kW)` : " (uncapped, legacy)"}` });
  rows.push({ label: "Discount Rate (NPV/IRR)", value: `${(a.discountRate * 100).toFixed(1)}%` });
  return rows;
}

// Plain black-bordered table with a bold header row — matches Roles &
// Responsibilities and the O&M Frequency table (no colored fill).
function plainGTable(hdrs: string[], dataRows: (string | number)[][], colWidths?: number[]) {
  const cw = colWidths || hdrs.map(() => Math.floor(9638 / hdrs.length));
  return new Table({
    width: { size: 9638, type: WidthType.DXA },
    columnWidths: cw,
    layout: TableLayoutType.FIXED,
    rows: [
      new TableRow({
        children: hdrs.map(
          (h, i) =>
            new TableCell({
              width: { size: cw[i], type: WidthType.DXA },
              borders: cellBorders,
              margins: { top: 60, bottom: 60, left: 90, right: 90 },
              children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, color: DARK, size: pt(1.0) })] })],
            })
        ),
      }),
      ...dataRows.map(
        (row) =>
          new TableRow({
            children: row.map(
              (cell, i) =>
                new TableCell({
                  width: { size: cw[i], type: WidthType.DXA },
                  borders: cellBorders,
                  margins: { top: 50, bottom: 50, left: 90, right: 90 },
                  children: [new Paragraph({ children: [new TextRun({ text: String(cell ?? ""), size: pt(0.95), color: DARK })] })],
                })
            ),
          })
      ),
    ],
  });
}

// Cover-page identity table — blue fill, white bold text, both columns.
function coverTable(rows: [string, string][]) {
  return new Table({
    width: { size: 9638, type: WidthType.DXA },
    columnWidths: [3200, 6438],
    layout: TableLayoutType.FIXED,
    rows: rows.map(
      ([l, r]) =>
        new TableRow({
          children: [
            new TableCell({
              width: { size: 3200, type: WidthType.DXA },
              shading: { fill: BLUE, type: ShadingType.CLEAR },
              borders: cellBorders,
              margins: { top: 70, bottom: 70, left: 100, right: 100 },
              children: [new Paragraph({ children: [new TextRun({ text: l, bold: true, color: "FFFFFF", size: pt(1.05) })] })],
            }),
            new TableCell({
              width: { size: 6438, type: WidthType.DXA },
              shading: { fill: BLUE, type: ShadingType.CLEAR },
              borders: cellBorders,
              margins: { top: 70, bottom: 70, left: 100, right: 100 },
              children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: r, bold: true, color: "FFFFFF", size: pt(1.05) })] })],
            }),
          ],
        })
    ),
  });
}

// Terms & Conditions — single table, one row per clause, bulleted clause
// bodies (● top-level, ○ nested), matching the real doc's single-table layout.
function termsSingleTable(rows: { term: string; bullets: { text: string; lvl?: number }[] }[]) {
  return new Table({
    width: { size: 9638, type: WidthType.DXA },
    columnWidths: [2400, 7238],
    layout: TableLayoutType.FIXED,
    rows: rows.map(
      (r) =>
        new TableRow({
          children: [
            new TableCell({
              width: { size: 2400, type: WidthType.DXA },
              borders: cellBorders,
              margins: { top: 70, bottom: 70, left: 90, right: 90 },
              verticalAlign: VerticalAlign.TOP,
              children: [new Paragraph({ children: [new TextRun({ text: r.term, size: pt(1.0), color: DARK })] })],
            }),
            new TableCell({
              width: { size: 7238, type: WidthType.DXA },
              borders: cellBorders,
              margins: { top: 70, bottom: 70, left: 90, right: 90 },
              children: r.bullets.map((b) =>
                b.lvl === undefined
                  ? new Paragraph({ children: [new TextRun({ text: b.text, size: pt(0.95), color: DARK })], spacing: { before: 20, after: 20 } })
                  : new Paragraph({ children: [new TextRun({ text: b.text, size: pt(0.95), color: DARK })], bullet: { level: b.lvl }, spacing: { before: 20, after: 20 } })
              ),
            }),
          ],
        })
    ),
  });
}

// Bill of Material — category label as a vertically-merged (row-spanned)
// first column, matching the real doc's "Structure / SPV string / Inverter"
// grouped layout, populated from the live BOQ engine.
function bomTable(items: BOQItem[]) {
  const active = items.filter((i) => i.qty > 0 && i.price > 0);
  const groups: { name: string; rows: BOQItem[] }[] = [];
  active.forEach((it) => {
    let g = groups.find((g) => g.name === it.group);
    if (!g) {
      g = { name: it.group, rows: [] };
      groups.push(g);
    }
    g.rows.push(it);
  });

  const cw = [1300, 2200, 3200, 1738, 1200];
  const headerRow = new TableRow({
    children: ["Category", "Item", "Specification", "Make", "Qty"].map(
      (h, i) =>
        new TableCell({
          width: { size: cw[i], type: WidthType.DXA },
          borders: cellBorders,
          shading: { fill: "E8F0F8", type: ShadingType.CLEAR },
          margins: { top: 60, bottom: 60, left: 80, right: 80 },
          children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, color: DARK, size: pt(0.95) })] })],
        })
    ),
  });

  const rows: TableRow[] = [headerRow];
  groups.forEach((g) => {
    g.rows.forEach((item, idx) => {
      const cells: TableCell[] = [];
      if (idx === 0) {
        cells.push(
          new TableCell({
            width: { size: cw[0], type: WidthType.DXA },
            borders: cellBorders,
            rowSpan: g.rows.length,
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 60, bottom: 60, left: 80, right: 80 },
            children: [new Paragraph({ children: [new TextRun({ text: g.name, bold: true, size: pt(0.9), color: DARK })] })],
          })
        );
      }
      cells.push(
        new TableCell({ width: { size: cw[1], type: WidthType.DXA }, borders: cellBorders, margins: { top: 50, bottom: 50, left: 80, right: 80 }, children: [new Paragraph({ children: [new TextRun({ text: item.name, size: pt(0.9), color: DARK })] })] }),
        new TableCell({ width: { size: cw[2], type: WidthType.DXA }, borders: cellBorders, margins: { top: 50, bottom: 50, left: 80, right: 80 }, children: [new Paragraph({ children: [new TextRun({ text: item.spec, size: pt(0.85), color: DARK })] })] }),
        new TableCell({ width: { size: cw[3], type: WidthType.DXA }, borders: cellBorders, margins: { top: 50, bottom: 50, left: 80, right: 80 }, children: [new Paragraph({ children: [new TextRun({ text: item.make, size: pt(0.85), color: DARK })] })] }),
        new TableCell({ width: { size: cw[4], type: WidthType.DXA }, borders: cellBorders, margins: { top: 50, bottom: 50, left: 80, right: 80 }, children: [new Paragraph({ children: [new TextRun({ text: `${item.qty} ${item.unit}`, size: pt(0.85), color: DARK })] })] })
      );
      rows.push(new TableRow({ children: cells }));
    });
  });

  return new Table({ width: { size: 9638, type: WidthType.DXA }, columnWidths: cw, layout: TableLayoutType.FIXED, rows });
}

// ─── Pre-export validation ─────────────────────────────────────────────────

export interface DocxValidationResult {
  ok: boolean;
  errors: string[];
}

export function validateForExport(inp: ProposalInputs, boq: BOQItem[], summary: PricingSummary): DocxValidationResult {
  const errors: string[] = [];
  if (!inp.customerName.trim()) errors.push("Customer Name is required");
  if (inp.capacity === "" || Number(inp.capacity) <= 0) errors.push("Required Capacity must be greater than 0");
  if (!inp.phase) errors.push("System Phase is required");
  if (!inp.panelType) errors.push("Panel Type is required");
  if (boq.filter((i) => i.qty > 0 && i.price > 0).length === 0) errors.push("No BOQ line items are populated — check catalogue/inputs");
  [summary.matTotal, summary.totalExGST, summary.gstAmt, summary.final, summary.effective].forEach((v) => {
    if (!Number.isFinite(v)) errors.push("A pricing figure is not a finite number (NaN/undefined)");
  });
  const arithmeticDrift = Math.abs(summary.totalExGST + summary.gstAmt - summary.final);
  if (arithmeticDrift > 2) errors.push(`Sub-Total + GST does not equal Total (off by ₹${arithmeticDrift.toFixed(2)})`);
  return { ok: errors.length === 0, errors };
}

// ─── Main export ─────────────────────────────────────────────────────────

export async function generateProposalDocx(
  inp: ProposalInputs,
  cat: Catalogue,
  boq: BOQItem[],
  summary: PricingSummary,
  meta: ProposalMeta,
  financeResult?: EngineResult | null
): Promise<void> {
  const validation = validateForExport(inp, boq, summary);
  if (!validation.ok) {
    throw new Error(validation.errors.join("; "));
  }

  const B1 = inp.capacity === "" ? 0 : inp.capacity;
  const isDCR2 = inp.panelType === "DCR";
  const annGen = summary.annualGen;
  const unitCN = inp.unitCost === "" ? 0 : inp.unitCost;
  const lifeSav = summary.lifeSavings;
  const shadowA = summary.shadowArea;
  const sanctLoad = inp.sanctionedLoad === "" ? 0 : inp.sanctionedLoad;
  const loadInc = Math.max(0, B1 - sanctLoad);
  const today = formatProposalDate(new Date().toISOString().slice(0, 10));
  const gstPct = cat.charges.gst || 8.9;
  const payback = computePaybackPeriod(summary);

  const [headerBannerBytes, footerPanelBytes, schematicBytes, coverPhotoBytes, g1, g2, g3, g4] = await Promise.all([
    loadImageBytes(headerBannerUrl),
    loadImageBytes(footerPanelUrl),
    loadImageBytes(systemSchematicUrl),
    loadImageBytes(coverPhotoUrl),
    loadImageBytes(gallery1Url),
    loadImageBytes(gallery2Url),
    loadImageBytes(gallery3Url),
    loadImageBytes(gallery4Url),
  ]);

  // Running header (banner) on every page, and running footer (contact panel)
  // on every page — matches the real proposal's repeating letterhead.
  const headerChildren = [imgPara(headerBannerBytes, 624, 322 * (624 / 622), { after: 0 })];
  const footerChildren = [imgPara(footerPanelBytes, 500, 213, { after: 0 })];

  const panelSpec = `${inp.panelWp || B1} Wp Mono PERC ${inp.panelType || "DCR"} (${inp.panelBrand || "As selected"} or as equivalent)`;
  const invSpec = `${inp.inverterSize || B1} kW (${inp.inverterBrand || "As selected"} or as equivalent)`;
  const installationType = inp.structUpperFt !== "" ? `${inp.structUpperFt} feet` : structureTypeLabel(inp.structureType) || "Shed / Roof Mounted Structure";

  // 2×2 photo grid for the About Us page, borderless.
  const galleryTable = new Table({
    width: { size: 9638, type: WidthType.DXA },
    columnWidths: [4819, 4819],
    layout: TableLayoutType.FIXED,
    borders: { top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, insideVertical: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" } },
    rows: [
      new TableRow({
        children: [
          new TableCell({ width: { size: 4819, type: WidthType.DXA }, children: [imgPara(g3, 260, 115)] }),
          new TableCell({ width: { size: 4819, type: WidthType.DXA }, children: [imgPara(g4, 260, 146)] }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({ width: { size: 4819, type: WidthType.DXA }, children: [imgPara(g1, 150, 200)] }),
          new TableCell({ width: { size: 4819, type: WidthType.DXA }, children: [imgPara(g2, 150, 244)] }),
        ],
      }),
    ],
  });

  const children: any[] = [
    // ── Cover ──────────────────────────────────────────────────────────
    imgPara(coverPhotoBytes, 500, 260, { after: 260 }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Proposal", bold: true, size: pt(4), color: DARK, font: SERIF })], spacing: { before: 100, after: 60 } }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Solar Rooftop System", size: pt(2.4), color: DARK, font: SERIF })], spacing: { before: 0, after: 260 } }),
    coverTable([
      ["Prepared For:", inp.customerName || ""],
      ["Contact No:", inp.contactNumber || ""],
      ["Proposal No.", meta.proposalNo],
      ["Proposed On.", today],
    ]),
    ...sp(2),
    pb(),

    // ── Cover Letter ──────────────────────────────────────────────────
    ...sp(1),
    np("To,"),
    np(inp.customerName || ""),
    np(inp.customerAddress || ""),
    ...sp(1),
    np("Dear Sir,"),
    np("Greetings for EnergyBae…!!!"),
    np("This is with reference to our discussion regarding your requirement of a solar power plant. Based on our preliminary analysis from the discussions and bill analysis, we have found the following:"),
    ...sp(1),
    plainTable([
      { label: "Projected Solar Capacity", value: `${B1} kW` },
      { label: "Sanctioned Load", value: sanctLoad > 0 ? `${sanctLoad} kW` : "NA" },
      { label: "Sanctioned Load to be Increased", value: loadInc > 0 ? `${loadInc} kW` : "NA" },
      { label: "Unit Cost", value: `₹${unitCN}/kWh` },
    ]),
    ...sp(1),
    np("Based on the above data, it is highly recommended that you should opt for a solar power plant at the earliest as the current cost of energy is very high and would continue to increase over the years."),
    np("A solar power plant on the other hand provides an excellent hedge against future energy cost escalations as well as saving the environment from harmful greenhouse gases."),
    np("We are submitting our detailed proposal for your reference and look forward to working with you closely."),
    np("If you have any questions or concerns, please do not hesitate to contact us."),
    ...sp(1),
    np("Thanks and Regards,"),
    ...sp(1),
    new Paragraph({ children: [new TextRun({ text: "Akshay Jain", bold: true, size: pt(1.05), color: DARK })] }),
    np("Co-founder,"),
    np("EnergyBae Private Limited"),
    np("Mobile: +91 7507991787"),
    np("Email: info@energybae.in"),
    pb(),

    // ── About Us ──────────────────────────────────────────────────────
    hdrTitle("About us:"),
    ...ABOUT_US.map((t) => np(t)),
    ...sp(1),
    galleryTable,
    pb(),

    // ── System + Scope of Work ────────────────────────────────────────
    hdrCaps("SYSTEM"),
    np("Schematic of Solar Rooftop System:"),
    imgPara(schematicBytes, 480, 368, { after: 160 }),
    hdrCaps("SCOPE OF WORK"),
    np("As turnkey solution providers we take care of the solution from concept to completion and maintenance as per the agreed terms and conditions. The scope of work is illustrated below:"),
    np("Following is the list of work to be performed by EnergyBae Private Limited."),
    ...sp(1),
    ...SCOPE_SECTIONS.flatMap((section) => [romanHdr(section.title), ...numList(section.items), ...sp(1)]),
    pb(),

    // ── Project Summary ───────────────────────────────────────────────
    hdrCaps("PROJECT SUMMARY"),
    plainTable([
      { label: "Name of the Customer", value: inp.customerName || "" },
      { label: "Address/Location", value: inp.customerAddress || "" },
      { label: "Proposed Capacity", value: `${B1} kW` },
      { label: "Types Of Modules", value: panelSpec },
      { label: "Types Of Inverters", value: invSpec },
      { label: "Average Annual Global tilted irradiation at an optimum angle", value: "2047.2 kWh/m²" },
      { label: "Estimated Annual Generation", value: `${Math.round(annGen).toLocaleString("en-IN")} kWh (units)` },
      { label: "Type of Installation", value: installationType },
      { label: "Payback Period", value: payback },
      { label: "Estimated Total Lifetime Savings", value: `₹ ${Math.round(lifeSav).toLocaleString("en-IN")}/- (25 years)` },
    ]),
    ...sp(1),

    // ── Project Pricing ───────────────────────────────────────────────
    hdrCaps("PROJECT PRICING"),
    plainTable([
      { label: "Design, Supply, Installation & Commissioning of Grid-tied Solar Power Plant with Liaisoning", value: `₹ ${summary.rateKW.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/kW x ${B1} kW` },
      { label: "Project Cost (Sub-Total)", value: formatMoney(summary.totalExGST) },
      { label: `GST (${gstPct.toFixed(1)}%)`, value: formatMoney(summary.gstAmt) },
      { label: "Total Project Cost (Payable Amount)", value: formatMoney(summary.final), bold: true },
      { label: "Amount in words (Payable Amount)", value: numberToWords(Math.round(summary.final)) },
      ...(isDCR2
        ? ([
            { label: "PMSGY Subsidy", value: `₹ ${(cat.charges.subsidy || 78000).toLocaleString("en-IN")}/-`, bold: true, color: GREEN },
            { label: "Total Effective Amount", value: formatMoney(summary.effective), bold: true, color: GREEN },
          ] as PlainRow[])
        : []),
      ...(summary.discountAmt > 0
        ? ([
            { label: `Discount (${inp.discountPct}%)`, value: `- ${formatMoney(summary.discountAmt)}`, bold: true, color: GREEN },
            { label: "Net Payable Amount", value: formatMoney(summary.finalAfterDiscount), bold: true, color: GREEN },
          ] as PlainRow[])
        : []),
      { label: "Minimum Shadow Free Area Required", value: `${shadowA} sq. ft.` },
      { label: "Extra charges at actual", value: "MSEB Load Increase charges (Approx. ₹1000/kW)" },
      { label: "AMC (Without Cleaning)", value: "5 Years FREE" },
      { label: "Solar Insurance", value: "5 Years FREE" },
    ]),
    ...sp(1),
    new Paragraph({ children: [new TextRun({ text: "Note", underline: { type: UnderlineType.SINGLE }, bold: true, size: pt(1.05), color: DARK })] }),
    num(1, "Walkway and access ladder is included.", 360),
    ...sp(1),

    // ── Financial & Subsidy Analysis (engine-computed, audit trail) ────
    ...(financeResult && financeResult.ok ? [hdrCaps("FINANCIAL & SUBSIDY ANALYSIS"), plainTable(financeAuditRows(financeResult)), ...sp(1)] : []),

    // ── AMC Contract Details ──────────────────────────────────────────
    hdrCaps("AMC CONTRACT DETAILS"),
    plainTable(
      [
        { label: "Additional AMC (w/o Cleaning)", value: "₹ 3,000 + 18% (GST) (from 6th year onward)" },
        { label: "Cleaning Charges", value: "₹ 12,000 + 18% (GST) (1st year)" },
        { label: "Annual Escalation", value: "+5%/year" },
        { label: "Payment schedule", value: "At the Beginning of the Year" },
      ],
      3200
    ),
    ...sp(1),
    plainGTable(
      ["Frequency", "O&M Scope"],
      [
        ["9 times/ year (If opted for)", "Panel Cleaning"],
        ["4 times/ year", "Inverter Health Check, Cabling check, Earthing Check, Panel Check, Structure Stability Check and Fix"],
        ["Weekly", "Remote monitoring through the Internet"],
      ],
      [3200, 6438]
    ),
    pb(),

    // ── Project Highlights ────────────────────────────────────────────
    hdrCaps("PROJECT HIGHLIGHTS"),
    ...blList(PROJECT_HIGHLIGHTS),
    bl("Service Guarantee"),
    ...blList(SERVICE_GUARANTEE, 1),
    ...blList(PROJECT_HIGHLIGHTS_TAIL),
    ...sp(1),

    // ── Bill of Material ──────────────────────────────────────────────
    hdrCaps("BILL OF MATERIAL"),
    np(`Material to be supplied for ${B1} kW Grid connected Solar power plant Installation`),
    ...sp(1),
    bomTable(boq),
    ...sp(1),
    np("Check Annexure-I attached for Detailed Methodology."),
    pb(),

    // ── Roles & Responsibilities ──────────────────────────────────────
    hdrTitle("Roles & Responsibilities"),
    plainGTable(["Sr. No.", "Activity", "Responsibility"], ROLES_RESPONSIBILITIES, [900, 5738, 3000]),
    pb(),

    // ── Terms & Conditions ─────────────────────────────────────────────
    hdrTitle("Terms & Conditions"),
    termsSingleTable(buildTermsRows(gstPct)),
    pb(),

    // ── Annexure-I ─────────────────────────────────────────────────────
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: "Annexure-I: Working Methodology and Workflow for the Solar Rooftop Project", bold: true, underline: { type: UnderlineType.SINGLE }, size: pt(1.2), color: DARK })],
      spacing: { before: 100, after: 100 },
    }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "* This is only an indicative document and is not binding.", italics: true, size: pt(1.0), color: DARK })], spacing: { before: 0, after: 160 } }),
    ...ANNEXURE_SECTIONS.flatMap((section, idx) => [
      annexHdr(idx + 1, section.title),
      ...(section.plain || []).map((p) => np(p)),
      ...(section.numbered || []).map((t, i) => num(`${idx + 1}.${i + 1}`, t, 460)),
      ...(section.bullets || []).map((t) => bl(t)),
    ]),
  ];

  const doc = new Document({
    creator: "EnergyBae Private Limited",
    title: `Solar Proposal — ${inp.customerName || "Customer"} — ${B1}kW`,
    sections: [
      {
        properties: { page: { margin: { top: 1400, bottom: 1400, left: 1418, right: 1134 } } },
        headers: { default: new Header({ children: headerChildren }) },
        footers: { default: new Footer({ children: footerChildren }) },
        children,
      },
    ],
  });

  const rawBlob = await Packer.toBlob(doc);
  const arrayBuf = await rawBlob.arrayBuffer();

  // Strip Word 2010+ namespaces so the file opens cleanly in Word 2007+.
  const NS = ["wpc", "cx", "cx1", "cx2", "cx3", "cx4", "cx5", "cx6", "cx7", "cx8", "w14", "w15", "w16cid", "w16se", "wp14", "wpg", "wpi", "wps"];
  const zip = await JSZip.loadAsync(arrayBuf);
  const xmlNames = Object.keys(zip.files).filter((name) => name.endsWith(".xml"));
  await Promise.all(
    xmlNames.map(async (name) => {
      let content = await zip.files[name].async("string");
      let cleaned = content;
      for (const nsTag of NS) {
        cleaned = cleaned.replace(new RegExp(`\\s+xmlns:${nsTag}="[^"]*"`, "g"), "");
        cleaned = cleaned.replace(new RegExp(`\\s+${nsTag}:[a-zA-Z0-9_.\\-]+="[^"]*"`, "g"), "");
      }
      cleaned = cleaned.replace(/\s+mc:Ignorable="[^"]*"/g, "");
      if (name.includes("settings.xml")) cleaned = cleaned.replace(/w:val="15"/g, 'w:val="12"');
      if (cleaned !== content) zip.file(name, cleaned);
    })
  );

  const uint8 = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  const finalBlob = new Blob([uint8], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });

  const fname = `EnergyBae_Proposal_${(inp.customerName || "Customer").replace(/[^a-zA-Z0-9]/g, "_")}_${B1}kW.docx`;
  saveAs(finalBlob, fname);
}
