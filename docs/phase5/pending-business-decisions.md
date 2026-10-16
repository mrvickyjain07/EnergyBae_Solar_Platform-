# BOQ business decision register

*Canonical register for the nine open BOQ rules. Created 2026-10-06; rewritten 2026-10-12 as a register with status, evidence, proposal and activation prerequisites per decision.*

**Rule of this page:** a rule changes a quote only when its status is `approved` **and** a dated approval is recorded below **and** its activation tests exist. A proposal, however reasonable, is not an approval. Until then the calculator (`calcBOQ`, mirrored by `legacyV1.ts`) keeps today's behaviour, and the tests below keep it that way.

Already decided and **not** part of this register: defects D1–D3 and editable cable spares (commit `41b4196`, business-approved 2026-10-05) — anchor bolts = typed Structure Legs × 2 base plates × 4; 4 mm² lugs / cable tags use 2 DC cores; DC cable length × strings; spares blank → 15 / 40 / 40 m, explicit 0 stays 0. Nothing here changes them.

## Status vocabulary

| Status | Meaning |
|---|---|
| `pending` | Open question; no proposal on the table. |
| `proposed` | A recommendation is written down. **Not approved.** No code may use it. |
| `approved` | Owner, date and decision version recorded below. Code may now be written. |
| `rejected` | Proposal declined; current behaviour stays (or a new proposal is needed). |
| `implemented` | Code and activation tests merged; behind its own template version. |
| `verified` | Implemented and checked against the 14 workbook fixtures and a real quote. |

## Summary

| # | Decision | Status | Current behaviour (live) | Proposed future behaviour (not approved) |
|---|---|---|---|---|
| 1 | F / B / SH / Prestructure | `proposed` | Not used anywhere | Per-structure height deductions + Prestructure rate; SH = Shed Height (term confirmed, formula not) |
| 2 | U-clamps / Z-clamps | `proposed` | U = ⌈panels × 1.5⌉, Z = panels × 2 | Project-level quantities unless a layout rule is validated |
| 3 | Walkway / ladder & cross bracing | `proposed` | Walkway 5 m, ladder & bracing 18 m (0 if no capacity) | Project- or structure-level quantities, blank ≠ 0 |
| 4 | Lightning arrester quantity | `proposed` | 1 (0 if LA type NA) | Design-specified quantity; NA = 0; missing = needs review |
| 5 | Data logger | `proposed` | Always 0 | Inverter-compatibility rule, else manual |
| 6 | Purlin | `proposed` | No purlin line | Structure-layout or per-template formula; k unexplained |
| 7 | Structure sub-table | `proposed` | No GI/base-plate line; legs typed (D1) | Structure-specific component BOM |
| 8 | Over-shed aluminium | `proposed` | Qty = required capacity (kW), always | Applicability per structure + kW actually on shed |
| 9 | Capacity basis & matching | `proposed` | Required capacity for everything | Separate bases per use (DC kWp, contracted kW, inverter AC kW) |

Every "proposed" above was recorded from the Phase 5 brief of 2026-10-12. **Proposal owner:** unassigned. **Approval owner:** not yet named for any decision.

## Where each rule lives today (verified 2026-10-12)

- **Live quotes:** `calcBOQ` in `src/modules/proposal/calculations.ts` computes every BOQ line, on the client and again on the server at save (`proposalsApi.ts` freezes the result). `legacyV1.ts` is the same rules as template data; `legacyParity.test.ts` proves they are identical.
- **Commercial totals:** `computePricingSummary` (same file). Installation, liaisoning and ₹/kW use `B1` (required capacity).
- **BOQ templates** (`src/modules/boqTemplates/`, migration 0019): capacity ranges, templates and versions are stored per company. Their structure defaults (`uClamps`, `zClamps`, `walkwayM`, `ladderBracingM`, `laQty`, `purlinExtraM`, `supportLengthM`, `rafterLengthM`, `frontLegHeightFt`, `backLegHeightFt`, `rafterCount`, `legCount`) are **editable but read by no calculation**. The BOQ Pricing screen shows the matching template "for reference" only.
- **F / B / SH / Prestructure** are listed in `CLARIFICATION_REQUIRED` (`templateRules.ts`), shown as "Business clarification required", and a test prevents them from becoming template fields.
- **Template matching:** `matchTemplate` → `rangeContains`: a range holds `(min_kw, max_kw]`; `validateRanges` requires the first range to start at 0, ranges contiguous, only the last open-ended. Called from `BoqGeneration.tsx` with `inputs.capacity` (required kW). Display only.
- **ACDB lookup:** `getACDB(cat, inputs.capacity, phase)` selects Price DB rows with `capMin ≤ capacity ≤ capMax` (both inclusive) on required capacity.

## Tests that freeze current behaviour

| Test | What it pins |
|---|---|
| `src/modules/boqEngine/legacyParity.test.ts` | `runTemplate(LEGACY_V1)` = `calcBOQ` for every line across a large input grid (4127 checks). |
| `src/modules/boqEngine/workbookGolden.test.ts` + `fixtures/expected-comparison.json` | Calculator quantity vs workbook quantity for every mapped line of all 14 sheets, including lines 3, 12, 22, 25, 26, 33, 34, 35. Any change to a pending rule fails here first. |
| `src/modules/boqTemplates/templateRules.test.ts` | Range convention `(min, max]`, contiguity, exactly one range per capacity, `matchTemplate` scoring, F/B/SH/Prestructure never fields. |
| `src/modules/proposal/structureTypes.test.ts`, `components/StructureDetails.test.tsx` | Structure type and heights change no BOQ line; anchor bolts = legs × 8 for every type; proposed formulas rendered only for `boq_template.update`. |
| `src/modules/proposal/calculations.test.ts`, `earthingRules.test.ts` | D1–D3, spares, the earthing-pit rule. |

**Activating any decision requires a reviewed diff to `expected-comparison.json`** (regenerate with `npx tsx scripts/boqGoldenReport.ts`). Never regenerate it to make a failing test pass without that review. Every activation must also add its own tests: formula and units, a standard case, min / max, zero and missing input, applicable and non-applicable structure types, manual override, the workbook fixtures, and proposal pricing downstream.

**How a rule is activated (all decisions):** a new template engine version (not `legacy-v1`), so saved and frozen proposals are never recomputed. `legacy-v1` and `calcBOQ` stay as they are, and `legacyParity.test.ts` keeps proving it. Proposals reference the template version they were generated with.

Workbook evidence: `docs/phase5/2026-10-05-phase5-ab-evidence-report.md` (§5 structure, §8 kW basis, §12 decision table, Appendix B structure cells) and `boq-golden-report.md`. Sheet names are shortened (Ananda 10.8 = `10.8kW Non-raised Strucutre Sol`, etc.).

## Who approves what

A decision moves to `approved` only when **every role listed for it** has signed, and the signature is copied into the approval log with the decision version. One person may hold several roles; each role still signs.

| Role | Decides | Signs for | Name | Signed (date) |
|---|---|---|---|---|
| Structural engineer | Physical meaning, datum and units of F, B, SH; the height deductions; structure layout and members (legs, supports, rafters, purlins, base plates); any clamp, walkway or bracing rule; which structure types carry over-shed aluminium | D1 (dimensions), D2, D3, D6, D7, D8 (applicability) | — | — |
| Electrical engineer | LA count and any link to earthing; data-logger rule per inverter model; ACDB selection basis (AC rating, per inverter or per system) | D4, D5, D9 (ACDB) | — | — |
| Pricing / product owner | Prestructure unit, rate and capacity basis; per-kW fee basis and ₹/W; over-shed rate; who enters typed quantities and the template defaults | D1 (Prestructure), D2 and D3 (who enters, defaults), D8 (rate), D9 (commercial basis) | — | — |
| QA / dev lead | Activation tests per rule; the reviewed golden-snapshot diff; the new template version | every decision, before `implemented` | — | — |
| Product manager | UI copy and pending defaults; release | every decision, before release | — | — |

## While a decision is pending (default policy)

These rules apply to every decision in this register until it is `approved`, and to every future rule.

| # | Rule | Where it applies | State in the app (2026-10-12) |
|---|---|---|---|
| P1 | A quantity whose rule is an open decision is labelled **Provisional** and names the decision it waits on. | BOQ Pricing: "Source" column and "Why this quantity?"; BOQ Templates: "Pending Dx" chip | **Implemented** for lines 3 (D5), 6 (D9), 12 (D4), 25–26 (D2), 33–34 (D3), 35 (D8). Single list: `src/modules/boqEngine/pendingDecisions.ts`; `pendingDecisions.test.ts` fails if a decision here leaves `proposed` / `pending` without that list being updated. An overridden line shows "Manual" instead. |
| P2 | An unapproved dimension or pricing rule shows **"Requires engineering input"**, never a formula or a number that could pass for an approved rule. | Structure Details | **Implemented.** F, B, SH and Prestructure read "Requires engineering input" for every type. The proposed formulas are visible only to users with `boq_template.update`, collapsed under "Proposed rule (for engineering review)". `StructureDetails.test.tsx` renders the component for all five types and checks that, without that permission (no permissions, other permissions, signed out, auth still loading), no proposed value and no disclosure is in the markup at all. |
| P3 | Unknown is blank or "—", **never 0**. | Every new input and derived value | **Implemented** for the height inputs (placeholder "Not measured"). Structure Legs keeps blank = 0, the approved D1-fix behaviour. Applies to D2 / D3 / D5 / D8 defaults when they are activated. |
| P4 | No **new** automatic structural quantity (legs, supports, rafters, purlins, base plates, GI steel) until its rule is approved. **Approved rules stay as they are:** anchor bolts = typed Structure Legs × 2 base plates × 4 (2026-10-05) keeps running, and no pending D1 formula may replace or override it. | `calcBOQ` and templates | **Holds**: no new line exists; legs are typed; anchor bolts unchanged. `structureTypes.test.ts` checks that heights (the pending D1 inputs) change no BOQ line and that anchor bolts = legs × 8 for all five types. |
| P5 | A rule that needs an unresolved input produces no quantity; its explanation says the input is pending. | Future template engine | Applies on activation. Nothing reads F, B or SH today. |
| P6 | A missing or unapproved rate **blocks** the line ("rate not set"); it is never priced at 0. | Prestructure and every new priced line | Applies on activation. (Existing lines with no Price DB rate show "—", as today.) |
| P7 | Saved and frozen proposals are never recalculated; a new rule runs only in a new template version. | Activation | Applies on activation (see "How a rule is activated"). |

