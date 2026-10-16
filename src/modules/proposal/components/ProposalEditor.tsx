// Proposal Maker — editable proposal document ("Canva-like" inline editor).
// Opened by the "Preview / Print" button. Renders the full sales proposal
// (matching Actual Proposal.docx) as an on-screen A4 document pre-filled
// from the current form/BOQ/finance state; every text, list, table and
// image is editable in place. Exports read from this edited state, not the
// form — see exportWord.ts and window.print() below.
import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, RotateCcw, Printer, FileText as FileWord } from "lucide-react";
import { BOQItem, Catalogue, PricingSummary as PricingSummaryType, ProposalInputs, ProposalMeta } from "../types";
import { EngineResult } from "../proposalEngine";
import { buildProposalData, ProposalData, ProposalBomRow, ProposalRoleRow, ProposalOmRow, recomputePricing, Money } from "../buildProposalData";
import { EditableText, EditableList, EditableTable, EditableImage } from "./EditablePrimitives";
import { FinanceAuditBlock } from "./FinanceAuditBlock";
import { exportProposalWord } from "../exportWord";
import { saveProposalEditorData } from "../storage";
import "../proposal-editor.css";

interface Props {
  open: boolean;
  onClose: () => void;
  inputs: ProposalInputs;
  meta: ProposalMeta;
  catalogue: Catalogue;
  boq: BOQItem[];
  summary: PricingSummaryType;
  financeResult: EngineResult | null;
}

// Label/editable-value table row — the recurring two-column pattern used by
// Project Summary, Project Pricing, and AMC Contract Details.
function EditRow({ label, value, onChange, bold, color, multiline }: { label: string; value: string; onChange: (v: string) => void; bold?: boolean; color?: string; multiline?: boolean }) {
  return (
    <tr>
      <td className="eb-row-label">{label}</td>
      <td className={`eb-row-value${multiline ? " eb-row-value-left" : ""}`} style={{ fontWeight: bold ? 700 : undefined, color }}>
        <EditableText value={value} onChange={onChange} multiline={multiline} />
      </td>
    </tr>
  );
}

// Running header/footer banner — repeated at the top/bottom of every page,
// matching the real proposal's letterhead (see exportDocx.ts's Header/Footer).
function PageHeader({ src, onChange }: { src: string; onChange: (v: string) => void }) {
  return <EditableImage src={src} onChange={onChange} imgClassName="eb-page-header-img" alt="Header" />;
}
function PageFooter({ src, onChange }: { src: string; onChange: (v: string) => void }) {
  return <EditableImage src={src} onChange={onChange} imgClassName="eb-page-footer-img" alt="Footer" />;
}
function StaticRow({ label, value, bold, color }: { label: string; value: string; bold?: boolean; color?: string }) {
  return (
    <tr>
      <td className="eb-row-label">{label}</td>
      <td className="eb-row-value" style={{ fontWeight: bold ? 700 : undefined, color }}>
        {value}
      </td>
    </tr>
  );
}

const bomColumns = [
  { key: "category" as const, label: "Category", width: "14%" },
  { key: "item" as const, label: "Item", width: "18%" },
  { key: "spec" as const, label: "Description", width: "38%" },
  { key: "make" as const, label: "Make", width: "18%" },
  { key: "qty" as const, label: "Qty", width: "12%", align: "right" as const },
];
const rolesColumns = [
  { key: "activity" as const, label: "Activity", width: "70%" },
  { key: "responsibility" as const, label: "Responsibility", width: "30%" },
];
const omColumns = [
  { key: "frequency" as const, label: "Frequency", width: "30%" },
  { key: "scope" as const, label: "O&M Scope", width: "70%" },
];

export default function ProposalEditor({ open, onClose, inputs, meta, catalogue, boq, summary, financeResult }: Props) {
  const [data, setData] = useState<ProposalData | null>(null);
  const pageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) setData(buildProposalData(inputs, catalogue, boq, summary, meta, financeResult));
    // Only reseed when the editor is (re)opened — once open, edits are local
    // to this component's state until "Reset to form data" is pressed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Mirror every edit to localStorage live — this is what lets the
  // standalone proposal-editor.html tool open pre-filled with the exact
  // same, already-computed document (no re-entry, no recomputation there).
  useEffect(() => {
    if (open && data) saveProposalEditorData(data);
  }, [open, data]);

  if (!open || !data) return null;

  const set = <K extends keyof ProposalData>(key: K, value: ProposalData[K]) => setData((d) => (d ? { ...d, [key]: value } : d));

  const setPricingField = (field: "capacityKw" | "ratePerKw" | "gstRatePct" | "subsidy" | "discountPct") => (raw: string) => {
    const num = parseFloat(raw.replace(/[^0-9.-]/g, "")) || 0;
    setData((d) => (d ? { ...d, pricing: recomputePricing({ ...d.pricing, [field]: num }) } : d));
  };

  const setImage = (key: "header" | "footer" | "cover" | "schematic") => (v: string) => set("images", { ...data.images, [key]: v });
  const setGalleryImage = (idx: number) => (v: string) => set("images", { ...data.images, gallery: data.images.gallery.map((g, i) => (i === idx ? v : g)) });
  const setScopeTitle = (idx: number) => (title: string) => set("scopeSections", data.scopeSections.map((s, i) => (i === idx ? { ...s, title } : s)));
  const setScopeItems = (idx: number) => (items: string[]) => set("scopeSections", data.scopeSections.map((s, i) => (i === idx ? { ...s, items } : s)));
  const setTermDetails = (idx: number) => (details: string) => set("termsRows", data.termsRows.map((r, i) => (i === idx ? { ...r, details } : r)));
  const setAnnexureBody = (idx: number) => (body: string) => set("annexureSections", data.annexureSections.map((s, i) => (i === idx ? { ...s, body } : s)));

  function handleReset() {
    if (!window.confirm("Discard your edits and reload this proposal from the current form data?")) return;
    setData(buildProposalData(inputs, catalogue, boq, summary, meta, financeResult));
  }

  function handleWord() {
    if (!pageRef.current) return;
    const fname = `EnergyBae_Proposal_${(data.customerName || "Customer").replace(/[^a-zA-Z0-9]/g, "_")}.doc`;
    exportProposalWord(pageRef.current, fname);
  }

  const p = data.pricing;

  // Portalled to <body> — the app shell's sticky navbar (z-40) lives in a
  // sibling stacking context created by <main>'s `relative z-10`, so a
  // same-tree `fixed` overlay here would be trapped underneath it no matter
  // its own z-index. Escaping to body is the only way to sit above it.
  return createPortal(
    <div className="eb-overlay-root fixed inset-0 z-[70] bg-[#525659] flex flex-col">
      <div className="no-print editor-toolbar flex items-center justify-between gap-3 px-5 py-3 border-b border-black/30 bg-[#17181b] shrink-0">
        <button type="button" onClick={onClose} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 text-xs font-semibold cursor-pointer">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to form
        </button>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <button type="button" onClick={handleReset} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/20 text-white/80 hover:text-white hover:bg-white/10 text-[11px] font-semibold cursor-pointer">
            <RotateCcw className="w-3.5 h-3.5" /> Reset to form data
          </button>
          <button type="button" onClick={() => window.print()} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--accent-solid)] text-white text-[11px] font-bold cursor-pointer">
            <Printer className="w-3.5 h-3.5" /> Download PDF
          </button>
          <button type="button" onClick={handleWord} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--accent-solid)] text-white text-[11px] font-bold cursor-pointer">
            <FileWord className="w-3.5 h-3.5" /> Download Word
          </button>
        </div>
      </div>

      <div className="eb-scroll-wrap flex-1 overflow-y-auto py-8 px-3">
        <div ref={pageRef} className="eb-doc mx-auto">
          {/* ── Page 1 — Cover ─────────────────────────────────────────── */}
          <div className="eb-page">
            <PageHeader src={data.images.header} onChange={setImage("header")} />
            <EditableImage src={data.images.cover} onChange={setImage("cover")} imgClassName="eb-cover-img" alt="Cover" />
            <div className="eb-cover-title">Proposal</div>
            <div className="eb-cover-subtitle">Solar Rooftop System</div>
            <table className="eb-plain-table eb-cover-table">
              <tbody>
                <tr>
                  <td className="eb-cover-label">Prepared For:</td>
                  <td className="eb-cover-value">
                    <EditableText value={data.customerName} onChange={(v) => set("customerName", v)} />
                  </td>
                </tr>
                <tr>
                  <td className="eb-cover-label">Contact No:</td>
                  <td className="eb-cover-value">
                    <EditableText value={data.contactNo} onChange={(v) => set("contactNo", v)} />
                  </td>
                </tr>
                <tr>
                  <td className="eb-cover-label">Proposal No.</td>
                  <td className="eb-cover-value">
                    <EditableText value={data.proposalNo} onChange={(v) => set("proposalNo", v)} />
                  </td>
                </tr>
                <tr>
                  <td className="eb-cover-label">Proposed On.</td>
                  <td className="eb-cover-value">
                    <EditableText value={data.proposedOn} onChange={(v) => set("proposedOn", v)} />
                  </td>
                </tr>
              </tbody>
            </table>
            <PageFooter src={data.images.footer} onChange={setImage("footer")} />
          </div>

          {/* ── Page 2 — Cover Letter + Signatory ─────────────────────── */}
          <div className="eb-page">
            <PageHeader src={data.images.header} onChange={setImage("header")} />
            <p className="eb-p">To,</p>
            <p className="eb-p">
              <EditableText value={data.customerName} onChange={(v) => set("customerName", v)} />
            </p>
            <p className="eb-p">
              <EditableText value={data.address} onChange={(v) => set("address", v)} multiline />
            </p>
            <p className="eb-p">
              <EditableText value={data.coverGreeting} onChange={(v) => set("coverGreeting", v)} />
            </p>
            <EditableList items={data.coverBody} onChange={(v) => set("coverBody", v)} className="eb-plain-list" addLabel="Add paragraph" />

            <table className="eb-plain-table">
              <tbody>
                <StaticRow label="Projected Solar Capacity" value={`${p.capacityKw} kW`} />
                <EditRow label="Sanctioned Load" value={data.sanctionedLoad} onChange={(v) => set("sanctionedLoad", v)} />
                <EditRow label="Sanctioned Load to be Increased" value={data.loadIncrease} onChange={(v) => set("loadIncrease", v)} />
                <EditRow label="Unit Cost" value={data.unitCostLabel} onChange={(v) => set("unitCostLabel", v)} />
              </tbody>
            </table>

            <p className="eb-p">Thanks and Regards,</p>
            <p className="eb-p eb-bold">
              <EditableText value={data.signatoryName} onChange={(v) => set("signatoryName", v)} />
            </p>
            <p className="eb-p">
              <EditableText value={data.signatoryTitle} onChange={(v) => set("signatoryTitle", v)} />
            </p>
            <p className="eb-p">
              Mobile: <EditableText value={data.signatoryMobile} onChange={(v) => set("signatoryMobile", v)} />
            </p>
            <p className="eb-p">
              Email: <EditableText value={data.signatoryEmail} onChange={(v) => set("signatoryEmail", v)} />
            </p>
            <PageFooter src={data.images.footer} onChange={setImage("footer")} />
          </div>

          {/* ── Page 3 — About Us ──────────────────────────────────────── */}
          <div className="eb-page">
            <PageHeader src={data.images.header} onChange={setImage("header")} />
            <div className="eb-section-title">About us:</div>
            <EditableList items={data.aboutUs} onChange={(v) => set("aboutUs", v)} className="eb-plain-list" addLabel="Add paragraph" />
            <div className="eb-gallery-grid">
              {data.images.gallery.map((src, idx) => (
                <EditableImage key={idx} src={src} onChange={setGalleryImage(idx)} imgClassName="eb-gallery-img" alt={`Gallery ${idx + 1}`} />
              ))}
            </div>
            <PageFooter src={data.images.footer} onChange={setImage("footer")} />
          </div>

          {/* ── Page 4 — System + Scope of Work ───────────────────────── */}
          <div className="eb-page">
            <PageHeader src={data.images.header} onChange={setImage("header")} />
            <div className="eb-section-title">SYSTEM</div>
            <p className="eb-p">Schematic of Solar Rooftop System:</p>
            <EditableImage src={data.images.schematic} onChange={setImage("schematic")} imgClassName="eb-schematic-img" alt="System schematic" />

            <div className="eb-section-title">SCOPE OF WORK</div>
            <p className="eb-p">As turnkey solution providers we take care of the solution from concept to completion and maintenance as per the agreed terms and conditions. The scope of work is illustrated below:</p>
            {data.scopeSections.map((section, idx) => (
              <div key={idx} className="eb-scope-section">
                <div className="eb-roman-hdr">
                  <EditableText value={section.title} onChange={setScopeTitle(idx)} />
                </div>
                <EditableList ordered items={section.items} onChange={setScopeItems(idx)} />
              </div>
            ))}
            <PageFooter src={data.images.footer} onChange={setImage("footer")} />
          </div>

          {/* ── Page 5 — Project Summary + Pricing ────────────────────── */}
          <div className="eb-page">
            <PageHeader src={data.images.header} onChange={setImage("header")} />
            <div className="eb-section-title">PROJECT SUMMARY</div>
            <table className="eb-plain-table">
              <tbody>
                <EditRow label="Name of the Customer" value={data.customerName} onChange={(v) => set("customerName", v)} />
                <EditRow label="Address/Location" value={data.address} onChange={(v) => set("address", v)} />
                <StaticRow label="Proposed Capacity" value={`${p.capacityKw} kW`} />
                <EditRow label="Types Of Modules" value={data.moduleType} onChange={(v) => set("moduleType", v)} />
                <EditRow label="Types Of Inverters" value={data.inverterType} onChange={(v) => set("inverterType", v)} />
                <EditRow label="Average Annual Global Tilted Irradiation" value={data.irradiation} onChange={(v) => set("irradiation", v)} />
                <EditRow label="Estimated Annual Generation" value={data.annualGeneration} onChange={(v) => set("annualGeneration", v)} />
                <EditRow label="Type of Installation" value={data.installationType} onChange={(v) => set("installationType", v)} />
                <EditRow label="Payback Period" value={data.paybackPeriod} onChange={(v) => set("paybackPeriod", v)} />
                <EditRow label="Estimated Total Lifetime Savings" value={data.lifetimeSavings} onChange={(v) => set("lifetimeSavings", v)} />
              </tbody>
            </table>

            <div className="eb-section-title">PROJECT PRICING</div>
            <table className="eb-plain-table">
              <tbody>
                <tr>
                  <td className="eb-row-label">Design, Supply, Installation &amp; Commissioning (₹/kW × kW)</td>
                  <td className="eb-row-value eb-pricing-inline">
                    ₹ <EditableText value={String(p.ratePerKw)} onChange={setPricingField("ratePerKw")} className="eb-num" /> /kW ×{" "}
                    <EditableText value={String(p.capacityKw)} onChange={setPricingField("capacityKw")} className="eb-num" /> kW
                  </td>
                </tr>
                <StaticRow label="Project Cost (Sub-Total)" value={Money(p.subTotal)} />
                <tr>
                  <td className="eb-row-label">
                    GST (<EditableText value={String(p.gstRatePct)} onChange={setPricingField("gstRatePct")} className="eb-num" />%)
                  </td>
                  <td className="eb-row-value">{Money(p.gst)}</td>
                </tr>
                <StaticRow label="Total Project Cost (Payable Amount)" value={Money(p.total)} bold />
                <StaticRow label="Amount in words (Payable Amount)" value={p.amountInWords} />
                <tr>
                  <td className="eb-row-label">Subsidy</td>
                  <td className="eb-row-value" style={{ color: "#2E7D32", fontWeight: 700 }}>
                    − ₹ <EditableText value={String(p.subsidy)} onChange={setPricingField("subsidy")} className="eb-num" />
                  </td>
                </tr>
                <StaticRow label="Total Effective Amount" value={Money(p.effective)} bold color="#2E7D32" />
                {p.discountPct > 0 && (
                  <>
                    <tr>
                      <td className="eb-row-label">
                        Discount (<EditableText value={String(p.discountPct)} onChange={setPricingField("discountPct")} className="eb-num" />%)
                      </td>
                      <td className="eb-row-value" style={{ color: "#2E7D32", fontWeight: 700 }}>
                        − {Money(p.discountAmt)}
                      </td>
                    </tr>
                    <StaticRow label="Net Payable Amount" value={Money(p.finalAfterDiscount)} bold color="#2E7D32" />
                  </>
                )}
                {p.discountPct === 0 && (
                  <tr>
                    <td className="eb-row-label">Discount (%)</td>
                    <td className="eb-row-value">
                      <EditableText value={String(p.discountPct)} onChange={setPricingField("discountPct")} className="eb-num" />%
                    </td>
                  </tr>
                )}
                <EditRow label="Minimum Shadow Free Area Required" value={data.shadowFreeArea} onChange={(v) => set("shadowFreeArea", v)} />
                <EditRow label="Extra charges at actual" value={data.extraChargesNote} onChange={(v) => set("extraChargesNote", v)} />
                <EditRow label="AMC (Without Cleaning)" value={data.amcFreeNote} onChange={(v) => set("amcFreeNote", v)} />
                <EditRow label="Solar Insurance" value={data.insuranceFreeNote} onChange={(v) => set("insuranceFreeNote", v)} />
              </tbody>
            </table>

            <div className="eb-section-title eb-underline">Note</div>
            <EditableList ordered items={data.note} onChange={(v) => set("note", v)} />

            {financeResult && financeResult.ok && <FinanceAuditBlock result={financeResult} />}
            <PageFooter src={data.images.footer} onChange={setImage("footer")} />
          </div>

          {/* ── Page 6 — AMC + O&M + Highlights ───────────────────────── */}
          <div className="eb-page">
            <PageHeader src={data.images.header} onChange={setImage("header")} />
            <div className="eb-section-title">AMC CONTRACT DETAILS</div>
            <table className="eb-plain-table">
              <tbody>
                <EditRow label="Additional AMC (w/o Cleaning)" value={data.amcAdditional} onChange={(v) => set("amcAdditional", v)} />
                <EditRow label="Cleaning Charges" value={data.cleaningCharges} onChange={(v) => set("cleaningCharges", v)} />
                <EditRow label="Annual Escalation" value={data.amcEscalation} onChange={(v) => set("amcEscalation", v)} />
                <EditRow label="Payment schedule" value={data.paymentSchedule} onChange={(v) => set("paymentSchedule", v)} />
              </tbody>
            </table>

            <EditableTable<ProposalOmRow> columns={omColumns} rows={data.omScope} onChange={(v) => set("omScope", v)} newRow={() => ({ frequency: "As needed", scope: "New scope" })} />

            <div className="eb-section-title">PROJECT HIGHLIGHTS</div>
            <EditableList items={data.highlights} onChange={(v) => set("highlights", v)} />
            <p className="eb-p eb-bold" style={{ marginTop: 8 }}>
              Service Guarantee
            </p>
            <EditableList items={data.serviceGuarantee} onChange={(v) => set("serviceGuarantee", v)} />
            <EditableList items={data.highlightsTail} onChange={(v) => set("highlightsTail", v)} />
            <PageFooter src={data.images.footer} onChange={setImage("footer")} />
          </div>

          {/* ── Page 7 — BOM + Roles ───────────────────────────────────── */}
          <div className="eb-page">
            <PageHeader src={data.images.header} onChange={setImage("header")} />
            <div className="eb-section-title">BILL OF MATERIAL</div>
            <p className="eb-p">Material to be supplied for {p.capacityKw} kW Grid connected Solar power plant Installation</p>
            <EditableTable<ProposalBomRow>
              columns={bomColumns}
              rows={data.bom}
              onChange={(v) => set("bom", v)}
              newRow={() => ({ category: "Optional / Special", item: "New Item", spec: "", make: "Standard", qty: "1 Nos." })}
            />

            <div className="eb-section-title" style={{ marginTop: 16 }}>
              Roles &amp; Responsibilities
            </div>
            <EditableTable<ProposalRoleRow> columns={rolesColumns} rows={data.roles} onChange={(v) => set("roles", v)} newRow={() => ({ activity: "New activity", responsibility: "Customer" })} />
            <PageFooter src={data.images.footer} onChange={setImage("footer")} />
          </div>

          {/* ── Page 8 — Terms & Conditions ────────────────────────────── */}
          <div className="eb-page">
            <PageHeader src={data.images.header} onChange={setImage("header")} />
            <div className="eb-section-title">Terms &amp; Conditions</div>
            <table className="eb-plain-table">
              <tbody>
                {data.termsRows.map((row, idx) => (
                  <EditRow key={idx} label={row.term} value={row.details} onChange={setTermDetails(idx)} multiline />
                ))}
              </tbody>
            </table>
            <PageFooter src={data.images.footer} onChange={setImage("footer")} />
          </div>

          {/* ── Page 9 — Annexure ──────────────────────────────────────── */}
          <div className="eb-page">
            <PageHeader src={data.images.header} onChange={setImage("header")} />
            <div className="eb-section-title">Annexure</div>
            <p className="eb-p eb-bold">
              <EditableText value={data.annexureDisclaimer} onChange={(v) => set("annexureDisclaimer", v)} multiline />
            </p>
            {data.annexureSections.map((section, idx) => (
              <div key={idx} className="eb-scope-section">
                <div className="eb-roman-hdr">{section.title}</div>
                <p className="eb-p">
                  <EditableText value={section.body} onChange={setAnnexureBody(idx)} multiline />
                </p>
              </div>
            ))}
            <PageFooter src={data.images.footer} onChange={setImage("footer")} />
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