## Approval packages at a glance (D1–D9)

Each decision section below carries a full package: recommended option, workbook evidence, sign-offs, unresolved assumptions, worked examples from the 14 fixtures, and acceptance tests. **"Recommended" is the analyst's recommendation for the approver, not an approval**: every decision stays `proposed`, and nothing below may run in a quote until the approval log records it (P1–P7 apply meanwhile). An external brief recommending an option is not an approval either.

| # | Recommended option (not approved) | Signs (all required) | Blocks approval | Fixtures: today's rule matches → recommended option would |
|---|---|---|---|---|
| D1 | Height deductions in feet (D1d I), once the engineer says what they deduct; Prestructure per installed DC Wp, replacing line 35 for shed types (D1e A + R1); structure quantities suggested and editable (D1f γ). **No recommendation** on what Shed Height measures or SH = F (D1a–D1c): only the structural engineer can define them | Structural engineer, pricing / product owner, QA, PM | Questions 1–12 | Nothing to compare: no workbook cell holds F, B, SH or Prestructure |
| D2 | U and Z typed per project; template default blank, so an empty line shows "needs input"; no panel-count multiplier | Structural engineer, pricing / product owner, QA, PM | Whether any layout rule exists (module manual, rails) | U 1 / 14, Z 1 / 14 → 14 / 14 (typed) |
| D3 | Walkway and ladder & bracing typed in metres per project, defaults from the template; ladder and bracing stay one line until split | Structural engineer, pricing / product owner, QA, PM | Ladder unit; split | 0 / 14 → 14 / 14 (typed) |
| D4 | LA count entered from the protection design (IS/IEC 62305 risk assessment); `laQty` 1 only as a Provisional suggestion; NA = 0; no link to pits or LA cable | Electrical engineer, QA, PM | What drove 2–3 LAs on Ananda | 10 / 14 → 14 / 14 (entered) |
| D5 | Logger count entered per project, blank = "needs input"; later a per-model monitoring attribute; PM Surya Ghar systems suggest 0 separate loggers (built-in communication, S8), engineer confirms | Electrical engineer, pricing / product owner (price source), QA, PM | Logger price source; per-model data | 3 / 11 sheets with a logger row → 11 / 11 (entered) |
| D6 | No purlin line until 1.2, 3 and k are explained; then `panels × 3.6 + k` with k per template, else typed metres | Structural engineer, pricing / product owner, QA, PM | Meaning of 1.2, 3, k; 6 m rounding | No line today → formula 11 / 14 with the sheet's k |
| D7 | Keep typed legs and the approved anchor-bolt rule; base-plate and GI-structure lines typed per project (D1f β / γ) until a structural method is approved | Structural engineer, pricing / product owner, QA, PM | Support vs leg; base plates × 2 or × 1.5 | Anchor bolts 12 / 14 (unchanged) |
| D8 | Applicability per structure type plus typed kW on the shed; not applicable = 0; applicable and blank = "needs input" | Structural engineer, pricing / product owner, QA, PM | AC or DC kW; overlap with Prestructure (Q12) | 2 / 14 → 14 / 14 (typed) |
| D9 | One basis per use: ₹/Wp on installed DC Wp; per-kW fees on an explicit basis; templates on DC kWp; ACDB on inverter AC rating, possibly one per inverter | Pricing / product owner, electrical engineer (ACDB), QA, PM | Which kW the customer quote shows; ACDB per inverter or total | ACDB 11 / 14 → 13 / 14 if one per inverter (Aaryan 5 kW has 2 ACDBs for 1 inverter) |

"Typed / entered" reproduces the workbook by construction: those sheets were filled by hand, so a typed field matches them. It shows that no rule is lost, not that a rule was found.

---

## Structure types (UI) — options `approved` 2026-10-12, formulas still `proposed`

The 2026-10-12 brief approved **the five options and their form behaviour only**. It did not approve any F / B / SH / Prestructure formula; those stay under D1.

| Display name | Stored code | Structure Details fields | Proposed rule (visible to template editors only, collapsed; everyone else sees "Requires engineering input", P2) |
|---|---|---|---|
| Shed Flush | `S-F` | Structure Legs | F = 0, B = 0, Shed Height — (no rule given), Prestructure 1.5 / Wp |
| Shed Tilted | `S-T` | Structure Legs | F = 0, B = 0, Shed Height — (no rule given), Prestructure 4.5 / Wp |
| Non-Elevated | `N-E` | Lower Height (ft), Upper Height (ft), Structure Legs | F − 4, B − 6, Shed Height F − 4 |
| Elevated | `E` | Lower Height (ft), Upper Height (ft), Structure Legs | F − 6, B − 8, Shed Height F − 6 |
| Ground Mounted | `GM` | Lower Height (ft), Upper Height (ft), Structure Legs | F − 2, B − 4, Shed Height F − 2, Prestructure 6 (unit not stated) |

- Single source: `src/modules/proposal/structureTypes.ts` (form, project systems, BOQ template variants, documents). Tests: `structureTypes.test.ts`.
- **Stored as codes**, because the old options stored labels and an old "Elevated" must stay distinguishable from the new Elevated. Older values ("Flush Mount (Default)", "Single Tilt", "Elevated") are **not converted**: they display as themselves, stay selectable in project / template dropdowns, and the proposal form asks the user to pick one of the five. No migration; `structure_type` is free text in `project_systems` and `boq_templates`.
- Structure Legs is shown for every type (it drives anchor bolts, the approved D1 fix). Heights are hidden for shed types (spec F = 0, B = 0); switching to a shed type clears previously entered heights so they can't reach the proposal document.
- **No quantity, cost or total depends on structure type** (tested for all five codes, the three old values and blank). The only output change is line 35's spec text, which now shows the label for a code; old values print exactly as before.
- Still blank by design: which structure lines apply per type (pending D1, D3, D6, D7, D8). The form says so instead of showing a number, and the BOQ marks lines with an open rule Provisional (P1).

---

## D1. F / B / SH / Prestructure — `proposed`

Symbols (terminology confirmed 2026-10-12; **formulas not confirmed**):

| Symbol | Meaning |
|---|---|
| F | Front |
| B | Back |
| SH | Shed Height |

| Field | Record |
|---|---|
| Current behaviour | Not used by any calculation. Blocked in templates (`CLARIFICATION_REQUIRED`). |
| Workbook evidence | **None.** A search of every cell in all 21 sheets finds no `F`, `B`, `SH`, `Prestructure`, `S-F`, `S-T`, `N-E` or `GM` (evidence §5.1). Nearest labels: Fredrick "Legs (Front)" / "Legs (Middle)" (values typed as `ft/3.28`, i.e. feet converted to metres); Foundit "On Shed" / "On Parafeet". Leg heights everywhere are typed in **feet** and divided by 3.28. |
| Source of the proposal | Product spec `01_BOQ_Formula_Calculation_Spec.md` §6 (not a workbook). The spec itself says the units and meaning "must be confirmed … before coding". |
| Proposed behaviour | Structure configuration below. If approved: `effectiveFront = max(0, frontInput − frontDeduction)`, `effectiveBack = max(0, backInput − backDeduction)`, applied only to the structure types listed with a deduction. `prestructureCost = ratePerWp × installedDcWp`, only if that formula is confirmed. |
| Units / inputs | Front and back height inputs (unit unconfirmed; feet is likely given the workbooks and `frontLegHeightFt`); installed DC Wp. |
| Defaults / zero / unknown | No default. A missing or unapproved rate must **block the line** ("rate not set"), never price at 0. SH means Shed Height, but it has **no confirmed formula** and must not be derived from F and B. |
| BOQ lines | None today. Future structure lines (GI structure, legs, base plates, anchor bolts), possibly template selection. |
| Downstream | Structure cost, material total, ₹/W, final quote. |
| Example (illustrative, if approved) | Non-Elevated, front input 7, back input 9 → effective 3 / 3. Ground Mounted, 3,000 Wp, rate 6 ₹/Wp → ₹18,000 (only if "6" is ₹/Wp). |
| Recommended option (not approved) | D1d (I) feet, once the engineer states what is deducted. D1e (A): per installed DC Wp, with (R1) Prestructure replacing line 35 on shed types, subject to question 12. D1f (γ) now, then (α) once D6 / D7 are approved. **No recommendation for D1a–D1c** (what SH measures, where it applies, SH = F): that is the structural engineer's definition. **No recommendation on the GM "6".** Deductions are never treated as 0 meanwhile (P5). |
| Signs | Structural engineer (D1a–D1d, D1f), pricing / product owner (D1e, D1f), QA / dev lead, product manager. |
| Unresolved assumptions | Meaning and datum of SH; SH = F; whether Lower / Upper Height are F / B; what 4 / 6 / 8 / 2 are; GM unit; Raised / Non-raised / Shed ↔ E / N-E / S-F / S-T (question 11). |
| Worked examples | "Worked examples from the 14 workbooks" below. |
| Acceptance tests (on activation) | Only if D1d (I) is approved: N-E 7 / 9 ft → effective 3 / 3; E 7 / 9 → 1 / 1; GM 7 / 9 → 5 / 5; N-E 3 / 5 → 0 / 0 (max 0). Blank height → no effective height, and the line explains that the input is pending (P5), never 0. S-F 3,000 Wp × 1.5 → ₹4,500 (only with D1e A); rate not set → line blocked (P6). Anchor bolts unchanged for every type (legs × 8). `legacyParity` 4127 checks unchanged. Golden-snapshot diff limited to reviewed lines. |
| Approval | Owner: — · Date: — · Version: — |

Proposed structure configuration (**unapproved**). Front / Back / Prestructure / note from spec §6; the SH (Shed Height) column comes from the 2026-10-12 business discussion and is **not in the spec**:

| Structure type (code) | SH (Shed Height) | F (Front) | B (Back) | Prestructure | Spec note |
|---|---|---|---|---|---|
| Shed Flush (S-F) | — (no rule given) | F = 0 | B = 0 | 1.5 / Wp | — |
| Shed Tilted (S-T) | — (no rule given) | F = 0 | B = 0 | 4.5 / Wp | — |
| Non-Elevated (N-E) | F − 4 | F − 4 | B − 6 | not specified | "Structure Table = Filled" |
| Elevated (E) | F − 6 | F − 6 | B − 8 | not specified | "Structure Table = Filled" |
| Ground Mounted (GM) | F − 2 | F − 2 | B − 4 | **6** (no unit in the spec) | — |

**Flagged, not resolved: SH = F.** For N-E, E and GM the Shed Height expression is identical to the Front expression. The spec (§6) has no SH at all and no workbook cell defines a shed height, so nothing available establishes whether the duplication is intentional, a copy error or a placeholder. The formulas above are kept **exactly as written**. The dash on the shed types means only that no rule was given: shed structures physically have heights (Foundit's shed sheets list legs "On Shed" at 4 ft), so the dash must not be read as "this dimension does not exist".

### D1 evidence (re-checked 2026-10-12)

| Evidence | What it shows | What it does not show |
|---|---|---|
| Workbook B10 / B11 "Structure Height Lower / Upper (FT.)" (= form inputs *Lower Height (ft)* / *Upper Height (ft)*) | **7 / 9 ft on 11 of 14 sheets** whatever the structure (raised, non-raised, shed); 3 / 5 on Aaryan 1 kW; 0 / 0 on Foundit NDCR and Fredrick. C10 / C11 convert with `× 0.305` and feed only the Aaryan rafter-length parameter, which no BOQ cell uses | That they were measured per site: identical values across structure types look like a copied template default, so they are weak evidence for F / B |
| Side-table leg heights, typed as `ft / 3.28` | Ananda non-raised 4 and 6 ft (equal to the N-E deductions); Ashwini raised 7 and 9 ft (≠ E deductions 6 / 8); Celebration 7 / 5; hybrid 2 / 4; Fredrick "Legs (Front)" 7, "Legs (Middle)" 8, 9; Foundit "On Parafeet" 6 and 4, "On Roof Parafeet" 11, **"On Shed" 4** | A rule: the leg counts beside them are typed (all 0 on Foundit) |
| Product spec §2 input list | Lists "Structure Height Lower (FT.)", "Structure Height Upper (FT.)", "3.5ft GI Shed (sqft)" as observed workbook inputs | Any link between these and F / B / SH |
| Product spec §6 | The F / B deductions, "Structure Table = Filled", Prestructure values, and "units/semantics must be confirmed … before coding" | SH; currency; the GM unit |
| Unit conversions in the workbooks | Two factors are used: `÷ 3.28` (sub-tables) and `× 0.305` (C10 / C11); the exact factor is 0.3048 m/ft | Which one any future rule should reproduce |

**Candidate meanings of Shed Height (for the engineering owner to choose from or replace; none is adopted):**
- (a) Height of the existing shed or building the system sits on, from ground or roof slab. It would affect access, cable runs or lifting, not structure members.
- (b) Clear height (headroom) under a raised structure, i.e. the usable "shed" space it creates on an RCC terrace or over ground. This would explain why N-E / E / GM have an SH rule and the shed-roof types do not, and why SH is tied to the front (lowest) edge.
- (c) Height of the mounting structure above a shed roof (Foundit "On Shed" legs).
- (d) Something else.

Not to be assumed without confirmation: SH as the front leg, back leg, average or difference of F and B, module height above the roof, or the building's elevation.

### Recommended measurement model (proposed, not approved)

| Field | Kind | Unit | Datum / meaning | Applies to | Status |
|---|---|---|---|---|---|
| Structure type | input | — | One of S-F, S-T, N-E, E, GM | all | implemented (UI) |
| Front height F | input (measured) | stated per field (ft today) | Vertical distance from the **mounting surface** (RCC slab / shed sheet / finished ground) to the top of the front (lower-edge) leg | N-E, E, GM (proposed) | proposed |
| Back height B | input (measured) | as F | Same, at the back (higher-edge) leg | N-E, E, GM (proposed) | proposed |
| Shed Height SH | input **or** derived, per the approved definition | as F | Datum to be fixed by the definition chosen above | to be decided | **open** |
| Tilt angle | derived or input | degrees | Consistency only: B − F = array depth × tan(tilt). Collect F and B, or F and tilt, **never three independent values** | raised / ground types | proposed |
| Panel rows, panels per row, array depth | input / derived | Nos., m | From the layout; already partly in the form (Panel Rows) | all | partly exists |
| Effective front / back | derived | as F | `max(0, F − frontDeduction)`, `max(0, B − backDeduction)` from the spec table | N-E, E, GM | proposed, inactive |
| Member lengths (legs, supports, rafters, purlins) | derived | m | Only from an approved structural design method (D6, D7) | per type | **open** |
| Component quantities | derived or input | Nos., m, kg | See dependency table below | per type | open (D2, D3, D6, D7, D8) |

Units: store every length with its unit explicit (or in one canonical unit with a named conversion). Use **0.3048 m/ft** in code. A test must pin each conversion. Never mix feet inputs with metre member lengths implicitly.

**Template for each future approved rule** (filled in only on approval): required inputs · formula and unit · minimum / maximum behaviour (e.g. deduction larger than input → 0, or block) · missing-input behaviour (block the line, never 0) · applicable structure types · downstream BOQ lines · expected results for representative cases (one per type, plus a boundary and a missing-input case).

### Structure-to-BOQ dependencies (what *could* drive each line after approval)

| BOQ item | Potential dependency | Today in `calcBOQ` | Decision |
|---|---|---|---|
| Structure legs and supports | Mounting geometry, support arrangement, member dimensions | Legs **typed** (Structure Legs); no support line | D7 |
| Rafters | Structural span and member layout | No line | D7 |
| Purlins | Panel layout, span arrangement, stock lengths | No line | D6 |
| Base plates | Approved leg / support connection | Not a line; legs × 2 used inside anchor bolts | D7 |
| Anchor bolts | Base-plate and connection design | Legs × 2 × 4 (**approved D1 fix, unchanged**) | D7 (re-approval needed to change) |
| GI steel quantity | Validated member lengths; stock-length rounding (workbooks round up to 6 m) | No line | D7 |
| Clamps, walkway, ladder & bracing | Layout / module manual; access design | Fixed heuristics (lines 25, 26, 33, 34) | D2, D3 |
| Over-shed aluminium | kW actually on the shed | = capacity (line 35) | D8 |
| Prestructure cost | Confirmed rate, unit and capacity basis | None | D1, D9 |
| Cables and earthing | Existing approved rules | Unchanged; **no new dependency on heights** without approval | — |

No component count may be calculated from a height alone: legs, rafters, purlins, base plates and anchor bolts also need the layout and an approved structural method (S1, S2 govern the design; OpenSolar's span rules are not transferable).

### Prestructure pricing (reviewed separately)

| Question | What the spec establishes | Open |
|---|---|---|
| Currency | Not stated (₹ is likely in context but not written) | Confirm ₹ |
| Denominator | "/ Wp" for S-F (1.5) and S-T (4.5); **GM "6" has no denominator** | GM unit |
| Capacity basis | Not stated: installed DC Wp, required kW × 1000, or another measure (see D9) | Basis |
| Included in or added to structure items | Not stated | Whether Prestructure replaces the structure sub-table / over-shed line (D7, D8) or adds to them |
| Eligible types | S-F, S-T, GM have a value; N-E, E "not specified" (spec says "Structure Table = Filled" for them) | Whether N-E / E never carry Prestructure |
| Pricing model | Reads as a per-Wp rate for the shed types | Fixed charge vs rate for GM |
| Workbook evidence | **None**: no Prestructure cell. Nearest: header cells "Rate With Structure" / "Rate Without Structure" (subtracts the GI 80×40 row) and the over-shed Al ₹/kW line | — |

The GM "6" must not be treated as ₹6/Wp until the business owner confirms it. No Prestructure amount is calculated anywhere.

### Decision options for sign-off (D1a–D1f)

Each question lists every option on the table. The approver ticks one (or writes a new one) in the **Chosen** column; "Evidence leans" is what the workbooks and sources suggest, not a recommendation to approve.

**D1a. What Shed Height measures** — signs: structural engineer

| Option | Meaning | Inputs it needs | Evidence | Chosen |
|---|---|---|---|---|
| (a) | Height of the existing shed or building the system sits on (from ground or slab) | One measured height | None in the workbooks | ☐ |
| (b) | Clear headroom under a raised structure (the usable "shed" space it creates) | Front height and a frame-depth allowance, or a measured clearance | Would explain why only N-E / E / GM carry an SH rule and why it follows F | ☐ |
| (c) | Height of the mounting structure above a shed roof | Leg height on the shed | Foundit lists legs "On Shed" at 4 ft | ☐ |
| (d) | Not a separate value: an alias of the effective front height | None extra | Matches the table literally (SH = F − x) | ☐ |
| (e) | Other (write in) | — | — | ☐ |

**D1b. Where Shed Height applies** — signs: structural engineer

| Option | Applies to | Note | Chosen |
|---|---|---|---|
| (i) | N-E, E, GM, as the proposed table shows | Odd for Ground Mounted if SH means a shed | ☐ |
| (ii) | S-F, S-T only | Fits the name; contradicts the table's dash | ☐ |
| (iii) | All five types | Uniform, but must mean the same thing everywhere | ☐ |
| (iv) | Per type, as the engineer specifies | — | ☐ |

**D1c. Shed Height vs Front** — signs: structural engineer

| Option | Rule | Consequence | Chosen |
|---|---|---|---|
| (1) | SH = F − x exactly as written | SH is not a separate input; one field fewer | ☐ |
| (2) | SH independent (own input or own formula) | New input and formula to define | ☐ |
| (3) | The SH column is a table error and gets rewritten | Supply the corrected column | ☐ |

**D1d. The deductions 4 / 6 / 8 / 2** — signs: structural engineer

| Option | Meaning | Evidence | Chosen |
|---|---|---|---|
| (I) | Feet | Every workbook height is typed in feet; the form's heights are in feet | ☐ |
| (II) | Metres | None | ☐ |
| (III) | Another quantity (e.g. a standard leg length, parapet allowance or clearance), stated | Ananda's non-raised leg heights are 4 and 6 ft, equal to the N-E deductions | ☐ |

Until this is decided **no effective height is computed** (P5). Treating the deductions as 0 "for now" is not an option: it would silently produce numbers under an unapproved meaning.

**D1e. Prestructure** — signs: pricing / product owner (with the structural engineer for R1 / R2)

| Option | Unit and basis | Note | Chosen |
|---|---|---|---|
| (A) | ₹ per Wp × installed DC Wp (panels × Wp) | Matches the "/ Wp" written for S-F and S-T | ☐ |
| (B) | ₹ per W × required capacity (kW × 1000) | The basis today's per-kW charges use | ☐ |
| (C) | ₹ per W × inverter AC rating | Differs from DC whenever DC / AC ≠ 1 | ☐ |
| GM "6" | Must be stated: per Wp like the shed types, per kW, or something else | The spec gives no unit | ☐ |
| (R1) | Prestructure **replaces** the over-shed aluminium line (35) and/or the structure sub-table for these types | The workbooks' over-shed rate of ₹1,500/kW (Fredrick, Celebration) equals ₹1.5/W, the S-F rate | ☐ |
| (R2) | Prestructure **adds** to them | Risk of charging the structure twice | ☐ |

**D1f. How structure lines get their quantities** — signs: structural engineer + pricing / product owner

| Option | How | Trade-off | Chosen |
|---|---|---|---|
| (α) | Derived from the layout by an approved structural method | Needs layout inputs and the D6 / D7 rules | ☐ |
| (β) | Typed per project, defaulted from the template | Always possible; relies on the person quoting | ☐ |
| (γ) | Suggested by a rule, editable, marked Provisional until reviewed (P1) | Transitional path from (β) to (α) | ☐ |

### Worked examples from the 14 workbooks

Real values from `src/modules/boqEngine/fixtures/workbooks/` (pairs are workbook / calculator today). "Legs" is inferred from the base-plate line ÷ 2, as the golden test does. There is **no Ground Mounted sheet and no sheet labelled tilted**, so no example below is a GM or S-T project.

| Sheet | kW (B1) | Installed DC (panels × Wp) | Lower / Upper ft (B10 / B11) | Legs | Anchor bolts (22) | U-clamps (25) | Z-clamps (26) | Ladder & bracing m (33) | Walkway m (34) | Over-shed kW (35) | Purlin m (workbook) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Aaryan / 1kW Solar | 1 | 2 × 590 = 1,180 | 3 / 5 | 2 | 16 / 16 | 3 / 3 | 6 / 4 | — / 18 | 0 / 5 | 0 / 1 | 7.2 |
| Aaryan / Copy of Solar BOQ | 3 | 6 × 590 = 3,540 | 7 / 9 | 6 | 48 / 48 | 12 / 9 | 12 / 12 | — / 18 | 12 / 5 | 0 / 3 | 14.4 |
| Aaryan / Solar BOQ | 5 | 9 × 590 = 5,310 | 7 / 9 | 6 | 48 / 48 | 12 / 14 | 12 / 18 | — / 18 | 25 / 5 | 0 / 5 | 32.4 |
| Ananda / 10.8 kW Non-raised | 10.5 | 18 × 600 = 10,800 | 7 / 9 | 10 | 80 / 80 | 78 / 27 | 18 / 36 | 12 / 18 | 0 / 5 | 0 / 10.5 | 69.3 |
| Ananda / 34.2 kW Non-raised | 34 | 57 × 600 = 34,200 | 7 / 9 | 22.5 | 180 / 176 | 78 / 86 | 18 / 114 | 24 / 18 | 21 / 5 | 0 / 34 | 217.2 |
| Ananda / 4.2 kW Non-raised | 4.2 | 7 × 600 = 4,200 | 7 / 9 | 6 | 48 / 48 | 78 / 11 | 18 / 14 | 6 / 18 | 0 / 5 | 0 / 4.2 | 29.7 |
| Ananda / 40.2 kW Non-raised | 40 | 75 × 540 = 40,500 | 7 / 9 | 22.5 | 180 / 176 | 78 / 113 | 18 / 150 | 24 / 18 | 21 / 5 | 0 / 40 | 282 |
| Ashwini / 3 kW Raised | 3 | 5 × 600 = 3,000 | 7 / 9 | 4 | 32 / 32 | 9 / 8 | 12 / 10 | 12 / 18 | 3.6 / 5 | 0 / 3 | 21.6 |
| Ashwini / 4.8 kW Raised | 4.8 | 8 × 600 = 4,800 | 7 / 9 | 6 | 48 / 48 | 18 / 12 | 12 / 16 | 12 / 18 | 4.5 / 5 | 0 / 4.8 | 32.4 |
| Celebration / 25 kW Non-raised + Shed Hybrid | 25 | 42 × 600 = 25,200 | 7 / 9 | 12 | 96 / 96 | 84 / 63 | 12 / 84 | 0 / 18 | 9.6 / 5 | 15.6 / 25 | 30 |
| Celebration / 25 kW Non-raised | 25 | 42 × 600 = 25,200 | 7 / 9 | 20 | 160 / 160 | 90 / 63 | 72 / 84 | 0 / 18 | 9.6 / 5 | 9.6 / 25 | 30 |
| Foundit / 6 kW Shed DCR | 3 | 5 × 600 = 3,000 | 7 / 9 | 0 | 0 / 0 | 33 / 8 | 18 / 10 | 12 / 18 | 10 / 5 | 3 / 3 | 21.6 |
| Foundit / 6 kW Shed NDCR | 6 | 10 × 600 = 6,000 | 0 / 0 | 0 | 0 / 0 | 33 / 15 | 18 / 20 | 12 / 18 | 10 / 5 | 6 / 6 | 39.6 |
| Fredrick / 3.6 kW Raised | 5.4 | 9 × 600 = 5,400 | 0 / 0 | 0 | 0 / 0 | 60 / 14 | 30 / 18 | 24 / 18 | 29 / 5 | 4.2 / 5.4 | 36 |

What the table shows:
- **Anchor bolts (approved rule, legs × 2 × 4):** equal to the workbook on 12 of 14 sheets (three of them 0 = 0, no base-plate line). The two differences are Ananda 34.2 / 40.2 (180 vs 176), where the workbook takes base plates as supports × 1.5 (D7).
- **Clamps (D2):** the calculator matches U on 1 sheet and Z on 1 sheet. The workbook's U = 78 / Z = 18 repeats on four Ananda sheets from 4.2 to 40.2 kW, which looks copied, not designed.
- **Walkway and bracing (D3):** the fixed 5 m / 18 m match no sheet. **Over-shed (D8):** "= capacity" matches only the two Foundit sheets (3 = 3, 6 = 6), where the whole system is on the shed; elsewhere the workbook kW is 0 or part of the system — consistent with D8's "kW actually on the shed".
- **Heights:** 7 / 9 ft on 11 sheets regardless of structure (above), so they illustrate formulas only.

Illustrations — **only if the named options were approved**, and assuming workbook "Non-raised" = N-E and "Raised" = E (question 11):
- **Effective heights, D1d (I) feet**, applied to the 7 / 9 ft inputs: N-E → max(0, 7 − 4) / max(0, 9 − 6) = **3 / 3 ft**; E → max(0, 7 − 6) / max(0, 9 − 8) = **1 / 1 ft**. A 1 ft effective height from a 7 ft raised structure suggests either the deductions are not meant for these inputs or the inputs are defaults — the point of questions 3 and 4.
- **Prestructure, D1e (A)**, on the two shed sheets: Foundit DCR 3,000 Wp → ₹4,500 at 1.5 or ₹13,500 at 4.5; Foundit NDCR 6,000 Wp → ₹9,000 or ₹27,000. For comparison, that NDCR workbook priced its over-shed aluminium at 6 kW × ₹2,500 = ₹15,000 (₹2.5/W); the DCR sheet at ₹0/kW. Under (R2) the structure would be charged twice.
- **No Ground Mounted example**: no sheet, and the "6" has no unit.

### Review of the external decision brief (2026-10-12)

An external "Executive Summary" decision brief on D1 / D6 / D7 / D9 was reviewed. **Adopted** (corrected) into this register: the option lists (above), the sign-off roles ("Who approves what") and the pending-default policy (P1–P7). **Not adopted**, because they conflict with the code or the workbooks:
- its worked examples: Fredrick called Non-Elevated and Ground Mounted (it is a raised 3.6 kW sheet); Ananda 10.8 called Elevated with 36 × 300 Wp (it is non-raised, 18 × 600 Wp); no Ground Mounted sheet exists;
- anchor bolts 4 × 4 = 16 for 4 legs (the approved rule gives 32);
- a "Front ≥ Back" validation (the front is the lower edge);
- pricing Ground Mounted "6" as ₹/Wp, and an AC example that equals the DC one;
- "clamps = panel-count rules" as a recommendation (D2 has no such evidence);
- results marked "Verified" / "Tested" that were not tested; "38 sheets" (38 checks, 14 sheets); a claim that the fixtures cover all structure types;
- unresolvable citation markers (`【20†L3-L10】`, `【pending-info】`, `【user-doc】`) in place of sources — this register's Sources table is the reference;
- "treat deductions as 0 until confirmed" and "default new lines to 0" (contrary to P3 / P5);
- a blanket "no automatic structural calculation": the approved anchor-bolt rule keeps running (P4);
- its scope: it covered D1 with D6 / D7 / D9 only, so the D2–D5 and D8 packages were written here from the fixtures ("Approval packages at a glance").

### Questions for the engineering owner

1. What physical points define Shed Height (from which surface to which point), and which of the candidate meanings (a)–(d) is intended?
2. Is Shed Height measured independently or derived from Front and Back? Is `SH = F − x` for N-E / E / GM intentional?
3. Are Front and Back the existing Lower / Upper Height inputs, or different measurements? (Those inputs read 7 / 9 ft on 11 of 14 sheets regardless of type.)
4. Are the deductions 4, 6, 8 and 2 in feet, metres or another unit, and what do they represent (e.g. a standard leg length, a clearance, a parapet height)?
5. Which structure components and BOQ lines depend on each dimension (F, B, SH, tilt)?
6. Does the configuration support all five types, including Ground Mounted, without conflating the old "Flush Mount (Default)", "Single Tilt" and "Elevated" values? (The UI does; the engineering rules per type are still missing.)
7. Shed types: does "F = 0, B = 0" mean "no legs" (heights not used) or a literal 0 in a later formula, given that Foundit lists legs "On Shed"?
8. Prestructure: currency, GM unit, capacity basis, eligibility, and whether it replaces or adds to the D7 / D8 structure lines.
9. "Structure Table = Filled" for N-E / E: does it mean the D7 sub-table is required there?
10. Which feet-to-metre factor applies (0.3048 exact, or the workbooks' 0.305 / ÷3.28)?
11. Do the workbook labels map to the app's types as "Raised" = Elevated (E), "Non-raised" = Non-Elevated (N-E), "Shed" = Shed Flush or Shed Tilted? Which shed type are the Foundit sheets?
12. Is Prestructure the over-shed aluminium structure (line 35, D8) expressed per Wp? The workbooks' ₹1,500/kW over-shed rate equals the S-F rate of ₹1.5/W.

(Earlier numbering: 3 → terminology now resolved, SH = Shed Height; 7 → structure options resolved for the UI.)

Prerequisites for activating D1: answers 1–12 and options D1a–D1f chosen; engineering owner and business owner named; the measurement model above approved; decided together with D7 (structure components), D6 (purlin) and D9 (capacity basis for Prestructure); activation tests per the template above; a reviewed golden-snapshot diff.

---

## D2. U-clamps / Z-clamps — `proposed`

| Field | Record |
|---|---|
| Current behaviour | Line 25 U-clamps = ⌈panels × 1.5⌉ (0 with no panels); line 26 Z-clamps = ⌈panels × 2⌉. |
| Workbook evidence | **Typed by hand on all 14 sheets; no formula anywhere.** U: 9 / 18 / 78 / 90 / 84 / 33 / 60 / 12 / 3; Z: 12 / 18 / 72 / 30 / 6. Ananda 10.8 kW (18 panels): workbook 78 U / 18 Z, calculator 27 / 36. |
| Proposed behaviour | A layout-derived rule only if mounting geometry (clamps per panel edge, per rail, end vs mid) is validated by engineering. Otherwise U and Z become project-level quantities, defaulted from the template (`uClamps` / `zClamps` already exist there). No universal multiplier is inferred from the workbooks. |
| Units / inputs | Nos.; panel count, rows, structure type (if a rule); else typed quantity. |
| Defaults / zero / unknown | Blank = "needs input" (shown on the BOQ), explicit 0 = none. |
| BOQ lines | 25, 26 (quantity and cost). |
| Downstream | Material total, quote. |
| Example (current) | 18 panels → U 27, Z 36. |
| Recommended option (not approved) | U and Z **typed per project**. The template default is blank, so an empty line reads "needs input". No panel-count multiplier: today's ⌈× 1.5⌉ / × 2 matches U on 1 of 14 sheets and Z on 1 of 14. A layout rule replaces typing only if the structural engineer validates one from the module manufacturer's manual. |
| Signs | Structural engineer (whether a rule exists), pricing / product owner (who enters, defaults), QA / dev lead, product manager. |
| Unresolved assumptions | Clamps per module edge and rail; whether Ananda's 78 / 18 on four sheets (7 to 75 panels) is a copied value. |
| Worked examples (workbook / calculator today) | Aaryan 1 kW, 2 panels: U 3 / 3 ✓, Z 6 / 4. Aaryan Copy, 6 panels: U 12 / 9, Z 12 / 12 ✓. Ashwini 3 kW, 5 panels: 9 / 8, 12 / 10. Ananda 10.8, 18 panels: 78 / 27, 18 / 36. Fredrick, 9 panels: 60 / 14, 30 / 18. |
| Acceptance tests (on activation) | Ananda 10.8 typed 78 / 18 → lines 25 / 26 = 78 / 18 and cost = qty × Price DB rate. Blank → "needs input", not 0. Explicit 0 → 0. Manual override still wins. All 14 fixtures reproduce the workbook when their typed values are loaded. `legacy-v1` unchanged. |
| Approval | Owner: — · Date: — · Version: — |

Open questions: is there a per-panel / per-row / per-structure rule? If not, who enters it (sales or engineering), and should the template default be blank?

Prerequisites: rule or "typed" decision; default per structure type.

---

## D3. Walkway, ladder and cross bracing — `proposed`

| Field | Record |
|---|---|
| Current behaviour | Line 34 Walkway = 5 m; line 33 "Ladder & Cross Bracing" (one line, Price DB key `bracing`, GI 80 microns) = 18 m. Both 0 when capacity is 0. |
| Workbook evidence | All typed. Walkway: 3.6, 4.5, 9.6, 10, 21, 29, 0 m. Ladder / bracing: 0, 6, 12, 24 m; absent on Aaryan, where a separate ladder "2" appears beside walkway 23. |
| Physical items (to confirm) | The BOQ already **combines** ladder and cross bracing in line 33. Whether they are one priced item or two (and Aaryan's ladder unit) must be confirmed before any rule; they are not merged further here. |
| Proposed behaviour | Project-level or structure-type quantities per item, defaulted from the template (`walkwayM`, `ladderBracingM`). |
| Units / inputs | Metres for walkway and bracing; ladder unit unconfirmed (Nos. or m). |
| Defaults / zero / unknown | Blank = template default; explicit 0 = none; no default = needs input. |
| BOQ lines | 33, 34. |
| Downstream | Material total, quote. |
| Example (current) | Any capacity > 0 → walkway 5 m, ladder & bracing 18 m. |
| Recommended option (not approved) | Walkway and ladder & bracing **typed in metres per project**, defaulted from the template (`walkwayM`, `ladderBracingM`, blank by default). Ladder and bracing stay one line until the structural engineer says to split them. The fixed 5 m / 18 m match no sheet. |
| Signs | Structural engineer (items, split, any rule), pricing / product owner (defaults, who enters), QA / dev lead, product manager. |
| Unresolved assumptions | Ladder unit (Nos. or m); whether ladder and bracing are one priced item; any per-row or per-type rule. |
| Worked examples (workbook / calculator today) | Walkway: Fredrick 29 / 5, Aaryan Solar BOQ 25 / 5, Ananda 10.8 0 / 5, Ashwini 3 kW 3.6 / 5. Ladder & bracing: Fredrick 24 / 18, Ananda 10.8 12 / 18, Celebration 0 / 18, Aaryan none / 18 (with a separate ladder "2"). |
| Acceptance tests (on activation) | Fredrick typed 29 / 24 → lines 34 / 33 = 29 / 24. Blank with no template default → "needs input". Explicit 0 → 0. Capacity 0 → 0 (as today). Override wins. 14 fixtures reproduce the workbook. |
| Approval | Owner: — · Date: — · Version: — |

Open questions: should ladder be split from cross bracing? Is there any rule (per kW, row, structure type), or always typed? Default per structure type?

---

## D4. Lightning arrester (LA) quantity — `proposed`

| Field | Record |
|---|---|
| Current behaviour | Line 12 = 1, or 0 if LA type is NA. LA earthing cable (line 15) = 0 for NA, else LA earthing length + spare. Earthing pits (line 16) follow `earthingRules.ts` (2 × inverters + 1; ESE +2, NA −1). LA count feeds neither. |
| Workbook evidence | 1 LA on 10 sheets. **3** on Ananda 10.8 and 4.2 (1 inverter each), **2** on Ananda 34.2 (2 inverters), **3** on Ananda 40.2 (3 inverters). Not explained by kW (4.2 kW and 40.2 kW both have 3), nor by inverter count. Every LA row specifies ESE. |
| Proposed behaviour | Design-specified quantity (entered from the protection design). NA = 0 explicitly. A selected type with no verified quantity = "needs review". LA earthing cable stays its own calculated or entered length. Pits stay on their own approved rule. **No new link** between LA count, LA cable or pits without engineering approval. |
| Units / inputs | Nos.; LA type; design quantity. |
| Defaults / zero / unknown | Template `laQty` (default 1) as a suggestion; NA forces 0. |
| BOQ lines | 12; possibly 15 and 16 only if engineering links them. |
| Downstream | LA cost (ESE priced from Price DB), material total. |
| Example (current) | ESE → 1; NA → 0. |
| Recommended option (not approved) | LA count **entered from the protection design**, which follows an IS/IEC 62305 risk assessment (S5), by the electrical engineer. Template `laQty` 1 is only a suggestion and stays Provisional. NA forces 0. No link to pits (line 16) or LA cable (line 15). |
| Signs | Electrical engineer, QA / dev lead, product manager. |
| Unresolved assumptions | What drove 2–3 LAs on Ananda (blocks, footprint, height); whether ESE devices fall under IS/IEC 62305. |
| Worked examples (workbook / calculator today) | 1 / 1 on 10 sheets. Ananda 10.8: 3 / 1 (1 inverter). Ananda 4.2: 3 / 1 (1 inverter). Ananda 34.2: 2 / 1 (2 inverters). Ananda 40.2: 3 / 1 (3 inverters). The cost difference is (entered − 1) × the ESE Price DB rate. |
| Acceptance tests (on activation) | Ananda 10.8 entered 3 → line 12 = 3. NA → 0 whatever is entered. Lines 15 and 16 identical for LA 1 and LA 3. Blank with no design → "needs review", not 0. The 4 Ananda fixtures reproduce the workbook. |
| Approval | Owner: — · Date: — · Version: — |

Open questions: what drove 2–3 LAs on Ananda (building footprint, blocks, roof area)? Should the LA count change the LA cable length or pit count?

---

## D5. Data logger — `proposed`

| Field | Record |
|---|---|
| Current behaviour | Line 3 = 0 always. |
| Workbook evidence | Typed: **1** on 8 sheets (Aaryan ×3, Ananda ×4, Fredrick), including Ananda 34.2 (2 inverters) and 40.2 (3 inverters), so one shared logger there. **0** on 3 (Ashwini ×2, Celebration non-raised). **No logger row** on 3 (Celebration hybrid, Foundit ×2). Make is "As per inverter company". |
| Proposed behaviour | A compatibility rule per inverter model and its manufacturer's monitoring setup: integrated monitoring (0); one logger shared by several supported inverters; one per inverter; or manual when no rule exists. Neither "1 per system" nor "1 per inverter" is applied universally. |
| Units / inputs | Nos.; inverter brand / model, inverter count; monitoring data per model (does not exist in `inverter_prices` today). |
| Defaults / zero / unknown | No compatibility data = manual entry, shown as needing input (not silently 0). |
| BOQ lines | 3. |
| Downstream | Material total (logger price not in Price DB today). |
| Example (illustrative) | 3 inverters of a brand with a shared logger → 1; integrated Wi-Fi → 0. |
| Recommended option (not approved) | Logger count **entered per project**, blank = "needs input". Later, a monitoring attribute per inverter model suggests the count. For PM Surya Ghar systems, the inverter must have built-in communication (S8), so suggest 0 separate loggers; the engineer confirms. Neither "1 per system" nor "1 per inverter" is applied. |
| Signs | Electrical engineer (rule per model), pricing / product owner (logger price source), QA / dev lead, product manager. |
| Unresolved assumptions | Logger price (not in the Price DB); monitoring data per model; rule for non-PMSG systems. |
| Worked examples (workbook / calculator today) | 1 / 0 on 8 sheets, including Ananda 34.2 (2 inverters) and 40.2 (3 inverters): one shared logger. 0 / 0 on Ashwini ×2 and Celebration non-raised. No row on Celebration hybrid or Foundit ×2. Today's rule fits 3 of the 11 sheets that have a row. |
| Acceptance tests (on activation) | Ananda 40.2 entered 1 with 3 inverters → line 3 = 1. Blank → "needs input", not 0. No logger rate → line blocked "rate not set" (P6). PMSG system → suggestion 0, still editable. Override wins. |
| Approval | Owner: — · Date: — · Version: — |

Prerequisites: monitoring data per inverter model; a logger price source.

---

## D6. Purlin — `proposed`

| Field | Record |
|---|---|
| Current behaviour | No purlin BOQ line. (The workbook parameter purlin B29 `=ROUNDUP(B22*1.2*3,0)` is referenced by no other cell.) |
| Workbook evidence | BOQ purlin 40×40 = `panels × 1.2 × 3 + k` (= panels × 3.6 m + k). k = **3.6** (Ashwini, Foundit, Fredrick), **4.5** (Ananda 10.8 / 4.2), **12** (Ananda 34.2 / 40.2), **0** (Aaryan Solar BOQ, 1kW). Other forms: `=3.6*4` (Aaryan Copy); `=round((7*1.2*3+3.6)/6,0)*6` (Celebration ×2, fixed 7 panels, rounded to 6 m lengths). |
| Proposed behaviour | A structure-layout formula, or an explicit per-template formula, once the meaning of 1.2, 3 and k is explained. No universal k. |
| Units / inputs | Metres; panel count; k per structure type (meaning unknown). |
| Defaults / zero / unknown | Template `purlinExtraM` exists (blank). No line until approved. |
| BOQ lines | New purlin line (metres and cost); possibly rounding to 6 m stock lengths. |
| Downstream | Structure cost, material total. |
| Example (workbook, Ashwini 3 kW) | 5 panels × 3.6 + 3.6 = 21.6 m. |
| Recommended option (not approved) | No purlin line until 1.2, 3 and k are explained. Then `panels × 3.6 + k` with k a per-template value; if not explained, purlin metres typed per project. |
| Signs | Structural engineer, pricing / product owner (40×40 rate, stock length), QA / dev lead, product manager. |
| Unresolved assumptions | Meaning of 1.2 (m per panel?), 3 (purlins per row?) and k; rounding to 6 m; why Celebration uses a fixed 7 panels. |
| Worked examples (workbook) | With the sheet's own k the formula reproduces **11 of 14**: k 0 → Aaryan 1 kW 2 × 3.6 = 7.2, Aaryan Solar BOQ 32.4; k 3.6 → Ashwini 21.6 / 32.4, Foundit 21.6 / 39.6, Fredrick 36; k 4.5 → Ananda 10.8 69.3, 4.2 29.7; k 12 → Ananda 34.2 217.2, 40.2 282. Not reproduced: Aaryan Copy `3.6 × 4` = 14.4 (6 panels); Celebration ×2 `round((7 × 3.6 + 3.6) / 6) × 6` = 30. |
| Acceptance tests (on activation) | Ashwini 5 panels, k 3.6 → 21.6 m. Ananda 34.2, 57 panels, k 12 → 217.2 m. k not set → "needs input", no quantity (P5). 0 panels → no line. If rounding is approved: 21.6 → 24 m. 11 fixtures match; the other 3 have a reviewed, documented difference. |
| Approval | Owner: — · Date: — · Version: — |

Open questions: what are 1.2 (m per panel?) and 3 (purlins per row?)? What does k represent (end allowance, overlap, extra rows), and its value per structure type? Is rounding to 6 m lengths part of the rule?

---

## D7. Structure sub-table (supports, rafters, legs, base plates, anchor bolts) — `proposed`

| Field | Record |
|---|---|
| Current behaviour | No GI-structure or base-plate line. Legs are typed (Structure Legs). Base plates = legs × 2 and anchor bolts = base plates × 4 (**D1 fix, approved, preserved**). |
| Workbook evidence | Hand-filled side tables. Support length per leg: 0.5 / 0.7 / 0.75 / 1.0 / 1.25 / 1.5 m. Rafter length `2.4 × n − 0.7 + 0.5` with n typed (2 / 3 / 6). Rafter and leg counts typed. GI 80×40 = `⌈(supports + rafters + legs, m) / 6⌉ × 6` on most sheets, typed on 5. Base plates: legs × 2 on most sheets but **supports × 1.5** on Ananda 34.2 / 40.2 (anchor bolts 176 vs 180) and `Q46 × 2` on Fredrick. Anchor bolts = base plates × 4 on all 14. |
| Proposed behaviour | A structure-specific component BOM (per template) with legs, supports, rafters, base plates and anchor bolts as **separate** quantities. Automatic leg count only with approved layout and geometry inputs, not panel count alone. |
| Units / inputs | Nos. and metres; rows, panels per row, structure type, heights (D1). |
| Defaults / zero / unknown | Typed legs stay the source until a rule is approved; blank legs = 0 (today). |
| BOQ lines | New GI-structure and base-plate lines; anchor bolts (22) keep D1 unless separately re-approved. |
| Downstream | Structure cost, material total, ₹/W. |
| Example (current, Ashwini 3 kW) | 4 legs → 8 base plates → 32 anchor bolts (matches workbook). |
| Recommended option (not approved) | **Keep typed legs and the approved anchor-bolt rule as they are.** Base-plate and GI-structure lines typed per project, defaulted from the template (D1f β / γ). Automatic members (D1f α) only with an approved structural method and layout inputs, never from panel count or height alone. |
| Signs | Structural engineer, pricing / product owner (GI rate, stock length), QA / dev lead, product manager. Changing anchor bolts needs its own re-approval. |
| Unresolved assumptions | Support vs leg; base plates per leg (× 2) or per support (× 1.5); meaning of 2.4 / 0.7 / 0.5 in the rafter length. |
| Worked examples (workbook / calculator today) | Anchor bolts match on 12 of 14 sheets: Ashwini 3 kW 4 legs → 8 plates → 32 / 32; Ananda 10.8 10 legs → 80 / 80. Differences: Ananda 34.2 and 40.2, 180 / 176 (workbook base plates = supports × 1.5). |
| Acceptance tests (on activation) | Legs 4 → anchor bolts 32 for every structure type (already pinned in `structureTypes.test.ts`). A new base-plate or GI line leaves line 22 unchanged unless re-approved. Blank legs → 0 (approved behaviour). GI rounding: 21 m → 24 m, only if approved. |
| Approval | Owner: — · Date: — · Version: — |

Shares its geometry with D1: see D1's measurement model and structure-to-BOQ dependency table; neither can be approved without the other.

Open questions: physical meaning of "support" vs "leg"; base-plate multiplier ×2 or ×1.5 (which component carries the plate?); meaning of 2.4 / 0.7 / 0.5 in the rafter length. Decide together with D1.

---

## D8. Over-shed aluminium structure — `proposed`

| Field | Record |
|---|---|
| Current behaviour | Line 35 quantity = required capacity (kW), always, priced at Price DB `alStructure` ₹/kW. |
| Workbook evidence | Typed kW. **0** on Aaryan, Ananda and Ashwini. **9.6** Celebration non-raised (note "9.6kW is on Shed"), `=26*0.6` (15.6) Celebration hybrid, **3 / 6** Foundit, **4.2** Fredrick (a raised structure, so "raised = 0" does not hold). Rates ₹/kW: 2900, 1500, 3000, 0, 2500. |
| Proposed behaviour | An applicability flag on the structure template, and a quantity equal to the kW actually mounted on the shed, entered per project, not the whole system capacity. |
| Units / inputs | kW on shed; structure type; rate. |
| Defaults / zero / unknown | Not applicable = 0; applicable with no kW = needs input. |
| BOQ lines | 35. |
| Downstream | Material total, ₹/W, quote. |
| Example (workbook, Celebration non-raised) | 9.6 kW on shed × ₹1,500 = ₹14,400 (calculator today: 25 kW × Price DB rate). |
| Recommended option (not approved) | An **applicability flag per structure type**, plus the kW on the shed typed per project. Not applicable → 0. Applicable and blank → "needs input". Decide together with D1e (R1): if Prestructure replaces this line on shed types, the line is not charged twice. |
| Signs | Structural engineer (applicable types), pricing / product owner (rate, overlap with Prestructure), QA / dev lead, product manager. |
| Unresolved assumptions | Whether the kW on the shed is AC or DC; per-company rate; question 12. |
| Worked examples (workbook / calculator today) | Matches only Foundit 3 / 3 and 6 / 6. Celebration non-raised 9.6 / 25: at ₹1,500/kW that is ₹14,400 vs ₹37,500. Hybrid 15.6 / 25. Fredrick 4.2 / 5.4. Ananda 10.8 0 / 10.5. |
| Acceptance tests (on activation) | N-E with no shed → 0. Celebration hybrid typed 15.6 → 15.6 × rate. Applicable, blank → "needs input". Rate missing → blocked (P6). With R1 approved, an S-F project carries Prestructure or line 35, never both. 14 fixtures reproduce the workbook. |
| Approval | Owner: — · Date: — · Version: — |

Open questions: which structure types carry the line? Is the kW on shed AC or DC? Per-company rate?

---

## D9. Capacity basis and template matching — `proposed`

| Field | Record |
|---|---|
| Current behaviour | **Required capacity (`B1`)** drives everything: installation and liaisoning (₹/kW × B1), ₹/kW rate, line 35, ACDB lookup (`capMin ≤ kW ≤ capMax`), and template matching (`(min, max]`, display only). |
| Workbook evidence | Three capacities exist: required B1, installed DC `C1 = Wp × panels ÷ 1000`, and inverter size (B8, e.g. "12 kW"). The kW used for installation, liaisoning and ₹/W is typed on 8 sheets and `=C1` on 6. Example: Celebration non-raised B1 25 vs C1 25.2 → installation ₹100,000 vs ₹100,800. Capacity ranges do not appear in any workbook. |
| Proposed behaviour (by use) | ₹/Wp: installed DC Wp, if the pricing owner confirms. Per-kW fees: an explicit basis, default required/contracted kW where the contract uses it. Template selection: installed DC kWp. ACDB: inverter AC rating with phase and catalogue constraints, not system capacity. |
| Range convention | Kept: `(min_kw, max_kw]` (exclusive minimum, inclusive maximum), contiguous from 0, last open-ended, exactly one range per capacity (validated and tested). Changing it is a separate decision. |
| Defaults / zero / unknown | No panels or Wp = no installed DC; fall back to required kW and show which basis was used. |
| BOQ lines | 6 (ACDB), 35; commercial installation, liaisoning, ₹/W; template choice. |
| Example (boundary) | Required 6 kW, 600 Wp × 11 panels = 6.6 kWp: on required kW → range 1–6 kW; on DC kWp → 7–20 kW. |
| Recommended option (not approved) | The proposed behaviour above, one basis per use, with the basis shown on screen. ACDB quantity one per inverter is the strongest lead: it fits 13 of 14 sheets. |
| Signs | Pricing / product owner (₹/W, per-kW fees, template basis), electrical engineer (ACDB), QA / dev lead, product manager. |
| Unresolved assumptions | Which kW the customer quote shows; ACDB per inverter or on total AC kW; why Aaryan 5 kW has 2 ACDBs for 1 inverter. |
| Worked examples (fixtures, required B1 vs installed DC) | Aaryan 1 kW 1 vs 1.18; Aaryan 5 kW 5 vs 5.31; Ananda 10.8 10.5 vs 10.8; Ananda 40.2 40 vs 40.5; Celebration 25 vs 25.2 (installation ₹100,000 vs ₹100,800); Fredrick 5.4 = 5.4. ACDB workbook / calculator: 1 / 1 on 11 sheets; Ananda 34.2 2 / 1 (2 inverters), Ananda 40.2 3 / 1 (3 inverters), Aaryan 5 kW 2 / 1 (1 inverter). |
| Acceptance tests (on activation) | Celebration non-raised: each fee on its approved basis (25 or 25.2). Range boundaries 6, 6.0001, 20, 50, 100. ACDB with 3 inverters → 3 if per-inverter is approved. Template matched on DC kWp, with the basis shown. If no panels / Wp → falls back to required kW, labelled. Proposal totals and golden commercial blocks reviewed. |
| Approval | Owner: — · Date: — · Version: — |

Open questions: which kW appears on the customer quote? Is ₹/W on DC Wp? For multiple inverters, does ACDB use total AC kW or one per inverter (see evidence §12 "ACDB quantity")?

---

## Sources and engineering basis

Every rule in this register sits on one or more of three levels of authority. They are not interchangeable.

1. **Regulatory and engineering basis.** Indian Standards, CEA regulations, MNRE scheme rules, the module / inverter / structure manufacturers' installation requirements, and site-specific design by a responsible engineer. This decides what is *safe and compliant*.
2. **Product workflow reference (OpenSolar).** How a mature design tool turns a design into a BOM: quantities derived from the layout, compatibility filtering, auto-apply with manual override, review before ordering. This decides *how the software should behave*, not what the numbers are.
3. **Business policy (EnergyBae).** Commercial rules, who enters which quantity, pricing bases, approved defaults. This decides *what EnergyBae quotes*.

> **Warning.** OpenSolar's examples (structure height 6–7 ft, tilt 10–15°, 1.8 m maximum leg span, 20–30 % cantilever, parapet 4 ft, ladder tilt 75°) are defaults of OpenSolar's own tool. They are not Indian statutory requirements and not EnergyBae's structure types, and none of them may become an EnergyBae default without independent engineering approval. Likewise, the standards below govern *design*; none of them, as far as verified, fixes a clamp multiplier, purlin allowance, leg count, LA count or logger count.

### Sources consulted (accessed 2026-10-12)

For BIS standards only status and scope were verified: their full texts are not openly readable, so **no clause-level requirement is quoted or relied on here**.

| # | Title | Publisher | URL | Status verified | Relevance | Limitations |
|---|---|---|---|---|---|---|
| S1 | IS 875 (Part 3):2015 Design Loads (Other than Earthquake) — Part 3 Wind Loads (Third Revision) | BIS | standards.bis.gov.in, IS 875 (Part 3):2015 standard-details page | Amendment 1 (2016), Amendment 2 (2020); reaffirmed Apr 2025 | Wind load on module structures; drives leg spacing, member sizes, anchoring (D1, D2, D6, D7) | Text not read; gives loads, not BOM counts |
| S2 | IS 800:2007 General Construction in Steel — Code of Practice (Third Revision) | BIS | standards.bis.gov.in, IS 800:2007 standard-details page | Amendment 1 (2012), Amendment 2 (2024) | Design of GI / MS structure members (D6, D7) | Text not read |
| S3 | IS 3043:2018 Code of Practice for Earthing (Second Revision) | BIS | standards.bis.gov.in, IS 3043:2018 standard-details page | Current; no amendments listed | Earthing design, pits and conductors (current pit rule, D4) | Text not read; the pit rule in `earthingRules.ts` is business policy, not derived from it |
| S4 | IS 2309:1989 Protection of Buildings and Allied Structures against Lightning | BIS | https://law.resource.org/pub/in/bis/S05/is.2309.1989.pdf (withdrawal noted at https://archive.org/details/gov.in.is.2309.1989) | **Withdrawn**, superseded by IS/IEC 62305 | Historical basis of LA practice (D4) | Not to be cited as current |
| S5 | IS/IEC 62305 Parts 1–4:2010 Protection against Lightning (Part 2 risk management; Part 3 physical damage and life hazard; Part 4 electrical and electronic systems) | BIS (adoption of IEC 62305) | standards.bis.gov.in, IS/IEC 62305 part pages | Current Indian adoption | LA need and design follow a risk assessment and protection design, not a per-kW count (D4) | Text not read; whether ESE devices fall inside IEC 62305 is an engineering question |
| S6 | CEA (Measures relating to Safety and Electric Supply) Regulations, 2023 | Central Electricity Authority | https://cea.nic.in/notification/central-electricity-authority-measures-relating-to-safety-and-electric-supply-regulations-2023/?lang=en | In force; draft First Amendment 2025 published for comment | Earthing and safety obligations of the installation (D4, earthing) | Only definitions extract read |
| S7 | CEA (Technical Standards for Connectivity of the Distributed Generation Resources) Regulations, 2013, amended 2019 | Central Electricity Authority | https://cea.nic.in/ | Cited in CEA's definitions compendium; 2019 amendment | Grid-connection requirements for rooftop systems (inverter / AC side, D9) | Text not read |
| S8 | MNRE OM F. No. 318/87/2024-GCRT-Part (1), 17 Aug 2026 — inverter-level generation data and data residency | MNRE (Rooftop Solar Division) | https://cdnbbsr.s3waas.gov.in/s3716e1b8c6cd17b771da77391355749f3/uploads/2026/08/20260821661139778.pdf | Read in full | Under PM Surya Ghar: inverter must have built-in SIM / dongle communication (CFA Guidelines 07.06.2024, Annexure-3 cl. 2.7(xiv)); all inverter communication devices / dongles / dataloggers must use M2M SIM (OM 21.07.2025); RMS guidelines 24.12.2025; data stored in India; datalogger warranty included in the inverter warranty; daily generation per inverter serial to the National Portal (D5) | Applies **only** to PMSG: MBY installations; states no separate logger count per system |
| S9 | Draft guidelines on RMS for inverter communication devices / dongles / data-logger with Centralised Platform under PMSG: MBY (comments 21–31 Jul 2025) | MNRE | https://mnre.gov.in/en/notice/draft-guideline-on-rms-for-inverter-communication-devices-dongles-data-logger-with-centralised-platform-under-pm-surya-ghar-muft-bijli-yojana/ | Draft; final guidelines dated 24.12.2025 (per S8) | Background for D5 | Final 24.12.2025 text not read |
| S10 | Auto BOM | OpenSolar | https://www.opensolar.com/auto-bom/ | Page dated 2026-10-01 | BOM built from the design; mounting hardware (rails, anchors, clamps) calculated for supported mounting systems; quantities editable before ordering (D2, D6, D7 workflow) | Product page; no formulas |
| S11 | Elevated Structures — How to Design Elevated Mounts on Indian RCC Rooftops | OpenSolar Help Center | https://support.opensolar.com/hc/en-us/articles/16653891972239 | Read | Frame (legs, purlins, rafters) generated from layout + height + tilt; rear leg derived from tilt; legs placed by span / cantilever rules, denser in coastal wind zones (D1, D6, D7) | OpenSolar defaults; Phase 1 fixed column sizing; not EnergyBae's types |
| S12 | How to use BOS: Electrical Components | OpenSolar Help Center | https://support.opensolar.com/hc/en-us/articles/12382404676879 | Read | Isolators and cables auto-assigned from a hardware database, with compatibility indicators and manual override (D5, D9 workflow) | The integration described is UK-only |
| S13 | Rooftop Obstructions — Realistic Objects and Access Structures | OpenSolar Help Center | https://support.opensolar.com/hc/en-us/articles/17343133204367 | Read | Walkway, ladder and handrail are separate, drawn, system-bound elements; walkway can be raised on legs (D3) | Layout tool; no BOM quantities stated |
| S14 | Project Design (Help Center category) | OpenSolar | https://support.opensolar.com/hc/en-us/categories/17377932459663-Project-Design | Index read | Lists the design articles; the structure-relevant ones are S11, S13, S15, S16 | Other articles (batteries, shading, incentives) not relevant here |
| S15 | How to design ground mount or fixed tilt systems | OpenSolar Help Center | https://support.opensolar.com/hc/en-us/articles/12354292806159 | Read | Ground / fixed-tilt arrays are defined by layout, gaps, slope, azimuth and **one tilt angle ("Racks")**; no front / back height inputs (D1 for GM) | No structure members or heights; not India-specific |
| S16 | Elevated Structures — How to Design RCC Rooftops | OpenSolar Help Center | https://support.opensolar.com/hc/en-us/articles/16653884698127 | Read | RCC roof drawn with an automatic parapet (default 4 ft high, 9 in wide) as the surface elevated structures stand on (D1 datum) | Visual default, not a measurement rule |

### Basis of each proposal

| # | From workbook evidence | Informed by official sources | Inspired by OpenSolar | Unresolved assumption |
|---|---|---|---|---|
| D1 F / B / SH / Prestructure | Lower / Upper heights (B10 / B11, ft; 7 / 9 on 11 sheets); leg heights in ft incl. "On Shed" 4 ft | Structure design per S1 / S2 (loads, members), not a deduction table | One height + tilt with rear leg derived (S11); one tilt angle for ground mounts (S15); surface datum incl. parapet (S16) | Units, meaning of the deductions, Shed Height formula, Prestructure unit for GM |
| D2 U / Z clamps | Typed on all 14 sheets; no formula | Clamp positions and counts come from the **module manufacturer's installation manual** and wind design (S1); no BIS multiplier found | Clamps calculated from the layout for supported mounting systems (S10) | Any multiplier |
| D3 Walkway / ladder / bracing | Typed, often 0 | None found | Separate drawn elements; raised walkway (S13) | Whether ladder and bracing split; default lengths |
| D4 LA quantity | 1 on 10 sheets, 2–3 on the 4 Ananda sheets | IS 2309 withdrawn (S4); LA need from IS/IEC 62305 risk assessment (S5); earthing per S3 / S6 | — | Count rule; ESE vs IEC 62305 scope; link to pits |
| D5 Data logger | 1 on 8 sheets (shared across 2–3 inverters), 0 on 3, absent on 3 | PMSG: built-in SIM / dongle communication, M2M SIM, logger warranty within inverter warranty (S8) | Compatibility-filtered selection with override (S12) | Logger count per inverter model outside PMSG; logger price source |
| D6 Purlin | panels × 3.6 + k, k per sheet | Member design per S1 / S2 | Purlins generated from the layout (S11) | Meaning of 1.2, 3 and k |
| D7 Structure sub-table | Hand-filled sub-tables; base plates ×2 vs ×1.5 | Member and anchorage design per S1 / S2 | Legs from span / cantilever rules (S11), **not transferable** | Leg / support / rafter rules per type |
| D8 Over-shed Al | Typed kW on shed, 0 elsewhere | None | — | Applicable types; AC or DC kW |
| D9 Capacity basis | Typed kW (8 sheets) vs `=C1` (6) | Connectivity per S7 (inverter / AC side) | — | kW basis per use; ACDB per inverter or total |

---

## Approval log

| Date | Decision | Status change | Owner | Decision version | Notes |
|---|---|---|---|---|---|
| 2026-10-05 | D1–D3 defects, cable spares | approved → implemented (`41b4196`) | business | — | Outside this register. |
| 2026-10-12 | D1–D9 | → `proposed` | — | — | Proposals recorded from the Phase 5 brief. No approvals. |
| 2026-10-12 | D1 terminology | SH defined as Shed Height (F = Front, B = Back) | product owner | — | Terminology only; formulas stay `proposed`, SH = F duplication still flagged. |
| 2026-10-12 | D1 / D7 engineering review | stays `proposed` | — | — | Evidence, measurement model, dependencies, Prestructure review and 10 engineering questions recorded. SH = F still flagged. Sources S2 updated, S15–S16 added. No formula activated. |
| 2026-10-12 | Governance and pending-default policy | — | — | — | Sign-off roles and P1–P7 added; D1a–D1f options and real-fixture examples added; external brief reviewed (adopted / not adopted listed under D1). App: Provisional marking (P1) and "Requires engineering input" (P2) implemented. All decisions stay `proposed`. |
| 2026-10-12 | D1–D9 approval packages | stays `proposed` | — | — | Recommended option, sign-offs, unresolved assumptions, fixture examples and acceptance tests per decision; P4 qualified (approved anchor-bolt rule preserved, test added); LA count corrected to 1 on 10 sheets. No formula activated. |
| 2026-10-12 | Structure type options (UI) | → `approved` → `implemented` | product owner (task brief) | ui-1 | Five options and form behaviour only. D1 formulas stay `proposed`. |
