# Phase 5A + 5B: BOQ evidence report

Date: 2026-10-05 · Branch `saas-redesign` (HEAD `273e49d`)

**Scope.** This is a read-only audit. `calcBOQ()`, the BOQ/Proposal behaviour and the database are unchanged, and no migrations were created. `calcBOQ` was only *run* from a scratch script outside the repo, against the workbook inputs.

**Labels used in every recommendation.**
- **[WB]**: fact read from a workbook cell.
- **[CODE]**: fact read from current code.
- **[INF]**: inference I drew. It is not a fact and must not become a rule without confirmation.
- **[BIZ]**: business decision required.

**Sources.**
- Workbooks: `EnergyBae_ClaudeCode_6_Files/source_boqs/*.xlsx` (6 files, 14 BOQ sheets, plus one `Sheet2` reference sheet per file and one `Sheet3` in Aaryan). The previous report said 17 BOQ sheets; that was wrong, it is **14**.
- Code: `src/modules/proposal/calculations.ts` (`calcBOQ`, `computePricingSummary`), `earthingRules.ts`, `defaultCatalogue.ts`.
- Workbook values are the **cached results** stored in each file. The files are Google Sheets exports; cells such as `__xludf.DUMMYFUNCTION("IMPORTRANGE(...)")` show this.

**How the comparison was run.** `calcBOQ` was run with each sheet's own inputs and `DEFAULT_CATALOGUE`. Only **quantities** are compared, because every catalogue BOS price defaults to ₹0 [CODE `defaultCatalogue.ts:19-27`], so calcBOQ prices are not comparable to workbook rates.

---

## 1. Current BOQ engine: legacy-v1 (`calcBOQ`, unchanged)

[CODE] `calculations.ts`.

**Variables.** calcBOQ names its variables after the workbook cells. `n(x)` turns "" into 0.

| Variable | Code |
|---|---|
| B1 | `capacity` |
| B2 | `panelPriceWp` |
| B3 | `panelWp` |
| B4 | phase: 1 or 3 |
| B5 | `buildingFloors` |
| B6 | `inverterFloor` |
| B7 | `numInverters` |
| B9 | `panelRows` |
| B10 / B11 | lower / upper structure height in ft × 0.305 |
| B32 | `numStrings` |
| B15 | `numBatteries` |
| B21 | `computeEarthingPits(numInverters, laType)` |
| B22 | `ceil(B1*1000/B3)` |
| B23 | `B22/B9` |
| B26 | `ceil(B9/2)+1` |
| B27 | `3*B9/2` |
| B28 | `round((18*2.3*B9 + 18*B10 + 18*B11 + B27*0.5)/10)*10` |
| B29 | `ceil(B22*1.2*3)` |
| B30 | `49.82*(B22/B32)` |
| B33 | `B32*4` |
| B16 | `ceil(B23*1.2 + B9*2.3)*B7` |
| B17 | `ceil((B6+1)*3.5)*B7` |
| B18 | `ceil((B5+2)*3.5+5)*B7` |
| B19 | `ceil(B6*3.5+5)*B7` |
| B20 | `ceil((B5+1)*3.5+10)` |
| B46 | `((B3*B22)/B30/B32)*1.5` |
| B37 | 4 if 3-phase, else 2 |
| B35 | `B46<32 ? 1 : 2` |
| S53 | `B26*0.75 + B28 + B29` |
| R53 | `ceil(S53/6)*6` |
| J46 | `R53*2` |
| dc16 | `B16+15` |
| condQ | `ceil((dc16 + (B18+40) + (B19+40))/3)*3` |

**Rules that apply to every line.**
- Every qty is `o(sr, default)` and every unit cost is `o("c"+sr, default)`. Either can be **manually overridden** per proposal (the `BOQOverrides` map).
- Any standard line can be removed with `x<sr>`.
- `sanitizePrice` is applied to qty and cost at the end.
- price = qty × unitCost.

| sr | Item (name source) | Qty formula [CODE] | Unit | Unit price source [CODE] | Inputs | Kind |
|---|---|---|---|---|---|---|
| 1 | Solar Module | `B22` | Nos. | `B2*B3` (₹/Wp × Wp, form inputs) | capacity, panelWp, panelPriceWp | calculated |
| 2 | Solar Inverter | `B7` | Nos. | `inp.inverterUnitCost` (inverter_prices match or manual) | numInverters | input + catalogue |
| 3 | Data Logger | `0` | Nos. | `0` | — | fixed |
| 4 | Battery | `B15` | Nos. | `inp.batteryUnitCost` | numBatteries | input |
| 5 | DCDB | `B7` | Nos. | `getDCDB(cat, strings, B30).price` (catalogue `dcdb` row by I/O count and voltage; fallback 1800) | numInverters, numStrings | calc + catalogue |
| 6 | ACDB | `1` | Nos. | `getACDB(cat, cap, phase).price` (cheapest `acdb` row whose range covers cap; fallback 1200) | capacity, phase | fixed qty + catalogue |
| 7 | MCB at LT panel (`bosNames.mcb`) | `1` | Nos. | `cat.bos.mcb` | — | fixed + catalogue |
| 8 | DC Cable | `B16 + 15` | MTS | `inp.dcCableUnitCost` (wire_prices pick) or `cat.bos.dcCable` | rows, strings, inverters, capacity | calculated |
| 9 | MC4 | `B33` | Pair | `cat.bos.mc4` | strings | calculated |
| 10 | AC Cable (Inv–Meter–DB) | `B17 + 40` | MTS | `inp.acCableUnitCost` or `cat.bos.acCable` | inverterFloor, inverters | calculated |
| 11 | AC Cable (Inv–ACDB) | `5*B7` | MTS | `inp.acCable2UnitCost` | inverters | calculated |
| 12 | Lightning Arrester | `laType=NA ? 0 : 1` | Nos. | ESE: `cat.bos.la`; Conventional / NA: 0 | laType | conditional |
| 13 | Earthing cable 6 mm²: structure | `B18 + 40` | MTS | `cat.bos.earthCable6` | floors, inverters | calculated |
| 14 | Earthing cable 6 mm²: inverter | `B19 + 40` | MTS | `cat.bos.earthCable6` | inverterFloor, inverters | calculated |
| 15 | Earthing cable 25 mm²: LA | `laType=NA ? 0 : B20 + 40` | MTS | `cat.bos.earthCable25` | floors, laType | calculated |
| 16 | Earthing Pit | `B21 = computeEarthingPits(B7, laType)`: base `2n+1`; Conventional +0, ESE +2, NA −1; 0 inverters → 0 | Nos. | `cat.bos.earthPit` | inverters, laType | business rule |
| 17 | Lug Cu ring 6 | `B22*2` | Nos. | `cat.bos.lugCuRing6` | panels | calculated |
| 18 | Lug Cu pin 6 | `B7*2` | Nos. | `cat.bos.lugCuPin6` | inverters | calculated |
| 19 | Lug Al ring 16 | `B21+1` | Nos. | `cat.bos.lugAlRing16` | pits | calculated |
| 20 | Lug Cu ring 4 (long barrel) | `B35*2 + B37*2` | Nos. | `cat.bos.lugCuRing4` | DC current, phase | calculated (**bug, see 1.1**) |
| 21 | Glands | `0` | Nos. | `cat.bos.gland` | — | fixed |
| 22 | Anchor bolt M10 | `J46*4` | Nos. | `cat.bos.anchorBolt` | rows, heights, panels | calculated (**bug, see 1.1**) |
| 23 | Nut bolt M8/M6 | `B7*6` | Nos. | `cat.bos.nutBolt` | inverters | calculated |
| 24 | J-Bolt | `0` | Nos. | `cat.bos.jBolt` | — | fixed |
| 25 | U-Clamp | `B22>0 ? ceil(B22*1.5) : 0` | Nos. | `cat.bos.uClamp` | panels | calculated (not in any workbook) |
| 26 | Z-Clamp | `B22>0 ? ceil(B22*2) : 0` | Nos. | `cat.bos.zClamp` | panels | calculated (not in any workbook) |
| 27 | Conduit | `condQ` | MTS | `cat.bos.conduit` | cable lengths | calculated |
| 28 | Tee Bend | `ceil(condQ/2)` | Nos. | `cat.bos.teeBend` | conduit | calculated |
| 29 | Cable Tag | `B37 + B35*2 + 2` | Nos. | `cat.bos.cableTag` | phase, DC current | calculated (**bug, see 1.1**) |
| 30 | Ferrule | `B32` | Set | `cat.bos.ferrule` | strings | calculated |
| 31 | Electrical Tape | `6` | Nos. | `cat.bos.tape` | — | fixed |
| 32 | Cable Ties | `1` | Pkt | `cat.bos.cableTie` | — | fixed |
| 33 | Ladder & Cross Bracing | `B1>0 ? 18 : 0` | MTS | `cat.bos.bracing` | capacity | fixed |
| 34 | Walkway | `B1>0 ? 5 : 0` | MTS | `cat.bos.walkway` | capacity | fixed |
| 35 | Al Structure (over-shed) | `B1` | kW | `cat.bos.alStructure` | capacity | calculated |
| 36 | Bird Spikes | `0` | MTS | `cat.bos.birdSpike` | — | fixed |
| 37 | Parnali | `0` | Nos. | `cat.bos.parnali` | — | fixed |
| 38 | Sprinkler | `0` | kW | `cat.bos.sprinkler` | — | fixed |
| 39+ | Custom BOS items (`cat.customBOS`) | `0` (override to set) | as defined | `customBOS[i].price` | — | manual |

**Commercial (`computePricingSummary`) [CODE].**

| Step | Formula |
|---|---|
| install | `charges.installation (5500) × B1` |
| transport | `matTotal × charges.transport (3)%` |
| liaison | `charges.liaisoning (3500) × B1` |
| subTotal | `mat + install + transport + liaison` |
| insurance | `subTotal×1.2/1000×3×5` |
| profit | `subTotal/(1−p)×p`, p = `charges.profit (15)%` |
| totalExGST | `subTotal + insurance + profit` |
| GST | `totalExGST × gst (8.9)%`; final = total + GST |
| firstQuoteRate | `ceil(rateKW/1000)*1000 + 2000` (display only) |
| subsidy | `charges.subsidy (78000)`, only when `panelType = DCR`; effective = final − subsidy |

### 1.1 Defects in calcBOQ found by this audit

No code was changed for any of these.

| # | Defect | Evidence | Measured effect |
|---|---|---|---|
| L1 | **Anchor bolts** are `J46*4` with `J46 = R53*2` and `R53 = ceil(S53/6)*6`. In the workbook, R53 is the **sum of leg counts** (Ashwini `R53 =sum(R49:R52)` = 4), and the GI length is a different cell (`J44 =roundup(S53/6,0)*6`). calcBOQ uses the rounded GI length as the leg count. | [CODE] lines `S53`/`R53`/`J46`; [WB] Ashwini 3 kW R53, J44, J46 `=R53*2`, J35 `=J46*4` | Ashwini 3 kW: workbook **32**, calcBOQ **1,536**. Every sheet in §2 is off by 10× to 50×. |
| L2 | **4 mm² lugs (sr 20) and cable tags (sr 29)** use `B35 = B46<32 ? 1 : 2`. That is the workbook's *No. of DC MCB* formula (B43 `=IF(B46<B42,1,2)`, B42 = 32). The workbook's B35 is a different input, *DC Cable Size (No. of Cores)* = 2, and that is what J33 and J42 reference. | [CODE] `const B35 = B46 < 32 ? 1 : 2`; [WB] Ashwini B35 = 2 (typed), B43, J33 `=(B35*2)+(B37*2)`, J42 `=(B37+B35*2)+2` | Ashwini 3 kW: lugs 8 vs 6, tags 8 vs 6. |
| L3 | **DC cable length** multiplies by inverters (`*B7`). The workbook multiplies by strings (`*B32`; `*B33`/`*B45` where rows are shifted). Aaryan multiplies by neither. | [CODE] B16; [WB] Ashwini B16 `=ROUNDUP(($B$23*1.2)+($B$9*2.3),0)*B32` | Differs whenever strings ≠ inverters (Ananda 34.2, Celebration, Fredrick). [INF] This is a porting slip, not a deliberate rule. |
| L4 | **Structure** uses parameter cells B26–B29 (legs, bracing, rafter length with a fixed 18 rafters, purlin). **No BOQ line in any workbook references B24–B30** (they are dead calculations). The workbook GI quantity comes from the side sub-table (Ashwini S53). | [CODE] `S53 = B26*0.75 + B28 + B29`; [WB] Ashwini J44 `=roundup(S53/6,0)*6`, where S53 is the side table `=SUM(S46:S51)`, not B28 | calcBOQ has no GI 80×40, purlin or base-plate lines at all. |
| L5 | **DC cable size** (`getDCSize`) stops at 10 mm². The workbook table runs to 70 mm². Only the spec text is affected; the price is not size-based. | [CODE] `getDCSize`; [WB] Sheet2 H14:J23 | Spec text is wrong above 79 A. |
| L6 | **AC cable size** is hard-coded as "4sq.mm" in the spec. The workbook computes it from AC current using the Sheet2 Al tables. | [CODE] sr 10 spec; [WB] B38 `=Sheet2!$F$45` | Ashwini 3 kW 4 (same); Ananda 4.2/10.8 **6**; Celebration **10**. |
| L7 | **Inverter spec** prints `${B1} kW String Inverter` (the system capacity), not the inverter size. | [CODE] sr 2 spec | Text only. |
| L8 | **Al over-shed structure** quantity is always `B1` kW. In the workbooks it is 0 on all raised and non-raised sheets and typed kW on shed sheets. | [CODE] sr 35; [WB] §5 | Every raised/non-raised quote gets an over-shed line priced at `bos.alStructure`. |

[INF] L1–L3 look like porting mistakes from `energybae_boq_v2.html`, because the variable names reuse the workbook cell addresses while the formulas belong to other cells. **[BIZ]** Whether to fix them in legacy-v1 (which changes draft recomputes and new quotes) or only in a new template is your decision (§12).

---

## 2. Six-workbook golden test report

**How to read this section.**
- For every sheet: all inputs (cell, typed or formula, value), then **every BOQ line**: workbook cached quantity (with the J formula) vs calcBOQ quantity run on that sheet's inputs.
- calcBOQ ran with `laType = ESE`, because every workbook LA row specifies "ESE Type" [WB]. §6 gives the Conventional and NA results.
- When several workbook rows map to one calcBOQ item (e.g. 3 inverter rows in Ananda 40.2), their quantities are summed and every row is listed.

**Difference classes.**
- A: formula difference
- B: template default difference
- C: manually entered project value
- D: catalogue difference
- E: commercial-rule difference
- F: current calcBOQ bug
- G: unknown

**Inputs that apply to all sheets** unless the table shows otherwise:
- System type is not a workbook input. [WB] it appears only in line text, e.g. Aaryan "Hybrid 5 kW", Celebration "30 kW Hybrid", Foundit "3 kW Hybrid"; the other sheets have no system-type text.
- Structure type is not a workbook input either. [WB] it appears only in the sheet title ("Raised", "Non-raised", "Shed", "Non-Raised + Shed").
- Inverter brand C8 is only used for the Sheet2 voltage lookup.

**Summary (count of compared lines).**

| Workbook / sheet | MATCH | DIFFERENT or MISSING |
|---|---|---|
| Aaryan / Solar BOQ | 15 | 23 |
| Aaryan / Copy of Solar BOQ | 16 | 22 |
| Aaryan / 1kW Solar | 16 | 22 |
| Ananda / 34.2kW Non-raised | 13 | 27 |
| Ananda / 40.2kW Non-raised | 13 | 27 |
| Ananda / 10.8kW Non-raised | 18 | 22 |
| Ananda / 4.2kW Non-raised | 16 | 24 |
| Ashwini / 3 kW Raised | 19 | 21 |
| Ashwini / 4.8 kW Raised | 19 | 21 |
| Celebration / 25 kW Non-Raised | 19 | 21 |
| Celebration / 25 kW Non-Raised + Shed Hybrid | 17 | 24 |
| Foundit / 6 kW Shed DCR | 17 | 24 |
| Foundit / 6 kW Shed NDCR | 20 | 21 |
| Fredrick / 3.6 kW Raised | 14 | 28 |

**No sheet matches calcBOQ.** No line-level parity is claimed anywhere; every MATCH below is an exact equality from an actual run.

### 2.1 Aaryan 5kW BOQ Solar Template.xlsx / sheet `Solar BOQ`

| Input | Cell | Formula or typed | Value |
|---|---|---|---|
| Required Solar Capacity | B1 | typed | 5.0; C1 `=$B$3*$B$22/1000` = 5.31 (actual DC kW) |
| Panel Price/Wp | B2 | typed | 15.0 |
| Solar Module Size (W) | B3 | typed | 590.0 |
| System Connection Phase | B4 | typed | 1.0 |
| Building No. of Floors | B5 | typed | 1.0 |
| Inverter Installation Floor | B6 | typed | 1.0 |
| No. of Inverter | B7 | typed | 1.0 |
| Inverter Size | B8 | typed | 5 kW (brand C8 = 'Solis') |
| No. of Panel Rows | B9 | typed | 2.0 |
| Structure Height Lower (FT.) | B10 | typed | 7.0 |
| Structure Height Upper (FT.) | B11 | typed | 9.0 |
| 3.5ft GI Shed (sqft) | B12 | typed | 0.0 |
| Battery Size | B14 | typed | 5kWh |
| No. of Batteries | B15 | typed | 1.0 |
| No. of Earthing Pit | B21 | typed | 3.0 |
| No. of Solar Panels | B22 | `=ROUNDUP(($B$1*1000/$B$3),0)` | 9 |
| No. of Strings | B31 | `=IFS(C8="Solis",INDEX(Sheet2!A50:I69,MATCH(B8,Sheet2!A50:A69,0),5),C8="Solax",INDEX(Sheet2!A71:I93,MATCH(B8,Sheet2!A71:A93,0),5))` | 2 |
| No. of rafters | B24 | `=roundup(B23/2,0)` | 3 |
| DC Cable Size (sqmm) | B35 | `=Sheet2!K24` | 1.5 |
| AC Cable Size (sqmm) | B37 | `=Sheet2!$F$45` | 6 |
| DC MCB Rating (Amp) | B41 | typed | 32.0 |
| AC MCB Rating (Amp) | B43 | typed | 64.0 |
| No. of AC MCB | B44 | typed | 2.0 |
| DC Cable Length (MTS.): spare | C16 | typed | 5.0 |
| AC Cable Length (MTS.): spare | C17 | typed | 10.0 |
| Earthing Cable Length for Structure (MTS.): spare | C18 | typed | 0.0 |
| Earthing Cable Length for Inverter (MTS.): spare | C19 | typed | 0.0 |
| LA Earthing Cable Length (MTS.): spare | C20 | typed | 0.0 |

Line by line (workbook cached Qty vs calcBOQ run with laType = ESE, since every workbook LA row specifies ESE):

| sr | Line (workbook rows) | Workbook qty (J formula → value) | calcBOQ qty | Diff (calc − WB) | Result | Reason | Class |
|---|---|---|---|---|---|---|---|
| 1 | Solar module: 590 Wp Mono-TOPCon DCR | r14 `=$B$22`→9 | 9 | +0 | MATCH | — | — |
| 2 | Solar inverter: Hybrid 5 kW (1 MPPT, 1 String, 9 P | r15 typed→1 | 1 | +0 | MATCH | — | — |
| 3 | Data logger: Ethernet/Wifi/GPRS | r16 typed→1 | 0 | -1 | DIFFERENT | workbook typed per sheet; calcBOQ fixed 0 | B template default |
| 4 | Battery: =B14 | r17 `=B15`→1 | 1 | +0 | MATCH | — | — |
| 5 | DC Distribution Box: Technical Specs of DC Distribution | r18 `=B7`→1 | 1 | +0 | MATCH | — | — |
| 8 | DC Cable: 2 C. 4 sq.mm , Annealed Tinned Fle | r19 `=B16+C16`→15 | 25 | +10 | DIFFERENT | WB length B16 `=ROUNDUP(($B$23*1.2)+($B$9*2.3),0)` = 10, spare C16 typed = 5.0; calcBOQ length B16 x inverters then +15 | A formula + C manual value |
| 9 | MC4 Connectors: 4 sq.mm, 1000 V DC, IP68, Applicat | r20 `=B32`→8 | 8 | +0 | MATCH | — | — |
| 6 | AC Distribution Box (Solar LT Panel): Technical Specs of AC Distribution | r21 typed→2 | 1 | -1 | DIFFERENT | workbook `=B7` / `=J15` (per inverter) or typed; calcBOQ fixed 1 | A formula |
| 7 | MCB at Client's LT Panel: Technical Specs :-  - 1 Nos. of  3 | r22 typed→1 | 1 | +0 | MATCH | — | — |
| 10 | AC Cable: 1.1 kV ,Al. Conductor XLPE - 1R X  | r23 `=B17+C17`→17 | 47 | +30 | DIFFERENT | WB length B17 `=ROUNDUP(($B$6+1)*3.5,0)` = 7, spare C17 typed = 10.0; calcBOQ length same formula then +40 | C manual project value |
| 12 | LA With Mounting Accessories: ESE Type - 25 sq.mm - Suitable for | r24 typed→1 | 1 | +0 | MATCH | — | — |
| 13 | Earthing cable: 1.1KV, Flexible Copper Conducter F | r25 `=B18+C18`→16 | 56 | +40 | DIFFERENT | WB length B18 `=ROUNDUP(($B$5+2)*3.5+5,0)` = 16, spare C18 typed = 0.0; calcBOQ length same formula then +40 | C manual project value |
| 14 | Earthing cable: 1.1KV, Flexible Copper Conducter F | r26 `=B19+C19`→9 | 49 | +40 | DIFFERENT | WB length B19 `=ROUNDUP($B$6*3.5+5,0)` = 9, spare C19 typed = 0.0; calcBOQ length same formula then +40 | C manual project value |
| 15 | Earthing cable: 1.1KV, Earthing wire, 25 sq.mm as  | r27 `=B20+C20`→17 | 57 | +40 | DIFFERENT | WB length B20 `=ROUNDUP(($B$5+1)*3.5+10,0)` = 17, spare C20 typed = 0.0; calcBOQ length same formula then +40 | C manual project value |
| 16 | Earthing Pit details: Earthing Pit Specification (DC Ear | r28 `=$B$21`→3 | 5 | +2 | DIFFERENT | workbook pits typed (B21); calcBOQ rule 2 x inv + 1, +2 for ESE | C manual project value |
| 17 | Lugs: Cu., Ring Type- 6 Sq.mm. (Panel to | r29 `=B22*2`→18 | 18 | +0 | MATCH | — | — |
| 18 | Lugs: Cu., pin Type- 6 Sq.mm. (Inverter  | r30 `=B7*2`→2 | 2 | +0 | MATCH | — | — |
| 19 | Lugs: LA earthing - Al , ring type 16 sq | r31 `=J28+1`→4 | 6 | +2 | DIFFERENT | same formula pits + 1; differs only through pits | C manual project value |
| 20 | Lugs: Cu, Ring Type - 4 Sq.mm - Long Bar | r32 `=(B34*2)+(B36*2)`→8 | 6 | -2 | DIFFERENT | calcBOQ sets `B35 = B46<32 ? 1 : 2` (the workbook's DC-MCB-count formula, B43) and uses it as DC cable cores; workbook B35 is typed cores = 2 | F calcBOQ bug |
| 21 | Glands  (PVC Type ): 32mm for 1C X 6 sqmm (HEX) | r33 typed→0 | 0 | +0 | MATCH | — | — |
| 22 | Nut Bolt & Washer Set: 100mm X M10 (Anchor Bolt) | r34 `=J45*4`→48 | 1680 | +1632 | DIFFERENT | calcBOQ base plates = ceil(S53/6)*6*2 with its own S53; workbook base plates = legs x 2 from a hand-filled sub-table | F calcBOQ bug |
| 23 | Nut Bolt & Washer Set: M8 or M6 Hot Dip Galvanised - Inve | r35 `=B7*6`→6 | 6 | +0 | MATCH | — | — |
| — | Nut Bolt & Washer Set: M8 x 100 Hot Dip Galvanised for Pu | r36 typed→0 | not produced | — | MISSING IN calcBOQ | workbook-only line (M8x100 purlin bolt) | A formula |
| 31 | Eletrical Tape: R,Y,B,Black,G (Each) | r37 typed→3 | 6 | +3 | DIFFERENT | workbook typed 3 / 6 / 10; calcBOQ 6 | B template default |
| 32 | Cable Ties: Nylon Cable Tie,-10 85 degree UV P | r38 typed→1 | 1 | +0 | MATCH | — | — |
| 27 | Conduits: PVC Flexible and Fixed Conduit - 2 | r39 `=ROUNDUP((J19+J23+J27+J26)/3,0)`→20 | 132 | +112 | DIFFERENT | different terms: workbook DC + LA wire + inverter earthing (Aaryan: 4 terms, no x3); calcBOQ DC + structure earthing + inverter earthing; spare lengths also differ | A formula + C manual value |
| 28 | Conduits: Tee Bend 25 mm PVC | r40 `=roundup(J39/2,0)`→10 | 66 | +56 | DIFFERENT | follows conduit | A formula + C manual value |
| 29 | Cable Tag: 2C X 6 Sqmm, CU CABLE, INVERTER NO | r41 `=(B36+B34*2)+2`→8 | 6 | -2 | DIFFERENT | same cores bug as line 20 | F calcBOQ bug |
| 30 | Ferules: Pre Printed - 8mm - 1 To 2 STRING | r42 `=B31`→2 | 2 | +0 | MATCH | — | — |
| — | Structure: ISI standard 80 microns GI structu | r43 typed→48 | not produced | — | MISSING IN calcBOQ | workbook-only line (GI structure 80x40) | A formula |
| — | Structure: 40x40x2 (Purlin) | r44 `=J$14*1.2*3`→32.4 | not produced | — | MISSING IN calcBOQ | workbook-only line (Purlin 40x40) | A formula |
| — | Structure: Base plate | r45 typed→12 | not produced | — | MISSING IN calcBOQ | workbook-only line (Base plate) | A formula |
| 34 | Structure: Ladder and Walkway | r46 typed→2; r47 typed→23 | 5 | -20 | DIFFERENT | workbook walkway typed; calcBOQ fixed 5 | C manual project value |
| 35 | Structure: Over the shed Al structure | r48 typed→0 | 5 | +5 | DIFFERENT | workbook over-shed Al typed in kW (0 on raised sheets); calcBOQ always = B1 | A formula |
| 25 | U-Clamp: With Spring and SS- 304 Nut & Bolt | r49 typed→12 | 14 | +2 | DIFFERENT | workbook typed; calcBOQ ceil(panels x 1.5) | C manual project value |
| 26 | Z-Clamp: With Spring and SS- 304 Nut & Bolt | r50 typed→12 | 18 | +6 | DIFFERENT | workbook typed; calcBOQ panels x 2 | C manual project value |
| 38 | Cleaning System: Sprinkler | r51 typed→0 | 0 | +0 | MATCH | — | — |
| 24 | J-Bolt: M-8 SS-304 | r52 typed→0 | 0 | +0 | MATCH | — | — |
| 11 | AC Cable (Inv–ACDB) | not in sheet | 5 | — | NOT IN WORKBOOK | calcBOQ-only line | — |
| 33 | Ladder & Cross Bracing | not in sheet | 18 | — | NOT IN WORKBOOK | calcBOQ-only line | — |
| 36 | Bird Spikes | not in sheet | 0 | — | NOT IN WORKBOOK | calcBOQ-only line | — |
| 37 | Parnali / Rainwater Channel | not in sheet | 0 | — | NOT IN WORKBOOK | calcBOQ-only line | — |

### 2.2 Aaryan 5kW BOQ Solar Template.xlsx / sheet `Copy of  Solar BOQ`

| Input | Cell | Formula or typed | Value |
|---|---|---|---|
| Required Solar Capacity | B1 | typed | 3.0; C1 `=$B$3*$B$22/1000` = 3.54 (actual DC kW) |
| Panel Price/Wp | B2 | typed | 15.0 |
| Solar Module Size (W) | B3 | typed | 590.0 |
| System Connection Phase | B4 | typed | 1.0 |
| Building No. of Floors | B5 | typed | 1.0 |
| Inverter Installation Floor | B6 | typed | 1.0 |
| No. of Inverter | B7 | typed | 1.0 |
| Inverter Size | B8 | typed | 5 kW (brand C8 = 'Solis') |
| No. of Panel Rows | B9 | typed | 2.0 |
| Structure Height Lower (FT.) | B10 | typed | 7.0 |
| Structure Height Upper (FT.) | B11 | typed | 9.0 |
| 3.5ft GI Shed (sqft) | B12 | typed | 0.0 |
| Battery Size | B14 | typed | 5kWh |
| No. of Batteries | B15 | typed | 1.0 |
| No. of Earthing Pit | B21 | typed | 3.0 |
| No. of Solar Panels | B22 | `=ROUNDUP(($B$1*1000/$B$3),0)` | 6 |
| No. of Strings | B31 | `=IFS(C8="Solis",INDEX(Sheet2!A50:I69,MATCH(B8,Sheet2!A50:A69,0),5),C8="Solax",INDEX(Sheet2!A71:I93,MATCH(B8,Sheet2!A71:A93,0),5))` | 2 |
| No. of rafters | B24 | `=roundup(B23/2,0)` | 2 |
| DC Cable Size (sqmm) | B35 | `=Sheet2!K24` | 1.5 |
| AC Cable Size (sqmm) | B37 | `=Sheet2!$F$45` | 6 |
| DC MCB Rating (Amp) | B41 | typed | 32.0 |
| AC MCB Rating (Amp) | B43 | typed | 64.0 |
| No. of AC MCB | B44 | typed | 2.0 |
| DC Cable Length (MTS.): spare | C16 | typed | 5.0 |
| AC Cable Length (MTS.): spare | C17 | typed | 10.0 |
| Earthing Cable Length for Structure (MTS.): spare | C18 | typed | 0.0 |
| Earthing Cable Length for Inverter (MTS.): spare | C19 | typed | 0.0 |
| LA Earthing Cable Length (MTS.): spare | C20 | typed | 0.0 |

Line by line (workbook cached Qty vs calcBOQ run with laType = ESE, since every workbook LA row specifies ESE):

| sr | Line (workbook rows) | Workbook qty (J formula → value) | calcBOQ qty | Diff (calc − WB) | Result | Reason | Class |
|---|---|---|---|---|---|---|---|
| 1 | Solar module: 590 Wp Mono-TOPCon DCR | r14 `=$B$22`→6 | 6 | +0 | MATCH | — | — |
| 2 | Solar inverter: Off-grid 4 kVA (1 MPPT, 1 String,  | r15 typed→1 | 1 | +0 | MATCH | — | — |
| 3 | Data logger: Ethernet/Wifi/GPRS | r16 typed→1 | 0 | -1 | DIFFERENT | workbook typed per sheet; calcBOQ fixed 0 | B template default |
| 4 | Battery: =B14 | r17 typed→0 | 1 | +1 | DIFFERENT | workbook `=B15` or typed 0; calcBOQ `B15` | C manual project value |
| 5 | DC Distribution Box: Technical Specs of DC Distribution | r18 `=B7`→1 | 1 | +0 | MATCH | — | — |
| 8 | DC Cable: 2 C. 4 sq.mm , Annealed Tinned Fle | r19 `=B16+C16`→14 | 24 | +10 | DIFFERENT | WB length B16 `=ROUNDUP(($B$23*1.2)+($B$9*2.3),0)` = 9, spare C16 typed = 5.0; calcBOQ length B16 x inverters then +15 | A formula + C manual value |
| 9 | MC4 Connectors: 4 sq.mm, 1000 V DC, IP68, Applicat | r20 `=B32`→8 | 8 | +0 | MATCH | — | — |
| 6 | AC Distribution Box (Solar LT Panel): Technical Specs of AC Distribution | r21 typed→1 | 1 | +0 | MATCH | — | — |
| 7 | MCB at Client's LT Panel: Technical Specs :-  - 1 Nos. of  3 | r22 typed→1 | 1 | +0 | MATCH | — | — |
| 10 | AC Cable: 1.1 kV ,Al. Conductor XLPE - 1R X  | r23 `=B17+C17`→17 | 47 | +30 | DIFFERENT | WB length B17 `=ROUNDUP(($B$6+1)*3.5,0)` = 7, spare C17 typed = 10.0; calcBOQ length same formula then +40 | C manual project value |
| 12 | LA With Mounting Accessories: ESE Type - 25 sq.mm - Suitable for | r24 typed→1 | 1 | +0 | MATCH | — | — |
| 13 | Earthing cable: 1.1KV, Flexible Copper Conducter F | r25 `=B18+C18`→16 | 56 | +40 | DIFFERENT | WB length B18 `=ROUNDUP(($B$5+2)*3.5+5,0)` = 16, spare C18 typed = 0.0; calcBOQ length same formula then +40 | C manual project value |
| 14 | Earthing cable: 1.1KV, Flexible Copper Conducter F | r26 `=B19+C19`→9 | 49 | +40 | DIFFERENT | WB length B19 `=ROUNDUP($B$6*3.5+5,0)` = 9, spare C19 typed = 0.0; calcBOQ length same formula then +40 | C manual project value |
| 15 | Earthing cable: 1.1KV, Earthing wire, 25 sq.mm as  | r27 `=B20+C20`→17 | 57 | +40 | DIFFERENT | WB length B20 `=ROUNDUP(($B$5+1)*3.5+10,0)` = 17, spare C20 typed = 0.0; calcBOQ length same formula then +40 | C manual project value |
| 16 | Earthing Pit details: Earthing Pit Specification (DC Ear | r28 typed→0 | 5 | +5 | DIFFERENT | workbook pits typed (B21); calcBOQ rule 2 x inv + 1, +2 for ESE | C manual project value |
| 17 | Lugs: Cu., Ring Type- 6 Sq.mm. (Panel to | r29 `=B22*2`→12 | 12 | +0 | MATCH | — | — |
| 18 | Lugs: Cu., pin Type- 6 Sq.mm. (Inverter  | r30 `=B7*2`→2 | 2 | +0 | MATCH | — | — |
| 19 | Lugs: LA earthing - Al , ring type 16 sq | r31 `=J28+1`→1 | 6 | +5 | DIFFERENT | same formula pits + 1; differs only through pits | C manual project value |
| 20 | Lugs: Cu, Ring Type - 4 Sq.mm - Long Bar | r32 `=(B34*2)+(B36*2)`→8 | 6 | -2 | DIFFERENT | calcBOQ sets `B35 = B46<32 ? 1 : 2` (the workbook's DC-MCB-count formula, B43) and uses it as DC cable cores; workbook B35 is typed cores = 2 | F calcBOQ bug |
| 21 | Glands  (PVC Type ): 32mm for 1C X 6 sqmm (HEX) | r33 typed→0 | 0 | +0 | MATCH | — | — |
| 22 | Nut Bolt & Washer Set: 100mm X M10 (Anchor Bolt) | r34 `=J45*4`→48 | 1584 | +1536 | DIFFERENT | calcBOQ base plates = ceil(S53/6)*6*2 with its own S53; workbook base plates = legs x 2 from a hand-filled sub-table | F calcBOQ bug |
| 23 | Nut Bolt & Washer Set: M8 or M6 Hot Dip Galvanised - Inve | r35 `=B7*6`→6 | 6 | +0 | MATCH | — | — |
| — | Nut Bolt & Washer Set: M8 x 100 Hot Dip Galvanised for Pu | r36 typed→0 | not produced | — | MISSING IN calcBOQ | workbook-only line (M8x100 purlin bolt) | A formula |
| 31 | Eletrical Tape: R,Y,B,Black,G (Each) | r37 typed→3 | 6 | +3 | DIFFERENT | workbook typed 3 / 6 / 10; calcBOQ 6 | B template default |
| 32 | Cable Ties: Nylon Cable Tie,-10 85 degree UV P | r38 typed→1 | 1 | +0 | MATCH | — | — |
| 27 | Conduits: PVC Flexible and Fixed Conduit - 2 | r39 `=ROUNDUP((J19+J23+J27+J26)/3,0)`→19 | 129 | +110 | DIFFERENT | different terms: workbook DC + LA wire + inverter earthing (Aaryan: 4 terms, no x3); calcBOQ DC + structure earthing + inverter earthing; spare lengths also differ | A formula + C manual value |
| 28 | Conduits: Tee Bend 25 mm PVC | r40 `=roundup(J39/2,0)`→10 | 65 | +55 | DIFFERENT | follows conduit | A formula + C manual value |
| 29 | Cable Tag: 2C X 6 Sqmm, CU CABLE, INVERTER NO | r41 `=(B36+B34*2)+2`→8 | 6 | -2 | DIFFERENT | same cores bug as line 20 | F calcBOQ bug |
| 30 | Ferules: Pre Printed - 8mm - 1 To 2 STRING | r42 `=B31`→2 | 2 | +0 | MATCH | — | — |
| — | Structure: ISI standard 80 microns GI structu | r43 typed→54 | not produced | — | MISSING IN calcBOQ | workbook-only line (GI structure 80x40) | A formula |
| — | Structure: 40x40x2 (Purlin) | r44 `=3.6*4`→14.4 | not produced | — | MISSING IN calcBOQ | workbook-only line (Purlin 40x40) | A formula |
| — | Structure: Base plate | r45 typed→12 | not produced | — | MISSING IN calcBOQ | workbook-only line (Base plate) | A formula |
| 34 | Structure: Ladder and Walkway | r46 typed→—; r47 typed→12 | 5 | -7 | DIFFERENT | workbook walkway typed; calcBOQ fixed 5 | C manual project value |
| 35 | Structure: Over the shed Al structure | r48 typed→0 | 3 | +3 | DIFFERENT | workbook over-shed Al typed in kW (0 on raised sheets); calcBOQ always = B1 | A formula |
| 25 | U-Clamp: With Spring and SS- 304 Nut & Bolt | r49 typed→12 | 9 | -3 | DIFFERENT | workbook typed; calcBOQ ceil(panels x 1.5) | C manual project value |
| 26 | Z-Clamp: With Spring and SS- 304 Nut & Bolt | r50 typed→12 | 12 | +0 | MATCH | — | — |
| 38 | Cleaning System: Sprinkler | r51 typed→0 | 0 | +0 | MATCH | — | — |
| 24 | J-Bolt: M-8 SS-304 | r52 typed→0 | 0 | +0 | MATCH | — | — |
| 11 | AC Cable (Inv–ACDB) | not in sheet | 5 | — | NOT IN WORKBOOK | calcBOQ-only line | — |
| 33 | Ladder & Cross Bracing | not in sheet | 18 | — | NOT IN WORKBOOK | calcBOQ-only line | — |
| 36 | Bird Spikes | not in sheet | 0 | — | NOT IN WORKBOOK | calcBOQ-only line | — |
| 37 | Parnali / Rainwater Channel | not in sheet | 0 | — | NOT IN WORKBOOK | calcBOQ-only line | — |

### 2.3 Aaryan 5kW BOQ Solar Template.xlsx / sheet `1kW Solar`

| Input | Cell | Formula or typed | Value |
|---|---|---|---|
| Required Solar Capacity | B1 | typed | 1.0; C1 `=$B$3*$B$22/1000` = 1.18 (actual DC kW) |
| Panel Price/Wp | B2 | typed | 15.0 |
| Solar Module Size (W) | B3 | typed | 590.0 |
| System Connection Phase | B4 | typed | 1.0 |
| Building No. of Floors | B5 | typed | 1.0 |
| Inverter Installation Floor | B6 | typed | 1.0 |
| No. of Inverter | B7 | typed | 1.0 |
| Inverter Size | B8 | typed | 1 kW (brand C8 = 'Solis') |
| No. of Panel Rows | B9 | typed | 1.0 |
| Structure Height Lower (FT.) | B10 | typed | 3.0 |
| Structure Height Upper (FT.) | B11 | typed | 5.0 |
| 3.5ft GI Shed (sqft) | B12 | typed | 0.0 |
| Battery Size | B14 | typed | 5kWh |
| No. of Batteries | B15 | typed | 1.0 |
| No. of Earthing Pit | B21 | typed | 3.0 |
| No. of Solar Panels | B22 | `=ROUNDUP(($B$1*1000/$B$3),0)` | 2 |
| No. of Strings | B31 | `=IFS(C8="Solis",INDEX(Sheet2!A50:I69,MATCH(B8,Sheet2!A50:A69,0),5),C8="Solax",INDEX(Sheet2!A71:I93,MATCH(B8,Sheet2!A71:A93,0),5))` | 1 |
| No. of rafters | B24 | `=roundup(B23/2,0)` | 1 |
| DC Cable Size (sqmm) | B35 | `=Sheet2!K24` | 1.5 |
| AC Cable Size (sqmm) | B37 | `=Sheet2!$F$45` | 6 |
| DC MCB Rating (Amp) | B41 | typed | 32.0 |
| AC MCB Rating (Amp) | B43 | typed | 64.0 |
| No. of AC MCB | B44 | typed | 2.0 |
| DC Cable Length (MTS.): spare | C16 | typed | 5.0 |
| AC Cable Length (MTS.): spare | C17 | typed | 10.0 |
| Earthing Cable Length for Structure (MTS.): spare | C18 | typed | 0.0 |
| Earthing Cable Length for Inverter (MTS.): spare | C19 | typed | 0.0 |
| LA Earthing Cable Length (MTS.): spare | C20 | typed | 0.0 |

Line by line (workbook cached Qty vs calcBOQ run with laType = ESE, since every workbook LA row specifies ESE):

| sr | Line (workbook rows) | Workbook qty (J formula → value) | calcBOQ qty | Diff (calc − WB) | Result | Reason | Class |
|---|---|---|---|---|---|---|---|
| 1 | Solar module: 590 Wp Mono-TOPCon DCR | r14 `=$B$22`→2 | 2 | +0 | MATCH | — | — |
| 2 | Solar inverter: Off-grid 4 kVA (1 MPPT, 1 String,  | r15 typed→1 | 1 | +0 | MATCH | — | — |
| 3 | Data logger: Ethernet/Wifi/GPRS | r16 typed→1 | 0 | -1 | DIFFERENT | workbook typed per sheet; calcBOQ fixed 0 | B template default |
| 4 | Battery: =B14 | r17 typed→0 | 1 | +1 | DIFFERENT | workbook `=B15` or typed 0; calcBOQ `B15` | C manual project value |
| 5 | DC Distribution Box: Technical Specs of DC Distribution | r18 `=B7`→1 | 1 | +0 | MATCH | — | — |
| 8 | DC Cable: 2 C. 4 sq.mm , Annealed Tinned Fle | r19 `=B16+C16`→10 | 20 | +10 | DIFFERENT | WB length B16 `=ROUNDUP(($B$23*1.2)+($B$9*2.3),0)` = 5, spare C16 typed = 5.0; calcBOQ length B16 x inverters then +15 | A formula + C manual value |
| 9 | MC4 Connectors: 4 sq.mm, 1000 V DC, IP68, Applicat | r20 `=B32`→4 | 4 | +0 | MATCH | — | — |
| 6 | AC Distribution Box (Solar LT Panel): Technical Specs of AC Distribution | r21 typed→1 | 1 | +0 | MATCH | — | — |
| 7 | MCB at Client's LT Panel: Technical Specs :-  - 1 Nos. of  3 | r22 typed→1 | 1 | +0 | MATCH | — | — |
| 10 | AC Cable: 1.1 kV ,Al. Conductor XLPE - 1R X  | r23 `=B17+C17`→17 | 47 | +30 | DIFFERENT | WB length B17 `=ROUNDUP(($B$6+1)*3.5,0)` = 7, spare C17 typed = 10.0; calcBOQ length same formula then +40 | C manual project value |
| 12 | LA With Mounting Accessories: ESE Type - 25 sq.mm - Suitable for | r24 typed→1 | 1 | +0 | MATCH | — | — |
| 13 | Earthing cable: 1.1KV, Flexible Copper Conducter F | r25 `=B18+C18`→16 | 56 | +40 | DIFFERENT | WB length B18 `=ROUNDUP(($B$5+2)*3.5+5,0)` = 16, spare C18 typed = 0.0; calcBOQ length same formula then +40 | C manual project value |
| 14 | Earthing cable: 1.1KV, Flexible Copper Conducter F | r26 `=B19+C19`→9 | 49 | +40 | DIFFERENT | WB length B19 `=ROUNDUP($B$6*3.5+5,0)` = 9, spare C19 typed = 0.0; calcBOQ length same formula then +40 | C manual project value |
| 15 | Earthing cable: 1.1KV, Earthing wire, 25 sq.mm as  | r27 `=B20+C20`→17 | 57 | +40 | DIFFERENT | WB length B20 `=ROUNDUP(($B$5+1)*3.5+10,0)` = 17, spare C20 typed = 0.0; calcBOQ length same formula then +40 | C manual project value |
| 16 | Earthing Pit details: Earthing Pit Specification (DC Ear | r28 typed→0 | 5 | +5 | DIFFERENT | workbook pits typed (B21); calcBOQ rule 2 x inv + 1, +2 for ESE | C manual project value |
| 17 | Lugs: Cu., Ring Type- 6 Sq.mm. (Panel to | r29 `=B22*2`→4 | 4 | +0 | MATCH | — | — |
| 18 | Lugs: Cu., pin Type- 6 Sq.mm. (Inverter  | r30 `=B7*2`→2 | 2 | +0 | MATCH | — | — |
| 19 | Lugs: LA earthing - Al , ring type 16 sq | r31 `=J28+1`→1 | 6 | +5 | DIFFERENT | same formula pits + 1; differs only through pits | C manual project value |
| 20 | Lugs: Cu, Ring Type - 4 Sq.mm - Long Bar | r32 `=(B34*2)+(B36*2)`→8 | 6 | -2 | DIFFERENT | calcBOQ sets `B35 = B46<32 ? 1 : 2` (the workbook's DC-MCB-count formula, B43) and uses it as DC cable cores; workbook B35 is typed cores = 2 | F calcBOQ bug |
| 21 | Glands  (PVC Type ): 32mm for 1C X 6 sqmm (HEX) | r33 typed→0 | 0 | +0 | MATCH | — | — |
| 22 | Nut Bolt & Washer Set: 100mm X M10 (Anchor Bolt) | r34 `=J45*4`→16 | 816 | +800 | DIFFERENT | calcBOQ base plates = ceil(S53/6)*6*2 with its own S53; workbook base plates = legs x 2 from a hand-filled sub-table | F calcBOQ bug |
| 23 | Nut Bolt & Washer Set: M8 or M6 Hot Dip Galvanised - Inve | r35 `=B7*6`→6 | 6 | +0 | MATCH | — | — |
| — | Nut Bolt & Washer Set: M8 x 100 Hot Dip Galvanised for Pu | r36 typed→0 | not produced | — | MISSING IN calcBOQ | workbook-only line (M8x100 purlin bolt) | A formula |
| 31 | Eletrical Tape: R,Y,B,Black,G (Each) | r37 typed→3 | 6 | +3 | DIFFERENT | workbook typed 3 / 6 / 10; calcBOQ 6 | B template default |
| 32 | Cable Ties: Nylon Cable Tie,-10 85 degree UV P | r38 typed→1 | 1 | +0 | MATCH | — | — |
| 27 | Conduits: PVC Flexible and Fixed Conduit - 2 | r39 `=ROUNDUP((J19+J23+J27+J26)/3,0)`→18 | 126 | +108 | DIFFERENT | different terms: workbook DC + LA wire + inverter earthing (Aaryan: 4 terms, no x3); calcBOQ DC + structure earthing + inverter earthing; spare lengths also differ | A formula + C manual value |
| 28 | Conduits: Tee Bend 25 mm PVC | r40 `=roundup(J39/2,0)`→9 | 63 | +54 | DIFFERENT | follows conduit | A formula + C manual value |
| 29 | Cable Tag: 2C X 6 Sqmm, CU CABLE, INVERTER NO | r41 `=(B36+B34*2)+2`→8 | 6 | -2 | DIFFERENT | same cores bug as line 20 | F calcBOQ bug |
| 30 | Ferules: Pre Printed - 8mm - 1 To 2 STRING | r42 `=B31`→1 | 1 | +0 | MATCH | — | — |
| — | Structure: ISI standard 80 microns GI structu | r43 typed→18 | not produced | — | MISSING IN calcBOQ | workbook-only line (GI structure 80x40) | A formula |
| — | Structure: 40x40x2 (Purlin) | r44 `=J$14*1.2*3`→7.2 | not produced | — | MISSING IN calcBOQ | workbook-only line (Purlin 40x40) | A formula |
| — | Structure: Base plate | r45 typed→4 | not produced | — | MISSING IN calcBOQ | workbook-only line (Base plate) | A formula |
| 34 | Structure: Ladder and Walkway | r46 typed→0; r47 typed→0 | 5 | +5 | DIFFERENT | workbook walkway typed; calcBOQ fixed 5 | C manual project value |
| 35 | Structure: Over the shed Al structure | r48 typed→0 | 1 | +1 | DIFFERENT | workbook over-shed Al typed in kW (0 on raised sheets); calcBOQ always = B1 | A formula |
| 25 | U-Clamp: With Spring and SS- 304 Nut & Bolt | r49 typed→3 | 3 | +0 | MATCH | — | — |
| 26 | Z-Clamp: With Spring and SS- 304 Nut & Bolt | r50 typed→6 | 4 | -2 | DIFFERENT | workbook typed; calcBOQ panels x 2 | C manual project value |
| 38 | Cleaning System: Sprinkler | r51 typed→0 | 0 | +0 | MATCH | — | — |
| 24 | J-Bolt: M-8 SS-304 | r52 typed→0 | 0 | +0 | MATCH | — | — |
| 11 | AC Cable (Inv–ACDB) | not in sheet | 5 | — | NOT IN WORKBOOK | calcBOQ-only line | — |
| 33 | Ladder & Cross Bracing | not in sheet | 18 | — | NOT IN WORKBOOK | calcBOQ-only line | — |
| 36 | Bird Spikes | not in sheet | 0 | — | NOT IN WORKBOOK | calcBOQ-only line | — |
| 37 | Parnali / Rainwater Channel | not in sheet | 0 | — | NOT IN WORKBOOK | calcBOQ-only line | — |

### 2.4 Ananda Residency - BOQ Solar Template.xlsx / sheet `34.2kW Non-raised Strucutre Sol`

| Input | Cell | Formula or typed | Value |
|---|---|---|---|
| Required Solar Capacity | B1 | typed | 34.0; C1 `=$B$3*$B$22/1000` = 34.2 (actual DC kW) |
| Panel Price/Wp | B2 | typed | 24.6 |
| Solar Module Size (W) | B3 | typed | 600.0 |
| System Connection Phase | B4 | typed | 3.0 |
| Building No. of Floors | B5 | typed | 12.0 |
| Inverter Installation Floor | B6 | typed | 12.0 |
| No. of Inverter | B7 | typed | 2.0 |
| Inverter Size | B8 | typed | 20 kW (brand C8 = 'Solis') |
| No. of Panel Rows | B9 | typed | 8.0 |
| Structure Height Lower (FT.) | B10 | typed | 7.0 |
| Structure Height Upper (FT.) | B11 | typed | 9.0 |
| 3.5ft GI Shed (sqft) | B12 | typed | 0.0 |
| Battery Size | B14 | typed | 0.0 |
| No. of Batteries | B15 | typed | 0.0 |
| No. of Earthing Pit | B21 | typed | 12.0 |
| No. of Solar Panels | B22 | `=ROUNDUP(($B$1*1000/$B$3),0)` | 57 |
| No. of Strings | B33 | typed | 6.0 |
| No. of rafters | B26 | typed | 18.0 |
| DC Cable Size (sqmm) | B37 | `=Sheet2!K24` | 1.5 |
| AC Cable Size (sqmm) | B39 | `=Sheet2!$F$45` | 6 |
| DC MCB Rating (Amp) | B43 | typed | 32.0 |
| AC MCB Rating (Amp) | B45 | typed | 64.0 |
| No. of AC MCB | B46 | typed | 2.0 |
| DC Cable Length (MTS.): spare | C16 | typed | 60.0 |
| AC Cable Length (MTS.): spare | C17 | typed | 120 |
| Earthing Cable Length for Structure (MTS.): spare | C18 | typed | 100.0 |
| Earthing Cable Length for Inverter (MTS.): spare | C19 | typed | 100.0 |
| LA Earthing Cable Length (MTS.): spare | C20 | typed | 0.0 |

Line by line (workbook cached Qty vs calcBOQ run with laType = ESE, since every workbook LA row specifies ESE):

| sr | Line (workbook rows) | Workbook qty (J formula → value) | calcBOQ qty | Diff (calc − WB) | Result | Reason | Class |
|---|---|---|---|---|---|---|---|
| 1 | Solar module: 540 Wp Mono Perc DCR | r14 `=$B$22`→57 | 57 | +0 | MATCH | — | — |
| 2 | Solar inverter: 15 kW (2 MPPT, 4 String, 13 Panel* | r15 `=B7`→2 | 2 | +0 | MATCH | — | — |
| 3 | Data logger: Ethernet/Wifi/GPRS | r16 typed→1 | 0 | -1 | DIFFERENT | workbook typed per sheet; calcBOQ fixed 0 | B template default |
| 4 | Battery: =B14 | r17 `=B15`→0 | 0 | +0 | MATCH | — | — |
| 5 | DC Distribution Box: Technical Specs of DC Distribution | r18 `=J15`→2 | 2 | +0 | MATCH | — | — |
| 8 | DC Cable: 2 C. 4 sq.mm , Annealed Tinned Fle | r19 `=B16+C16`→222 | 69 | -153 | DIFFERENT | WB length B16 `=ROUNDUP(($B$23*1.2)+($B$9*2.3),0)*B33` = 162, spare C16 typed = 60.0; calcBOQ length B16 x inverters then +15 | A formula + C manual value |
| 9 | MC4 Connectors: 4 sq.mm, 1000 V DC, IP68, Applicat | r20 `=B34`→24 | 24 | +0 | MATCH | — | — |
| 6 | AC Distribution Box (Solar LT Panel): Technical Specs of AC Distribution | r21 `=J15`→2 | 1 | -1 | DIFFERENT | workbook `=B7` / `=J15` (per inverter) or typed; calcBOQ fixed 1 | A formula |
| 7 | MCB at Client's LT Panel: Technical Specs :-  - 1 Nos. of  3 | r22 `=J15`→2 | 1 | -1 | DIFFERENT | workbook typed 1 or `=J15`; calcBOQ fixed 1 | C manual project value |
| 10 | AC Cable: 1.1 kV ,Al. Conductor XLPE - 1R X  | r23 `=B17+C17`→212 | 132 | -80 | DIFFERENT | WB length B17 `=ROUNDUP(($B$6+1)*3.5,0)*B7` = 92, spare C17 typed = 120; calcBOQ length same formula then +40 | C manual project value |
| 11 | AC Cable (Inverter to ACDB): 1R x 3.5C x 16 Sqmm ARM Cu | r24 `=10*J15`→20 | 10 | -10 | DIFFERENT | workbook `5*J15` / `10*J15` / typed; calcBOQ `5*B7` | A formula |
| 12 | LA With Mounting Accessories: ESE Type - 25 sq.mm - Suitable for | r25 typed→2 | 1 | -1 | DIFFERENT | LA count typed in workbook; calcBOQ 1 | C manual project value |
| 13 | Earthing cable: 1.1KV, Flexible Copper Conducter F | r26 `=B18+C18`→208 | 148 | -60 | DIFFERENT | WB length B18 `=ROUNDUP(($B$5+2)*3.5+5,0)*B7` = 108, spare C18 typed = 100.0; calcBOQ length same formula then +40 | C manual project value |
| 14 | Earthing cable: 1.1KV, Flexible Copper Conducter F | r27 `=B19+C19`→194 | 134 | -60 | DIFFERENT | WB length B19 `=ROUNDUP($B$6*3.5+5,0)*B7` = 94, spare C19 typed = 100.0; calcBOQ length same formula then +40 | C manual project value |
| 15 | Earthing cable: 1.1KV, Earthing wire, 25 sq.mm as  | r28 `=B20+C20`→104 | 96 | -8 | DIFFERENT | WB length B20 `=ROUNDUP($B$6*3.5+10,0)*B7` = 104, spare C20 typed = 0.0; calcBOQ length same formula then +40 | C manual project value |
| 16 | Earthing Pit details: Earthing Pit Specification (DC Ear | r29 `=$B$21`→12 | 7 | -5 | DIFFERENT | workbook pits typed (B21); calcBOQ rule 2 x inv + 1, +2 for ESE | C manual project value |
| 17 | Lugs: Cu., Ring Type- 6 Sq.mm. (Panel to | r30 `=B22*2`→114 | 114 | +0 | MATCH | — | — |
| 18 | Lugs: Cu., pin Type- 6 Sq.mm. (Inverter  | r31 `=B7*2`→4 | 4 | +0 | MATCH | — | — |
| 19 | Lugs: LA earthing - Al , ring type 16 sq | r32 `=J29+1`→13 | 8 | -5 | DIFFERENT | same formula pits + 1; differs only through pits | C manual project value |
| 20 | Lugs: Cu, Ring Type - 4 Sq.mm - Long Bar | r33 `=(B36*2)+(B38*2)`→12 | 10 | -2 | DIFFERENT | calcBOQ sets `B35 = B46<32 ? 1 : 2` (the workbook's DC-MCB-count formula, B43) and uses it as DC cable cores; workbook B35 is typed cores = 2 | F calcBOQ bug |
| 21 | Glands  (PVC Type ): 32mm for 1C X 6 sqmm (HEX) | r34 typed→0 | 0 | +0 | MATCH | — | — |
| 22 | Nut Bolt & Washer Set: 100mm X M10 (Anchor Bolt) | r35 `=J46*4`→180 | 5136 | +4956 | DIFFERENT | calcBOQ base plates = ceil(S53/6)*6*2 with its own S53; workbook base plates = legs x 2 from a hand-filled sub-table | F calcBOQ bug |
| 23 | Nut Bolt & Washer Set: M8 or M6 Hot Dip Galvanised - Inve | r36 `=B7*6`→12 | 12 | +0 | MATCH | — | — |
| — | Nut Bolt & Washer Set: M8 x 100 Hot Dip Galvanised for Pu | r37 typed→0 | not produced | — | MISSING IN calcBOQ | workbook-only line (M8x100 purlin bolt) | A formula |
| 31 | Eletrical Tape: R,Y,B,Black,G (Each) | r38 typed→6 | 6 | +0 | MATCH | — | — |
| 32 | Cable Ties: Nylon Cable Tie,-10 85 degree UV P | r39 typed→1 | 1 | +0 | MATCH | — | — |
| 27 | Conduits: PVC Flexible and Fixed Conduit - 2 | r40 `=ROUNDUP((J19+J28+J27)/3,0)*3`→522 | 351 | -171 | DIFFERENT | different terms: workbook DC + LA wire + inverter earthing (Aaryan: 4 terms, no x3); calcBOQ DC + structure earthing + inverter earthing; spare lengths also differ | A formula + C manual value |
| 28 | Conduits: Tee Bend 25 mm PVC | r41 `=roundup(J40/2,0)`→261 | 176 | -85 | DIFFERENT | follows conduit | A formula + C manual value |
| 29 | Cable Tag: 2C X 6 Sqmm, CU CABLE, INVERTER NO | r42 `=(B38+B36*2)+2`→10 | 8 | -2 | DIFFERENT | same cores bug as line 20 | F calcBOQ bug |
| 30 | Ferules: Pre Printed - 8mm - 1 To 2 STRING | r43 `=B33`→6 | 6 | +0 | MATCH | — | — |
| — | Structure: ISI standard 80 microns GI structu | r44 `=roundup(T45/6,0)*6`→150 | not produced | — | MISSING IN calcBOQ | workbook-only line (GI structure 80x40) | A formula |
| — | Structure: 40x40x2 (Purlin) | r45 `=J$14*1.2*3+12`→217.2 | not produced | — | MISSING IN calcBOQ | workbook-only line (Purlin 40x40) | A formula |
| — | Structure: Base plate | r46 `=S45*1.5`→45 | not produced | — | MISSING IN calcBOQ | workbook-only line (Base plate) | A formula |
| 33 | Structure: Ladder and Cross bracing | r47 typed→24 | 18 | -6 | DIFFERENT | workbook 'Ladder and Cross bracing' typed; calcBOQ fixed 18 | B template default |
| 34 | Structure: Walkway | r48 typed→21 | 5 | -16 | DIFFERENT | workbook walkway typed; calcBOQ fixed 5 | C manual project value |
| 35 | Structure: Over the shed Al structure | r49 typed→0 | 34 | +34 | DIFFERENT | workbook over-shed Al typed in kW (0 on raised sheets); calcBOQ always = B1 | A formula |
| 25 | U-Clamp: With Spring and SS- 304 Nut & Bolt | r50 typed→78 | 86 | +8 | DIFFERENT | workbook typed; calcBOQ ceil(panels x 1.5) | C manual project value |
| 26 | Z-Clamp: With Spring and SS- 304 Nut & Bolt | r51 typed→18 | 114 | +96 | DIFFERENT | workbook typed; calcBOQ panels x 2 | C manual project value |
| 38 | Cleaning System: Sprinkler | r52 typed→0 | 0 | +0 | MATCH | — | — |
| — | Civil: Block | r53 typed→22 | not produced | — | MISSING IN calcBOQ | workbook-only line (Civil block) | A formula |
| 24 | J-Bolt M8 SS-304 | not in sheet | 0 | — | NOT IN WORKBOOK | calcBOQ-only line | — |
| 36 | Bird Spikes | not in sheet | 0 | — | NOT IN WORKBOOK | calcBOQ-only line | — |
| 37 | Parnali / Rainwater Channel | not in sheet | 0 | — | NOT IN WORKBOOK | calcBOQ-only line | — |

### 2.5 Ananda Residency - BOQ Solar Template.xlsx / sheet `40.2kW Non-raised Strucutre Sol`

| Input | Cell | Formula or typed | Value |
|---|---|---|---|
| Required Solar Capacity | B1 | typed | 40.0; C1 `=$B$3*$B$28/1000` = 40.5 (actual DC kW) |
| Panel Price/Wp | B2 | typed | 25.0 |
| Solar Module Size (W) | B3 | typed | 540.0 |
| System Connection Phase | B4 | typed | 3.0 |
| Building No. of Floors | B5 | typed | 6.0 |
| Inverter Installation Floor | B6 | typed | 6.0 |
| No. of Inverter | B7 | typed | 3.0 |
| Inverter Size | B8 | typed | 12 kW (brand C8 = 'Solis') |
| No. of Panel Rows | B9 | typed | 8.0 |
| Structure Height Lower (FT.) | B10 | typed | 7.0 |
| Structure Height Upper (FT.) | B11 | typed | 9.0 |
| 3.5ft GI Shed (sqft) | B12 | typed | 0.0 |
| Battery Size | B14 | typed | 0.0 |
| No. of Batteries | B15 | typed | 0.0 |
| No. of Earthing Pit | B25 | typed | 12.0 |
| No. of Solar Panels | B28 | `=ROUNDUP(($B$1*1000/$B$3),0)` | 75 |
| No. of Strings | B45 | typed | 6.0 |
| No. of rafters | B38 | typed | 18.0 |
| DC Cable Size (sqmm) | B49 | `=Sheet2!K24` | 1.5 |
| AC Cable Size (sqmm) | B51 | `=Sheet2!$F$45` | 6 |
| DC MCB Rating (Amp) | B55 | typed | 32.0 |
| AC MCB Rating (Amp) | B57 | typed | 64.0 |
| No. of AC MCB | B58 | typed | 2.0 |
| DC Cable Length (MTS.): spare | C18 | typed | 120.0 |
| AC Cable Length (MTS.): spare | C19 | typed | 100.0 |
| Earthing Cable Length for Structure (MTS.): spare | C20 | typed | 100.0 |
| Earthing Cable Length for Inverter (MTS.): spare | C23 | typed | 100.0 |
| LA Earthing Cable Length (MTS.): spare | C24 | typed | 60.0 |

Line by line (workbook cached Qty vs calcBOQ run with laType = ESE, since every workbook LA row specifies ESE):

| sr | Line (workbook rows) | Workbook qty (J formula → value) | calcBOQ qty | Diff (calc − WB) | Result | Reason | Class |
|---|---|---|---|---|---|---|---|
| 1 | Solar module: 600 Wp Mono Perc DCR | r14 `=$B$28`→75 | 75 | +0 | MATCH | — | — |
| 2 | Solar inverter: 25 kW (2 MPPT, 4 String, 13 Panel* | r15 typed→1; r16 typed→1; r17 typed→1 | 3 | +0 | MATCH | — | — |
| 3 | Data logger: Ethernet/Wifi/GPRS | r18 typed→1 | 0 | -1 | DIFFERENT | workbook typed per sheet; calcBOQ fixed 0 | B template default |
| 4 | Battery: =B14 | r19 `=B15`→0 | 0 | +0 | MATCH | — | — |
| 5 | DC Distribution Box: Technical Specs of DC Distribution | r20 `=J15`→1; r21 typed→1; r22 typed→1 | 3 | +0 | MATCH | — | — |
| 8 | DC Cable: 2 C. 4 sq.mm , Annealed Tinned Fle | r23 `=B18+C18`→300 | 105 | -195 | DIFFERENT | WB length B18 `=ROUNDUP(($B$31*1.2)+($B$9*2.3),0)*B45` = 180, spare C18 typed = 120.0; calcBOQ length B16 x inverters then +15 | A formula + C manual value |
| 9 | MC4 Connectors: 4 sq.mm, 1000 V DC, IP68, Applicat | r24 `=B46`→24 | 24 | +0 | MATCH | — | — |
| 6 | AC Distribution Box (Solar LT Panel): Technical Specs of AC Distribution | r25 `=J15`→1; r26 typed→1; r27 typed→1 | 1 | -2 | DIFFERENT | workbook `=B7` / `=J15` (per inverter) or typed; calcBOQ fixed 1 | A formula |
| 7 | MCB at Client's LT Panel: Technical Specs :-  - 1 Nos. of  6 | r28 `=J15`→1; r29 typed→1; r30 typed→1 | 1 | -2 | DIFFERENT | workbook typed 1 or `=J15`; calcBOQ fixed 1 | C manual project value |
| 10 | AC Cable: 1.1 kV ,Al. Conductor XLPE - 1R X  | r31 `=B19+C19`→175; r32 `=B19+C19`→175; r33 `=B19+C19`→175 | 115 | -410 | DIFFERENT | WB length B19 `=ROUNDUP(($B$6+1)*3.5,0)*B7` = 75, spare C19 typed = 100.0; calcBOQ length same formula then +40 | C manual project value |
| 11 | AC Cable (Inverter to ACDB): 1R x 3.5C x 25 Sqmm ARM Cu | r34 `=10*J15`→10; r35 `=10*J15`→10; r36 `=10*J15`→10 | 15 | -15 | DIFFERENT | workbook `5*J15` / `10*J15` / typed; calcBOQ `5*B7` | A formula |
| 12 | LA With Mounting Accessories: ESE Type - 25 sq.mm - Suitable for | r37 typed→3 | 1 | -2 | DIFFERENT | LA count typed in workbook; calcBOQ 1 | C manual project value |
| 13 | Earthing cable: 1.1KV, Flexible Copper Conducter F | r38 `=B20+C20`→199 | 139 | -60 | DIFFERENT | WB length B20 `=ROUNDUP(($B$5+2)*3.5+5,0)*B7` = 99, spare C20 typed = 100.0; calcBOQ length same formula then +40 | C manual project value |
| 14 | Earthing cable: 1.1KV, Flexible Copper Conducter F | r39 `=B23+C23`→178 | 118 | -60 | DIFFERENT | WB length B23 `=ROUNDUP($B$6*3.5+5,0)*B7` = 78, spare C23 typed = 100.0; calcBOQ length same formula then +40 | C manual project value |
| 15 | Earthing cable: 1.1KV, Earthing wire, 25 sq.mm as  | r40 `=B24+C24`→153 | 75 | -78 | DIFFERENT | WB length B24 `=ROUNDUP($B$6*3.5+10,0)*B7` = 93, spare C24 typed = 60.0; calcBOQ length same formula then +40 | C manual project value |
| 16 | Earthing Pit details: Earthing Pit Specification (DC Ear | r41 `=$B$25`→12 | 9 | -3 | DIFFERENT | workbook pits typed (B21); calcBOQ rule 2 x inv + 1, +2 for ESE | C manual project value |
| 17 | Lugs: Cu., Ring Type- 6 Sq.mm. (Panel to | r42 `=B28*2`→150 | 150 | +0 | MATCH | — | — |
| 18 | Lugs: Cu., pin Type- 6 Sq.mm. (Inverter  | r43 `=B7*2`→6 | 6 | +0 | MATCH | — | — |
| 19 | Lugs: LA earthing - Al , ring type 16 sq | r44 `=J41+1`→13 | 10 | -3 | DIFFERENT | same formula pits + 1; differs only through pits | C manual project value |
| 20 | Lugs: Cu, Ring Type - 4 Sq.mm - Long Bar | r45 `=(B48*2)+(B50*2)`→12 | 10 | -2 | DIFFERENT | calcBOQ sets `B35 = B46<32 ? 1 : 2` (the workbook's DC-MCB-count formula, B43) and uses it as DC cable cores; workbook B35 is typed cores = 2 | F calcBOQ bug |
| 21 | Glands  (PVC Type ): 32mm for 1C X 6 sqmm (HEX) | r46 typed→0 | 0 | +0 | MATCH | — | — |
| 22 | Nut Bolt & Washer Set: 100mm X M10 (Anchor Bolt) | r47 `=J58*4`→180 | 5664 | +5484 | DIFFERENT | calcBOQ base plates = ceil(S53/6)*6*2 with its own S53; workbook base plates = legs x 2 from a hand-filled sub-table | F calcBOQ bug |
| 23 | Nut Bolt & Washer Set: M8 or M6 Hot Dip Galvanised - Inve | r48 `=B7*6`→18 | 18 | +0 | MATCH | — | — |
| — | Nut Bolt & Washer Set: M8 x 100 Hot Dip Galvanised for Pu | r49 typed→0 | not produced | — | MISSING IN calcBOQ | workbook-only line (M8x100 purlin bolt) | A formula |
| 31 | Eletrical Tape: R,Y,B,Black,G (Each) | r50 typed→6 | 6 | +0 | MATCH | — | — |
| 32 | Cable Ties: Nylon Cable Tie,-10 85 degree UV P | r51 typed→1 | 1 | +0 | MATCH | — | — |
| 27 | Conduits: PVC Flexible and Fixed Conduit - 2 | r52 `=ROUNDUP((J23+J40+J39)/3,0)*3`→633 | 363 | -270 | DIFFERENT | different terms: workbook DC + LA wire + inverter earthing (Aaryan: 4 terms, no x3); calcBOQ DC + structure earthing + inverter earthing; spare lengths also differ | A formula + C manual value |
| 28 | Conduits: Tee Bend 25 mm PVC | r53 `=roundup(J52/2,0)`→317 | 182 | -135 | DIFFERENT | follows conduit | A formula + C manual value |
| 29 | Cable Tag: 2C X 6 Sqmm, CU CABLE, INVERTER NO | r54 `=(B50+B48*2)+2`→10 | 8 | -2 | DIFFERENT | same cores bug as line 20 | F calcBOQ bug |
| 30 | Ferules: Pre Printed - 8mm - 1 To 2 STRING | r55 `=B45`→6 | 6 | +0 | MATCH | — | — |
| — | Structure: ISI standard 80 microns GI structu | r56 `=roundup(T57/6,0)*6`→150 | not produced | — | MISSING IN calcBOQ | workbook-only line (GI structure 80x40) | A formula |
| — | Structure: 40x40x2 (Purlin) | r57 `=J$14*1.2*3+12`→282 | not produced | — | MISSING IN calcBOQ | workbook-only line (Purlin 40x40) | A formula |
| — | Structure: Base plate | r58 `=S57*1.5`→45 | not produced | — | MISSING IN calcBOQ | workbook-only line (Base plate) | A formula |
| 33 | Structure: Ladder and Cross bracing | r59 typed→24 | 18 | -6 | DIFFERENT | workbook 'Ladder and Cross bracing' typed; calcBOQ fixed 18 | B template default |
| 34 | Structure: Walkway | r60 typed→21 | 5 | -16 | DIFFERENT | workbook walkway typed; calcBOQ fixed 5 | C manual project value |
| 35 | Structure: Over the shed Al structure | r61 typed→0 | 40 | +40 | DIFFERENT | workbook over-shed Al typed in kW (0 on raised sheets); calcBOQ always = B1 | A formula |
| 25 | U-Clamp: With Spring and SS- 304 Nut & Bolt | r62 typed→78 | 113 | +35 | DIFFERENT | workbook typed; calcBOQ ceil(panels x 1.5) | C manual project value |
| 26 | Z-Clamp: With Spring and SS- 304 Nut & Bolt | r63 typed→18 | 150 | +132 | DIFFERENT | workbook typed; calcBOQ panels x 2 | C manual project value |
| 38 | Cleaning System: Sprinkler | r64 typed→0 | 0 | +0 | MATCH | — | — |
| — | Civil: Block | r65 typed→22 | not produced | — | MISSING IN calcBOQ | workbook-only line (Civil block) | A formula |
| 24 | J-Bolt M8 SS-304 | not in sheet | 0 | — | NOT IN WORKBOOK | calcBOQ-only line | — |
| 36 | Bird Spikes | not in sheet | 0 | — | NOT IN WORKBOOK | calcBOQ-only line | — |
| 37 | Parnali / Rainwater Channel | not in sheet | 0 | — | NOT IN WORKBOOK | calcBOQ-only line | — |

### 2.6 Ananda Residency - BOQ Solar Template.xlsx / sheet `10.8kW Non-raised Strucutre Sol`

| Input | Cell | Formula or typed | Value |
|---|---|---|---|
| Required Solar Capacity | B1 | typed | 10.5; C1 `=$B$3*$B$22/1000` = 10.8 (actual DC kW) |
| Panel Price/Wp | B2 | typed | 25.0 |
| Solar Module Size (W) | B3 | typed | 600.0 |
| System Connection Phase | B4 | typed | 3.0 |
| Building No. of Floors | B5 | typed | 4.0 |
| Inverter Installation Floor | B6 | typed | 4.0 |
| No. of Inverter | B7 | typed | 1.0 |
| Inverter Size | B8 | typed | 12 kW (brand C8 = 'Solis') |
| No. of Panel Rows | B9 | typed | 5.0 |
| Structure Height Lower (FT.) | B10 | typed | 7.0 |
| Structure Height Upper (FT.) | B11 | typed | 9.0 |
| 3.5ft GI Shed (sqft) | B12 | typed | 0.0 |
| Battery Size | B14 | typed | 0.0 |
| No. of Batteries | B15 | typed | 0.0 |
| No. of Earthing Pit | B21 | typed | 5.0 |
| No. of Solar Panels | B22 | `=ROUNDUP(($B$1*1000/$B$3),0)` | 18 |
| No. of Strings | B32 | typed | 2.0 |
| No. of rafters | B25 | typed | 18.0 |
| DC Cable Size (sqmm) | B36 | `=Sheet2!K24` | 1.5 |
| AC Cable Size (sqmm) | B38 | `=Sheet2!$F$45` | 6 |
| DC MCB Rating (Amp) | B42 | typed | 32.0 |
| AC MCB Rating (Amp) | B44 | typed | 64.0 |
| No. of AC MCB | B45 | typed | 2.0 |
| DC Cable Length (MTS.): spare | C16 | typed | 50.0 |
| AC Cable Length (MTS.): spare | C17 | typed | 30.0 |
| Earthing Cable Length for Structure (MTS.): spare | C18 | typed | 35.0 |
| Earthing Cable Length for Inverter (MTS.): spare | C19 | typed | 35.0 |
| LA Earthing Cable Length (MTS.): spare | C20 | typed | 70.0 |

Line by line (workbook cached Qty vs calcBOQ run with laType = ESE, since every workbook LA row specifies ESE):

| sr | Line (workbook rows) | Workbook qty (J formula → value) | calcBOQ qty | Diff (calc − WB) | Result | Reason | Class |
|---|---|---|---|---|---|---|---|
| 1 | Solar module: 540 Wp Mono Perc DCR | r14 `=$B$22`→18 | 18 | +0 | MATCH | — | — |
| 2 | Solar inverter: 15 kW (2 MPPT, 4 String, 13 Panel* | r15 `=B7`→1 | 1 | +0 | MATCH | — | — |
| 3 | Data logger: Ethernet/Wifi/GPRS | r16 typed→1 | 0 | -1 | DIFFERENT | workbook typed per sheet; calcBOQ fixed 0 | B template default |
| 4 | Battery: =B14 | r17 `=B15`→0 | 0 | +0 | MATCH | — | — |
| 5 | DC Distribution Box: Technical Specs of DC Distribution | r18 typed→1 | 1 | +0 | MATCH | — | — |
| 8 | DC Cable: 2 C. 4 sq.mm , Annealed Tinned Fle | r19 `=B16+C16`→82 | 31 | -51 | DIFFERENT | WB length B16 `=ROUNDUP(($B$23*1.2)+($B$9*2.3),0)*B32` = 32, spare C16 typed = 50.0; calcBOQ length B16 x inverters then +15 | A formula + C manual value |
| 9 | MC4 Connectors: 4 sq.mm, 1000 V DC, IP68, Applicat | r20 `=B33`→8 | 8 | +0 | MATCH | — | — |
| 6 | AC Distribution Box (Solar LT Panel): Technical Specs of AC Distribution | r21 typed→1 | 1 | +0 | MATCH | — | — |
| 7 | MCB at Client's LT Panel: Technical Specs :-  - 1 Nos. of  3 | r22 typed→1 | 1 | +0 | MATCH | — | — |
| 10 | AC Cable: 1.1 kV ,Al. Conductor XLPE - 1R X  | r23 `=B17+C17`→48 | 58 | +10 | DIFFERENT | WB length B17 `=ROUNDUP(($B$6+1)*3.5,0)*B7` = 18, spare C17 typed = 30.0; calcBOQ length same formula then +40 | C manual project value |
| 11 | AC Cable (Inverter to ACDB): 1R x 4C x 6Sqmm Flexible  | r24 typed→10 | 5 | -5 | DIFFERENT | workbook `5*J15` / `10*J15` / typed; calcBOQ `5*B7` | A formula |
| 12 | LA With Mounting Accessories: ESE Type - 25 sq.mm - Suitable for | r25 typed→3 | 1 | -2 | DIFFERENT | LA count typed in workbook; calcBOQ 1 | C manual project value |
| 13 | Earthing cable: 1.1KV, Flexible Copper Conducter F | r26 `=B18+C18`→61 | 66 | +5 | DIFFERENT | WB length B18 `=ROUNDUP(($B$5+2)*3.5+5,0)*B7` = 26, spare C18 typed = 35.0; calcBOQ length same formula then +40 | C manual project value |
| 14 | Earthing cable: 1.1KV, Flexible Copper Conducter F | r27 `=B19+C19`→54 | 59 | +5 | DIFFERENT | WB length B19 `=ROUNDUP($B$6*3.5+5,0)*B7` = 19, spare C19 typed = 35.0; calcBOQ length same formula then +40 | C manual project value |
| 15 | Earthing cable: 1.1KV, Earthing wire, 25 sq.mm as  | r28 `=B20+C20`→98 | 68 | -30 | DIFFERENT | WB length B20 `=ROUNDUP(($B$5+1)*3.5+10,0)` = 28, spare C20 typed = 70.0; calcBOQ length same formula then +40 | C manual project value |
| 16 | Earthing Pit details: Earthing Pit Specification (DC Ear | r29 `=$B$21`→5 | 5 | +0 | MATCH | — | — |
| 17 | Lugs: Cu., Ring Type- 6 Sq.mm. (Panel to | r30 `=B22*2`→36 | 36 | +0 | MATCH | — | — |
| 18 | Lugs: Cu., pin Type- 6 Sq.mm. (Inverter  | r31 `=B7*2`→2 | 2 | +0 | MATCH | — | — |
| 19 | Lugs: LA earthing - Al , ring type 16 sq | r32 `=J29+1`→6 | 6 | +0 | MATCH | — | — |
| 20 | Lugs: Cu, Ring Type - 4 Sq.mm - Long Bar | r33 `=(B35*2)+(B37*2)`→12 | 10 | -2 | DIFFERENT | calcBOQ sets `B35 = B46<32 ? 1 : 2` (the workbook's DC-MCB-count formula, B43) and uses it as DC cable cores; workbook B35 is typed cores = 2 | F calcBOQ bug |
| 21 | Glands  (PVC Type ): 32mm for 1C X 6 sqmm (HEX) | r34 typed→0 | 0 | +0 | MATCH | — | — |
| 22 | Nut Bolt & Washer Set: 100mm X M10 (Anchor Bolt) | r35 `=J46*4`→80 | 2976 | +2896 | DIFFERENT | calcBOQ base plates = ceil(S53/6)*6*2 with its own S53; workbook base plates = legs x 2 from a hand-filled sub-table | F calcBOQ bug |
| 23 | Nut Bolt & Washer Set: M8 or M6 Hot Dip Galvanised - Inve | r36 `=B7*6`→6 | 6 | +0 | MATCH | — | — |
| — | Nut Bolt & Washer Set: M8 x 100 Hot Dip Galvanised for Pu | r37 typed→0 | not produced | — | MISSING IN calcBOQ | workbook-only line (M8x100 purlin bolt) | A formula |
| 31 | Eletrical Tape: R,Y,B,Black,G (Each) | r38 typed→6 | 6 | +0 | MATCH | — | — |
| 32 | Cable Ties: Nylon Cable Tie,-10 85 degree UV P | r39 typed→1 | 1 | +0 | MATCH | — | — |
| 27 | Conduits: PVC Flexible and Fixed Conduit - 2 | r40 `=ROUNDUP((J19+J28+J27)/3,0)*3`→234 | 156 | -78 | DIFFERENT | different terms: workbook DC + LA wire + inverter earthing (Aaryan: 4 terms, no x3); calcBOQ DC + structure earthing + inverter earthing; spare lengths also differ | A formula + C manual value |
| 28 | Conduits: Tee Bend 25 mm PVC | r41 `=roundup(J40/2,0)`→117 | 78 | -39 | DIFFERENT | follows conduit | A formula + C manual value |
| 29 | Cable Tag: 2C X 6 Sqmm, CU CABLE, INVERTER NO | r42 `=(B37+B35*2)+2`→10 | 8 | -2 | DIFFERENT | same cores bug as line 20 | F calcBOQ bug |
| 30 | Ferules: Pre Printed - 8mm - 1 To 2 STRING | r43 `=B32`→2 | 2 | +0 | MATCH | — | — |
| — | Structure: ISI standard 80 microns GI structu | r44 typed→48 | not produced | — | MISSING IN calcBOQ | workbook-only line (GI structure 80x40) | A formula |
| — | Structure: 40x40x2 (Purlin) | r45 `=J$14*1.2*3+4.5`→69.3 | not produced | — | MISSING IN calcBOQ | workbook-only line (Purlin 40x40) | A formula |
| — | Structure: Base plate | r46 `=R53*2`→20 | not produced | — | MISSING IN calcBOQ | workbook-only line (Base plate) | A formula |
| 33 | Structure: Ladder and Cross bracing | r47 typed→12 | 18 | +6 | DIFFERENT | workbook 'Ladder and Cross bracing' typed; calcBOQ fixed 18 | B template default |
| 34 | Structure: Walkway | r48 typed→0 | 5 | +5 | DIFFERENT | workbook walkway typed; calcBOQ fixed 5 | C manual project value |
| 35 | Structure: Over the shed Al structure | r49 typed→0 | 10.5 | +10.5 | DIFFERENT | workbook over-shed Al typed in kW (0 on raised sheets); calcBOQ always = B1 | A formula |
| 25 | U-Clamp: With Spring and SS- 304 Nut & Bolt | r50 typed→78 | 27 | -51 | DIFFERENT | workbook typed; calcBOQ ceil(panels x 1.5) | C manual project value |
| 26 | Z-Clamp: With Spring and SS- 304 Nut & Bolt | r51 typed→18 | 36 | +18 | DIFFERENT | workbook typed; calcBOQ panels x 2 | C manual project value |
| 38 | Cleaning System: Sprinkler | r52 typed→0 | 0 | +0 | MATCH | — | — |
| 24 | J-Bolt: M-8 SS-304 | r53 typed→0 | 0 | +0 | MATCH | — | — |
| 36 | Bird Spikes | not in sheet | 0 | — | NOT IN WORKBOOK | calcBOQ-only line | — |
| 37 | Parnali / Rainwater Channel | not in sheet | 0 | — | NOT IN WORKBOOK | calcBOQ-only line | — |

### 2.7 Ananda Residency - BOQ Solar Template.xlsx / sheet `4.2kW Non-raised Strucutre Sola`

| Input | Cell | Formula or typed | Value |
|---|---|---|---|
| Required Solar Capacity | B1 | typed | 4.2; C1 `=$B$3*$B$22/1000` = 4.2 (actual DC kW) |
| Panel Price/Wp | B2 | typed | 25.0 |
| Solar Module Size (W) | B3 | typed | 600.0 |
| System Connection Phase | B4 | typed | 3.0 |
| Building No. of Floors | B5 | typed | 4.0 |
| Inverter Installation Floor | B6 | typed | 4.0 |
| No. of Inverter | B7 | typed | 1.0 |
| Inverter Size | B8 | typed | 4 kW (brand C8 = 'Solis') |
| No. of Panel Rows | B9 | typed | 5.0 |
| Structure Height Lower (FT.) | B10 | typed | 7.0 |
| Structure Height Upper (FT.) | B11 | typed | 9.0 |
| 3.5ft GI Shed (sqft) | B12 | typed | 0.0 |
| Battery Size | B14 | typed | 0.0 |
| No. of Batteries | B15 | typed | 0.0 |
| No. of Earthing Pit | B21 | typed | 3.0 |
| No. of Solar Panels | B22 | `=ROUNDUP(($B$1*1000/$B$3),0)` | 7 |
| No. of Strings | B32 | typed | 1.0 |
| No. of rafters | B25 | typed | 18.0 |
| DC Cable Size (sqmm) | B36 | `=Sheet2!K24` | 1.5 |
| AC Cable Size (sqmm) | B38 | `=Sheet2!$F$45` | 6 |
| DC MCB Rating (Amp) | B42 | typed | 32.0 |
| AC MCB Rating (Amp) | B44 | typed | 64.0 |
| No. of AC MCB | B45 | typed | 2.0 |
| DC Cable Length (MTS.): spare | C16 | typed | 50.0 |
| AC Cable Length (MTS.): spare | C17 | typed | 30.0 |
| Earthing Cable Length for Structure (MTS.): spare | C18 | typed | 35.0 |
| Earthing Cable Length for Inverter (MTS.): spare | C19 | typed | 35.0 |
| LA Earthing Cable Length (MTS.): spare | C20 | typed | 70.0 |

Line by line (workbook cached Qty vs calcBOQ run with laType = ESE, since every workbook LA row specifies ESE):

| sr | Line (workbook rows) | Workbook qty (J formula → value) | calcBOQ qty | Diff (calc − WB) | Result | Reason | Class |
|---|---|---|---|---|---|---|---|
| 1 | Solar module: 540 Wp Mono Perc DCR | r14 `=$B$22`→7 | 7 | +0 | MATCH | — | — |
| 2 | Solar inverter: 15 kW (2 MPPT, 4 String, 13 Panel* | r15 `=B7`→1 | 1 | +0 | MATCH | — | — |
| 3 | Data logger: Ethernet/Wifi/GPRS | r16 typed→1 | 0 | -1 | DIFFERENT | workbook typed per sheet; calcBOQ fixed 0 | B template default |
| 4 | Battery: =B14 | r17 `=B15`→0 | 0 | +0 | MATCH | — | — |
| 5 | DC Distribution Box: Technical Specs of DC Distribution | r18 typed→1 | 1 | +0 | MATCH | — | — |
| 8 | DC Cable: 2 C. 4 sq.mm , Annealed Tinned Fle | r19 `=B16+C16`→64 | 29 | -35 | DIFFERENT | WB length B16 `=ROUNDUP(($B$23*1.2)+($B$9*2.3),0)*B32` = 14, spare C16 typed = 50.0; calcBOQ length B16 x inverters then +15 | A formula + C manual value |
| 9 | MC4 Connectors: 4 sq.mm, 1000 V DC, IP68, Applicat | r20 `=B33`→4 | 4 | +0 | MATCH | — | — |
| 6 | AC Distribution Box (Solar LT Panel): Technical Specs of AC Distribution | r21 typed→1 | 1 | +0 | MATCH | — | — |
| 7 | MCB at Client's LT Panel: Technical Specs :-  - 1 Nos. of  3 | r22 typed→1 | 1 | +0 | MATCH | — | — |
| 10 | AC Cable: 1.1 kV ,Al. Conductor XLPE - 1R X  | r23 `=B17+C17`→48 | 58 | +10 | DIFFERENT | WB length B17 `=ROUNDUP(($B$6+1)*3.5,0)*B7` = 18, spare C17 typed = 30.0; calcBOQ length same formula then +40 | C manual project value |
| 11 | AC Cable (Inverter to ACDB): 1R x 4C x 6Sqmm Flexible  | r24 typed→10 | 5 | -5 | DIFFERENT | workbook `5*J15` / `10*J15` / typed; calcBOQ `5*B7` | A formula |
| 12 | LA With Mounting Accessories: ESE Type - 25 sq.mm - Suitable for | r25 typed→3 | 1 | -2 | DIFFERENT | LA count typed in workbook; calcBOQ 1 | C manual project value |
| 13 | Earthing cable: 1.1KV, Flexible Copper Conducter F | r26 `=B18+C18`→61 | 66 | +5 | DIFFERENT | WB length B18 `=ROUNDUP(($B$5+2)*3.5+5,0)*B7` = 26, spare C18 typed = 35.0; calcBOQ length same formula then +40 | C manual project value |
| 14 | Earthing cable: 1.1KV, Flexible Copper Conducter F | r27 `=B19+C19`→54 | 59 | +5 | DIFFERENT | WB length B19 `=ROUNDUP($B$6*3.5+5,0)*B7` = 19, spare C19 typed = 35.0; calcBOQ length same formula then +40 | C manual project value |
| 15 | Earthing cable: 1.1KV, Earthing wire, 25 sq.mm as  | r28 `=B20+C20`→98 | 68 | -30 | DIFFERENT | WB length B20 `=ROUNDUP(($B$5+1)*3.5+10,0)` = 28, spare C20 typed = 70.0; calcBOQ length same formula then +40 | C manual project value |
| 16 | Earthing Pit details: Earthing Pit Specification (DC Ear | r29 `=$B$21`→3 | 5 | +2 | DIFFERENT | workbook pits typed (B21); calcBOQ rule 2 x inv + 1, +2 for ESE | C manual project value |
| 17 | Lugs: Cu., Ring Type- 6 Sq.mm. (Panel to | r30 `=B22*2`→14 | 14 | +0 | MATCH | — | — |
| 18 | Lugs: Cu., pin Type- 6 Sq.mm. (Inverter  | r31 `=B7*2`→2 | 2 | +0 | MATCH | — | — |
| 19 | Lugs: LA earthing - Al , ring type 16 sq | r32 `=J29+1`→4 | 6 | +2 | DIFFERENT | same formula pits + 1; differs only through pits | C manual project value |
| 20 | Lugs: Cu, Ring Type - 4 Sq.mm - Long Bar | r33 `=(B35*2)+(B37*2)`→12 | 10 | -2 | DIFFERENT | calcBOQ sets `B35 = B46<32 ? 1 : 2` (the workbook's DC-MCB-count formula, B43) and uses it as DC cable cores; workbook B35 is typed cores = 2 | F calcBOQ bug |
| 21 | Glands  (PVC Type ): 32mm for 1C X 6 sqmm (HEX) | r34 typed→0 | 0 | +0 | MATCH | — | — |
| 22 | Nut Bolt & Washer Set: 100mm X M10 (Anchor Bolt) | r35 `=J46*4`→48 | 2640 | +2592 | DIFFERENT | calcBOQ base plates = ceil(S53/6)*6*2 with its own S53; workbook base plates = legs x 2 from a hand-filled sub-table | F calcBOQ bug |
| 23 | Nut Bolt & Washer Set: M8 or M6 Hot Dip Galvanised - Inve | r36 `=B7*6`→6 | 6 | +0 | MATCH | — | — |
| — | Nut Bolt & Washer Set: M8 x 100 Hot Dip Galvanised for Pu | r37 typed→0 | not produced | — | MISSING IN calcBOQ | workbook-only line (M8x100 purlin bolt) | A formula |
| 31 | Eletrical Tape: R,Y,B,Black,G (Each) | r38 typed→6 | 6 | +0 | MATCH | — | — |
| 32 | Cable Ties: Nylon Cable Tie,-10 85 degree UV P | r39 typed→1 | 1 | +0 | MATCH | — | — |
| 27 | Conduits: PVC Flexible and Fixed Conduit - 2 | r40 `=ROUNDUP((J19+J28+J27)/3,0)*3`→216 | 156 | -60 | DIFFERENT | different terms: workbook DC + LA wire + inverter earthing (Aaryan: 4 terms, no x3); calcBOQ DC + structure earthing + inverter earthing; spare lengths also differ | A formula + C manual value |
| 28 | Conduits: Tee Bend 25 mm PVC | r41 `=roundup(J40/2,0)`→108 | 78 | -30 | DIFFERENT | follows conduit | A formula + C manual value |
| 29 | Cable Tag: 2C X 6 Sqmm, CU CABLE, INVERTER NO | r42 `=(B37+B35*2)+2`→10 | 8 | -2 | DIFFERENT | same cores bug as line 20 | F calcBOQ bug |
| 30 | Ferules: Pre Printed - 8mm - 1 To 2 STRING | r43 `=B32`→1 | 1 | +0 | MATCH | — | — |
| — | Structure: ISI standard 80 microns GI structu | r44 typed→42 | not produced | — | MISSING IN calcBOQ | workbook-only line (GI structure 80x40) | A formula |
| — | Structure: 40x40x2 (Purlin) | r45 `=J$14*1.2*3+4.5`→29.7 | not produced | — | MISSING IN calcBOQ | workbook-only line (Purlin 40x40) | A formula |
| — | Structure: Base plate | r46 `=R53*2`→12 | not produced | — | MISSING IN calcBOQ | workbook-only line (Base plate) | A formula |
| 33 | Structure: Ladder and Cross bracing | r47 typed→6 | 18 | +12 | DIFFERENT | workbook 'Ladder and Cross bracing' typed; calcBOQ fixed 18 | B template default |
| 34 | Structure: Walkway | r48 typed→0 | 5 | +5 | DIFFERENT | workbook walkway typed; calcBOQ fixed 5 | C manual project value |
| 35 | Structure: Over the shed Al structure | r49 typed→0 | 4.2 | +4.2 | DIFFERENT | workbook over-shed Al typed in kW (0 on raised sheets); calcBOQ always = B1 | A formula |
| 25 | U-Clamp: With Spring and SS- 304 Nut & Bolt | r50 typed→78 | 11 | -67 | DIFFERENT | workbook typed; calcBOQ ceil(panels x 1.5) | C manual project value |
| 26 | Z-Clamp: With Spring and SS- 304 Nut & Bolt | r51 typed→18 | 14 | -4 | DIFFERENT | workbook typed; calcBOQ panels x 2 | C manual project value |
| 38 | Cleaning System: Sprinkler | r52 typed→0 | 0 | +0 | MATCH | — | — |
| 24 | J-Bolt: M-8 SS-304 | r53 typed→0 | 0 | +0 | MATCH | — | — |
| 36 | Bird Spikes | not in sheet | 0 | — | NOT IN WORKBOOK | calcBOQ-only line | — |
| 37 | Parnali / Rainwater Channel | not in sheet | 0 | — | NOT IN WORKBOOK | calcBOQ-only line | — |

### 2.8 Ashwini Patil - BOQ Solar Template.xlsx / sheet `3 kW Raised Structure Solar BOQ`

| Input | Cell | Formula or typed | Value |
|---|---|---|---|
| Required Solar Capacity | B1 | typed | 3.0; C1 `=$B$3*$B$22/1000` = 3 (actual DC kW) |
| Panel Price/Wp | B2 | typed | 25.0 |
| Solar Module Size (W) | B3 | typed | 600.0 |
| System Connection Phase | B4 | typed | 1.0 |
| Building No. of Floors | B5 | typed | 2.0 |
| Inverter Installation Floor | B6 | typed | 2.0 |
| No. of Inverter | B7 | typed | 1.0 |
| Inverter Size | B8 | typed | 3 kW (brand C8 = 'Solis') |
| No. of Panel Rows | B9 | typed | 2.0 |
| Structure Height Lower (FT.) | B10 | typed | 7.0 |
| Structure Height Upper (FT.) | B11 | typed | 9.0 |
| 3.5ft GI Shed (sqft) | B12 | typed | 0.0 |
| Battery Size | B14 | typed | 0.0 |
| No. of Batteries | B15 | typed | 0.0 |
| No. of Earthing Pit | B21 | typed | 3.0 |
| No. of Solar Panels | B22 | `=ROUNDUP(($B$1*1000/$B$3),0)` | 5 |
| No. of Strings | B32 | typed | 1.0 |
| No. of rafters | B25 | typed | 18.0 |
| DC Cable Size (sqmm) | B36 | `=Sheet2!K24` | 1.5 |
| AC Cable Size (sqmm) | B38 | `=Sheet2!$F$45` | 4 |
| DC MCB Rating (Amp) | B42 | typed | 32.0 |
| AC MCB Rating (Amp) | B44 | typed | 64.0 |
| No. of AC MCB | B45 | typed | 2.0 |
| DC Cable Length (MTS.): spare | C16 | typed | 10.0 |
| AC Cable Length (MTS.): spare | C17 | typed | 10.0 |
| Earthing Cable Length for Structure (MTS.): spare | C18 | typed | 5.0 |
| Earthing Cable Length for Inverter (MTS.): spare | C19 | typed | 10.0 |
| LA Earthing Cable Length (MTS.): spare | C20 | typed | 5.0 |

Line by line (workbook cached Qty vs calcBOQ run with laType = ESE, since every workbook LA row specifies ESE):

| sr | Line (workbook rows) | Workbook qty (J formula → value) | calcBOQ qty | Diff (calc − WB) | Result | Reason | Class |
|---|---|---|---|---|---|---|---|
| 1 | Solar module: 600 Wp Mono Perc DCR | r14 `=$B$22`→5 | 5 | +0 | MATCH | — | — |
| 2 | Solar inverter: 3 kW (2 MPPT, 4 String, 13 Panel*1 | r15 `=B7`→1 | 1 | +0 | MATCH | — | — |
| 3 | Data logger: Ethernet/Wifi/GPRS | r16 typed→0 | 0 | +0 | MATCH | — | — |
| 4 | Battery: =B14 | r17 `=B15`→0 | 0 | +0 | MATCH | — | — |
| 5 | DC Distribution Box: Technical Specs of DC Distribution | r18 `=B7`→1 | 1 | +0 | MATCH | — | — |
| 8 | DC Cable: 2 C. 4 sq.mm , Annealed Tinned Fle | r19 `=B16+C16`→18 | 23 | +5 | DIFFERENT | WB length B16 `=ROUNDUP(($B$23*1.2)+($B$9*2.3),0)*B32` = 8, spare C16 typed = 10.0; calcBOQ length B16 x inverters then +15 | A formula + C manual value |
| 9 | MC4 Connectors: 4 sq.mm, 1000 V DC, IP68, Applicat | r20 `=B33`→4 | 4 | +0 | MATCH | — | — |
| 6 | AC Distribution Box (Solar LT Panel): Technical Specs of AC Distribution | r21 `=B7`→1 | 1 | +0 | MATCH | — | — |
| 7 | MCB at Client's LT Panel: Technical Specs :-  - 1 Nos. of  2 | r22 typed→1 | 1 | +0 | MATCH | — | — |
| 10 | AC Cable: 1.1 kV ,Al. Conductor XLPE - 1R X  | r23 `=B17+C17`→21 | 51 | +30 | DIFFERENT | WB length B17 `=ROUNDUP(($B$6+1)*3.5,0)*B7` = 11, spare C17 typed = 10.0; calcBOQ length same formula then +40 | C manual project value |
| 11 | AC Cable (Inverter to ACDB): 1R x 3C x 4Sqmm Cu. Flexible  | r24 `=5*J15`→5 | 5 | +0 | MATCH | — | — |
| 12 | LA With Mounting Accessories: ESE Type - 25 sq.mm - Suitable for | r25 typed→1 | 1 | +0 | MATCH | — | — |
| 13 | Earthing cable: 1.1KV, Flexible Copper Conducter F | r26 `=B18+C18`→24 | 59 | +35 | DIFFERENT | WB length B18 `=ROUNDUP(($B$5+2)*3.5+5,0)*B7` = 19, spare C18 typed = 5.0; calcBOQ length same formula then +40 | C manual project value |
| 14 | Earthing cable: 1.1KV, Flexible Copper Conducter F | r27 `=B19+C19`→22 | 52 | +30 | DIFFERENT | WB length B19 `=ROUNDUP($B$6*3.5+5,0)*B7` = 12, spare C19 typed = 10.0; calcBOQ length same formula then +40 | C manual project value |
| 15 | Earthing cable: 1.1KV, Earthing wire, 25 sq.mm as  | r28 `=B20+C20`→26 | 61 | +35 | DIFFERENT | WB length B20 `=ROUNDUP(($B$5+1)*3.5+10,0)` = 21, spare C20 typed = 5.0; calcBOQ length same formula then +40 | C manual project value |
| 16 | Earthing Pit details: Earthing Pit Specification (DC Ear | r29 `=$B$21`→3 | 5 | +2 | DIFFERENT | workbook pits typed (B21); calcBOQ rule 2 x inv + 1, +2 for ESE | C manual project value |
| 17 | Lugs: Cu., Ring Type- 6 Sq.mm. (Panel to | r30 `=B22*2`→10 | 10 | +0 | MATCH | — | — |
| 18 | Lugs: Cu., pin Type- 6 Sq.mm. (Inverter  | r31 `=B7*2`→2 | 2 | +0 | MATCH | — | — |
| 19 | Lugs: LA earthing - Al , ring type 16 sq | r32 `=J29+1`→4 | 6 | +2 | DIFFERENT | same formula pits + 1; differs only through pits | C manual project value |
| 20 | Lugs: Cu, Ring Type - 4 Sq.mm - Long Bar | r33 `=(B35*2)+(B37*2)`→8 | 6 | -2 | DIFFERENT | calcBOQ sets `B35 = B46<32 ? 1 : 2` (the workbook's DC-MCB-count formula, B43) and uses it as DC cable cores; workbook B35 is typed cores = 2 | F calcBOQ bug |
| 21 | Glands  (PVC Type ): 32mm for 1C X 6 sqmm (HEX) | r34 typed→0 | 0 | +0 | MATCH | — | — |
| 22 | Nut Bolt & Washer Set: 100mm X M10 (Anchor Bolt) | r35 `=J46*4`→32 | 1536 | +1504 | DIFFERENT | calcBOQ base plates = ceil(S53/6)*6*2 with its own S53; workbook base plates = legs x 2 from a hand-filled sub-table | F calcBOQ bug |
| 23 | Nut Bolt & Washer Set: M8 or M6 Hot Dip Galvanised - Inve | r36 `=B7*6`→6 | 6 | +0 | MATCH | — | — |
| — | Nut Bolt & Washer Set: M8 x 100 Hot Dip Galvanised for Pu | r37 typed→0 | not produced | — | MISSING IN calcBOQ | workbook-only line (M8x100 purlin bolt) | A formula |
| 31 | Eletrical Tape: R,Y,B,Black,G (Each) | r38 typed→6 | 6 | +0 | MATCH | — | — |
| 32 | Cable Ties: Nylon Cable Tie,-10 85 degree UV P | r39 typed→1 | 1 | +0 | MATCH | — | — |
| 27 | Conduits: PVC Flexible and Fixed Conduit - 2 | r40 `=ROUNDUP((J19+J28+J27)/3,0)*3`→66 | 135 | +69 | DIFFERENT | different terms: workbook DC + LA wire + inverter earthing (Aaryan: 4 terms, no x3); calcBOQ DC + structure earthing + inverter earthing; spare lengths also differ | A formula + C manual value |
| 28 | Conduits: Tee Bend 25 mm PVC | r41 `=roundup(J40/2,0)`→33 | 68 | +35 | DIFFERENT | follows conduit | A formula + C manual value |
| 29 | Cable Tag: 2C X 6 Sqmm, CU CABLE, INVERTER NO | r42 `=(B37+B35*2)+2`→8 | 6 | -2 | DIFFERENT | same cores bug as line 20 | F calcBOQ bug |
| 30 | Ferules: Pre Printed - 8mm - 1 To 2 STRING | r43 `=B32`→1 | 1 | +0 | MATCH | — | — |
| — | Structure: ISI standard 80 microns GI structu | r44 `=roundup(S53/6,0)*6`→24 | not produced | — | MISSING IN calcBOQ | workbook-only line (GI structure 80x40) | A formula |
| — | Structure: 40x40x2 (Purlin) | r45 `=J$14*1.2*3+3.6`→21.6 | not produced | — | MISSING IN calcBOQ | workbook-only line (Purlin 40x40) | A formula |
| — | Structure: Base plate | r46 `=R53*2`→8 | not produced | — | MISSING IN calcBOQ | workbook-only line (Base plate) | A formula |
| 33 | Structure: Ladder and Cross bracing | r47 typed→12 | 18 | +6 | DIFFERENT | workbook 'Ladder and Cross bracing' typed; calcBOQ fixed 18 | B template default |
| 34 | Structure: Walkway | r48 typed→3.6 | 5 | +1.4 | DIFFERENT | workbook walkway typed; calcBOQ fixed 5 | C manual project value |
| 35 | Structure: Over the shed Al structure | r49 typed→0 | 3 | +3 | DIFFERENT | workbook over-shed Al typed in kW (0 on raised sheets); calcBOQ always = B1 | A formula |
| 25 | U-Clamp: With Spring and SS- 304 Nut & Bolt | r50 typed→9 | 8 | -1 | DIFFERENT | workbook typed; calcBOQ ceil(panels x 1.5) | C manual project value |
| 26 | Z-Clamp: With Spring and SS- 304 Nut & Bolt | r51 typed→12 | 10 | -2 | DIFFERENT | workbook typed; calcBOQ panels x 2 | C manual project value |
| 38 | Cleaning System: Sprinkler | r52 typed→0 | 0 | +0 | MATCH | — | — |
| 24 | J-Bolt: M-8 SS-304 | r53 typed→0 | 0 | +0 | MATCH | — | — |
| 36 | Bird Spikes | not in sheet | 0 | — | NOT IN WORKBOOK | calcBOQ-only line | — |
| 37 | Parnali / Rainwater Channel | not in sheet | 0 | — | NOT IN WORKBOOK | calcBOQ-only line | — |

### 2.9 Ashwini Patil - BOQ Solar Template.xlsx / sheet `4.8 kW Raised Structure Solar B`

| Input | Cell | Formula or typed | Value |
|---|---|---|---|
| Required Solar Capacity | B1 | typed | 4.8; C1 `=$B$3*$B$22/1000` = 4.8 (actual DC kW) |
| Panel Price/Wp | B2 | typed | 25.0 |
| Solar Module Size (W) | B3 | typed | 600.0 |
| System Connection Phase | B4 | typed | 1.0 |
| Building No. of Floors | B5 | typed | 2.0 |
| Inverter Installation Floor | B6 | typed | 2.0 |
| No. of Inverter | B7 | typed | 1.0 |
| Inverter Size | B8 | typed | 5 kW (brand C8 = 'Solis') |
| No. of Panel Rows | B9 | typed | 2.0 |
| Structure Height Lower (FT.) | B10 | typed | 7.0 |
| Structure Height Upper (FT.) | B11 | typed | 9.0 |
| 3.5ft GI Shed (sqft) | B12 | typed | 0.0 |
| Battery Size | B14 | typed | 0.0 |
| No. of Batteries | B15 | typed | 0.0 |
| No. of Earthing Pit | B21 | typed | 3.0 |
| No. of Solar Panels | B22 | `=ROUNDUP(($B$1*1000/$B$3),0)` | 8 |
| No. of Strings | B32 | typed | 1.0 |
| No. of rafters | B25 | typed | 18.0 |
| DC Cable Size (sqmm) | B36 | `=Sheet2!K24` | 1.5 |
| AC Cable Size (sqmm) | B38 | `=Sheet2!$F$45` | 4 |
| DC MCB Rating (Amp) | B42 | typed | 32.0 |
| AC MCB Rating (Amp) | B44 | typed | 64.0 |
| No. of AC MCB | B45 | typed | 2.0 |
| DC Cable Length (MTS.): spare | C16 | typed | 10.0 |
| AC Cable Length (MTS.): spare | C17 | typed | 10.0 |
| Earthing Cable Length for Structure (MTS.): spare | C18 | typed | 5.0 |
| Earthing Cable Length for Inverter (MTS.): spare | C19 | typed | 10.0 |
| LA Earthing Cable Length (MTS.): spare | C20 | typed | 5.0 |

Line by line (workbook cached Qty vs calcBOQ run with laType = ESE, since every workbook LA row specifies ESE):

| sr | Line (workbook rows) | Workbook qty (J formula → value) | calcBOQ qty | Diff (calc − WB) | Result | Reason | Class |
|---|---|---|---|---|---|---|---|
| 1 | Solar module: 600 Wp Mono Perc DCR | r14 `=$B$22`→8 | 8 | +0 | MATCH | — | — |
| 2 | Solar inverter: 5 kW (2 MPPT, 4 String, 13 Panel*1 | r15 `=B7`→1 | 1 | +0 | MATCH | — | — |
| 3 | Data logger: Ethernet/Wifi/GPRS | r16 typed→0 | 0 | +0 | MATCH | — | — |
| 4 | Battery: =B14 | r17 `=B15`→0 | 0 | +0 | MATCH | — | — |
| 5 | DC Distribution Box: Technical Specs of DC Distribution | r18 `=B7`→1 | 1 | +0 | MATCH | — | — |
| 8 | DC Cable: 2 C. 4 sq.mm , Annealed Tinned Fle | r19 `=B16+C16`→20 | 25 | +5 | DIFFERENT | WB length B16 `=ROUNDUP(($B$23*1.2)+($B$9*2.3),0)*B32` = 10, spare C16 typed = 10.0; calcBOQ length B16 x inverters then +15 | A formula + C manual value |
| 9 | MC4 Connectors: 4 sq.mm, 1000 V DC, IP68, Applicat | r20 `=B33`→4 | 4 | +0 | MATCH | — | — |
| 6 | AC Distribution Box (Solar LT Panel): Technical Specs of AC Distribution | r21 `=B7`→1 | 1 | +0 | MATCH | — | — |
| 7 | MCB at Client's LT Panel: Technical Specs :-  - 1 Nos. of  2 | r22 typed→1 | 1 | +0 | MATCH | — | — |
| 10 | AC Cable: 1.1 kV ,Al. Conductor XLPE - 1R X  | r23 `=B17+C17`→21 | 51 | +30 | DIFFERENT | WB length B17 `=ROUNDUP(($B$6+1)*3.5,0)*B7` = 11, spare C17 typed = 10.0; calcBOQ length same formula then +40 | C manual project value |
| 11 | AC Cable (Inverter to ACDB): 1R x 3C x 4Sqmm Cu. Flexible  | r24 `=5*J15`→5 | 5 | +0 | MATCH | — | — |
| 12 | LA With Mounting Accessories: ESE Type - 25 sq.mm - Suitable for | r25 typed→1 | 1 | +0 | MATCH | — | — |
| 13 | Earthing cable: 1.1KV, Flexible Copper Conducter F | r26 `=B18+C18`→24 | 59 | +35 | DIFFERENT | WB length B18 `=ROUNDUP(($B$5+2)*3.5+5,0)*B7` = 19, spare C18 typed = 5.0; calcBOQ length same formula then +40 | C manual project value |
| 14 | Earthing cable: 1.1KV, Flexible Copper Conducter F | r27 `=B19+C19`→22 | 52 | +30 | DIFFERENT | WB length B19 `=ROUNDUP($B$6*3.5+5,0)*B7` = 12, spare C19 typed = 10.0; calcBOQ length same formula then +40 | C manual project value |
| 15 | Earthing cable: 1.1KV, Earthing wire, 25 sq.mm as  | r28 `=B20+C20`→26 | 61 | +35 | DIFFERENT | WB length B20 `=ROUNDUP(($B$5+1)*3.5+10,0)` = 21, spare C20 typed = 5.0; calcBOQ length same formula then +40 | C manual project value |
| 16 | Earthing Pit details: Earthing Pit Specification (DC Ear | r29 `=$B$21`→3 | 5 | +2 | DIFFERENT | workbook pits typed (B21); calcBOQ rule 2 x inv + 1, +2 for ESE | C manual project value |
| 17 | Lugs: Cu., Ring Type- 6 Sq.mm. (Panel to | r30 `=B22*2`→16 | 16 | +0 | MATCH | — | — |
| 18 | Lugs: Cu., pin Type- 6 Sq.mm. (Inverter  | r31 `=B7*2`→2 | 2 | +0 | MATCH | — | — |
| 19 | Lugs: LA earthing - Al , ring type 16 sq | r32 `=J29+1`→4 | 6 | +2 | DIFFERENT | same formula pits + 1; differs only through pits | C manual project value |
| 20 | Lugs: Cu, Ring Type - 4 Sq.mm - Long Bar | r33 `=(B35*2)+(B37*2)`→8 | 6 | -2 | DIFFERENT | calcBOQ sets `B35 = B46<32 ? 1 : 2` (the workbook's DC-MCB-count formula, B43) and uses it as DC cable cores; workbook B35 is typed cores = 2 | F calcBOQ bug |
| 21 | Glands  (PVC Type ): 32mm for 1C X 6 sqmm (HEX) | r34 typed→0 | 0 | +0 | MATCH | — | — |
| 22 | Nut Bolt & Washer Set: 100mm X M10 (Anchor Bolt) | r35 `=J46*4`→48 | 1632 | +1584 | DIFFERENT | calcBOQ base plates = ceil(S53/6)*6*2 with its own S53; workbook base plates = legs x 2 from a hand-filled sub-table | F calcBOQ bug |
| 23 | Nut Bolt & Washer Set: M8 or M6 Hot Dip Galvanised - Inve | r36 `=B7*6`→6 | 6 | +0 | MATCH | — | — |
| — | Nut Bolt & Washer Set: M8 x 100 Hot Dip Galvanised for Pu | r37 typed→0 | not produced | — | MISSING IN calcBOQ | workbook-only line (M8x100 purlin bolt) | A formula |
| 31 | Eletrical Tape: R,Y,B,Black,G (Each) | r38 typed→6 | 6 | +0 | MATCH | — | — |
| 32 | Cable Ties: Nylon Cable Tie,-10 85 degree UV P | r39 typed→1 | 1 | +0 | MATCH | — | — |
| 27 | Conduits: PVC Flexible and Fixed Conduit - 2 | r40 `=ROUNDUP((J19+J28+J27)/3,0)*3`→69 | 138 | +69 | DIFFERENT | different terms: workbook DC + LA wire + inverter earthing (Aaryan: 4 terms, no x3); calcBOQ DC + structure earthing + inverter earthing; spare lengths also differ | A formula + C manual value |
| 28 | Conduits: Tee Bend 25 mm PVC | r41 `=roundup(J40/2,0)`→35 | 69 | +34 | DIFFERENT | follows conduit | A formula + C manual value |
| 29 | Cable Tag: 2C X 6 Sqmm, CU CABLE, INVERTER NO | r42 `=(B37+B35*2)+2`→8 | 6 | -2 | DIFFERENT | same cores bug as line 20 | F calcBOQ bug |
| 30 | Ferules: Pre Printed - 8mm - 1 To 2 STRING | r43 `=B32`→1 | 1 | +0 | MATCH | — | — |
| — | Structure: ISI standard 80 microns GI structu | r44 `=roundup(S53/6,0)*6`→36 | not produced | — | MISSING IN calcBOQ | workbook-only line (GI structure 80x40) | A formula |
| — | Structure: 40x40x2 (Purlin) | r45 `=J$14*1.2*3+3.6`→32.4 | not produced | — | MISSING IN calcBOQ | workbook-only line (Purlin 40x40) | A formula |
| — | Structure: Base plate | r46 `=R53*2`→12 | not produced | — | MISSING IN calcBOQ | workbook-only line (Base plate) | A formula |
| 33 | Structure: Ladder and Cross bracing | r47 typed→12 | 18 | +6 | DIFFERENT | workbook 'Ladder and Cross bracing' typed; calcBOQ fixed 18 | B template default |
| 34 | Structure: Walkway | r48 typed→4.5 | 5 | +0.5 | DIFFERENT | workbook walkway typed; calcBOQ fixed 5 | C manual project value |
| 35 | Structure: Over the shed Al structure | r49 typed→0 | 4.8 | +4.8 | DIFFERENT | workbook over-shed Al typed in kW (0 on raised sheets); calcBOQ always = B1 | A formula |
| 25 | U-Clamp: With Spring and SS- 304 Nut & Bolt | r50 typed→18 | 12 | -6 | DIFFERENT | workbook typed; calcBOQ ceil(panels x 1.5) | C manual project value |
| 26 | Z-Clamp: With Spring and SS- 304 Nut & Bolt | r51 typed→12 | 16 | +4 | DIFFERENT | workbook typed; calcBOQ panels x 2 | C manual project value |
| 38 | Cleaning System: Sprinkler | r52 typed→0 | 0 | +0 | MATCH | — | — |
| 24 | J-Bolt: M-8 SS-304 | r53 typed→0 | 0 | +0 | MATCH | — | — |
| 36 | Bird Spikes | not in sheet | 0 | — | NOT IN WORKBOOK | calcBOQ-only line | — |
| 37 | Parnali / Rainwater Channel | not in sheet | 0 | — | NOT IN WORKBOOK | calcBOQ-only line | — |

### 2.10 Celebration Country Aqua Blue - BOQ Solar Template.xlsx / sheet `25 kW Non-Raised Structure Sola`

| Input | Cell | Formula or typed | Value |
|---|---|---|---|
| Required Solar Capacity | B1 | typed | 25.0; C1 `=$B$3*$B$22/1000` = 25.2 (actual DC kW) |
| Panel Price/Wp | B2 | typed | 15.0 |
| Solar Module Size (W) | B3 | typed | 600.0 |
| System Connection Phase | B4 | typed | 3.0 |
| Building No. of Floors | B5 | typed | 12.0 |
| Inverter Installation Floor | B6 | typed | 12.0 |
| No. of Inverter | B7 | typed | 1.0 |
| Inverter Size | B8 | typed | 25 kW (brand C8 = 'Solis') |
| No. of Panel Rows | B9 | typed | 2.0 |
| Structure Height Lower (FT.) | B10 | typed | 7.0 |
| Structure Height Upper (FT.) | B11 | typed | 9.0 |
| 3.5ft GI Shed (sqft) | B12 | typed | 0.0 |
| Battery Size | B14 | typed | 0.0 |
| No. of Batteries | B15 | typed | 0.0 |
| No. of Earthing Pit | B21 | typed | 5.0 |
| No. of Solar Panels | B22 | `=ROUNDUP(($B$1*1000/$B$3),0)` | 42 |
| No. of Strings | B32 | typed | 3.0 |
| No. of rafters | B25 | typed | 18.0 |
| DC Cable Size (sqmm) | B36 | `=Sheet2!K24` | 1.5 |
| AC Cable Size (sqmm) | B38 | `=Sheet2!$F$45` | 10 |
| DC MCB Rating (Amp) | B42 | typed | 32.0 |
| AC MCB Rating (Amp) | B44 | typed | 64.0 |
| No. of AC MCB | B45 | typed | 2.0 |
| DC Cable Length (MTS.): spare | C16 | typed | 40.0 |
| AC Cable Length (MTS.): spare | C17 | typed | 30.0 |
| Earthing Cable Length for Structure (MTS.): spare | C18 | typed | 30.0 |
| Earthing Cable Length for Inverter (MTS.): spare | C19 | typed | 30.0 |
| LA Earthing Cable Length (MTS.): spare | C20 | typed | 20.0 |

Line by line (workbook cached Qty vs calcBOQ run with laType = ESE, since every workbook LA row specifies ESE):

| sr | Line (workbook rows) | Workbook qty (J formula → value) | calcBOQ qty | Diff (calc − WB) | Result | Reason | Class |
|---|---|---|---|---|---|---|---|
| 1 | Solar module: 600 Wp Mono Perc Non-DCR | r14 `=$B$22`→42 | 42 | +0 | MATCH | — | — |
| 2 | Solar inverter: 25 kW (2 MPPT, 4 String, 13 Panel* | r15 `=B7`→1 | 1 | +0 | MATCH | — | — |
| 3 | Data logger: Ethernet/Wifi/GPRS | r16 typed→0 | 0 | +0 | MATCH | — | — |
| 4 | Battery: =B14 | r17 `=B15`→0 | 0 | +0 | MATCH | — | — |
| 5 | DC Distribution Box: Technical Specs of DC Distribution | r18 `=B7`→1 | 1 | +0 | MATCH | — | — |
| 8 | DC Cable: 2 C. 4 sq.mm , Annealed Tinned Fle | r19 `=B16+C16`→130 | 45 | -85 | DIFFERENT | WB length B16 `=ROUNDUP(($B$23*1.2)+($B$9*2.3),0)*B32` = 90, spare C16 typed = 40.0; calcBOQ length B16 x inverters then +15 | A formula + C manual value |
| 9 | MC4 Connectors: 4 sq.mm, 1000 V DC, IP68, Applicat | r20 `=B33`→12 | 12 | +0 | MATCH | — | — |
| 6 | AC Distribution Box (Solar LT Panel): Technical Specs of AC Distribution | r21 `=B7`→1 | 1 | +0 | MATCH | — | — |
| 7 | MCB at Client's LT Panel: Technical Specs :-  - 1 Nos. of  6 | r22 typed→1 | 1 | +0 | MATCH | — | — |
| 10 | AC Cable: 1.1 kV ,Al. Conductor XLPE - 1R X  | r23 `=B17+C17`→76 | 86 | +10 | DIFFERENT | WB length B17 `=ROUNDUP(($B$6+1)*3.5,0)*B7` = 46, spare C17 typed = 30.0; calcBOQ length same formula then +40 | C manual project value |
| 11 | AC Cable (Inverter to ACDB): 1R x 3.5C x 25Sqmm Cu. Flexible  | r24 `=5*J15`→5 | 5 | +0 | MATCH | — | — |
| 12 | LA With Mounting Accessories: ESE Type - 25 sq.mm - Suitable for | r25 typed→1 | 1 | +0 | MATCH | — | — |
| 13 | Earthing cable: 1.1KV, Flexible Copper Conducter F | r26 `=B18+C18`→84 | 94 | +10 | DIFFERENT | WB length B18 `=ROUNDUP(($B$5+2)*3.5+5,0)*B7` = 54, spare C18 typed = 30.0; calcBOQ length same formula then +40 | C manual project value |
| 14 | Earthing cable: 1.1KV, Flexible Copper Conducter F | r27 `=B19+C19`→77 | 87 | +10 | DIFFERENT | WB length B19 `=ROUNDUP($B$6*3.5+5,0)*B7` = 47, spare C19 typed = 30.0; calcBOQ length same formula then +40 | C manual project value |
| 15 | Earthing cable: 1.1KV, Earthing wire, 25 sq.mm as  | r28 `=B20+C20`→76 | 96 | +20 | DIFFERENT | WB length B20 `=ROUNDUP(($B$5+1)*3.5+10,0)` = 56, spare C20 typed = 20.0; calcBOQ length same formula then +40 | C manual project value |
| 16 | Earthing Pit details: Earthing Pit Specification (DC Ear | r29 `=$B$21`→5 | 5 | +0 | MATCH | — | — |
| 17 | Lugs: Cu., Ring Type- 6 Sq.mm. (Panel to | r30 `=B22*2`→84 | 84 | +0 | MATCH | — | — |
| 18 | Lugs: Cu., pin Type- 6 Sq.mm. (Inverter  | r31 `=B7*2`→2 | 2 | +0 | MATCH | — | — |
| 19 | Lugs: LA earthing - Al , ring type 16 sq | r32 `=J29+1`→6 | 6 | +0 | MATCH | — | — |
| 20 | Lugs: Cu, Ring Type - 4 Sq.mm - Long Bar | r33 `=(B35*2)+(B37*2)`→12 | 10 | -2 | DIFFERENT | calcBOQ sets `B35 = B46<32 ? 1 : 2` (the workbook's DC-MCB-count formula, B43) and uses it as DC cable cores; workbook B35 is typed cores = 2 | F calcBOQ bug |
| 21 | Glands  (PVC Type ): 32mm for 1C X 6 sqmm (HEX) | r34 typed→0 | 0 | +0 | MATCH | — | — |
| 22 | Nut Bolt & Washer Set: 100mm X M10 (Anchor Bolt) | r35 `=J46*4`→160 | 2592 | +2432 | DIFFERENT | calcBOQ base plates = ceil(S53/6)*6*2 with its own S53; workbook base plates = legs x 2 from a hand-filled sub-table | F calcBOQ bug |
| 23 | Nut Bolt & Washer Set: M8 or M6 Hot Dip Galvanised - Inve | r36 `=B7*6`→6 | 6 | +0 | MATCH | — | — |
| — | Nut Bolt & Washer Set: M8 x 100 Hot Dip Galvanised for Pu | r37 typed→0 | not produced | — | MISSING IN calcBOQ | workbook-only line (M8x100 purlin bolt) | A formula |
| 31 | Eletrical Tape: R,Y,B,Black,G (Each) | r38 typed→6 | 6 | +0 | MATCH | — | — |
| 32 | Cable Ties: Nylon Cable Tie,-10 85 degree UV P | r39 typed→1 | 1 | +0 | MATCH | — | — |
| 27 | Conduits: PVC Flexible and Fixed Conduit - 2 | r40 `=ROUNDUP((J19+J28+J27)/3,0)*3`→285 | 228 | -57 | DIFFERENT | different terms: workbook DC + LA wire + inverter earthing (Aaryan: 4 terms, no x3); calcBOQ DC + structure earthing + inverter earthing; spare lengths also differ | A formula + C manual value |
| 28 | Conduits: Tee Bend 25 mm PVC | r41 `=roundup(J40/2,0)`→143 | 114 | -29 | DIFFERENT | follows conduit | A formula + C manual value |
| 29 | Cable Tag: 2C X 6 Sqmm, CU CABLE, INVERTER NO | r42 `=(B37+B35*2)+2`→10 | 8 | -2 | DIFFERENT | same cores bug as line 20 | F calcBOQ bug |
| 30 | Ferules: Pre Printed - 8mm - 1 To 2 STRING | r43 `=B32`→3 | 3 | +0 | MATCH | — | — |
| — | Structure: ISI standard 80 microns GI structu | r44 `=roundup(S53/6,0)*6`→102 | not produced | — | MISSING IN calcBOQ | workbook-only line (GI structure 80x40) | A formula |
| — | Structure: 40x40x2 (Purlin) | r45 `=round((7*1.2*3+3.6)/6,0)*6`→30 | not produced | — | MISSING IN calcBOQ | workbook-only line (Purlin 40x40) | A formula |
| — | Structure: Base plate | r46 `=R53*2`→40 | not produced | — | MISSING IN calcBOQ | workbook-only line (Base plate) | A formula |
| 33 | Structure: Ladder and Cross bracing | r47 typed→0 | 18 | +18 | DIFFERENT | workbook 'Ladder and Cross bracing' typed; calcBOQ fixed 18 | B template default |
| 34 | Structure: Walkway | r48 typed→9.6 | 5 | -4.6 | DIFFERENT | workbook walkway typed; calcBOQ fixed 5 | C manual project value |
| 35 | Structure: Over the shed Al structure | r49 typed→9.6 | 25 | +15.4 | DIFFERENT | workbook over-shed Al typed in kW (0 on raised sheets); calcBOQ always = B1 | A formula |
| 25 | U-Clamp: With Spring and SS- 304 Nut & Bolt | r50 typed→90 | 63 | -27 | DIFFERENT | workbook typed; calcBOQ ceil(panels x 1.5) | C manual project value |
| 26 | Z-Clamp: With Spring and SS- 304 Nut & Bolt | r51 typed→72 | 84 | +12 | DIFFERENT | workbook typed; calcBOQ panels x 2 | C manual project value |
| 36 | Bird Spikes: Ewelt Polycarbonate | r52 typed→84 | 0 | -84 | DIFFERENT | workbook typed; calcBOQ 0 | C manual project value |
| 24 | J-Bolt: M-8 SS-304 | r53 `=R53`→20 | 0 | -20 | DIFFERENT | workbook typed (Celebration `=R53` legs); calcBOQ 0 | C manual project value |
| 37 | Parnali / Rainwater Channel | not in sheet | 0 | — | NOT IN WORKBOOK | calcBOQ-only line | — |
| 38 | Sprinkler System | not in sheet | 0 | — | NOT IN WORKBOOK | calcBOQ-only line | — |

### 2.11 Celebration Country Aqua Blue - BOQ Solar Template.xlsx / sheet `25 kW Non-Raised + Shed Hybrid`

| Input | Cell | Formula or typed | Value |
|---|---|---|---|
| Required Solar Capacity | B1 | typed | 25.0; C1 `=$B$3*$B$22/1000` = 25.2 (actual DC kW) |
| Panel Price/Wp | B2 | typed | 15.0 |
| Solar Module Size (W) | B3 | typed | 600.0 |
| System Connection Phase | B4 | typed | 3.0 |
| Building No. of Floors | B5 | typed | 12.0 |
| Inverter Installation Floor | B6 | typed | 12.0 |
| No. of Inverter | B7 | typed | 1.0 |
| Inverter Size | B8 | typed | 30 kW (brand C8 = 'Solis') |
| No. of Panel Rows | B9 | typed | 2.0 |
| Structure Height Lower (FT.) | B10 | typed | 7.0 |
| Structure Height Upper (FT.) | B11 | typed | 9.0 |
| 3.5ft GI Shed (sqft) | B12 | typed | 0.0 |
| Battery Size | B14 | typed | 0.0 |
| No. of Batteries | B15 | typed | 0.0 |
| No. of Earthing Pit | B21 | typed | 5.0 |
| No. of Solar Panels | B22 | `=ROUNDUP(($B$1*1000/$B$3),0)` | 42 |
| No. of Strings | B33 | typed | 3.0 |
| No. of rafters | B26 | typed | 18.0 |
| DC Cable Size (sqmm) | B37 | `=Sheet2!K24` | 1.5 |
| AC Cable Size (sqmm) | B39 | `=Sheet2!$F$45` | 10 |
| DC MCB Rating (Amp) | B43 | typed | 32.0 |
| AC MCB Rating (Amp) | B45 | typed | 64.0 |
| No. of AC MCB | B46 | typed | 2.0 |
| DC Cable Length (MTS.): spare | C16 | typed | 60.0 |
| AC Cable Length (MTS.): spare | C17 | typed | 30.0 |
| Earthing Cable Length for Structure (MTS.): spare | C18 | typed | 30.0 |
| Earthing Cable Length for Inverter (MTS.): spare | C19 | typed | 30.0 |
| LA Earthing Cable Length (MTS.): spare | C20 | typed | 20.0 |

Line by line (workbook cached Qty vs calcBOQ run with laType = ESE, since every workbook LA row specifies ESE):

| sr | Line (workbook rows) | Workbook qty (J formula → value) | calcBOQ qty | Diff (calc − WB) | Result | Reason | Class |
|---|---|---|---|---|---|---|---|
| 1 | Solar module: 600 Wp Mono Perc Non-DCR | r14 `=$B$22`→42 | 42 | +0 | MATCH | — | — |
| 2 | Solar inverter: 30 kW Hybrid (2 MPPT, 4 String, 13 | r15 `=B7`→1 | 1 | +0 | MATCH | — | — |
| — | DC MCB: 160A | r16 typed→1 | not produced | — | MISSING IN calcBOQ | workbook-only line (DC MCB 160A) | A formula |
| 4 | Battery: 100Ah | r17 typed→0 | 0 | +0 | MATCH | — | — |
| 5 | DC Distribution Box: Technical Specs of DC Distribution | r18 `=B7`→1 | 1 | +0 | MATCH | — | — |
| 8 | DC Cable: 2 C. 4 sq.mm , Annealed Tinned Fle | r19 `=B16+C16`→150 | 45 | -105 | DIFFERENT | WB length B16 `=ROUNDUP(($B$23*1.2)+($B$9*2.3),0)*B33` = 90, spare C16 typed = 60.0; calcBOQ length B16 x inverters then +15 | A formula + C manual value |
| 9 | MC4 Connectors: 4 sq.mm, 1000 V DC, IP68, Applicat | r20 `=B34`→12 | 12 | +0 | MATCH | — | — |
| 6 | AC Distribution Box (Solar LT Panel): Technical Specs of AC Distribution | r21 `=B7`→1 | 1 | +0 | MATCH | — | — |
| 7 | MCB at Client's LT Panel: Technical Specs :-  - 1 Nos. of  6 | r22 typed→1 | 1 | +0 | MATCH | — | — |
| 10 | AC Cable: 1.1 kV ,Al. Conductor XLPE - 1R X  | r23 `=B17+C17`→76 | 86 | +10 | DIFFERENT | WB length B17 `=ROUNDUP(($B$6+1)*3.5,0)*B7` = 46, spare C17 typed = 30.0; calcBOQ length same formula then +40 | C manual project value |
| — | Bypass Switch: 63A | r24 typed→1 | not produced | — | MISSING IN calcBOQ | workbook-only line (Bypass switch) | A formula |
| 11 | AC Cable (Inverter to ACDB): 1R x 3.5C x 25Sqmm Cu. Flexible  | r25 typed→10 | 5 | -5 | DIFFERENT | workbook `5*J15` / `10*J15` / typed; calcBOQ `5*B7` | A formula |
| 12 | LA With Mounting Accessories: ESE Type - 25 sq.mm - Suitable for | r26 typed→1 | 1 | +0 | MATCH | — | — |
| 13 | Earthing cable: 1.1KV, Flexible Copper Conducter F | r27 `=B18+C18`→84 | 94 | +10 | DIFFERENT | WB length B18 `=ROUNDUP(($B$5+2)*3.5+5,0)*B7` = 54, spare C18 typed = 30.0; calcBOQ length same formula then +40 | C manual project value |
| 14 | Earthing cable: 1.1KV, Flexible Copper Conducter F | r28 `=B19+C19`→77 | 87 | +10 | DIFFERENT | WB length B19 `=ROUNDUP($B$6*3.5+5,0)*B7` = 47, spare C19 typed = 30.0; calcBOQ length same formula then +40 | C manual project value |
| 15 | Earthing cable: 1.1KV, Earthing wire, 25 sq.mm as  | r29 `=B20+C20`→76 | 96 | +20 | DIFFERENT | WB length B20 `=ROUNDUP(($B$5+1)*3.5+10,0)` = 56, spare C20 typed = 20.0; calcBOQ length same formula then +40 | C manual project value |
| 16 | Earthing Pit details: Earthing Pit Specification (DC Ear | r30 `=$B$21`→5 | 5 | +0 | MATCH | — | — |
| 17 | Lugs: Cu., Ring Type- 6 Sq.mm. (Panel to | r31 `=B22*2`→84 | 84 | +0 | MATCH | — | — |
| 18 | Lugs: Cu., pin Type- 6 Sq.mm. (Inverter  | r32 `=B7*2`→2 | 2 | +0 | MATCH | — | — |
| 19 | Lugs: LA earthing - Al , ring type 16 sq | r33 `=J30+1`→6 | 6 | +0 | MATCH | — | — |
| 20 | Lugs: Cu, Ring Type - 4 Sq.mm - Long Bar | r34 `=(B36*2)+(B38*2)`→12 | 10 | -2 | DIFFERENT | calcBOQ sets `B35 = B46<32 ? 1 : 2` (the workbook's DC-MCB-count formula, B43) and uses it as DC cable cores; workbook B35 is typed cores = 2 | F calcBOQ bug |
| 21 | Glands  (PVC Type ): 32mm for 1C X 6 sqmm (HEX) | r35 typed→0 | 0 | +0 | MATCH | — | — |
| 22 | Nut Bolt & Washer Set: 100mm X M10 (Anchor Bolt) | r36 `=J47*4`→96 | 2592 | +2496 | DIFFERENT | calcBOQ base plates = ceil(S53/6)*6*2 with its own S53; workbook base plates = legs x 2 from a hand-filled sub-table | F calcBOQ bug |
| 23 | Nut Bolt & Washer Set: M8 or M6 Hot Dip Galvanised - Inve | r37 `=B7*6`→6 | 6 | +0 | MATCH | — | — |
| — | Nut Bolt & Washer Set: M8 x 100 Hot Dip Galvanised for Pu | r38 typed→0 | not produced | — | MISSING IN calcBOQ | workbook-only line (M8x100 purlin bolt) | A formula |
| 31 | Eletrical Tape: R,Y,B,Black,G (Each) | r39 typed→6 | 6 | +0 | MATCH | — | — |
| 32 | Cable Ties: Nylon Cable Tie,-10 85 degree UV P | r40 typed→1 | 1 | +0 | MATCH | — | — |
| 27 | Conduits: PVC Flexible and Fixed Conduit - 2 | r41 `=ROUNDUP((J19+J29+J28)/3,0)*3`→303 | 228 | -75 | DIFFERENT | different terms: workbook DC + LA wire + inverter earthing (Aaryan: 4 terms, no x3); calcBOQ DC + structure earthing + inverter earthing; spare lengths also differ | A formula + C manual value |
| 28 | Conduits: Tee Bend 25 mm PVC | r42 `=roundup(J41/2,0)`→152 | 114 | -38 | DIFFERENT | follows conduit | A formula + C manual value |
| 29 | Cable Tag: 2C X 6 Sqmm, CU CABLE, INVERTER NO | r43 `=(B38+B36*2)+2`→10 | 8 | -2 | DIFFERENT | same cores bug as line 20 | F calcBOQ bug |
| 30 | Ferules: Pre Printed - 8mm - 1 To 2 STRING | r44 `=B33`→3 | 3 | +0 | MATCH | — | — |
| — | Structure: ISI standard 80 microns GI structu | r45 `=roundup(S54/6,0)*6`→48 | not produced | — | MISSING IN calcBOQ | workbook-only line (GI structure 80x40) | A formula |
| — | Structure: 40x40x2 (Purlin) | r46 `=round((7*1.2*3+3.6)/6,0)*6`→30 | not produced | — | MISSING IN calcBOQ | workbook-only line (Purlin 40x40) | A formula |
| — | Structure: Base plate | r47 `=R54*2`→24 | not produced | — | MISSING IN calcBOQ | workbook-only line (Base plate) | A formula |
| 33 | Structure: Ladder and Cross bracing | r48 typed→0 | 18 | +18 | DIFFERENT | workbook 'Ladder and Cross bracing' typed; calcBOQ fixed 18 | B template default |
| 34 | Structure: Walkway | r49 typed→9.6 | 5 | -4.6 | DIFFERENT | workbook walkway typed; calcBOQ fixed 5 | C manual project value |
| 35 | Structure: Over the shed Al structure | r50 `=26*0.6`→15.6 | 25 | +9.4 | DIFFERENT | workbook over-shed Al typed in kW (0 on raised sheets); calcBOQ always = B1 | A formula |
| 25 | U-Clamp: With Spring and SS- 304 Nut & Bolt | r51 typed→84 | 63 | -21 | DIFFERENT | workbook typed; calcBOQ ceil(panels x 1.5) | C manual project value |
| 26 | Z-Clamp: With Spring and SS- 304 Nut & Bolt | r52 typed→12 | 84 | +72 | DIFFERENT | workbook typed; calcBOQ panels x 2 | C manual project value |
| 36 | Bird Spikes: Ewelt Polycarbonate | r53 typed→150 | 0 | -150 | DIFFERENT | workbook typed; calcBOQ 0 | C manual project value |
| 24 | J-Bolt: M-8 SS-304 | r54 `=R54`→12 | 0 | -12 | DIFFERENT | workbook typed (Celebration `=R53` legs); calcBOQ 0 | C manual project value |
| 3 | Data Logger | not in sheet | 0 | — | NOT IN WORKBOOK | calcBOQ-only line | — |
| 37 | Parnali / Rainwater Channel | not in sheet | 0 | — | NOT IN WORKBOOK | calcBOQ-only line | — |
| 38 | Sprinkler System | not in sheet | 0 | — | NOT IN WORKBOOK | calcBOQ-only line | — |

### 2.12 Foundit Lab - BOQ Solar Template.xlsx / sheet `6 kW Shed Structure DCR Solar B`

| Input | Cell | Formula or typed | Value |
|---|---|---|---|
| Required Solar Capacity | B1 | typed | 3.0; C1 `=$B$3*$B$22/1000` = 3 (actual DC kW) |
| Panel Price/Wp | B2 | typed | 25.0 |
| Solar Module Size (W) | B3 | typed | 600.0 |
| System Connection Phase | B4 | typed | 3.0 |
| Building No. of Floors | B5 | typed | 1.0 |
| Inverter Installation Floor | B6 | typed | 1.0 |
| No. of Inverter | B7 | typed | 1.0 |
| Inverter Size | B8 | typed | 3 kW (brand C8 = 'Solis') |
| No. of Panel Rows | B9 | typed | 2.0 |
| Structure Height Lower (FT.) | B10 | typed | 7.0 |
| Structure Height Upper (FT.) | B11 | typed | 9.0 |
| 3.5ft GI Shed (sqft) | B12 | typed | 0.0 |
| Battery Size | B14 | typed | 100Ah 51.2V |
| No. of Batteries | B15 | typed | 1.0 |
| No. of Earthing Pit | B21 | typed | 3.0 |
| No. of Solar Panels | B22 | `=ROUNDUP(($B$1*1000/$B$3),0)` | 5 |
| No. of Strings | B33 | typed | 1.0 |
| No. of rafters | B26 | typed | 18.0 |
| DC Cable Size (sqmm) | B37 | `=Sheet2!K24` | 1.5 |
| AC Cable Size (sqmm) | B39 | `=Sheet2!$F$45` | 4 |
| DC MCB Rating (Amp) | B43 | typed | 32.0 |
| AC MCB Rating (Amp) | B45 | typed | 64.0 |
| No. of AC MCB | B46 | typed | 2.0 |
| DC Cable Length (MTS.): spare | C16 | typed | 14.0 |
| AC Cable Length (MTS.): spare | C17 | typed | 10.0 |
| Earthing Cable Length for Structure (MTS.): spare | C18 | typed | 20.0 |
| Earthing Cable Length for Inverter (MTS.): spare | C19 | typed | 15.0 |
| LA Earthing Cable Length (MTS.): spare | C20 | typed | 15.0 |

Line by line (workbook cached Qty vs calcBOQ run with laType = ESE, since every workbook LA row specifies ESE):

| sr | Line (workbook rows) | Workbook qty (J formula → value) | calcBOQ qty | Diff (calc − WB) | Result | Reason | Class |
|---|---|---|---|---|---|---|---|
| 1 | Solar module: 600 Wp Mono Perc DCR | r14 `=$B$22`→5 | 5 | +0 | MATCH | — | — |
| 2 | Solar inverter: 3 kW Hybrid (2 MPPT, 4 String, 13  | r15 typed→1 | 1 | +0 | MATCH | — | — |
| — | DC MCB: 160A | r16 typed→1 | not produced | — | MISSING IN calcBOQ | workbook-only line (DC MCB 160A) | A formula |
| 4 | Battery: 100 Ah | r17 typed→2 | 1 | -1 | DIFFERENT | workbook `=B15` or typed 0; calcBOQ `B15` | C manual project value |
| 5 | DC Distribution Box: Technical Specs of DC Distribution | r18 `=J15`→1 | 1 | +0 | MATCH | — | — |
| 8 | DC Cable: 2 C. 6 sq.mm , Annealed Tinned Fle | r19 `=B16+C16`→22 | 23 | +1 | DIFFERENT | WB length B16 `=ROUNDUP(($B$23*1.2)+($B$9*2.3),0)*B33` = 8, spare C16 typed = 14.0; calcBOQ length B16 x inverters then +15 | A formula + C manual value |
| 9 | MC4 Connectors: 4 sq.mm, 1000 V DC, IP68, Applicat | r20 `=B34`→4 | 4 | +0 | MATCH | — | — |
| 6 | AC Distribution Box (Solar LT Panel): Technical Specs of AC Distribution | r21 `=J15`→1 | 1 | +0 | MATCH | — | — |
| 7 | MCB at Client's LT Panel: Technical Specs :-  - 1 Nos. of  2 | r22 `=J15`→1 | 1 | +0 | MATCH | — | — |
| 10 | AC Cable: 1.1 kV ,Al. Conductor XLPE - 1R X  | r23 `=B17+C17`→17 | 47 | +30 | DIFFERENT | WB length B17 `=ROUNDUP(($B$6+1)*3.5,0)*B7` = 7, spare C17 typed = 10.0; calcBOQ length same formula then +40 | C manual project value |
| — | Bypass Switch: 63A | r24 typed→1 | not produced | — | MISSING IN calcBOQ | workbook-only line (Bypass switch) | A formula |
| 11 | AC Cable (Inverter to ACDB): 1R x 3C x 4Sqmm Cu. Flexible  | r25 `=5*J15`→5 | 5 | +0 | MATCH | — | — |
| 12 | LA With Mounting Accessories: ESE Type - 25 sq.mm - Suitable for | r26 typed→1 | 1 | +0 | MATCH | — | — |
| 13 | Earthing cable: 1.1KV, Flexible Copper Conducter F | r27 `=B18+C18`→36 | 56 | +20 | DIFFERENT | WB length B18 `=ROUNDUP(($B$5+2)*3.5+5,0)*B7` = 16, spare C18 typed = 20.0; calcBOQ length same formula then +40 | C manual project value |
| 14 | Earthing cable: 1.1KV, Flexible Copper Conducter F | r28 `=B19+C19`→24 | 49 | +25 | DIFFERENT | WB length B19 `=ROUNDUP($B$6*3.5+5,0)*B7` = 9, spare C19 typed = 15.0; calcBOQ length same formula then +40 | C manual project value |
| 15 | Earthing cable: 1.1KV, Earthing wire, 25 sq.mm as  | r29 `=B20+C20`→32 | 57 | +25 | DIFFERENT | WB length B20 `=ROUNDUP(($B$5+1)*3.5+10,0)` = 17, spare C20 typed = 15.0; calcBOQ length same formula then +40 | C manual project value |
| 16 | Earthing Pit details: Earthing Pit Specification (DC Ear | r30 `=$B$21`→3 | 5 | +2 | DIFFERENT | workbook pits typed (B21); calcBOQ rule 2 x inv + 1, +2 for ESE | C manual project value |
| 17 | Lugs: Cu., Ring Type- 6 Sq.mm. (Panel to | r31 `=B22*2`→10 | 10 | +0 | MATCH | — | — |
| 18 | Lugs: Cu., pin Type- 6 Sq.mm. (Inverter  | r32 `=B7*2`→2 | 2 | +0 | MATCH | — | — |
| 19 | Lugs: LA earthing - Al , ring type 16 sq | r33 `=J30+1`→4 | 6 | +2 | DIFFERENT | same formula pits + 1; differs only through pits | C manual project value |
| 20 | Lugs: Cu, Ring Type - 4 Sq.mm - Long Bar | r34 `=(B36*2)+(B38*2)`→12 | 10 | -2 | DIFFERENT | calcBOQ sets `B35 = B46<32 ? 1 : 2` (the workbook's DC-MCB-count formula, B43) and uses it as DC cable cores; workbook B35 is typed cores = 2 | F calcBOQ bug |
| 21 | Glands  (PVC Type ): 32mm for 1C X 6 sqmm (HEX) | r35 typed→0 | 0 | +0 | MATCH | — | — |
| 22 | Nut Bolt & Washer Set: 100mm X M10 (Anchor Bolt) | r36 `=J47*4`→0 | 1536 | +1536 | DIFFERENT | calcBOQ base plates = ceil(S53/6)*6*2 with its own S53; workbook base plates = legs x 2 from a hand-filled sub-table | F calcBOQ bug |
| 23 | Nut Bolt & Washer Set: M8 or M6 Hot Dip Galvanised - Inve | r37 `=B7*6`→6 | 6 | +0 | MATCH | — | — |
| — | Nut Bolt & Washer Set: M8 x 100 Hot Dip Galvanised for Pu | r38 typed→0 | not produced | — | MISSING IN calcBOQ | workbook-only line (M8x100 purlin bolt) | A formula |
| 31 | Eletrical Tape: R,Y,B,Black,G (Each) | r39 typed→6 | 6 | +0 | MATCH | — | — |
| 32 | Cable Ties: Nylon Cable Tie,-10 85 degree UV P | r40 typed→1 | 1 | +0 | MATCH | — | — |
| 27 | Conduits: PVC Flexible and Fixed Conduit - 2 | r41 `=ROUNDUP((J19+J29+J28)/3,0)*3`→78 | 129 | +51 | DIFFERENT | different terms: workbook DC + LA wire + inverter earthing (Aaryan: 4 terms, no x3); calcBOQ DC + structure earthing + inverter earthing; spare lengths also differ | A formula + C manual value |
| 28 | Conduits: Tee Bend 25 mm PVC | r42 `=roundup(J41/2,0)`→39 | 65 | +26 | DIFFERENT | follows conduit | A formula + C manual value |
| 29 | Cable Tag: 2C X 6 Sqmm, CU CABLE, INVERTER NO | r43 `=(B38+B36*2)+2`→10 | 8 | -2 | DIFFERENT | same cores bug as line 20 | F calcBOQ bug |
| 30 | Ferules: Pre Printed - 8mm - 1 To 2 STRING | r44 `=B33`→1 | 1 | +0 | MATCH | — | — |
| — | Structure: ISI standard 80 microns GI structu | r45 `=roundup(S54/6,0)*6`→0 | not produced | — | MISSING IN calcBOQ | workbook-only line (GI structure 80x40) | A formula |
| — | Structure: 40x40x2 (Purlin) | r46 `=J$14*1.2*3+3.6`→21.6 | not produced | — | MISSING IN calcBOQ | workbook-only line (Purlin 40x40) | A formula |
| — | Structure: Base plate | r47 `=R54*2`→0 | not produced | — | MISSING IN calcBOQ | workbook-only line (Base plate) | A formula |
| 33 | Structure: Ladder and Cross bracing | r48 typed→12 | 18 | +6 | DIFFERENT | workbook 'Ladder and Cross bracing' typed; calcBOQ fixed 18 | B template default |
| 34 | Structure: Walkway | r49 typed→10 | 5 | -5 | DIFFERENT | workbook walkway typed; calcBOQ fixed 5 | C manual project value |
| 35 | Structure: Over the shed Al structure | r50 typed→3 | 3 | +0 | MATCH | — | — |
| 25 | U-Clamp: With Spring and SS- 304 Nut & Bolt | r51 typed→33 | 8 | -25 | DIFFERENT | workbook typed; calcBOQ ceil(panels x 1.5) | C manual project value |
| 26 | Z-Clamp: With Spring and SS- 304 Nut & Bolt | r52 typed→18 | 10 | -8 | DIFFERENT | workbook typed; calcBOQ panels x 2 | C manual project value |
| 38 | Cleaning System: Sprinkler | r53 typed→0 | 0 | +0 | MATCH | — | — |
| 24 | J-Bolt: M-8 SS-304 | r54 typed→6 | 0 | -6 | DIFFERENT | workbook typed (Celebration `=R53` legs); calcBOQ 0 | C manual project value |
| 3 | Data Logger | not in sheet | 0 | — | NOT IN WORKBOOK | calcBOQ-only line | — |
| 36 | Bird Spikes | not in sheet | 0 | — | NOT IN WORKBOOK | calcBOQ-only line | — |
| 37 | Parnali / Rainwater Channel | not in sheet | 0 | — | NOT IN WORKBOOK | calcBOQ-only line | — |

### 2.13 Foundit Lab - BOQ Solar Template.xlsx / sheet `6 kW Shed Structure NDCR Solar`

| Input | Cell | Formula or typed | Value |
|---|---|---|---|
| Required Solar Capacity | B1 | typed | 6.0; C1 `=$B$3*$B$22/1000` = 6 (actual DC kW) |
| Panel Price/Wp | B2 | typed | 16.0 |
| Solar Module Size (W) | B3 | typed | 600.0 |
| System Connection Phase | B4 | typed | 3.0 |
| Building No. of Floors | B5 | typed | 1.0 |
| Inverter Installation Floor | B6 | typed | 1.0 |
| No. of Inverter | B7 | typed | 1.0 |
| Inverter Size | B8 | typed | 6 kW (brand C8 = 'Solis') |
| No. of Panel Rows | B9 | typed | 2.0 |
| Structure Height Lower (FT.) | B10 | typed | 0.0 |
| Structure Height Upper (FT.) | B11 | typed | 0.0 |
| 3.5ft GI Shed (sqft) | B12 | typed | 0.0 |
| Battery Size | B14 | typed | 100Ah 51.2V |
| No. of Batteries | B15 | typed | 1.0 |
| No. of Earthing Pit | B21 | typed | 5.0 |
| No. of Solar Panels | B22 | `=ROUNDUP(($B$1*1000/$B$3),0)` | 10 |
| No. of Strings | B33 | typed | 1.0 |
| No. of rafters | B26 | typed | 18.0 |
| DC Cable Size (sqmm) | B37 | `=Sheet2!K24` | 1.5 |
| AC Cable Size (sqmm) | B39 | `=Sheet2!$F$45` | 4 |
| DC MCB Rating (Amp) | B43 | typed | 32.0 |
| AC MCB Rating (Amp) | B45 | typed | 64.0 |
| No. of AC MCB | B46 | typed | 2.0 |
| DC Cable Length (MTS.): spare | C16 | typed | 14.0 |
| AC Cable Length (MTS.): spare | C17 | typed | 15.0 |
| Earthing Cable Length for Structure (MTS.): spare | C18 | typed | 20.0 |
| Earthing Cable Length for Inverter (MTS.): spare | C19 | typed | 15.0 |
| LA Earthing Cable Length (MTS.): spare | C20 | typed | 15.0 |

Line by line (workbook cached Qty vs calcBOQ run with laType = ESE, since every workbook LA row specifies ESE):

| sr | Line (workbook rows) | Workbook qty (J formula → value) | calcBOQ qty | Diff (calc − WB) | Result | Reason | Class |
|---|---|---|---|---|---|---|---|
| 1 | Solar module: 600 Wp Mono Perc DCR | r14 `=$B$22`→10 | 10 | +0 | MATCH | — | — |
| 2 | Solar inverter: 6 kW Hybrid (2 MPPT, 4 String, 13  | r15 typed→1 | 1 | +0 | MATCH | — | — |
| — | DC MCB: 160A | r16 typed→1 | not produced | — | MISSING IN calcBOQ | workbook-only line (DC MCB 160A) | A formula |
| 4 | Battery: 100 Ah | r17 typed→1 | 1 | +0 | MATCH | — | — |
| 5 | DC Distribution Box: Technical Specs of DC Distribution | r18 `=J15`→1 | 1 | +0 | MATCH | — | — |
| 8 | DC Cable: 2 C. 6 sq.mm , Annealed Tinned Fle | r19 `=B16+C16`→25 | 26 | +1 | DIFFERENT | WB length B16 `=ROUNDUP(($B$23*1.2)+($B$9*2.3),0)*B33` = 11, spare C16 typed = 14.0; calcBOQ length B16 x inverters then +15 | A formula + C manual value |
| 9 | MC4 Connectors: 4 sq.mm, 1000 V DC, IP68, Applicat | r20 `=B34`→4 | 4 | +0 | MATCH | — | — |
| 6 | AC Distribution Box (Solar LT Panel): Technical Specs of AC Distribution | r21 `=J15`→1 | 1 | +0 | MATCH | — | — |
| 7 | MCB at Client's LT Panel: Technical Specs :-  - 1 Nos. of  2 | r22 `=J15`→1 | 1 | +0 | MATCH | — | — |
| 10 | AC Cable: 1.1 kV ,Al. Conductor XLPE - 1R X  | r23 `=B17+C17`→22 | 47 | +25 | DIFFERENT | WB length B17 `=ROUNDUP(($B$6+1)*3.5,0)*B7` = 7, spare C17 typed = 15.0; calcBOQ length same formula then +40 | C manual project value |
| — | Bypass Switch: 63A | r24 typed→1 | not produced | — | MISSING IN calcBOQ | workbook-only line (Bypass switch) | A formula |
| 11 | AC Cable (Inverter to ACDB): 1R x 3C x 4Sqmm Cu. Flexible  | r25 `=5*J15`→5 | 5 | +0 | MATCH | — | — |
| 12 | LA With Mounting Accessories: ESE Type - 25 sq.mm - Suitable for | r26 typed→1 | 1 | +0 | MATCH | — | — |
| 13 | Earthing cable: 1.1KV, Flexible Copper Conducter F | r27 `=B18+C18`→36 | 56 | +20 | DIFFERENT | WB length B18 `=ROUNDUP(($B$5+2)*3.5+5,0)*B7` = 16, spare C18 typed = 20.0; calcBOQ length same formula then +40 | C manual project value |
| 14 | Earthing cable: 1.1KV, Flexible Copper Conducter F | r28 `=B19+C19`→24 | 49 | +25 | DIFFERENT | WB length B19 `=ROUNDUP($B$6*3.5+5,0)*B7` = 9, spare C19 typed = 15.0; calcBOQ length same formula then +40 | C manual project value |
| 15 | Earthing cable: 1.1KV, Earthing wire, 25 sq.mm as  | r29 `=B20+C20`→32 | 57 | +25 | DIFFERENT | WB length B20 `=ROUNDUP(($B$5+1)*3.5+10,0)` = 17, spare C20 typed = 15.0; calcBOQ length same formula then +40 | C manual project value |
| 16 | Earthing Pit details: Earthing Pit Specification (DC Ear | r30 `=$B$21`→5 | 5 | +0 | MATCH | — | — |
| 17 | Lugs: Cu., Ring Type- 6 Sq.mm. (Panel to | r31 `=B22*2`→20 | 20 | +0 | MATCH | — | — |
| 18 | Lugs: Cu., pin Type- 6 Sq.mm. (Inverter  | r32 `=B7*2`→2 | 2 | +0 | MATCH | — | — |
| 19 | Lugs: LA earthing - Al , ring type 16 sq | r33 `=J30+1`→6 | 6 | +0 | MATCH | — | — |
| 20 | Lugs: Cu, Ring Type - 4 Sq.mm - Long Bar | r34 `=(B36*2)+(B38*2)`→12 | 10 | -2 | DIFFERENT | calcBOQ sets `B35 = B46<32 ? 1 : 2` (the workbook's DC-MCB-count formula, B43) and uses it as DC cable cores; workbook B35 is typed cores = 2 | F calcBOQ bug |
| 21 | Glands  (PVC Type ): 32mm for 1C X 6 sqmm (HEX) | r35 typed→0 | 0 | +0 | MATCH | — | — |
| 22 | Nut Bolt & Washer Set: 100mm X M10 (Anchor Bolt) | r36 `=J47*4`→0 | 960 | +960 | DIFFERENT | calcBOQ base plates = ceil(S53/6)*6*2 with its own S53; workbook base plates = legs x 2 from a hand-filled sub-table | F calcBOQ bug |
| 23 | Nut Bolt & Washer Set: M8 or M6 Hot Dip Galvanised - Inve | r37 `=B7*6`→6 | 6 | +0 | MATCH | — | — |
| — | Nut Bolt & Washer Set: M8 x 100 Hot Dip Galvanised for Pu | r38 typed→0 | not produced | — | MISSING IN calcBOQ | workbook-only line (M8x100 purlin bolt) | A formula |
| 31 | Eletrical Tape: R,Y,B,Black,G (Each) | r39 typed→6 | 6 | +0 | MATCH | — | — |
| 32 | Cable Ties: Nylon Cable Tie,-10 85 degree UV P | r40 typed→1 | 1 | +0 | MATCH | — | — |
| 27 | Conduits: PVC Flexible and Fixed Conduit - 2 | r41 `=ROUNDUP((J19+J29+J28)/3,0)*3`→81 | 132 | +51 | DIFFERENT | different terms: workbook DC + LA wire + inverter earthing (Aaryan: 4 terms, no x3); calcBOQ DC + structure earthing + inverter earthing; spare lengths also differ | A formula + C manual value |
| 28 | Conduits: Tee Bend 25 mm PVC | r42 `=roundup(J41/2,0)`→41 | 66 | +25 | DIFFERENT | follows conduit | A formula + C manual value |
| 29 | Cable Tag: 2C X 6 Sqmm, CU CABLE, INVERTER NO | r43 `=(B38+B36*2)+2`→10 | 8 | -2 | DIFFERENT | same cores bug as line 20 | F calcBOQ bug |
| 30 | Ferules: Pre Printed - 8mm - 1 To 2 STRING | r44 `=B33`→1 | 1 | +0 | MATCH | — | — |
| — | Structure: ISI standard 80 microns GI structu | r45 `=roundup(S54/6,0)*6`→0 | not produced | — | MISSING IN calcBOQ | workbook-only line (GI structure 80x40) | A formula |
| — | Structure: 40x40x2 (Purlin) | r46 `=J$14*1.2*3+3.6`→39.6 | not produced | — | MISSING IN calcBOQ | workbook-only line (Purlin 40x40) | A formula |
| — | Structure: Base plate | r47 `=R54*2`→0 | not produced | — | MISSING IN calcBOQ | workbook-only line (Base plate) | A formula |
| 33 | Structure: Ladder and Cross bracing | r48 typed→12 | 18 | +6 | DIFFERENT | workbook 'Ladder and Cross bracing' typed; calcBOQ fixed 18 | B template default |
| 34 | Structure: Walkway | r49 typed→10 | 5 | -5 | DIFFERENT | workbook walkway typed; calcBOQ fixed 5 | C manual project value |
| 35 | Structure: Over the shed Al structure | r50 typed→6 | 6 | +0 | MATCH | — | — |
| 25 | U-Clamp: With Spring and SS- 304 Nut & Bolt | r51 typed→33 | 15 | -18 | DIFFERENT | workbook typed; calcBOQ ceil(panels x 1.5) | C manual project value |
| 26 | Z-Clamp: With Spring and SS- 304 Nut & Bolt | r52 typed→18 | 20 | +2 | DIFFERENT | workbook typed; calcBOQ panels x 2 | C manual project value |
| 38 | Cleaning System: Sprinkler | r53 typed→0 | 0 | +0 | MATCH | — | — |
| 24 | J-Bolt: M-8 SS-304 | r54 typed→6 | 0 | -6 | DIFFERENT | workbook typed (Celebration `=R53` legs); calcBOQ 0 | C manual project value |
| 3 | Data Logger | not in sheet | 0 | — | NOT IN WORKBOOK | calcBOQ-only line | — |
| 36 | Bird Spikes | not in sheet | 0 | — | NOT IN WORKBOOK | calcBOQ-only line | — |
| 37 | Parnali / Rainwater Channel | not in sheet | 0 | — | NOT IN WORKBOOK | calcBOQ-only line | — |

### 2.14 Fredrick Xavier BOQ Solar Template.xlsx / sheet `3.6 kW Raised Structure Solar B`

| Input | Cell | Formula or typed | Value |
|---|---|---|---|
| Required Solar Capacity | B1 | typed | 5.4; C1 `=$B$3*$B$22/1000` = 5.4 (actual DC kW) |
| Panel Price/Wp | B2 | typed | 25.5 |
| Solar Module Size (W) | B3 | typed | 600.0 |
| System Connection Phase | B4 | typed | 3.0 |
| Building No. of Floors | B5 | typed | 2.0 |
| Inverter Installation Floor | B6 | typed | 2.0 |
| No. of Inverter | B7 | typed | 1.0 |
| Inverter Size | B8 | typed | 5 kW (brand C8 = 'Solis') |
| No. of Panel Rows | B9 | typed | 5.0 |
| Structure Height Lower (FT.) | B10 | typed | 0.0 |
| Structure Height Upper (FT.) | B11 | typed | 0.0 |
| 3.5ft GI Shed (sqft) | B12 | typed | 0.0 |
| Battery Size | B14 | typed | 0.0 |
| No. of Batteries | B15 | typed | 0.0 |
| No. of Earthing Pit | B21 | typed | 4.0 |
| No. of Solar Panels | B22 | `=ROUNDUP(($B$1*1000/$B$3),0)` | 9 |
| No. of Strings | B33 | typed | 2.0 |
| No. of rafters | B26 | typed | 18.0 |
| DC Cable Size (sqmm) | B37 | `=Sheet2!K24` | 1.5 |
| AC Cable Size (sqmm) | B39 | `=Sheet2!$F$45` | 4 |
| DC MCB Rating (Amp) | B43 | typed | 32.0 |
| AC MCB Rating (Amp) | B46 | typed | 64.0 |
| No. of AC MCB | B47 | typed | 2.0 |
| DC Cable Length (MTS.): spare | C16 | typed | 50.0 |
| AC Cable Length (MTS.): spare | C17 | typed | 10.0 |
| Earthing Cable Length for Structure (MTS.): spare | C18 | typed | 30.0 |
| Earthing Cable Length for Inverter (MTS.): spare | C19 | typed | 20.0 |
| LA Earthing Cable Length (MTS.): spare | C20 | typed | 30.0 |

Line by line (workbook cached Qty vs calcBOQ run with laType = ESE, since every workbook LA row specifies ESE):

| sr | Line (workbook rows) | Workbook qty (J formula → value) | calcBOQ qty | Diff (calc − WB) | Result | Reason | Class |
|---|---|---|---|---|---|---|---|
| 1 | Solar module: 600 Wp Mono Perc DCR | r14 `=$B$22`→9 | 9 | +0 | MATCH | — | — |
| 2 | Solar inverter: 12 kW (2 MPPT, 4 String, 13 Panel* | r15 `=B7`→1 | 1 | +0 | MATCH | — | — |
| 3 | Data logger: Ethernet/Wifi/GPRS | r16 typed→1 | 0 | -1 | DIFFERENT | workbook typed per sheet; calcBOQ fixed 0 | B template default |
| 4 | Battery: =B14 | r17 `=B15`→0 | 0 | +0 | MATCH | — | — |
| 5 | DC Distribution Box: Technical Specs of DC Distribution | r18 `=J15`→1 | 1 | +0 | MATCH | — | — |
| 8 | DC Cable: 1 C. 4 sq.mm , Annealed Tinned Fle | r19 `=B16+C16`→78 | 29 | -49 | DIFFERENT | WB length B16 `=ROUNDUP(($B$23*1.2)+($B$9*2.3),0)*B33` = 28, spare C16 typed = 50.0; calcBOQ length B16 x inverters then +15 | A formula + C manual value |
| 9 | MC4 Connectors: 4 sq.mm, 1000 V DC, IP68, Applicat | r20 `=B34`→8 | 8 | +0 | MATCH | — | — |
| 6 | AC Distribution Box (Solar LT Panel): Technical Specs of AC Distribution | r21 `=J15`→1 | 1 | +0 | MATCH | — | — |
| 7 | MCB at Client's LT Panel: Technical Specs :-  - 1 Nos. of  6 | r22 `=J15`→1 | 1 | +0 | MATCH | — | — |
| 10 | AC Cable: 1.1 kV ,Al. Conductor XLPE - 1R X  | r23 `=B17+C17`→21 | 51 | +30 | DIFFERENT | WB length B17 `=ROUNDUP(($B$6+1)*3.5,0)*B7` = 11, spare C17 typed = 10.0; calcBOQ length same formula then +40 | C manual project value |
| 11 | AC Cable (Inverter to ACDB): 1R x 4C x 6 Sqmm ARM Cu  | r24 `=10*J15`→10 | 5 | -5 | DIFFERENT | workbook `5*J15` / `10*J15` / typed; calcBOQ `5*B7` | A formula |
| — | AC Cable (BusBar to Meter ): 1R x 3.5C x 95 Sqmm ARM Al | r25 typed→0 | not produced | — | MISSING IN calcBOQ | workbook-only line (AC cable busbar to meter) | A formula |
| 12 | LA With Mounting Accessories: ESE Type - 25 sq.mm - Suitable for | r26 typed→1 | 1 | +0 | MATCH | — | — |
| 13 | Earthing cable: 1.1KV, Flexible Copper Conducter F | r27 `=B18+C18`→49 | 59 | +10 | DIFFERENT | WB length B18 `=ROUNDUP(($B$5+2)*3.5+5,0)*B7` = 19, spare C18 typed = 30.0; calcBOQ length same formula then +40 | C manual project value |
| 14 | Earthing cable: 1.1KV, Flexible Copper Conducter F | r28 `=B19+C19`→32 | 52 | +20 | DIFFERENT | WB length B19 `=ROUNDUP($B$6*3.5+5,0)*B7` = 12, spare C19 typed = 20.0; calcBOQ length same formula then +40 | C manual project value |
| 15 | Earthing cable: 1.1KV, Earthing wire, 25 sq.mm as  | r29 `=B20+C20`→51 | 61 | +10 | DIFFERENT | WB length B20 `=ROUNDUP(($B$5+1)*3.5+10,0)` = 21, spare C20 typed = 30.0; calcBOQ length same formula then +40 | C manual project value |
| 16 | Earthing Pit details: Earthing Pit Specification (DC Ear | r30 `=$B$21`→4 | 5 | +1 | DIFFERENT | workbook pits typed (B21); calcBOQ rule 2 x inv + 1, +2 for ESE | C manual project value |
| 17 | Lugs: Cu., Ring Type- 6 Sq.mm. (Panel to | r31 `=B22*2`→18 | 18 | +0 | MATCH | — | — |
| 18 | Lugs: Cu., pin Type- 6 Sq.mm. (Inverter  | r32 `=B7*2`→2 | 2 | +0 | MATCH | — | — |
| 19 | Lugs: LA earthing - Al , ring type 16 sq | r33 `=J30+1`→5 | 6 | +1 | DIFFERENT | same formula pits + 1; differs only through pits | C manual project value |
| 20 | Lugs: Cu, Ring Type - 4 Sq.mm - Long Bar | r34 `=(B36*2)+(B38*2)`→12 | 10 | -2 | DIFFERENT | calcBOQ sets `B35 = B46<32 ? 1 : 2` (the workbook's DC-MCB-count formula, B43) and uses it as DC cable cores; workbook B35 is typed cores = 2 | F calcBOQ bug |
| 21 | Glands  (PVC Type ): 32mm for 1C X 6 sqmm (HEX) | r35 typed→0 | 0 | +0 | MATCH | — | — |
| 22 | Nut Bolt & Washer Set: 100mm X M10 (Anchor Bolt) | r36 `=J48*4`→0 | 1968 | +1968 | DIFFERENT | calcBOQ base plates = ceil(S53/6)*6*2 with its own S53; workbook base plates = legs x 2 from a hand-filled sub-table | F calcBOQ bug |
| 23 | Nut Bolt & Washer Set: M8 or M6 Hot Dip Galvanised - Inve | r37 `=B7*6`→6 | 6 | +0 | MATCH | — | — |
| — | Nut Bolt & Washer Set: M8 x 100 Hot Dip Galvanised for Pu | r38 typed→0 | not produced | — | MISSING IN calcBOQ | workbook-only line (M8x100 purlin bolt) | A formula |
| 31 | Eletrical Tape: R,Y,B,Black,G (Each) | r39 typed→10 | 6 | -4 | DIFFERENT | workbook typed 3 / 6 / 10; calcBOQ 6 | B template default |
| 32 | Cable Ties: Nylon Cable Tie,-10 85 degree UV P | r40 typed→2 | 1 | -1 | DIFFERENT | workbook typed 1 / 2; calcBOQ 1 | B template default |
| 27 | Conduits: PVC Flexible and Fixed Conduit - 2 | r41 `=ROUNDUP((J19+J29+J28)/3,0)*3`→162 | 141 | -21 | DIFFERENT | different terms: workbook DC + LA wire + inverter earthing (Aaryan: 4 terms, no x3); calcBOQ DC + structure earthing + inverter earthing; spare lengths also differ | A formula + C manual value |
| 28 | Conduits: Tee Bend 25 mm PVC | r42 `=roundup(J41/2,0)`→81 | 71 | -10 | DIFFERENT | follows conduit | A formula + C manual value |
| 29 | Cable Tag: 2C X 6 Sqmm, CU CABLE, INVERTER NO | r43 `=(B38+B36*2)+2`→10 | 8 | -2 | DIFFERENT | same cores bug as line 20 | F calcBOQ bug |
| 30 | Ferules: Pre Printed - 8mm - 1 To 2 STRING | r44 `=B33`→2 | 2 | +0 | MATCH | — | — |
| — | Structure: ISI standard 80 microns GI structu | r45 `=ROUNDUP(R36/6,0)*6`→0 | not produced | — | MISSING IN calcBOQ | workbook-only line (GI structure 80x40) | A formula |
| — | Structure: 75x75x2 | r46 `=J14*1.2*3`→32.4 | not produced | — | MISSING IN calcBOQ | workbook-only line (Structure 75x75) | A formula |
| — | Structure: 40x40x2 (Purlin) | r47 `=J$14*1.2*3+3.6`→36 | not produced | — | MISSING IN calcBOQ | workbook-only line (Purlin 40x40) | A formula |
| — | Structure: Base plate | r48 `=Q46*2`→0 | not produced | — | MISSING IN calcBOQ | workbook-only line (Base plate) | A formula |
| 33 | Structure: Ladder | r49 typed→24 | 18 | -6 | DIFFERENT | workbook 'Ladder and Cross bracing' typed; calcBOQ fixed 18 | B template default |
| 34 | Structure: Walkway | r50 typed→29 | 5 | -24 | DIFFERENT | workbook walkway typed; calcBOQ fixed 5 | C manual project value |
| 35 | Structure: Over the shed Al structure | r51 typed→4.2 | 5.4 | +1.2 | DIFFERENT | workbook over-shed Al typed in kW (0 on raised sheets); calcBOQ always = B1 | A formula |
| 25 | U-Clamp: With Spring and SS- 304 Nut & Bolt | r52 typed→60 | 14 | -46 | DIFFERENT | workbook typed; calcBOQ ceil(panels x 1.5) | C manual project value |
| 26 | Z-Clamp: With Spring and SS- 304 Nut & Bolt | r53 typed→30 | 18 | -12 | DIFFERENT | workbook typed; calcBOQ panels x 2 | C manual project value |
| 38 | Cleaning System: Sprinkler | r54 typed→0 | 0 | +0 | MATCH | — | — |
| — | Civil: Block | r55 `=Q46`→— | not produced | — | MISSING IN calcBOQ | workbook-only line (Civil block) | A formula |
| 24 | J-Bolt M8 SS-304 | not in sheet | 0 | — | NOT IN WORKBOOK | calcBOQ-only line | — |
| 36 | Bird Spikes | not in sheet | 0 | — | NOT IN WORKBOOK | calcBOQ-only line | — |
| 37 | Parnali / Rainwater Channel | not in sheet | 0 | — | NOT IN WORKBOOK | calcBOQ-only line | — |
---

## 3. Formula source of truth

The workbook formula is quoted from Ashwini 3 kW (cells in brackets); variants found in other sheets are listed. "Treatment" is a **recommendation**: every one is [INF] unless marked [BIZ].

| BOQ item | Exact workbook formula [WB] | Exact calcBOQ formula [CODE] | Same? | Recommended treatment |
|---|---|---|---|---|
| Panels | `=ROUNDUP(($B$1*1000/$B$3),0)` (B22) — all 14 | `ceil(B1*1000/B3)` | Same | ENGINEERING CONSTANT (formula); Wp = CATALOGUE VALUE; B1 = PROJECT INPUT |
| Actual DC kW | `=$B$3*$B$22/1000` (C1) — all 14 | not computed | Missing | ENGINEERING CONSTANT (formula); use as kW basis → BUSINESS RULE [BIZ §8] |
| Panels per line | `=B22/B9` (B23) | `B22/B9` | Same | ENGINEERING CONSTANT; rows = PROJECT INPUT |
| Strings | typed (B32); Aaryan `=IFS(C8="Solis",INDEX(Sheet2!A50:I69,…,5),…)` (B31) | `inp.numStrings` | Same (input) | PROJECT INPUT now; CATALOGUE VALUE if inverter specs are added [BIZ §11] |
| String Voc | `=49.82*(B22/B32)` (B30), label C30 "for 550Wp PV"; Sheet2 L48 = 49.82 is Voc of a **540 Wp** panel (J48) | `49.82*(B22/B32)` | Same | CATALOGUE VALUE (panel Voc) — constant is wrong for 600 Wp panels [INF] |
| DC current | `=(B3*B22/B30/B32)*1.5` (B46) | `((B3*B22)/B30/B32)*1.5` | Same | ENGINEERING CONSTANT |
| DC cable size | `=Sheet2!K24` (B36) — band lookup, §7 | `getDCSize` 5 bands to 10 mm² | Different | ENGINEERING CONSTANT (table) |
| AC current | `=(B3*B22/B7/C49)*1.5` (B47), `C49 =IFS(B4=3,415*1.7321,B4=1,230)` | not computed | Missing | ENGINEERING CONSTANT |
| AC cable size | `=Sheet2!$F$45` (B38) | hard-coded "4sq.mm" text | Different | ENGINEERING CONSTANT (table) |
| DC cable length | `=ROUNDUP(($B$23*1.2)+($B$9*2.3),0)*B32` (B16); Aaryan without `*strings` | `ceil(B23*1.2+B9*2.3)*B7` | **Different** (×inverters vs ×strings) | ENGINEERING CONSTANT; multiplier needs confirmation [BIZ] |
| DC cable qty | `=B16+C16` (J19), C16 typed 5–120 | `B16+15` | Different | spare = TEMPLATE DEFAULT or PROJECT INPUT [BIZ §12] |
| AC length / qty | `=ROUNDUP(($B$6+1)*3.5,0)*B7` (B17) / `=B17+C17` (J23) | `B17` same / `B17+40` | Length same, spare different | ENGINEERING CONSTANT + spare [BIZ] |
| Earthing structure | `=ROUNDUP(($B$5+2)*3.5+5,0)*B7` / `=B18+C18` | same / `+40` | Length same | ENGINEERING CONSTANT + spare [BIZ] |
| Earthing inverter | `=ROUNDUP($B$6*3.5+5,0)*B7` / `=B19+C19` | same / `+40` | Length same | ENGINEERING CONSTANT + spare [BIZ] |
| LA earthing | `=ROUNDUP(($B$5+1)*3.5+10,0)` / `=B20+C20`; Ananda 34.2/40.2 `=ROUNDUP($B$6*3.5+10,0)*B7` | same as Ashwini / `+40`, 0 if NA | Same as majority | ENGINEERING CONSTANT; Ananda variant [BIZ] |
| MC4 | `=$B$32*4` (B33), J20 `=B33` | `B32*4` | Same | ENGINEERING CONSTANT |
| Earthing pits | typed (B21) in all 14 | `2n+1` +2/0/−1 | Different | BUSINESS RULE [BIZ §6] |
| Lug ring 6 | `=B22*2` | `B22*2` | Same | ENGINEERING CONSTANT |
| Lug pin 6 | `=B7*2` | `B7*2` | Same | ENGINEERING CONSTANT |
| Lug LA 16 | `=J29+1` (pits+1) | `B21+1` | Same | ENGINEERING CONSTANT |
| Lug 4 mm² | `=(B35*2)+(B37*2)` (DC cores, AC cores) | `B35*2+B37*2` with B35 = DC-MCB count | **Different (bug L2)** | ENGINEERING CONSTANT |
| Cable tag | `=(B37+B35*2)+2` | `B37+B35*2+2` with wrong B35 | **Different (bug L2)** | ENGINEERING CONSTANT |
| Conduit | `=ROUNDUP((J19+J28+J27)/3,0)*3` (DC + LA wire + inverter earthing); Aaryan `=ROUNDUP((J19+J23+J27+J26)/3,0)` | `ceil((dc16+(B18+40)+(B19+40))/3)*3` (DC + structure earth + inverter earth) | Different terms | ENGINEERING CONSTANT; which terms [BIZ] |
| Tee bend | `=roundup(J40/2,0)` | `ceil(condQ/2)` | Same | ENGINEERING CONSTANT |
| Cable cores | DC typed 2 (B35, all 14); AC `=IFS(B4=3,4,B4=1,2)` (B37) | DC: none; AC `B4===3?4:2` | AC same | DC cores = TEMPLATE DEFAULT (2, all 14) |
| Ferrule | `=B32` | `B32` | Same | ENGINEERING CONSTANT |
| Inverter nut-bolt | `=B7*6` | `B7*6` | Same | ENGINEERING CONSTANT |
| Anchor bolt | `=J46*4` (J46 base plates) | `J46*4`, J46 = 2 × rounded GI length | **Different (bug L1)** | ENGINEERING CONSTANT (×4 per base plate) |
| Base plate | `=R53*2` (R53 = Σ leg counts); Ananda 34/40 `=S45*1.5`; Aaryan / Ananda 10.8 / 4.2 typed | not produced | Missing | UNKNOWN / NEEDS BUSINESS DECISION (×2 vs ×1.5) |
| GI structure 80×40 | `=roundup(S53/6,0)*6`, S53 = side sub-table; Aaryan / Ananda 10.8 / 4.2 typed | not produced | Missing | UNKNOWN / NEEDS BUSINESS DECISION (§5) |
| Purlin 40×40 | `=J$14*1.2*3+3.6`; variants +0, +4.5, +12, `=3.6*4`, `=round((7*1.2*3+3.6)/6,0)*6` | not produced | Missing | formula = ENGINEERING CONSTANT; "+k" = UNKNOWN [BIZ] |
| Ladder / bracing | typed 0/6/12/24 m | fixed 18 | Different | TEMPLATE DEFAULT or PROJECT INPUT [BIZ] |
| Walkway | typed 0–29 m | fixed 5 | Different | PROJECT INPUT [BIZ] |
| Over-shed Al | typed kW (0 on raised / non-raised) | `B1` | Different | BUSINESS RULE by structure type [BIZ §5] |
| U / Z clamp | typed (U 3–90, Z 6–72) | `ceil(panels*1.5)` / `panels*2` | Different | UNKNOWN / NEEDS BUSINESS DECISION |
| Data logger, tape, ties, glands, LA count, MCB, ACDB | typed | fixed 0/6/1/0/1/1/1 | Mixed | TEMPLATE DEFAULT (ACDB per inverter vs 1 = [BIZ]) |
| DCDB | `=B7` / `=J15` / typed | `B7` | Same as majority | ENGINEERING CONSTANT (1 per inverter) |
| AC inverter→ACDB | `=5*J15`; Ananda 34.2 / 40.2, Fredrick `=10*J15`; Celebration hybrid, Ananda 10.8 / 4.2 typed 10 | `5*B7` | Mixed | TEMPLATE DEFAULT (5 vs 10 m) |
| Material | `=SUM(M14:M53)` | `Σ price` | Same | ENGINEERING CONSTANT |
| Installation / transport / liaisoning / insurance / profit / GST / quote | see §4 | see §1 | Variants | COMMERCIAL RULE [BIZ] |
| Unit prices (every L cell) | typed per sheet | catalogue (`bos`, `acdb`, `dcdb`, wire / inverter tables) | — | CATALOGUE VALUE |

---

## 4. Commercial logic: every variant [WB]

Each block below is copied cell by cell from the workbooks; the full dump is in Appendix A. I have not picked a correct variant anywhere.

| Factor | Variants found (formula / value → sheets) | calcBOQ [CODE] |
|---|---|---|
| **Installation** | Formula: all 14 use `=L × J(kW)`. Rates: **4000** → Aaryan Solar BOQ, Ashwini 3 & 4.8, Celebration ×2. **8000** → Aaryan Copy. **9000** → Aaryan 1kW. **3800** → Ananda 10.8, 4.2. **3500** → Ananda 34.2, 40.2, Foundit ×2, Fredrick | `5500 × B1` |
| **Transport** | `=M53*5%` → Aaryan ×3. `=M54*0.03` (row varies) → other 11 | `mat × 3%` |
| **Liaisoning** | Formula: all `=L × J(kW)`. Rates: **4000** → Aaryan Solar, Copy. **0** → Aaryan 1kW. **2000** → Ananda 34.2, 40.2. **3500** → Ananda 10.8, 4.2, Ashwini ×2, Fredrick. **2500** → Celebration ×2. **3000** → Foundit ×2 | `3500 × B1` |
| **Insurance** | `(sub*1.2)/1000*2*7` → Aaryan ×3. `(sub*1.2)/1000*3*5*1.2+34000` → Ananda 34.2, 40.2. `(sub*1.2)/1000*3*5` → Ananda 10.8, 4.2, Ashwini ×2, Celebration ×2, Foundit ×2. `(sub*1.2)/1000*2*5` → Fredrick | `sub×1.2/1000×3×5` |
| **Profit** | Formula: all `=sub/(1-L)*L`. L = **0.15** → Aaryan ×3, Ananda 34.2, 40.2, Fredrick. **0.149** → Ananda 10.8, 4.2, Ashwini ×2, Celebration ×2, Foundit ×2 | `15%` |
| **Total ex-GST** | `=SUM(sub, insurance, profit)`, all 14 | same |
| **₹/W** | `=Total/1000/kW` (Ashwini M62; row varies), all 14 | `totalExGST/B1` (₹/kW) |
| **First quote** | `=ROUNDUP(₹/W,0)+2`, all 14 (Fredrick lowercase `roundup`) | `ceil(rateKW/1000)*1000+2000` — **display only** |
| **Quoted price** | `=FirstQuote × kW × 1000` (Ashwini M64) then × GST factor (M65), all 14 | GST is applied to **unrounded** `totalExGST`; first quote is not used in the price |
| **GST factor on the quoted price** | `×1.089` → Ananda 34.2, 40.2, Ashwini ×2, Celebration ×2, Foundit ×2, Fredrick. **`×1.1089`** → Aaryan ×3 (M64). **`×1.138`** → Ananda 10.8, 4.2 (M65) | `8.9%` |
| **Second column (N)** | `=Total*1.138` → Aaryan ×3, Ananda 10.8, 4.2, Ashwini ×2, Celebration ×2, Foundit ×2. `=Total*1.089` → Ananda 34.2, 40.2, Fredrick. Then N-₹/W, `ROUNDUP+2`, ×kW×1000 | not modelled |
| **Header labels** | G2 "Rate With Laisoning" `=M62`; **G3 "Rate Without Laisoning" `=N61`** (the ×1.138/1.089 column, which still includes liaisoning); J2 "Rate Without Structure, With Liaisoning" `=(Total−M44)/1000/kW` (subtracts only the GI 80×40 row); J3 also subtracts liaisoning (M57); J4 `=ROUNDUP(J3,0)+2` — same pattern in all 14 (cells shifted) | not modelled |
| **Subsidy / effective** | **Fredrick only:** M71 "Quotation Rate" typed **58** (₹/W; the computed first quote M66 is 79); M72 `=M71*J58*1000`; M73 `=M72*0.089`; M74 `=ROUND(M73+M72,0)`; M75 Subsidy typed **78000**; M76 `=M74-M75`. No other sheet has a subsidy row | `subsidy 78000` if DCR; effective = final − subsidy |
| **Other ad-hoc cells** | Ananda 10.8 M71:M74 (`=65*4.8`, `=56*10.2`, `=M72+M71`, `=M73/15`, N73 `=M73*0.089`); Aaryan 1kW L73:L78 typed price list; Aaryan side table R14:T29 (customer price breakdown, GST `0.089`); Aaryan O column `=roundup(Mx/0.85,0)` and revenue/COGS block P53:R66 | — |

**Exact disagreements** (no correct variant chosen):
1. Installation rate: 5 values.
2. Liaisoning rate: 6 values.
3. Transport: 3% vs 5%.
4. Insurance: 4 formulas.
5. Profit: 0.149 vs 0.15.
6. GST: 1.089 vs 1.1089 vs 1.138, and the N-column ×1.138 vs ×1.089.
7. The kW multiplier: typed vs `=C1` (§8).
8. calcBOQ prices GST on the unrounded total, while every workbook prices GST on (first-quote rate × kW).
9. Fredrick's customer price uses a *typed* quotation rate (58), not the computed one (79).

---

## 5. Structure logic: evidence

### 5.1 F, B, SH, Prestructure

A text search of every cell in all 21 sheets (formulas and values) for `Prestructure` / `pre-struct`, `S-F`, `S-T`, `N-E`, `GM`, and standalone `F`, `B`, `SH` labels found **no matches**. These terms exist only in the product spec (`01_BOQ_Formula_Calculation_Spec.md` §6) and in the brief. **There is no workbook evidence for their meaning, so none is given here.**

The workbook evidence that might *relate* to them is below, reported without interpretation:
- Fredrick side table O31:R33: labels **"Legs (Front)"** (P31 `=7/3.28`), **"Legs (Middle)"** (P32 `=8/3.28`), **"Legs (Middle)"** (P33 `=9/3.28`), all with quantity 0.
- Foundit side table P49:P53: labels "On Parafeet", "On Roof Parafeet", "On Shed", "On Parafeet (S)".
- The over-shed Al rate L (₹/kW): 2900 (Aaryan, Ananda, Ashwini), 1500 (Celebration non-raised, Fredrick), 3000 (Celebration hybrid), 0 / 2500 (Foundit DCR / NDCR).

### 5.2 Every structure-related value

Raw cells are in Appendix B.

| Value / rule | Where it comes from [WB] | Formula or typed | Enough evidence to automate? |
|---|---|---|---|
| Support length per leg | Side table "Support" Q: Ashwini Q46 = **0.7**, Celebration Q46 / Q47 = **0.75**, Ananda 10.8 / 4.2 Q46 = **1.25**, Ananda 40.2 R49 = **1.5**, Foundit Q47 = **1.0**, Fredrick P27 = **0.5** | typed; × legs (`=R53`) | **No**: 6 values, no rule |
| Rafter length | Ashwini Q47 `=2.4*2-0.7+0.5` (4.6); Celebration Q47 / Q48 same; Foundit Q48 `=2.4*3-0.7+0.5` (7); Ananda 10.8 / 4.2 Q47 typed **4.3**, Q48 **6.6**; Ananda 40.2 R50 4.3, R51 2; Fredrick P29 `=2.4*6-0.7` (13.7); Aaryan R43 `=2.3*2-0.8` | formula with typed constants (2.4 = ?, ×panels across?) | **No**: the multiplier (2/3/6) is typed per sheet; meaning of 2.4 / 0.7 / 0.5 not stated |
| Rafter count | Side table R47 typed (Ashwini 2, Ashwini 4.8 3, Celebration 10, hybrid 6, Ananda 5) | typed | **No** |
| Leg heights | Side table Q49 / Q50 typed as `ft/3.28`: Ashwini 7, 9; Celebration 7, 5; hybrid 2, 4; Ananda 10.8 / 4.2 4, 6; Ananda 34.2 / 40.2 4, 5, 6, 8 (groups "B&C", "A"); Foundit 6, 11, 4, 4, 2; Fredrick 7, 8, 9 | typed | **No** (and not linked to B10 / B11) |
| Leg counts | Side table R49 / R50 typed (Ashwini 2 + 2; Ashwini 4.8 3 + 3; Celebration 10 + 10; Ananda 34.2 4 / 4 / 11 / 11) | typed; R53 `=sum(R49:R52)` | **No** |
| GI structure 80×40 (MTS) | J44 `=roundup(S53/6,0)*6`, S53 `=SUM(S46:S51)` (support + rafters + legs, metres); Ananda 34.2 / 40.2 `=roundup(T45/6,0)*6` / `T57`; Fredrick `=ROUNDUP(R36/6,0)*6`; Aaryan ×3, Ananda 10.8, 4.2 **typed** 48 / 54 / 18 / 48 / 42 | formula on typed sub-table, or typed | Formula **yes** (round up to 6 m lengths); inputs **no** |
| Purlin 40×40 | `=J$14*1.2*3+k` (panels × 3.6 m + k): k = 3.6 (Ashwini, Foundit, Fredrick), 4.5 (Ananda 10.8 / 4.2), 12 (Ananda 34.2 / 40.2), 0 (Aaryan Solar, 1kW); `=3.6*4` (Aaryan Copy); `=round((7*1.2*3+3.6)/6,0)*6` (Celebration ×2, a fixed 7 panels) | formula + typed k | Base formula **yes**; k **no** |
| Parameter purlin (B29 `=ROUNDUP(B22*1.2*3,0)`) | All 14 | formula | **Referenced by no other cell** (verified) |
| Parameter rafters / legs / bracing / rafter length (B25–B28) | All 14 | rafters typed 18 (Aaryan formula); others formula | Rafters and bracing feed only rafter length; **legs, rafter length and purlin are referenced by no other cell** (verified). calcBOQ uses them (L4) |
| Base plate | `=R53*2` (Ashwini, Ananda 10.8 / 4.2, Celebration, Foundit); `=S45*1.5` / `=S57*1.5` (Ananda 34.2 / 40.2); `=Q46*2` (Fredrick); typed 12 / 12 / 4 (Aaryan) | formula on typed leg count | Multiplier **conflicts** (×2 vs ×1.5) |
| Anchor bolts | `=J46*4` (base plates × 4), all 14 | formula | **Yes** (×4 consistent) |
| U / Z clamps | typed in all 14: U 9 / 18 / 78 / 90 / 84 / 33 / 60 / 12 / 3; Z 12 / 18 / 72 / 30 / 6 | typed | **No** (no formula anywhere) |
| Walkway | typed: 3.6, 4.5, 9.6, 10, 21, 29, 0; Aaryan 23 + ladder 2 | typed | **No** |
| Ladder / bracing | typed 0 / 6 / 12 / 24 m; absent in Aaryan | typed | **No** |
| Over-shed Al | typed kW: 0 on Aaryan, Ananda, Ashwini; 9.6 (Celebration; note P42 "9.6kW is on Shed"); `=26*0.6` (hybrid); 3 / 6 (Foundit); 4.2 (Fredrick) | typed | **No**: kW on shed is a project input |
| J-bolt | typed 0 or 6; Celebration `=R53` (= legs) | mixed | **No** |
| Civil block | Ananda 34.2 / 40.2 typed 22; Fredrick `=Q46` | mixed | **No** |
| 3.5 ft GI shed (sqft) / rubber seal | B12 / B13 typed 0 in all 14; **referenced by no cell** (verified) | typed | Not used |

---

## 6. Earthing: every pit count [WB] vs the rule

Rule: base = 2 × inverters + 1; Conventional = base, ESE = base + 2, NA = base − 1 (`earthingRules.ts`). Every LA row in every sheet is specified as "ESE Type - 25 sq.mm".

| Workbook / sheet | Inverters (cell) | Pits typed (cell) | LA rows (qty, spec) | 2n+1 | Conventional (=base) | ESE (+2) | NA (−1) | Typed pits equals |
|---|---|---|---|---|---|---|---|---|
| Aaryan / `Solar BOQ` | 1 (B7) | 3 (B21) | r24 qty 1 'ESE Type - 25 sq.mm ' | 3 | 3 | 5 | 2 | Conventional |
| Aaryan / `Copy of  Solar BOQ` | 1 (B7) | 3 (B21) | r24 qty 1 'ESE Type - 25 sq.mm ' | 3 | 3 | 5 | 2 | Conventional |
| Aaryan / `1kW Solar` | 1 (B7) | 3 (B21) | r24 qty 1 'ESE Type - 25 sq.mm ' | 3 | 3 | 5 | 2 | Conventional |
| Ananda / `34.2kW Non-raised Strucutre Sol` | 2 (B7) | 12 (B21) | r25 qty 2 'ESE Type - 25 sq.mm ' | 5 | 5 | 7 | 4 | none |
| Ananda / `40.2kW Non-raised Strucutre Sol` | 3 (B7) | 12 (B25) | r37 qty 3 'ESE Type - 25 sq.mm ' | 7 | 7 | 9 | 6 | none |
| Ananda / `10.8kW Non-raised Strucutre Sol` | 1 (B7) | 5 (B21) | r25 qty 3 'ESE Type - 25 sq.mm ' | 3 | 3 | 5 | 2 | ESE |
| Ananda / `4.2kW Non-raised Strucutre Sola` | 1 (B7) | 3 (B21) | r25 qty 3 'ESE Type - 25 sq.mm ' | 3 | 3 | 5 | 2 | Conventional |
| Ashwini / `3 kW Raised Structure Solar BOQ` | 1 (B7) | 3 (B21) | r25 qty 1 'ESE Type - 25 sq.mm ' | 3 | 3 | 5 | 2 | Conventional |
| Ashwini / `4.8 kW Raised Structure Solar B` | 1 (B7) | 3 (B21) | r25 qty 1 'ESE Type - 25 sq.mm ' | 3 | 3 | 5 | 2 | Conventional |
| Celebration / `25 kW Non-Raised Structure Sola` | 1 (B7) | 5 (B21) | r25 qty 1 'ESE Type - 25 sq.mm ' | 3 | 3 | 5 | 2 | ESE |
| Celebration / `25 kW Non-Raised + Shed Hybrid` | 1 (B7) | 5 (B21) | r26 qty 1 'ESE Type - 25 sq.mm ' | 3 | 3 | 5 | 2 | ESE |
| Foundit / `6 kW Shed Structure DCR Solar B` | 1 (B7) | 3 (B21) | r26 qty 1 'ESE Type - 25 sq.mm ' | 3 | 3 | 5 | 2 | Conventional |
| Foundit / `6 kW Shed Structure NDCR Solar` | 1 (B7) | 5 (B21) | r26 qty 1 'ESE Type - 25 sq.mm ' | 3 | 3 | 5 | 2 | ESE |
| Fredrick / `3.6 kW Raised Structure Solar B` | 1 (B7) | 4 (B21) | r26 qty 1 'ESE Type - 25 sq.mm ' | 3 | 3 | 5 | 2 | none |

**Where they match** (counts, no rule chosen):
- Typed pits equal **Conventional** in 7 sheets: Aaryan ×3, Ananda 4.2, Ashwini ×2, Foundit DCR.
- Typed pits equal **ESE** in 4 sheets: Ananda 10.8, Celebration ×2, Foundit NDCR.
- Typed pits match **no variant** in 3 sheets: Ananda 34.2 (12 vs 5 / 7 / 4), Ananda 40.2 (12 vs 7 / 9 / 6), Fredrick (4 vs 3 / 5 / 2).
- Using the earthing type the workbooks actually state (ESE), the rule reproduces **4 of 14** sheets.

**Other facts:**
- Pit rate L varies: 500, 700, 1000, 1500, 3500.
- The LA quantity is 3 on Ananda 10.8 / 4.2 / 40.2 and 2 on Ananda 34.2, so LA count ≠ 1 there; the rule does not use LA count.

---

## 7. Cable logic

### 7.1 Exact workbook formulas (Ashwini 3 kW cells; variants noted) vs calcBOQ

| Item | Workbook [WB] | calcBOQ [CODE] |
|---|---|---|
| DC cable length | B16 `=ROUNDUP(($B$23*1.2)+($B$9*2.3),0)*B32` (×strings). Aaryan `…,0)` without multiplier. Ananda 40.2 `…*B45` (B45 = strings) | `ceil(B23*1.2+B9*2.3)*B7` (×inverters) |
| DC cable qty | J19 `=B16+C16` | `B16+15` |
| AC cable length | B17 `=ROUNDUP(($B$6+1)*3.5,0)*B7`; Aaryan without `*B7` | same ×B7 |
| AC cable qty | J23 `=B17+C17` | `B17+40` |
| Earthing structure | B18 `=ROUNDUP(($B$5+2)*3.5+5,0)*B7`; J26 `=B18+C18` | same; `+40` |
| Earthing inverter | B19 `=ROUNDUP($B$6*3.5+5,0)*B7`; J27 `=B19+C19` | same; `+40` |
| LA earthing | B20 `=ROUNDUP(($B$5+1)*3.5+10,0)`; Ananda 34.2 / 40.2 `=ROUNDUP($B$6*3.5+10,0)*B7`; J28 `=B20+C20` | Ashwini form; `+40`; 0 if NA |
| AC inverter→ACDB | J24 `=5*J15`; Ananda 34.2 / 40.2, Fredrick `=10*J15`; Celebration hybrid, Ananda 10.8 / 4.2 typed 10 | `5*B7` |
| DC current | B46 `=(B3*B22/B30/B32)*1.5` | same |
| DC size | B36 `=Sheet2!K24`. Sheet2 K14:K23 picks I (mm²) where current is in (J(prev), J]: **2-core Cu XLPO EB: 24 A→1.5, 33→2.5, 44→4, 57→6, 79→10, 107→16, 142→25, 176→35, 208→50, 255→70**; K24 `=SUM(K14:K23)`; above 255 A → 0 [WB: SUM of FALSE] | `getDCSize`: ≤24 1.5, ≤33 2.5, ≤44 4, ≤57 6, else **10** |
| AC current | B47 `=(B3*B22/B7/C49)*1.5`; C49 `=IFS(B4=3,415*1.7321,B4=1,230)` | not computed |
| AC size | B38 `=Sheet2!$F$45`; F45 `=IFS(phase=1,F24,phase=3,F44)`. F14:F23 (2-core) and F34:F43 (4-core) use column **D (Al amps)**: 30→4, 40→6, 53→10, 70→16, 99→25, 117→35, 140→50, 176→70, 221→95, 258→120 mm² (same list for 2- and 4-core). Sheet2 A2 "HAVELLS XLPE ARMOURED (AC CABLE)". The 1-core (A4:D13) and 3-core (A24:D33) tables are not referenced | "4sq.mm" text |
| Cable cores | B35 DC typed 2 (all 14); B37 `=IFS(B4=3,4,B4=1,2)` | DC: none (B35 misused, L2); AC same |
| Cable tags | J42 `=(B37+B35*2)+2` | `B37+B35*2+2` (wrong B35) |
| Conduit | J40 `=ROUNDUP((J19+J28+J27)/3,0)*3` (DC + LA wire + inverter earthing); Aaryan `=ROUNDUP((J19+J23+J27+J26)/3,0)` (DC + AC + LA + inverter, no ×3) | `ceil((dc16+(B18+40)+(B19+40))/3)*3` |
| Tee bends | J41 `=roundup(J40/2,0)` | `ceil(condQ/2)` |
| Lugs | J30 `=B22*2`; J31 `=B7*2`; J32 `=J29+1`; J33 `=(B35*2)+(B37*2)` | same except J33 (L2) |

**Workbook fact that matters for automation:** the computed cable sizes are **not linked to the line text or price**. The AC size cell (B38) is referenced by **no cell** (verified); the DC size cell (B36) feeds only the "MC4 Connector Size" label cell (B34).
- Ashwini J19 spec reads "2 C. 4 sq.mm" while B36 computes 1.5.
- Celebration B38 computes **10**, while line r23 reads "3.5C X 35 sq.mm", priced ₹264/m.
- The purchased size is typed per project.

### 7.2 Spare lengths: every value [WB]

| Sheet | DC C16 | AC C17 | Earth-structure C18 | Earth-inverter C19 | LA C20 |
|---|---|---|---|---|---|
| Aaryan ×3 | 5 | 10 | 0 | 0 | 0 |
| Ananda 34.2 | 60 | `=120` | 100 | 100 | 0 |
| Ananda 40.2 (C18…C24) | 120 | 100 | 100 | 100 | 60 |
| Ananda 10.8 / 4.2 | 50 | 30 | 35 | 35 | 70 |
| Ashwini 3 / 4.8 | 10 | 10 | 5 | 10 | 5 |
| Celebration non-raised / hybrid | 40 / 60 | 30 | 30 | 30 | 20 |
| Foundit DCR / NDCR | 14 | 10 / 15 | 20 | 15 | 15 |
| Fredrick | 50 | 10 | 30 | 20 | 30 |
| **calcBOQ** | **15** | **40** | **40** | **40** | **40** |

---

## 8. Capacity / kW basis [WB]

| Workbook / sheet | Sheet title | B1 required kW | C1 actual DC kW (`=B3*panels/1000`) | kW cell used by Installation / Liaisoning (row: formula → value) | Rate divisor in ₹/W cells |
|---|---|---|---|---|---|
| Aaryan / `Solar BOQ` | Solar BOQ | 5 | 5.31 | J54: typed → 5; Installation M54 `=L54*J54`; Liaisoning M56 `=L56*J54` | M61 `=M60/1000/$J$54` |
| Aaryan / `Copy of  Solar BOQ` | Copy of  Solar BOQ | 3 | 3.54 | J54: typed → 3.5; Installation M54 `=L54*J54`; Liaisoning M56 `=L56*J54` | M61 `=M60/1000/$J$54` |
| Aaryan / `1kW Solar` | 1kW Solar | 1 | 1.18 | J54: typed → 1.18; Installation M54 `=L54*J54`; Liaisoning M56 `=L56*J54` | M61 `=M60/1000/$J$54` |
| Ananda / `34.2kW Non-raised Strucutre Sol` | 34.2kW Non-raised Strucutre Sol | 34 | 34.2 | J55: typed → 34; Installation M55 `=L55*J55`; Liaisoning M57 `=L57*J55` | M62 `=M61/1000/$J$55` |
| Ananda / `40.2kW Non-raised Strucutre Sol` | 40.2kW Non-raised Strucutre Sol | 40 | 40.5 | J67: `=C1` → 40.5; Installation M67 `=L67*J67`; Liaisoning M69 `=L69*J67` | M74 `=M73/1000/$J$67` |
| Ananda / `10.8kW Non-raised Strucutre Sol` | 10.8kW Non-raised Strucutre Sol | 10.5 | 10.8 | J55: typed → 10.8; Installation M55 `=L55*J55`; Liaisoning M57 `=L57*J55` | M62 `=M61/1000/$J$55` |
| Ananda / `4.2kW Non-raised Strucutre Sola` | 4.2kW Non-raised Strucutre Sola | 4.2 | 4.2 | J55: typed → 4.2; Installation M55 `=L55*J55`; Liaisoning M57 `=L57*J55` | M62 `=M61/1000/$J$55` |
| Ashwini / `3 kW Raised Structure Solar BOQ` | 3 kW Raised Structure Solar BOQ | 3 | 3 | J55: typed → 3; Installation M55 `=L55*J55`; Liaisoning M57 `=L57*J55` | M62 `=M61/1000/$J$55` |
| Ashwini / `4.8 kW Raised Structure Solar B` | 4.8 kW Raised Structure Solar B | 4.8 | 4.8 | J55: `=C1` → 4.8; Installation M55 `=L55*J55`; Liaisoning M57 `=L57*J55` | M62 `=M61/1000/$J$55` |
| Celebration / `25 kW Non-Raised Structure Sola` | 25 kW Non-Raised Structure Sola | 25 | 25.2 | J55: `=C1` → 25.2; Installation M55 `=L55*J55`; Liaisoning M57 `=L57*J55` | M62 `=M61/1000/$J$55` |
| Celebration / `25 kW Non-Raised + Shed Hybrid` | 25 kW Non-Raised + Shed Hybrid | 25 | 25.2 | J56: `=C1` → 25.2; Installation M56 `=L56*J56`; Liaisoning M58 `=L58*J56` | M63 `=M62/1000/$J$56` |
| Foundit / `6 kW Shed Structure DCR Solar B` | 6 kW Shed Structure DCR Solar B | 3 | 3 | J56: `=C1` → 3; Installation M56 `=L56*J56`; Liaisoning M58 `=L58*J56` | M63 `=M62/1000/$J$56` |
| Foundit / `6 kW Shed Structure NDCR Solar` | 6 kW Shed Structure NDCR Solar | 6 | 6 | J56: `=C1` → 6; Installation M56 `=L56*J56`; Liaisoning M58 `=L58*J56` | M63 `=M62/1000/$J$56` |
| Fredrick / `3.6 kW Raised Structure Solar B` | 3.6 kW Raised Structure Solar B | 5.4 | 5.4 | J58: typed → 5.4; Installation M58 `=L58*J58`; Liaisoning M60 `=L60*J58` | M65 `=M64/1000/$J$58` |

**Facts:**
- Sheet-title kW vs B1 / C1:
  - title = **C1, not B1** in 2 sheets: Ananda 34.2 (B1 34), Ananda 10.8 (B1 10.5);
  - title = **B1, not C1** in 3 sheets: Celebration ×2 (25 vs C1 25.2), Aaryan 1kW (1 vs 1.18);
  - title = B1 = C1 in 4 sheets: Ananda 4.2, Ashwini 3, Ashwini 4.8, Foundit NDCR;
  - title matches **neither** in 3 sheets: Ananda 40.2 (title 40.2, B1 40, C1 40.5), Foundit DCR (title 6, B1 = C1 = 3), Fredrick (title 3.6, B1 = C1 = 5.4);
  - no kW in the title in 2 sheets: Aaryan Solar BOQ, Copy.
- The kW used for installation, liaisoning and ₹/W is typed in 8 sheets and `=C1` in 6.

**25 vs 25.2 kW (Celebration non-raised):**
- J55 `=C1` = 25.2, so installation is 4000 × 25.2 = ₹100,800 (vs ₹100,000 on B1 = 25) and liaisoning 2500 × 25.2 = ₹63,000 (vs ₹62,500).
- ₹/W M62 `=M61/1000/$J$55` divides by 25.2.
- calcBOQ always uses `B1` for installation, liaisoning and rate [CODE].
- Capacity-range membership is the same for 25 and 25.2 (21–50 kW) in this example. It would differ at a boundary, e.g. B1 = 6 with C1 = 6.3.

---

## 9. Template-default candidates

Strength reflects how consistently the value appears across the 14 sheets [WB]. None of these is a decision.

| Candidate | Values seen | Evidence |
|---|---|---|
| DC MCB rating 32 A | 32 in 14/14; feeds only "No. of DC MCB", which **no cell uses** (verified) | **Strong** value, but unused |
| AC MCB rating 64 A, count 2 | 14/14; **referenced by no cell** (verified) | **Strong** value, but unused |
| LA earthing cable 16 mm² / earthing cable 4 mm² | 14/14; **referenced by no cell** (verified); line specs say 25 mm² (LA) and 6 mm² | **Strong** value, but unused and contradicted by line text |
| DC cable cores = 2 | 14/14 | **Strong** |
| Glands qty 0 | 14/14 | **Strong** |
| Cable ties 1 packet | 13/14 (Fredrick 2) | **Strong** |
| Anchor bolts per base plate = 4 | 14/14 formula | **Strong** |
| Lug / nut-bolt multipliers (×2, ×2, +1, ×6) | 14/14 formula | **Strong** |
| Transport 3% | 11/14 (Aaryan 5%) | **Medium** |
| Electrical tape 6 | 10/14 (Aaryan 3, Fredrick 10) | **Medium** |
| Insurance `×1.2/1000×3×5` | 8/14 | **Medium** |
| Profit 0.149 vs 0.15 | 8 / 6 | **Weak** (split) |
| GST ×1.089 on quoted price | 9/14 | **Medium** |
| AC inverter→ACDB 5 m per inverter | `=5*J15` in 5 (Ashwini ×2, Celebration non-raised, Foundit ×2); `=10*J15` in 3 (Ananda 34.2, 40.2, Fredrick); typed 10 in 3 (Celebration hybrid, Ananda 10.8, 4.2); absent in Aaryan ×3 | **Weak** |
| Data logger qty | 1 in 8 sheets (Aaryan ×3, Ananda ×4, Fredrick), 0 in 3 (Ashwini ×2, Celebration non-raised), no row in 3 (Celebration hybrid, Foundit ×2) | **Weak** |
| LA count 1 | 10/14 (Ananda 34.2 = 2; 40.2, 10.8, 4.2 = 3) | **Medium** |
| ACDB qty = inverters | formula `=B7` / `=J15` in 9 sheets (Ananda 40.2 plus 2 typed rows); typed only in 5 (Aaryan 2 / 1 / 1, Ananda 10.8 / 4.2 = 1) | **Weak** |
| Purlin extra k | 0 / 3.6 / 4.5 / 12 / fixed | **Weak** |
| Support length per leg | 0.5–1.5 | **Weak** |
| Spare cable lengths | §7.2: 0–120 m | **Weak** (per project) |
| Clamps, walkway, ladder | typed per project | **Unknown** |
| Installation ₹/kW | 3500–9000 | **Weak** |
| Liaisoning ₹/kW | 0–4000 | **Weak** |
| Panel Voc 49.82 | 14/14, but belongs to a 540 Wp panel | **Unknown** as a default (catalogue value) |

---

## 10. Multi-inverter / multi-brand: Ananda 40.2 kW (C1 = 40.5)

Full dump of the sheet below. Here is how it handles each part [WB]:

- **Inverter combination.**
  - Three separate rows (r15 / r16 / r17), each typed qty **1**: "25 kW", "12 kW", "6 kW", priced 75,000 / 59,300 / 46,000. Sum 43 kW AC vs 40.5 kW DC.
  - B7 "No. of Inverter" = 3 is typed separately and is not linked to the rows.
  - B8 "Inverter Size" holds one value ("12 kW", Solis), used only for the Sheet2 input-voltage lookup (B61 = 600).
  - All three rows carry the identical text "(2 MPPT, 4 String, 13 Panel*1 String)", so the per-inverter spec text was not updated.
  - Make is "Solis/Solax/Growatt/Deye" on r15 only.
- **Strings.** One system-wide value B45 = 6 (typed). Panels/string B44 `=B28/B45` = **12.5** (fractional); string Voc B43 = 622.75 and DC current B59 are computed for the whole array, not per inverter.
- **DCDB.** Three rows: 4 IN / 4 OUT `=J15` (₹8,600); 2 IN / 2 OUT typed 1 (₹3,325); 2 IN / 2 OUT typed 1 (₹1,850). Different size per inverter.
- **ACDB.** Three rows: 3 IN / 3 OUT `=J15` (₹8,900); 1 IN / 1 OUT typed 1 (₹6,700); 1 IN / 1 OUT typed 1 (₹5,650).
- **MCB at LT panel.** Three rows: 63 A 4P `=J15`, 32 A 4P typed 1, 25 A 4P typed 1.
- **AC cable (inverter→meter).** Three rows (3.5C×35, 4C×16, 4C×10 Al), **each** with qty `=B19+C19` = 175 m. **Only r31 has a price formula** (M31 `=J31*L31` = 46,025); M32 and M33 are **empty**, so those two rows add ₹0 to material.
- **AC inverter→ACDB.** Three rows (Cu 3.5C×25, 4C×6, 4C×4), each `=10*J15` = 10 m. **M36 is `=J36*L31`** (uses row 31's rate): ₹2,630 instead of 10 × 326 = ₹3,260. This is a workbook cell-reference error.
- **Earthing.** Pits typed 12 (B25). Earthing lengths use `×B7` (3 inverters). LA wire uses `=ROUNDUP($B$6*3.5+10,0)*B7` (×3). LA count typed 3.
- **Pricing.**
  - Every row has its own typed L.
  - The side table O15:S20 holds a "per inverter price" average (`=S19/Q19` = 65,000 from 25 kW @ 75,000 + 12 kW @ 55,000). It is not used here.
  - **Ananda 34.2** uses that method instead: one inverter row qty `=B7` = 2 at L15 = 65,000, the *average* of a 25 kW and a 12 kW unit (side table O15:S18).
- **calcBOQ on the same inputs** [CODE run]: one inverter row qty 3 at one price; DCDB 3 at one price; ACDB 1; MCB 1; AC cable 115 m; inverter→ACDB 15 m; pits 9.

**What the new engine must support** (each is [INF] from the facts above):
1. Several inverter lines in one system, each with its own model, size, qty and price; the system inverter count is the sum of those lines, not a separate typed number.
2. Per-inverter DCDB, ACDB, MCB and AC-cable lines sized to that inverter.
3. Strings per inverter (per MPPT), so panels/string is never fractional.
4. Unpriced or alternative lines must be explicit (an "option" flag), not silent blanks.
5. Exact per-SKU pricing, never averaging.
6. Price formulas bound to their own row (the M36 class of error must be impossible).

Full sheet:

Parameter block:

| Label | Row | B | C |
|---|---|---|---|
| Required Solar Capacity | 1 | typed 40.0 → 40 | `=$B$3*$B$28/1000` → 40.5 |
| Panel Price/Wp | 2 | typed 25.0 → 25 |  |
| Solar Module Size (W) | 3 | typed 540.0 → 540 |  |
| System Connection Phase | 4 | typed 3.0 → 3 |  |
| Building No. of Floors | 5 | typed 6.0 → 6 |  |
| Inverter Installation Floor | 6 | typed 6.0 → 6 |  |
| No. of Inverter | 7 | typed 3.0 → 3 |  |
| Inverter Size | 8 | typed '12 kW' → 12 kW | typed 'Solis' → Solis |
| No. of Panel Rows | 9 | typed 8.0 → 8 |  |
| Structure Height Lower (FT.) | 10 | typed 7.0 → 7 | `=($B$10*0.305)` → 2.135 |
| Structure Height Upper (FT.) | 11 | typed 9.0 → 9 | `=(B11*0.305)` → 2.745 |
| 3.5ft GI Shed (sqft) | 12 | typed 0.0 → 0 |  |
| Rubber Seal Water Proof (MTS.) | 13 | typed 0.0 → 0 |  |
| Battery Size | 14 | typed 0.0 → 0 | typed 'Lead Acid' → Lead Acid |
| No. of Batteries | 15 | typed 0.0 → 0 | typed '(Extra Length)' → (Extra Length) |
| DC Cable Length (MTS.) | 18 | `=ROUNDUP(($B$31*1.2)+($B$9*2.3),0)*B45` → 180 | typed 120.0 → 120 |
| AC Cable Length (MTS.) | 19 | `=ROUNDUP(($B$6+1)*3.5,0)*B7` → 75 | typed 100.0 → 100 |
| Earthing Cable Length for Structure (MTS.) | 20 | `=ROUNDUP(($B$5+2)*3.5+5,0)*B7` → 99 | typed 100.0 → 100 |
| Earthing Cable Length for Inverter (MTS.) | 23 | `=ROUNDUP($B$6*3.5+5,0)*B7` → 78 | typed 100.0 → 100 |
| LA Earthing Cable Length (MTS.) | 24 | `=ROUNDUP($B$6*3.5+10,0)*B7` → 93 | typed 60.0 → 60 |
| No. of Earthing Pit | 25 | typed 12.0 → 12 |  |
| No. of Solar Panels | 28 | `=ROUNDUP(($B$1*1000/$B$3),0)` → 75 |  |
| No. of Panels in a Line | 31 | `=B28/B9` → 9.375 |  |
| No. of rafters | 38 | typed 18.0 → 18 |  |
| No of legs | 39 | `=ROUNDUP(B9/2,0)+1` → 5 | `=if(B9/3=int(B9/3),0,1)` → 1 |
| Bracing Support Length | 40 | `=3*B9/2` → 12 |  |
| Rafter Length 80x40x2mm (MTS) | 41 | `=ROUNDUP((B38*2.3*B9)+(B38*C10)+(B38*C11)+(B40*0.5),-1)` → 430 |  |
| Purlin Length 40x40x2mm (MTS) | 42 | `=ROUNDUP(($B$28*1.2*3),0)` → 270 |  |
| Voltage per String | 43 | `=49.82*(B28/B45)` → 622.75 | typed 'for 550Wp PV ' → for 550Wp PV  |
| No of panels/string | 44 | `=B28/B45` → 12.5 |  |
| No. of Strings | 45 | typed 6.0 → 6 |  |
| No. of MC4 Connectors | 46 | `=$B$45*4` → 24 |  |
| MC4 Connector Size (sqmm) | 47 | `=$B$49` → 1.5 |  |
| DC Cable Size (No. of Cores) | 48 | typed 2.0 → 2 |  |
| DC Cable Size (sqmm) | 49 | `=Sheet2!K24` → 1.5 |  |
| AC Cable Size (No. of Cores) | 50 | `=IFS(B4=3,4,B4=1,2)` → 4 |  |
| AC Cable Size (sqmm) | 51 | `=Sheet2!$F$45` → 6 |  |
| LA Earthing Cable Size (sqmm) | 52 | typed 16.0 → 16 |  |
| Earthing Cable Size (sqmm) | 53 | typed 4.0 → 4 |  |
| DC MCB Rating (Amp) | 55 | typed 32.0 → 32 |  |
| No. of DC MCB (2 Pole) | 56 | `=IF(B59<B55,1,2)` → 1 |  |
| AC MCB Rating (Amp) | 57 | typed 64.0 → 64 |  |
| No. of AC MCB | 58 | typed 2.0 → 2 |  |
| DC Cable Current | 59 | `=(B3*B28/B43/B45)*1.5` → 16.2585 |  |
| AC Cable Current | 60 | `=(B3*B28/B7/C62)*1.5` → 28.1711 |  |
| Inverter Input Side Voltage | 61 | `=IFS(C8="Solis",INDEX(Sheet2!A50:I69,MATCH(B8,Sheet2!A50:A69,0),9),C8="Solax",INDEX(Sheet2!A71:I93,MATCH(B8,Sheet2!A71:A93,0),9))` → 600 |  |
| Inverter Output Side Voltage | 62 | `=C62/1.7321` → 415 | `=IFS(B4=3,415*1.7321,B4=1,230)` → 718.822 |

Lines:

| Row | Material | Specification | Make | Unit | J | L | M |
|---|---|---|---|---|---|---|---|
| 14 | Solar module | 600 Wp Mono Perc DCR | ReNew or as equivalent | Nos. | `=$B$28` → 75 | `=B3*B2` | 1.0125e+06 |
| 15 | Solar inverter | 25 kW (2 MPPT, 4 String, 13 Panel*1 String) | Solis/Solax/Growatt/Deye | Nos. | typed 1.0 → 1 | 75000 | 75000 |
| 16 |  | 12 kW (2 MPPT, 4 String, 13 Panel*1 String) |  | Nos. | typed 1.0 → 1 | 59300 | 59300 |
| 17 |  | 6 kW (2 MPPT, 4 String, 13 Panel*1 String) |  | Nos. | typed 1.0 → 1 | 46000 | 46000 |
| 18 | Data logger | Ethernet/Wifi/GPRS | As per inverter company | Nos. | typed 1.0 → 1 | — | 0 |
| 19 | Battery | =B14 | Exide/Livguard/Luminous | Nos. | `=B15` → 0 | — | — |
| 20 | DC Distribution Box | Technical Specs of DC Distribution Box (4 IN / 4 OUT) :-  -  | ABB/Schinder/L&T/Havells | Nos. | `=J15` → 1 | 8600 | 8600 |
| 21 |  | Technical Specs of DC Distribution Box (2 IN / 2 OUT) :-  -  | ABB/Schinder/L&T/Havells | Nos. | typed 1.0 → 1 | 3325 | 3325 |
| 22 |  | Technical Specs of DC Distribution Box (2 IN / 2 OUT) :-  -  | ABB/Schinder/L&T/Havells | Nos. | typed 1.0 → 1 | 1850 | 1850 |
| 23 | DC Cable | 2 C. 4 sq.mm , Annealed Tinned Flexible Cu Conductor Electro | Polycab | MTS | `=B18+C18` → 300 | 115 | 34500 |
| 24 | MC4 Connectors | 4 sq.mm, 1000 V DC, IP68, Application Class-A, Protection cl | Elmex | Pair | `=B46` → 24 | 50 | 1200 |
| 25 | AC Distribution Box (Solar LT Panel) | Technical Specs of AC Distribution Box (3 IN / 3 OUT) :-  -  | ABB/Schinder/L&T | Nos. | `=J15` → 1 | 8900 | 8900 |
| 26 |  | Technical Specs of AC Distribution Box (1 IN / 1 OUT) :-  -  | ABB/Schinder/L&T | Nos. | typed 1.0 → 1 | 6700 | 6700 |
| 27 |  | Technical Specs of AC Distribution Box (1 IN / 1 OUT) :-  -  | ABB/Schinder/L&T | Nos. | typed 1.0 → 1 | 5650 | 5650 |
| 28 | MCB at Client's LT Panel | Technical Specs :-  - 1 Nos. of  63 Amps 4P MCB in Client LT | ABB/Schinder/L&T/EQV. | Nos. | `=J15` → 1 | 2100 | 2100 |
| 29 |  | Technical Specs :-  - 1 Nos. of  32 Amps 4P MCB in Client LT | ABB/Schinder/L&T/EQV. | Nos. | typed 1.0 → 1 | 1500 | 1500 |
| 30 |  | Technical Specs :-  - 1 Nos. of  25 Amps 4P MCB in Client LT | ABB/Schinder/L&T/EQV. | Nos. | typed 1.0 → 1 | 975 | 975 |
| 31 | AC Cable | 1.1 kV ,Al. Conductor XLPE - 1R X 3.5C X 35 sq.mm insulated  | Polycab/Havells/KEI | MTS | `=B19+C19` → 175 | 263 | 46025 |
| 32 |  | 1.1 kV ,Al. Conductor XLPE - 1R X 4C X 16 sq.mm insulated PV | Polycab/Havells/KEI | MTS | `=B19+C19` → 175 | 185 | — |
| 33 |  | 1.1 kV ,Al. Conductor XLPE - 1R X 4C X 10 sq.mm insulated PV | Polycab/Havells/KEI | MTS | `=B19+C19` → 175 | 187 | — |
| 34 | AC Cable (Inverter to ACDB) | 1R x 3.5C x 25 Sqmm ARM Cu |  | MTS | `=10*J15` → 10 | 1289 | 12890 |
| 35 |  | 1R x 4C x 6 Sqmm ARM Cu |  | MTS | `=10*J15` → 10 | 1504 | 15040 |
| 36 |  | 1R x 4C x 4 Sqmm ARM Cu |  | MTS | `=10*J15` → 10 | 326 | 2630 |
| 37 | LA With Mounting Accessories | ESE Type - 25 sq.mm - Suitable for mounting arrangement for  | Vasudha/Jenflex /EQV. | Nos. | typed 3.0 → 3 | 1000 | 3000 |
| 38 | Earthing cable | 1.1KV, Flexible Copper Conducter FRLS - 1C X 6 sq.mm insulat | Polycab/Havells/KEI | MTS | `=B20+C20` → 199 | 21 | 4179 |
| 39 |  | 1.1KV, Flexible Copper Conducter FRLS - 1C X 6 sq.mm insulat | Polycab/Havells/KEI | MTS | `=B23+C23` → 178 | 21 | 3738 |
| 40 |  | 1.1KV, Earthing wire, 25 sq.mm as per IS 695/IS 1554. (LA Ea | Polycab/Havells/KEI | MTS | `=B24+C24` → 153 | 25 | 3825 |
| 41 | Earthing Pit details | Earthing Pit Specification (DC Earthing for Structure & DC A | - | Nos. | `=$B$25` → 12 | 1500 | 18000 |
| 42 | Lugs | Cu., Ring Type- 6 Sq.mm. (Panel to Panel earthing) | Reputed | Nos. | `=B28*2` → 150 | 5 | 750 |
| 43 |  | Cu., pin Type- 6 Sq.mm. (Inverter earthing) | Reputed | Nos. | `=B7*2` → 6 | 10 | 60 |
| 44 |  | LA earthing - Al , ring type 16 sqmm | Reputed | Nos. | `=J41+1` → 13 | 20 | 260 |
| 45 |  | Cu, Ring Type - 4 Sq.mm - Long Barrel type (ACDB & DCDB I/P  | Reputed | Nos. | `=(B48*2)+(B50*2)` → 12 | 10 | 120 |
| 46 | Glands  (PVC Type ) | 32mm for 1C X 6 sqmm (HEX) | HUMMEL/METALMECH | Nos. | typed 0.0 → 0 | 20 | 0 |
| 47 | Nut Bolt & Washer Set | 100mm X M10 (Anchor Bolt) | Reputed | Nos. | `=J58*4` → 180 | 16 | 2880 |
| 48 |  | M8 or M6 Hot Dip Galvanised - Inverter earthing | Reputed | Nos. | `=B7*6` → 18 | 10 | 180 |
| 49 |  | M8 x 100 Hot Dip Galvanised for Purlin | Reputed | Nos. | typed 0.0 → 0 | 10 | 0 |
| 50 | Eletrical Tape | R,Y,B,Black,G (Each) | Reputed | Nos. | typed 6.0 → 6 | 20 | 120 |
| 51 | Cable Ties | Nylon Cable Tie,-10 85 degree UV Protected - size 300*4.8 mm | Reputed | Packet | typed 1.0 → 1 | 200 | 200 |
| 52 | Conduits | PVC Flexible and Fixed Conduit - 25 mm | TIGER/APOLLO | MTS | `=ROUNDUP((J23+J40+J39)/3,0)*3` → 633 | 20 | 12660 |
| 53 |  | Tee Bend 25 mm PVC |  | Nos. | `=roundup(J52/2,0)` → 317 | 10 | 3170 |
| 54 | Cable Tag | 2C X 6 Sqmm, CU CABLE, INVERTER NO. xx TO LT PANEL NO. xx | Reputed | Nos. | `=(B50+B48*2)+2` → 10 | 20 | 200 |
| 55 | Ferules | Pre Printed - 8mm - 1 To 2 STRING | Reputed | Set | `=B45` → 6 | 30 | 180 |
| 56 | Structure | ISI standard 80 microns GI structure | 80x40x2 | MTS | `=roundup(T57/6,0)*6` → 150 | 338 | 50700 |
| 57 |  |  | 40x40x2 (Purlin) | MTS | `=J$14*1.2*3+12` → 282 | 180 | 50760 |
| 58 |  |  | Base plate | Nos. | `=S57*1.5` → 45 | 120 | 5400 |
| 59 |  | Ladder and Cross bracing | 40x40x2 | MTS. | typed 24.0 → 24 | 160 | 3840 |
| 60 |  | Walkway |  | MTS. | typed 21.0 → 21 | 800 | 16800 |
| 61 |  | Over the shed Al structure |  | kW | typed 0.0 → 0 | 2900 | 0 |
| 62 | U-Clamp | With Spring and SS- 304 Nut & Bolt | Reputed | Nos. | typed 78.0 → 78 | 40 | 3120 |
| 63 | Z-Clamp | With Spring and SS- 304 Nut & Bolt | Reputed | Nos. | typed 18.0 → 18 | 40 | 720 |
| 64 | Cleaning System | Sprinkler | Reputed | kW | typed 0.0 → 0 | 2755 | — |
| 65 | Civil | Block | 300*300*300 | Nos. | typed 22.0 → 22 | 350 | 7700 |

calcBOQ on the same inputs (ESE): 2 Solar Inverter = 3; 5 DCDB = 3; 6 ACDB = 1; 7 MCB at LT Panel = 1; 10 AC Cable (Inv–Meter–DB) = 115; 11 AC Cable (Inv–ACDB) = 15; 16 Earthing Pit = 9

---

## 11. Missing source data

We do **not** have enough evidence for:

1. **Any system above 40.5 kW.** No 51–100 kW and no 100+ kW example exists. The 21–50 kW range has two projects (Celebration 25.2, Ananda 34.2 / 40.5).
2. **Inverter catalogue specs.** MPPT, strings and voltage exist only in Sheet2 A50:I93, for **Solis (1–50 kW) and Solax (0.6–15 kW)**. None for Growatt or Deye, which are named in line text. The app's `inverter_prices` table has no MPPT / string / voltage columns [CODE].
3. **Panel electrical specs.** One Voc / Isc pair (Sheet2 L48:L51, for 540 Wp and 535 Wp); the 600 Wp panels used in 11 sheets have none.
4. **BOS SKU / brand mapping.** Line "Make" is free text ("ABB/Schinder/L&T", "Polycab/Havells/KEI", "Reputed"); there are no SKUs. The app catalogue has one flat price per BOS key [CODE].
5. **Structure automation.** Every structure quantity rests on hand-typed sub-tables (§5); there is no rule linking structure type, rows or heights to legs, rafters, supports or clamps.
6. **F / B / SH / Prestructure** definitions (§5.1).
7. **Canonical commercial rules** (§4): installation, liaisoning, insurance, profit, transport and GST all vary.
8. **Earthing rule source**: the workbooks never compute pits (§6).
9. **Hybrid / off-grid specifics**: battery sizing (B14 is text, e.g. "5kWh", "100Ah 51.2V"), DC MCB 160 A and bypass switch appear only as typed lines in 3 sheets.
10. **Cable sizes actually purchased**: the purchased size is typed and not linked to the computed size (§7.1).
11. **C&I TOD sizing reference**: not part of these BOQ workbooks; the Phase 4 assumption is unverified here.

---

## 12. Final decision table

| Decision | Evidence | Options found | Recommendation | Confidence | What business owner must confirm |
|---|---|---|---|---|---|
| F / B / SH / Prestructure | [WB] none in any cell; only Fredrick "Legs (Front / Middle)" and Foundit "On Shed / Parafeet" labels | None in source | Do not implement until defined. [INF] keep the structure section as editable template lines | High that it's undefined | Exact definition, units, which BOQ lines each value drives, with one worked example per structure type |
| Earthing rule | §6: rule matches 4/14 (ESE), Conventional 7/14, none 3/14 | Typed per project; `2n+1 ±` | [BIZ] Your rule is your stated policy. [INF] keep it as the default and keep the per-BOQ override | Medium | Is `2n+1 ±` authoritative even though 3 real projects used 4 / 12 / 12 pits? Should LA count matter? |
| Spare cable lengths | §7.2: 0–120 m, per project | Typed per project; calcBOQ 15 / 40 | [INF] template default per capacity range, editable per BOQ | Low | Default spares per range, or always ask? |
| Clamp / walkway / ladder / LA rules | §5.2: all typed | Typed; calcBOQ heuristics (×1.5, ×2, 5, 18) | [INF] template defaults or project inputs; drop calcBOQ heuristics only in a new template | Low | Any rule (per panel / row / kW)? Else, who enters them? |
| Purlin extra k | 0 / 3.6 / 4.5 / 12 / fixed formulas | `panels×3.6 + k` | [INF] base formula as constant, k as template default | Medium (base), Low (k) | What k represents, and its value per structure type |
| Commercial factors | §4: 5 installation, 6 liaisoning, 4 insurance, 2 profit, 2 transport rates | All listed | [BIZ] per-company commercial defaults on the template | Low | Canonical installation, liaisoning, transport, insurance formula and profit per range or company |
| Quoted price formula | §4: all 14 use first-quote rate × kW × GST; calcBOQ uses unrounded total × GST | 2 | [BIZ] | High that they differ | Which number the customer sees; whether the +₹2/W rounding is part of the price |
| GST factor | ×1.089 (9), ×1.1089 (3), ×1.138 (2) | 3 | [BIZ] | High that they differ | Current GST rule (and whether ×1.1089 is a typo) |
| kW basis | §8: typed (8), `=C1` (6); calcBOQ B1 | B1 / C1 / typed | [BIZ] | High that they differ | kW for per-kW charges, ₹/W and range selection: required or actual DC |
| Capacity boundaries | None in workbooks | — | [BIZ] | — | Where 6.x, 20.x, 50.x kW fall (≤ / <), on which kW basis |
| ACDB quantity | Formula per inverter (7), typed 1 / 2 (6); Ananda 40.2 per-inverter rows; calcBOQ 1 | 3 | [INF] one per inverter line for template v1 | Medium | One per inverter, or one per system (+ combiner)? |
| Anchor-bolt handling | §1.1 L1: calcBOQ 1,536 vs workbook 32 | Fix in legacy (changes drafts / new quotes) or new engine only | [BIZ] | High (defect is measured) | Fix legacy-v1 now as a separate change, or freeze legacy and fix only in templates? Same question for L2 (lugs / tags) and L3 (DC length) |
| Company-specific templates | Workbooks are one company's per-project copies; side tables copied stale across files (P14:S18 inverter-price block identical in 8 sheets: Ananda 10.8 / 4.2, Ashwini ×2, Celebration ×2, Foundit ×2) | Seeded per company / shared | [INF] seed each company with its own editable copy | Medium | Do vendors get EnergyBae's defaults, or start blank? |
| TOD sizing (Phase 4) | Not in these BOQ workbooks | TOD-adjusted if readings exist, else full | Keep as is, flagged | Low | Confirm against the C&I reference workbook |
| Structure GI / base plate | Formula on hand sub-tables; base plate ×2 vs ×1.5 | 2 multipliers | [INF] template lines with editable quantities until rules exist | Low | Rule for legs, supports and rafters per structure type; base-plate multiplier |
| Over-shed Al | Typed kW, 0 on raised; calcBOQ = B1 always | 2 | [INF] structure-type rule | Medium | Which structure types carry the over-shed line, and what kW |
| Panel Voc | 49.82 (540 Wp) used for 600 Wp panels in all sheets | Constant / catalogue | [INF] catalogue value per panel | Medium | Provide Voc / Isc per panel model |

---

## 13. Implementation recommendation

Nothing below is implemented. 5C onward is not to start until §12 is answered.

### 5A: rule interpreter + legacy-v1 definition (no DB, no UI, no behaviour change)
- [CODE] calcBOQ stays byte-for-byte unchanged and remains the engine for every existing proposal.
- Build a pure, typed rule interpreter (FIXED / REF / LINEAR / ROUND_UP / CONDITIONAL / CALC / CATALOGUE_LOOKUP / PRICE_LOOKUP) and express **legacy-v1 as data that reproduces calcBOQ exactly, defects L1–L8 included**.
- Exit test: identical BOQItem[] (qty, unitCost, price, spec, name) for a grid of inputs, overrides and removals.
- Why first [INF]: it proves the interpreter can carry today's behaviour before any number changes.

### 5B: workbook golden harness (no DB, no behaviour change)
- Commit a fixture extractor (the scripts used for this report) that writes one JSON per sheet: inputs, typed values, cached line quantities and commercial cells.
- Golden tests assert **only cells with a workbook formula**, fed with that sheet's typed values as project inputs, against a *draft* "workbook-aligned" definition. Typed cells are carried as inputs, never asserted as rules.
- Every known difference in §2 is recorded in an explicit expected-differences list, so the test reports MATCH / DIFFERENT rather than hiding anything.
- The workbook-aligned definition stays a draft until §12 is answered. Items that need a [BIZ] answer are left as editable template lines, not rules.

### 5C: ranges, templates, versions (migration 0019, Dev)
- Start only after §12 items 1–10.
- Seed ranges as data (boundaries per your answer) and two templates per company: "Current calculator (legacy-v1)" and, only if approved, "Workbook-aligned v1".

### 5D: automatic template selection
- Needs the kW basis and boundary answers. Pure function + boundary tests.

### 5E: system BOQ generation and snapshot (migration 0020, Dev)
- One snapshot per project system.
- Stores template version, inputs, trace and per-line catalogue reference (supports the §10 multi-inverter needs).
- Existing proposals untouched.

### 5F: manual editing on generated BOQs
- Overrides keyed by template item key.
- Regenerate keeps edits.
- Multiple lines per category (multi-brand, multi-inverter).
- Reuse `BOQTable`, `sanitizePrice`, `matchWirePrice`, `findBestInverter`.

### Separately [BIZ]
Whether to correct calcBOQ defects L1 (anchor bolts), L2 (lugs / tags) and L3 (DC length) in the live legacy engine. That would change draft recomputes and new quotes, so it is your decision. It has not been done.


---

## Appendix A: commercial block, every sheet, cell by cell [WB]

Quote header cells (E1:J8):

- **Aaryan / `Solar BOQ`**: F1 'Rate With Structure'; I1 'Rate Without Structure'; F2 'Rate With Laisoning'; G2 `=M61` → 74.658; I2 'Rate With Liaisoning'; J2 `=(M60-M43)/1000/J54` → 71.893; F3 'Rate Without Laisoning'; G3 `=N61` → 84.961; I3 'Rate Without Liaisoning'; J3 `=(M60-M56-M43)/1000/J54` → 67.893; F4 'First Quote Rate Without Laisoning'; G4 `=N62` → 87; I4 'First Quote Rate Without Liaisoning'; J4 `=ROUNDUP(J3,0)+2` → 70; F5 'First Quote Rate With Laisoning'; G5 `=M62` → 77
- **Aaryan / `Copy of  Solar BOQ`**: F1 'Rate With Structure'; I1 'Rate Without Structure'; F2 'Rate With Laisoning'; G2 `=M61` → 61.457; I2 'Rate With Liaisoning'; J2 `=(M60-M43)/1000/J54` → 57.014; F3 'Rate Without Laisoning'; G3 `=N61` → 69.938; I3 'Rate Without Liaisoning'; J3 `=(M60-M56-M43)/1000/J54` → 53.014; F4 'First Quote Rate Without Laisoning'; G4 `=N62` → 72; I4 'First Quote Rate Without Liaisoning'; J4 `=ROUNDUP(J3,0)+2` → 56; F5 'First Quote Rate With Laisoning'; G5 `=M62` → 64
- **Aaryan / `1kW Solar`**: F1 'Rate With Structure'; I1 'Rate Without Structure'; F2 'Rate With Laisoning'; G2 `=M61` → 73.845; I2 'Rate With Liaisoning'; J2 `=(M60-M43)/1000/J54` → 69.452; F3 'Rate Without Laisoning'; G3 `=N61` → 84.035; I3 'Rate Without Liaisoning'; J3 `=(M60-M56-M43)/1000/J54` → 69.452; F4 'First Quote Rate Without Laisoning'; G4 `=N62` → 87; I4 'First Quote Rate Without Liaisoning'; J4 `=ROUNDUP(J3,0)+2` → 72; F5 'First Quote Rate With Laisoning'; G5 `=M62` → 76
- **Ananda / `34.2kW Non-raised Strucutre Sol`**: F1 'Rate With Structure'; I1 'Rate Without Structure'; F2 'Rate With Laisoning'; G2 `=M62` → 51.878; I2 'Rate With Liaisoning'; J2 `=(M61-M44)/1000/J55` → 50.607; F3 'Rate Without Laisoning'; G3 `=N62` → 56.495; I3 'Rate Without Liaisoning'; J3 `=(M61-M57-M44)/1000/J55` → 48.607; F4 'First Quote Rate Without Laisoning'; G4 `=N63` → 59; I4 'First Quote Rate Without Liaisoning'; J4 `=ROUNDUP(J3,0)+2` → 51; F5 'First Quote Rate With Laisoning'; G5 `=M63` → 54
- **Ananda / `40.2kW Non-raised Strucutre Sol`**: F1 'Rate With Structure'; I1 'Rate Without Structure'; F2 'Rate With Laisoning'; G2 `=M74` → 54.268; I2 'Rate With Liaisoning'; J2 `=(M73-M56)/1000/J67` → 53.016; F3 'Rate Without Laisoning'; G3 `=N74` → 59.098; I3 'Rate Without Liaisoning'; J3 `=(M73-M69-M56)/1000/J67` → 51.016; F4 'First Quote Rate Without Laisoning'; G4 `=N75` → 62; I4 'First Quote Rate Without Liaisoning'; J4 `=ROUNDUP(J3,0)+2` → 54; F5 'First Quote Rate With Laisoning'; G5 `=M75` → 57
- **Ananda / `10.8kW Non-raised Strucutre Sol`**: F1 'Rate With Structure'; I1 'Rate Without Structure'; F2 'Rate With Laisoning'; G2 `=M62` → 54.706; I2 'Rate With Liaisoning'; J2 `=(M61-M44)/1000/J55` → 53.426; F3 'Rate Without Laisoning'; G3 `=N62` → 62.255; I3 'Rate Without Liaisoning'; J3 `=(M61-M57-M44)/1000/J55` → 49.926; F4 'First Quote Rate Without Laisoning'; G4 `=N63` → 65; I4 'First Quote Rate Without Liaisoning'; J4 `=ROUNDUP(J3,0)+2` → 52; F5 'First Quote Rate With Laisoning'; G5 `=M63` → 57
- **Ananda / `4.2kW Non-raised Strucutre Sola`**: F1 'Rate With Structure'; I1 'Rate Without Structure'; F2 'Rate With Laisoning'; G2 `=M62` → 63.842; I2 'Rate With Liaisoning'; J2 `=(M61-M44)/1000/J55` → 60.962; F3 'Rate Without Laisoning'; G3 `=N62` → 72.652; I3 'Rate Without Liaisoning'; J3 `=(M61-M57-M44)/1000/J55` → 57.462; F4 'First Quote Rate Without Laisoning'; G4 `=N63` → 75; I4 'First Quote Rate Without Liaisoning'; J4 `=ROUNDUP(J3,0)+2` → 60; F5 'First Quote Rate With Laisoning'; G5 `=M63` → 66
- **Ashwini / `3 kW Raised Structure Solar BOQ`**: F1 'Rate With Structure'; I1 'Rate Without Structure'; F2 'Rate With Laisoning'; G2 `=M62` → 59.072; I2 'Rate With Liaisoning'; J2 `=(M61-M44)/1000/J55` → 56.768; F3 'Rate Without Laisoning'; G3 `=N61` → 67.224; I3 'Rate Without Liaisoning'; J3 `=(M61-M57-M44)/1000/J55` → 53.268; F4 'First Quote Rate Without Laisoning'; G4 `=N62` → 70; I4 'First Quote Rate Without Liaisoning'; J4 `=ROUNDUP(J3,0)+2` → 56; F5 'First Quote Rate With Laisoning'; G5 `=M63` → 62
- **Ashwini / `4.8 kW Raised Structure Solar B`**: F1 'Rate With Structure'; I1 'Rate Without Structure'; F2 'Rate With Laisoning'; G2 `=M62` → 56.681; I2 'Rate With Liaisoning'; J2 `=(M61-M44)/1000/J55` → 54.521; F3 'Rate Without Laisoning'; G3 `=N61` → 64.503; I3 'Rate Without Liaisoning'; J3 `=(M61-M57-M44)/1000/J55` → 51.021; F4 'First Quote Rate Without Laisoning'; G4 `=N62` → 67; I4 'First Quote Rate Without Liaisoning'; J4 `=ROUNDUP(J3,0)+2` → 54; F5 'First Quote Rate With Laisoning'; G5 `=M63` → 59
- **Celebration / `25 kW Non-Raised Structure Sola`**: F1 'Rate With Structure'; I1 'Rate Without Structure'; F2 'Rate With Laisoning'; G2 `=M62` → 38.315; I2 'Rate With Liaisoning'; J2 `=(M61-M44)/1000/J55` → 36.947; F3 'Rate Without Laisoning'; G3 `=N61` → 43.603; I3 'Rate Without Liaisoning'; J3 `=(M61-M57-M44)/1000/J55` → 34.447; F4 'First Quote Rate Without Laisoning'; G4 `=N62` → 46; I4 'First Quote Rate Without Liaisoning'; J4 `=ROUNDUP(J3,0)+2` → 37; F5 'First Quote Rate With Laisoning'; G5 `=M63` → 41
- **Celebration / `25 kW Non-Raised + Shed Hybrid`**: F1 'Rate With Structure'; I1 'Rate Without Structure'; F2 'Rate With Laisoning'; G2 `=M63` → 57.296; I2 'Rate With Liaisoning'; J2 `=(M62-M45)/1000/J56` → 56.652; F3 'Rate Without Laisoning'; G3 `=N62` → 65.203; I3 'Rate Without Liaisoning'; J3 `=(M62-M58-M45)/1000/J56` → 54.152; F4 'First Quote Rate Without Laisoning'; G4 `=N63` → 68; I4 'First Quote Rate Without Liaisoning'; J4 `=ROUNDUP(J3,0)+2` → 57; F5 'First Quote Rate With Laisoning'; G5 `=M64` → 60
- **Foundit / `6 kW Shed Structure DCR Solar B`**: F1 'Rate With Structure'; I1 'Rate Without Structure'; F2 'Rate With Laisoning'; G2 `=M63` → 156.754; I2 'Rate With Liaisoning'; J2 `=(M62-M45)/1000/J56` → 156.754; F3 'Rate Without Laisoning'; G3 `=N63` → 178.386; I3 'Rate Without Liaisoning'; J3 `=(M62-M58-M45)/1000/J56` → 153.754; F4 'First Quote Rate Without Laisoning'; G4 `=N64` → 181; I4 'First Quote Rate Without Liaisoning'; J4 `=ROUNDUP(J3,0)+2` → 156; F5 'First Quote Rate With Laisoning'; G5 `=M64` → 159
- **Foundit / `6 kW Shed Structure NDCR Solar`**: F1 'Rate With Structure'; I1 'Rate Without Structure'; F2 'Rate With Laisoning'; G2 `=M63` → 89.931; I2 'Rate With Liaisoning'; J2 `=(M62-M45)/1000/J56` → 89.931; F3 'Rate Without Laisoning'; G3 `=N63` → 102.341; I3 'Rate Without Liaisoning'; J3 `=(M62-M58-M45)/1000/J56` → 86.931; F4 'First Quote Rate Without Laisoning'; G4 `=N64` → 105; I4 'First Quote Rate Without Liaisoning'; J4 `=ROUNDUP(J3,0)+2` → 89; F5 'First Quote Rate With Laisoning'; G5 `=M64` → 92
- **Fredrick / `3.6 kW Raised Structure Solar B`**: F1 'Rate With Structure'; I1 'Rate Without Structure'; F2 'Rate With Laisoning'; G2 `=M65` → 76.021; I2 'Rate With Liaisoning'; J2 `=(M64-M46)/1000/J58` → 76.021; F3 'Rate Without Laisoning'; G3 `=N65` → 82.787; I3 'Rate Without Liaisoning'; J3 `=(M64-M60-M46)/1000/J58` → 72.521; F4 'First Quote Rate Without Laisoning'; G4 `=N66` → 85; I4 'First Quote Rate Without Liaisoning'; J4 `=ROUNDUP(J3,0)+2` → 75; F5 'First Quote Rate With Laisoning'; G5 `=M66` → 79


#### Aaryan / `Solar BOQ`

| Row | I | J | K label | L | M formula → value | N formula → value |
|---|---|---|---|---|---|---|
| 53 | — | — | Material | — | `=SUM(M14:M52)` → 259838 |  |
| 54 | kW | 5 | Installation | 4000 | `=L54*J54` → 20000 |  |
| 55 | — | — | Transportation | — | `=M53*5%` → 12991.9 |  |
| 56 | — | — | Liasioning | 4000 | `=L56*J54` → 20000 |  |
| 57 | — | — | Sub Total | — | `=SUM(M53:M56)` → 312830 |  |
| 58 | — | — | Insurance | — | `=(M57*1.2)/1000*2*7` → 5255.54 |  |
| 59 | — | — | Profit | 0.15 | `=M57/(1-L59)*L59` → 55205.3 |  |
| 60 | — | — | Total | 0 | `=SUM(M57:M59)` → 373291 | `=M60*1.138` → 424805 |
| 61 | — | — |  | — | `=M60/1000/$J$54` → 74.6581 | `=N60/1000/$J$54` → 84.961 |
| 62 | — | — | First Quote Rate  | — | `=ROUNDUP(M61,0)+2` → 77 | `=ROUNDUP(N61,0)+2` → 87 |
| 63 | — | — |  | — | `=M62*$J$54*1000` → 385000 | `=N62*$J$54*1000` → 435000 |
| 64 | — | — |  | — | `=M63*1.1089` → 426926 |  |
| 67 | — | — | First Quote Rate With Liaisoning | — | — → — |  |

#### Aaryan / `Copy of  Solar BOQ`

| Row | I | J | K label | L | M formula → value | N formula → value |
|---|---|---|---|---|---|---|
| 53 | — | — | Material | — | `=SUM(M14:M52)` → 131677 |  |
| 54 | kW | 3.5 | Installation | 8000 | `=L54*J54` → 28000 |  |
| 55 | — | — | Transportation | — | `=M53*5%` → 6583.86 |  |
| 56 | — | — | Liasioning | 4000 | `=L56*J54` → 14000 |  |
| 57 | — | — | Sub Total | — | `=SUM(M53:M56)` → 180261 |  |
| 58 | — | — | Insurance | — | `=(M57*1.2)/1000*2*7` → 3028.39 |  |
| 59 | — | — | Profit | 0.15 | `=M57/(1-L59)*L59` → 31810.8 |  |
| 60 | — | — | Total | 0 | `=SUM(M57:M59)` → 215100 | `=M60*1.138` → 244784 |
| 61 | — | — |  | — | `=M60/1000/$J$54` → 61.4572 | `=N60/1000/$J$54` → 69.9383 |
| 62 | — | — | First Quote Rate  | — | `=ROUNDUP(M61,0)+2` → 64 | `=ROUNDUP(N61,0)+2` → 72 |
| 63 | — | — |  | — | `=M62*$J$54*1000` → 224000 | `=N62*$J$54*1000` → 252000 |
| 64 | — | — |  | — | `=M63*1.1089` → 248394 |  |
| 67 | — | — | First Quote Rate With Liaisoning | — | — → — |  |

#### Aaryan / `1kW Solar`

| Row | I | J | K label | L | M formula → value | N formula → value |
|---|---|---|---|---|---|---|
| 53 | — | — | Material | — | `=SUM(M14:M52)` → 59432 |  |
| 54 | kW | 1.18 | Installation | 9000 | `=L54*J54` → 10620 |  |
| 55 | — | — | Transportation | — | `=M53*5%` → 2971.6 |  |
| 56 | — | — | Liasioning | 0 | `=L56*J54` → 0 |  |
| 57 | — | — | Sub Total | — | `=SUM(M53:M56)` → 73023.6 |  |
| 58 | — | — | Insurance | — | `=(M57*1.2)/1000*2*7` → 1226.8 |  |
| 59 | — | — | Profit | 0.15 | `=M57/(1-L59)*L59` → 12886.5 |  |
| 60 | — | — | Total | 0 | `=SUM(M57:M59)` → 87136.9 | `=M60*1.138` → 99161.8 |
| 61 | — | — |  | — | `=M60/1000/$J$54` → 73.8448 | `=N60/1000/$J$54` → 84.0354 |
| 62 | — | — | First Quote Rate  | — | `=ROUNDUP(M61,0)+2` → 76 | `=ROUNDUP(N61,0)+2` → 87 |
| 63 | — | — |  | — | `=M62*$J$54*1000` → 89680 | `=N62*$J$54*1000` → 102660 |
| 64 | — | — |  | — | `=M63*1.1089` → 99446.2 |  |
| 67 | — | — | First Quote Rate With Liaisoning | — | — → — |  |
| 73 | — | — | Actuator | 32500 | — → — |  |
| 74 | — | — | Structure | 15000 | — → — |  |
| 75 | — | — | Panels  | 53100 | — → — |  |
| 76 | — | — | Inverter | 51000 | — → — |  |
| 77 | — | — | Battery | 54000 | — → — |  |
| 78 | — | — |  | 10000 | — → — |  |

#### Ananda / `34.2kW Non-raised Strucutre Sol`

| Row | I | J | K label | L | M formula → value | N formula → value |
|---|---|---|---|---|---|---|
| 54 | — | — | Material | — | `=SUM(M14:M53)` → 1.22024e+06 |  |
| 55 | kW | 34 | Installation | 3500 | `=L55*J55` → 119000 |  |
| 56 | — | — | Transportation | — | `=M54*0.03` → 36607.3 |  |
| 57 | — | — | Liasioning | 2000 | `=L57*J55` → 68000 |  |
| 58 | — | — | Sub Total | — | `=SUM(M54:M57)` → 1.44385e+06 |  |
| 59 | — | — | Insurance | — | `=(M58*1.2)/1000*3*5*1.2+34000` → 65187.2 |  |
| 60 | — | — | Profit | 0.15 | `=M58/(1-L60)*L60` → 254797 |  |
| 61 | — | — | Total | 0 | `=SUM(M58:M60)` → 1.76384e+06 | `=M61*1.089` → 1.92082e+06 |
| 62 | — | — |  | — | `=M61/1000/$J$55` → 51.8775 | `=N61/1000/$J$55` → 56.4946 |
| 63 | — | — | First Quote Rate  | — | `=ROUNDUP(M62,0)+2` → 54 | `=ROUNDUP(N62,0)+2` → 59 |
| 64 | — | — |  | — | `=M63*$J$55*1000` → 1.836e+06 | `=N63*$J$55*1000` → 2.006e+06 |
| 65 | — | — |  | — | `=M64*1.089` → 1.9994e+06 |  |
| 68 | — | — | First Quote Rate With Liaisoning | — | typed 53.0 → 53 |  |

#### Ananda / `40.2kW Non-raised Strucutre Sol`

| Row | I | J | K label | L | M formula → value | N formula → value |
|---|---|---|---|---|---|---|
| 66 | — | — | Material | — | `=SUM(M14:M65)` → 1.53725e+06 |  |
| 67 | kW | `=C1` | Installation | 3500 | `=L67*J67` → 141750 |  |
| 68 | — | — | Transportation | — | `=M66*0.03` → 46117.4 |  |
| 69 | — | — | Liasioning | 2000 | `=L69*J67` → 81000 |  |
| 70 | — | — | Sub Total | — | `=SUM(M66:M69)` → 1.80611e+06 |  |
| 71 | — | — | Insurance | — | `=(M70*1.2)/1000*3*5*1.2+34000` → 73012.1 |  |
| 72 | — | — | Profit | 0.15 | `=M70/(1-L72)*L72` → 318726 |  |
| 73 | — | — | Total | 0 | `=SUM(M70:M72)` → 2.19785e+06 | `=M73*1.089` → 2.39346e+06 |
| 74 | — | — |  | — | `=M73/1000/$J$67` → 54.268 | `=N73/1000/$J$67` → 59.0978 |
| 75 | — | — | First Quote Rate  | — | `=ROUNDUP(M74,0)+2` → 57 | `=ROUNDUP(N74,0)+2` → 62 |
| 76 | — | — |  | — | `=M75*$J$67*1000` → 2.3085e+06 | `=N75*$J$67*1000` → 2.511e+06 |
| 77 | — | — |  | — | `=M76*1.089` → 2.51396e+06 |  |
| 80 | — | — | First Quote Rate With Liaisoning | — | typed 53.0 → 53 |  |

#### Ananda / `10.8kW Non-raised Strucutre Sol`

| Row | I | J | K label | L | M formula → value | N formula → value |
|---|---|---|---|---|---|---|
| 54 | — | — | Material | — | `=SUM(M14:M53)` → 404238 |  |
| 55 | kW | 10.8 | Installation | 3800 | `=L55*J55` → 41040 |  |
| 56 | — | — | Transportation | — | `=M54*0.03` → 12127.2 |  |
| 57 | — | — | Liasioning | 3500 | `=L57*J55` → 37800 |  |
| 58 | — | — | Sub Total | — | `=SUM(M54:M57)` → 495206 |  |
| 59 | — | — | Insurance | — | `=(M58*1.2)/1000*3*5` → 8913.7 |  |
| 60 | — | — | Profit | 0.149 | `=M58/(1-L60)*L60` → 86704.6 |  |
| 61 | — | — | Total | 0 | `=SUM(M58:M60)` → 590824 | `=M61*1.138` → 672358 |
| 62 | — | — |  | — | `=M61/1000/$J$55` → 54.7059 | `=N61/1000/$J$55` → 62.2553 |
| 63 | — | — | First Quote Rate  | — | `=ROUNDUP(M62,0)+2` → 57 | `=ROUNDUP(N62,0)+2` → 65 |
| 64 | — | — |  | — | `=M63*$J$55*1000` → 615600 | `=N63*$J$55*1000` → 702000 |
| 65 | — | — |  | — | `=M64*1.138` → 700553 |  |
| 68 | — | — | First Quote Rate With Liaisoning | — | typed 56.0 → 56 |  |
| 71 | — | — |  | — | `=65*4.8` → 312 |  |
| 72 | — | — |  | — | `=56*10.2` → 571.2 |  |
| 73 | — | — |  | — | `=M72+M71` → 883.2 | `=M73*0.089` → 78.6048 |
| 74 | — | — |  | — | `=M73/15` → 58.88 |  |

#### Ananda / `4.2kW Non-raised Strucutre Sola`

| Row | I | J | K label | L | M formula → value | N formula → value |
|---|---|---|---|---|---|---|
| 54 | — | — | Material | — | `=SUM(M14:M53)` → 188428 |  |
| 55 | kW | 4.2 | Installation | 3800 | `=L55*J55` → 15960 |  |
| 56 | — | — | Transportation | — | `=M54*0.03` → 5652.85 |  |
| 57 | — | — | Liasioning | 3500 | `=L57*J55` → 14700 |  |
| 58 | — | — | Sub Total | — | `=SUM(M54:M57)` → 224741 |  |
| 59 | — | — | Insurance | — | `=(M58*1.2)/1000*3*5` → 4045.34 |  |
| 60 | — | — | Profit | 0.149 | `=M58/(1-L60)*L60` → 39349.5 |  |
| 61 | — | — | Total | 0 | `=SUM(M58:M60)` → 268136 | `=M61*1.138` → 305139 |
| 62 | — | — |  | — | `=M61/1000/$J$55` → 63.842 | `=N61/1000/$J$55` → 72.6522 |
| 63 | — | — | First Quote Rate  | — | `=ROUNDUP(M62,0)+2` → 66 | `=ROUNDUP(N62,0)+2` → 75 |
| 64 | — | — |  | — | `=M63*$J$55*1000` → 277200 | `=N63*$J$55*1000` → 315000 |
| 65 | — | — |  | — | `=M64*1.138` → 315454 |  |
| 68 | — | — | First Quote Rate With Liaisoning | — | typed 65.0 → 65 |  |

#### Ashwini / `3 kW Raised Structure Solar BOQ`

| Row | I | J | K label | L | M formula → value | N formula → value |
|---|---|---|---|---|---|---|
| 54 | — | — | Material | — | `=SUM(M14:M53)` → 122364 |  |
| 55 | kW | 3 | Installation | 4000 | `=L55*J55` → 12000 |  |
| 56 | — | — | Transportation | — | `=M54*0.03` → 3670.92 |  |
| 57 | — | — | Liasioning | 3500 | `=L57*J55` → 10500 |  |
| 58 | — | — | Sub Total | — | `=SUM(M54:M57)` → 148535 |  |
| 59 | — | — | Insurance | — | `=(M58*1.2)/1000*3*5` → 2673.63 |  |
| 60 | — | — | Profit | 0.149 | `=M58/(1-L60)*L60` → 26006.7 | `=M61*1.138` → 201671 |
| 61 | — | — | Total | 0 | `=SUM(M58:M60)` → 177215 | `=N60/1000/$J$55` → 67.2237 |
| 62 | — | — |  | — | `=M61/1000/$J$55` → 59.0718 | `=ROUNDUP(N61,0)+2` → 70 |
| 63 | — | — | First Quote Rate  | — | `=ROUNDUP(M62,0)+2` → 62 | `=N62*$J$55*1000` → 210000 |
| 64 | — | — |  | — | `=M63*$J$55*1000` → 186000 |  |
| 65 | — | — |  | — | `=M64*1.089` → 202554 |  |
| 68 | — | — | First Quote Rate With Liaisoning | — | — → — |  |

#### Ashwini / `4.8 kW Raised Structure Solar B`

| Row | I | J | K label | L | M formula → value | N formula → value |
|---|---|---|---|---|---|---|
| 54 | — | — | Material | — | `=SUM(M14:M53)` → 186444 |  |
| 55 | kW | `=C1` | Installation | 4000 | `=L55*J55` → 19200 |  |
| 56 | — | — | Transportation | — | `=M54*0.03` → 5593.32 |  |
| 57 | — | — | Liasioning | 3500 | `=L57*J55` → 16800 |  |
| 58 | — | — | Sub Total | — | `=SUM(M54:M57)` → 228037 |  |
| 59 | — | — | Insurance | — | `=(M58*1.2)/1000*3*5` → 4104.67 |  |
| 60 | — | — | Profit | 0.149 | `=M58/(1-L60)*L60` → 39926.6 | `=M61*1.138` → 309614 |
| 61 | — | — | Total | 0 | `=SUM(M58:M60)` → 272069 | `=N60/1000/$J$55` → 64.5029 |
| 62 | — | — |  | — | `=M61/1000/$J$55` → 56.681 | `=ROUNDUP(N61,0)+2` → 67 |
| 63 | — | — | First Quote Rate  | — | `=ROUNDUP(M62,0)+2` → 59 | `=N62*$J$55*1000` → 321600 |
| 64 | — | — |  | — | `=M63*$J$55*1000` → 283200 |  |
| 65 | — | — |  | — | `=M64*1.089` → 308405 |  |
| 68 | — | — | First Quote Rate With Liaisoning | — | — → — |  |

#### Celebration / `25 kW Non-Raised Structure Sola`

| Row | I | J | K label | L | M formula → value | N formula → value |
|---|---|---|---|---|---|---|
| 54 | — | — | Material | — | `=SUM(M14:M53)` → 626677 |  |
| 55 | kW | `=C1` | Installation | 4000 | `=L55*J55` → 100800 |  |
| 56 | — | — | Transportation | — | `=M54*0.03` → 18800.3 |  |
| 57 | — | — | Liasioning | 2500 | `=L57*J55` → 63000 |  |
| 58 | — | — | Sub Total | — | `=SUM(M54:M57)` → 809277 |  |
| 59 | — | — | Insurance | — | `=(M58*1.2)/1000*3*5` → 14567 |  |
| 60 | — | — | Profit | 0.149 | `=M58/(1-L60)*L60` → 141695 | `=M61*1.138` → 1.09878e+06 |
| 61 | — | — | Total | 0 | `=SUM(M58:M60)` → 965539 | `=N60/1000/$J$55` → 43.6025 |
| 62 | — | — |  | — | `=M61/1000/$J$55` → 38.315 | `=ROUNDUP(N61,0)+2` → 46 |
| 63 | — | — | First Quote Rate  | — | `=ROUNDUP(M62,0)+2` → 41 | `=N62*$J$55*1000` → 1.1592e+06 |
| 64 | — | — |  | — | `=M63*$J$55*1000` → 1.0332e+06 |  |
| 65 | — | — |  | — | `=M64*1.089` → 1.12515e+06 |  |
| 68 | — | — | First Quote Rate With Liaisoning | `=M63` | — → — |  |

#### Celebration / `25 kW Non-Raised + Shed Hybrid`

| Row | I | J | K label | L | M formula → value | N formula → value |
|---|---|---|---|---|---|---|
| 55 | — | — | Material | — | `=SUM(M14:M54)` → 1.01591e+06 |  |
| 56 | kW | `=C1` | Installation | 4000 | `=L56*J56` → 100800 |  |
| 57 | — | — | Transportation | — | `=M55*0.03` → 30477.4 |  |
| 58 | — | — | Liasioning | 2500 | `=L58*J56` → 63000 |  |
| 59 | — | — | Sub Total | — | `=SUM(M55:M58)` → 1.21019e+06 |  |
| 60 | — | — | Insurance | — | `=(M59*1.2)/1000*3*5` → 21783.4 |  |
| 61 | — | — | Profit | 0.149 | `=M59/(1-L61)*L61` → 211890 | `=M62*1.138` → 1.64312e+06 |
| 62 | — | — | Total | 0 | `=SUM(M59:M61)` → 1.44386e+06 | `=N61/1000/$J$56` → 65.203 |
| 63 | — | — |  | — | `=M62/1000/$J$56` → 57.2961 | `=ROUNDUP(N62,0)+2` → 68 |
| 64 | — | — | First Quote Rate  | — | `=ROUNDUP(M63,0)+2` → 60 | `=N63*$J$56*1000` → 1.7136e+06 |
| 65 | — | — |  | — | `=M64*$J$56*1000` → 1.512e+06 |  |
| 66 | — | — |  | — | `=M65*1.089` → 1.64657e+06 |  |
| 69 | — | — | First Quote Rate With Liaisoning | `=M64` | — → — |  |

#### Foundit / `6 kW Shed Structure DCR Solar B`

| Row | I | J | K label | L | M formula → value | N formula → value |
|---|---|---|---|---|---|---|
| 55 | — | — | Material | — | `=SUM(M14:M54)` → 363743 |  |
| 56 | kW | `=C1` | Installation | 3500 | `=L56*J56` → 10500 |  |
| 57 | — | — | Transportation | — | `=M55*0.03` → 10912.3 |  |
| 58 | — | — | Liasioning | 3000 | `=L58*J56` → 9000 |  |
| 59 | — | — | Sub Total | — | `=SUM(M55:M58)` → 394155 |  |
| 60 | — | — | Insurance | — | `=(M59*1.2)/1000*3*5` → 7094.8 |  |
| 61 | — | — | Profit | 0.149 | `=M59/(1-L61)*L61` → 69011.9 |  |
| 62 | — | — | Total | 0 | `=SUM(M59:M61)` → 470262 | `=M62*1.138` → 535158 |
| 63 | — | — |  | — | `=M62/1000/$J$56` → 156.754 | `=N62/1000/$J$56` → 178.386 |
| 64 | — | — | First Quote Rate  | — | `=ROUNDUP(M63,0)+2` → 159 | `=ROUNDUP(N63,0)+2` → 181 |
| 65 | — | — |  | — | `=M64*$J$56*1000` → 477000 | `=N64*$J$56*1000` → 543000 |
| 66 | — | — |  | — | `=M65*1.089` → 519453 |  |
| 69 | — | — | First Quote Rate With Liaisoning | — | `=M64` → 159 |  |

#### Foundit / `6 kW Shed Structure NDCR Solar`

| Row | I | J | K label | L | M formula → value | N formula → value |
|---|---|---|---|---|---|---|
| 55 | — | — | Material | — | `=SUM(M14:M54)` → 401222 |  |
| 56 | kW | `=C1` | Installation | 3500 | `=L56*J56` → 21000 |  |
| 57 | — | — | Transportation | — | `=M55*0.03` → 12036.7 |  |
| 58 | — | — | Liasioning | 3000 | `=L58*J56` → 18000 |  |
| 59 | — | — | Sub Total | — | `=SUM(M55:M58)` → 452259 |  |
| 60 | — | — | Insurance | — | `=(M59*1.2)/1000*3*5` → 8140.66 |  |
| 61 | — | — | Profit | 0.149 | `=M59/(1-L61)*L61` → 79185.1 |  |
| 62 | — | — | Total | 0 | `=SUM(M59:M61)` → 539584 | `=M62*1.138` → 614047 |
| 63 | — | — |  | — | `=M62/1000/$J$56` → 89.9307 | `=N62/1000/$J$56` → 102.341 |
| 64 | — | — | First Quote Rate  | — | `=ROUNDUP(M63,0)+2` → 92 | `=ROUNDUP(N63,0)+2` → 105 |
| 65 | — | — |  | — | `=M64*$J$56*1000` → 552000 | `=N64*$J$56*1000` → 630000 |
| 66 | — | — |  | — | `=M65*1.089` → 601128 |  |
| 69 | — | — | First Quote Rate With Liaisoning | — | `=M64` → 92 |  |

#### Fredrick / `3.6 kW Raised Structure Solar B`

| Row | I | J | K label | L | M formula → value | N formula → value |
|---|---|---|---|---|---|---|
| 57 | — | — | Material | — | `=SUM(M14:M55)` → 298655 |  |
| 58 | kW | 5.4 | Installation | 3500 | `=L58*J58` → 18900 |  |
| 59 | — | — | Transportation | — | `=M57*0.03` → 8959.65 |  |
| 60 | — | — | Liasioning | 3500 | `=L60*J58` → 18900 |  |
| 61 | — | — | Sub Total | — | `=SUM(M57:M60)` → 345415 |  |
| 62 | — | — | Insurance | — | `=(M61*1.2)/1000*2*5` → 4144.98 |  |
| 63 | — | — | Profit | 0.15 | `=M61/(1-L63)*L63` → 60955.5 |  |
| 64 | — | — | Total | 0 | `=SUM(M61:M63)` → 410515 | `=M64*1.089` → 447051 |
| 65 | — | — |  | — | `=M64/1000/$J$58` → 76.0213 | `=N64/1000/$J$58` → 82.7872 |
| 66 | — | — | First Quote Rate  | — | `=roundup(M65,0)+2` → 79 | `=ROUNDUP(N65,0)+2` → 85 |
| 67 | — | — |  | — | `=M66*$J$58*1000` → 426600 | `=N66*$J$58*1000` → 459000 |
| 68 | — | — |  | — | `=M67*1.089` → 464567 |  |
| 71 | — | — | Quotation Rate | — | typed 58.0 → 58 |  |
| 72 | — | — | Cost | — | `=M71*J58*1000` → 313200 |  |
| 73 | — | — | GST  | — | `=M72*0.089` → 27874.8 |  |
| 74 | — | — | Total | — | `=ROUND(M73+M72,0)` → 341075 |  |
| 75 | — | — | Subsidy | — | typed 78000.0 → 78000 |  |
| 76 | — | — | Effective | — | `=M74-M75` → 263075 |  |

---

## Appendix B: structure cells, every sheet [WB]

#### Aaryan / `Solar BOQ`

Parameter block (column A/B/C):

| Label | Cell | B | C |
|---|---|---|---|
| Structure Height Lower (FT.) | row 10 | typed 7.0 → 7 | `=($B$10*0.305)` → 2.135 |
| Structure Height Upper (FT.) | row 11 | typed 9.0 → 9 | `=(B11*0.305)` → 2.745 |
| No. of rafters | row 24 | `=roundup(B23/2,0)` → 3 |  |
| No of legs | row 25 | `=B24*2` → 6 | `=if(B9/3=int(B9/3),0,1)` → 1 |
| Bracing Support Length | row 26 | `=3*B9/2` → 3 |  |
| Rafter Length 80x40x2mm (MTS) | row 27 | `=ROUNDUP((B24*2.3*B9)+(B24*C10)+(B24*C11)+(B26*0.5),-1)` → 30 |  |
| Purlin Length 40x40x2mm (MTS) | row 28 | `=ROUNDUP(($B$22*1.2*3),0)` → 33 |  |
| 3.5ft GI Shed (sqft) | row 12 | typed 0.0 → 0 |  |

Structure / hardware lines:

| Row | Line | Make | Unit | J (qty) | L (rate) |
|---|---|---|---|---|---|
| 34 | Nut Bolt & Washer Set: 100mm X M10 (Anchor Bolt) | Reputed | Nos. | `=J45*4` → 48 | 16 |
| 36 | Nut Bolt & Washer Set: M8 x 100 Hot Dip Galvanised for Purlin | Reputed | Nos. | typed 0.0 → 0 | 10 |
| 43 | Structure: ISI standard 80 microns GI structure | 80x40x2 | MTS | typed 48.0 → 48 | 288 |
| 44 | Structure:  | 40x40x2 (Purlin) | MTS | `=J$14*1.2*3` → 32.4 | 155 |
| 45 | Structure:  | Base plate | Nos. | typed 12.0 → 12 | 100 |
| 46 | Structure: Ladder and Walkway | 40x40x2 | MTS. | typed 2.0 → 2 | 880 |
| 47 | Structure: Ladder and Walkway |  | MTS. | typed 23.0 → 23 | 150 |
| 48 | Structure: Over the shed Al structure |  | kW | typed 0.0 → 0 | 2900 |
| 49 | U-Clamp: With Spring and SS- 304 Nut & Bolt | Reputed | Nos. | typed 12.0 → 12 | 40 |
| 50 | Z-Clamp: With Spring and SS- 304 Nut & Bolt | Reputed | Nos. | typed 12.0 → 12 | 40 |
| 52 | J-Bolt: M-8 SS-304 | 80*42*25mm | Nos. | typed 0.0 → 0 | 0 |

Side sub-table cells (columns O–W, row ≥ 30):

| Cell | Formula / typed | Value |
|---|---|---|
| R30 | typed 'Structure ' | Structure  |
| S30 | `=roundup(21000/0.85,0)` | 24706 |
| T30 | typed 'GI Pre-fabricated' | GI Pre-fabricated |
| R31 | typed 'BOS' | BOS |
| S31 | `=sum(O18:O42)` | 19977 |
| T31 | typed 'ACDB, DCDB, Switchgear. Wiring, Earthing, LA' | ACDB, DCDB, Switchgear. Wiring, Earthing, LA |
| R32 | typed 'INC and Transport' | INC and Transport |
| S32 | typed 30000.0 | 30000 |
| T32 | typed 'In Pune' | In Pune |
| R33 | typed 'Liaisoning ' | Liaisoning  |
| S33 | typed 'Extra at Actual' | Extra at Actual |
| T33 | typed 'Depends on Location ' | Depends on Location  |
| R34 | typed 'Sub-total' | Sub-total |
| S34 | `=Sum(S27:S32)` | 290978 |
| R35 | typed 'GST' | GST |
| S35 | `=round(S34*T35,0)` | 25897 |
| T35 | typed 0.089 | 0.089 |
| R36 | typed 'Total' | Total |
| S36 | `=S35+S34` | 316875 |
| Q43 | typed 'Rafter ' | Rafter  |
| R43 | `=2.3*2-0.8` | 3.8 |
| S43 | typed 3.0 | 3 |
| Q44 | typed 'Legs' | Legs |
| R44 | `=7/3.28` | 2.1341 |
| S44 | typed 3.0 | 3 |
| R45 | `=9/3.28` | 2.7439 |
| S45 | typed 3.0 | 3 |
| Q46 | typed 'Cross Bracing' | Cross Bracing |
| R46 | `=4*2+6*2` | 20 |
| S46 | typed 1.0 | 1 |
| R47 | `=SUM(#REF!)` | #REF! |

#### Aaryan / `Copy of  Solar BOQ`

Parameter block (column A/B/C):

| Label | Cell | B | C |
|---|---|---|---|
| Structure Height Lower (FT.) | row 10 | typed 7.0 → 7 | `=($B$10*0.305)` → 2.135 |
| Structure Height Upper (FT.) | row 11 | typed 9.0 → 9 | `=(B11*0.305)` → 2.745 |
| No. of rafters | row 24 | `=roundup(B23/2,0)` → 2 |  |
| No of legs | row 25 | `=B24*2` → 4 | `=if(B9/3=int(B9/3),0,1)` → 1 |
| Bracing Support Length | row 26 | `=3*B9/2` → 3 |  |
| Rafter Length 80x40x2mm (MTS) | row 27 | `=ROUNDUP((B24*2.3*B9)+(B24*C10)+(B24*C11)+(B26*0.5),-1)` → 30 |  |
| Purlin Length 40x40x2mm (MTS) | row 28 | `=ROUNDUP(($B$22*1.2*3),0)` → 22 |  |
| 3.5ft GI Shed (sqft) | row 12 | typed 0.0 → 0 |  |

Structure / hardware lines:

| Row | Line | Make | Unit | J (qty) | L (rate) |
|---|---|---|---|---|---|
| 34 | Nut Bolt & Washer Set: 100mm X M10 (Anchor Bolt) | Reputed | Nos. | `=J45*4` → 48 | 16 |
| 36 | Nut Bolt & Washer Set: M8 x 100 Hot Dip Galvanised for Purlin | Reputed | Nos. | typed 0.0 → 0 | 10 |
| 43 | Structure: ISI standard 80 microns GI structure | 80x40x2 | MTS | typed 54.0 → 54 | 288 |
| 44 | Structure:  | 40x40x2 (Purlin) | MTS | `=3.6*4` → 14.4 | 145 |
| 45 | Structure:  | Base plate | Nos. | typed 12.0 → 12 | 100 |
| 46 | Structure: Ladder and Walkway | 40x40x2 | MTS. | — → — | 880 |
| 47 | Structure: Ladder and Walkway |  | MTS. | typed 12.0 → 12 | 150 |
| 48 | Structure: Over the shed Al structure |  | kW | typed 0.0 → 0 | 2900 |
| 49 | U-Clamp: With Spring and SS- 304 Nut & Bolt | Reputed | Nos. | typed 12.0 → 12 | 70 |
| 50 | Z-Clamp: With Spring and SS- 304 Nut & Bolt | Reputed | Nos. | typed 12.0 → 12 | 70 |
| 52 | J-Bolt: M-8 SS-304 | 80*42*25mm | Nos. | typed 0.0 → 0 | 0 |

Side sub-table cells (columns O–W, row ≥ 30):

| Cell | Formula / typed | Value |
|---|---|---|
| R30 | typed 'Structure ' | Structure  |
| S30 | `=roundup(21000/0.85,0)` | 24706 |
| T30 | typed 'GI Pre-fabricated' | GI Pre-fabricated |
| R31 | typed 'BOS' | BOS |
| S31 | `=sum(O18:O42)` | 13747 |
| T31 | typed 'ACDB, DCDB, Switchgear. Wiring, Earthing, LA' | ACDB, DCDB, Switchgear. Wiring, Earthing, LA |
| R32 | typed 'INC and Transport' | INC and Transport |
| S32 | typed 30000.0 | 30000 |
| T32 | typed 'In Pune' | In Pune |
| R33 | typed 'Liaisoning ' | Liaisoning  |
| S33 | typed 'Extra at Actual' | Extra at Actual |
| T33 | typed 'Depends on Location ' | Depends on Location  |
| R34 | typed 'Sub-total' | Sub-total |
| S34 | `=Sum(S27:S32)` | 188807 |
| R35 | typed 'GST' | GST |
| S35 | `=round(S34*T35,0)` | 16804 |
| T35 | typed 0.089 | 0.089 |
| R36 | typed 'Total' | Total |
| S36 | `=S35+S34` | 205611 |
| Q43 | typed 'Rafter ' | Rafter  |
| R43 | typed 2.0 | 2 |
| S43 | typed 4.0 | 4 |
| T43 | `=S43*R43` | 8 |
| Q44 | typed 'Legs' | Legs |
| R44 | typed 2.0 | 2 |
| S44 | typed 2.0 | 2 |
| T44 | `=S44*R44` | 4 |
| R45 | typed 3.0 | 3 |
| S45 | typed 2.0 | 2 |
| T45 | `=S45*R45` | 6 |
| Q46 | typed 'Cross Bracing' | Cross Bracing |
| R46 | typed 3.6 | 3.6 |
| S46 | typed 4.0 | 4 |
| T46 | `=S46*R46` | 14.4 |
| T47 | `=SUM(T43:T46)` | 32.4 |

#### Aaryan / `1kW Solar`

Parameter block (column A/B/C):

| Label | Cell | B | C |
|---|---|---|---|
| Structure Height Lower (FT.) | row 10 | typed 3.0 → 3 | `=($B$10*0.305)` → 0.915 |
| Structure Height Upper (FT.) | row 11 | typed 5.0 → 5 | `=(B11*0.305)` → 1.525 |
| No. of rafters | row 24 | `=roundup(B23/2,0)` → 1 |  |
| No of legs | row 25 | `=B24*2` → 2 | `=if(B9/3=int(B9/3),0,1)` → 1 |
| Bracing Support Length | row 26 | `=3*B9/2` → 1.5 |  |
| Rafter Length 80x40x2mm (MTS) | row 27 | `=ROUNDUP((B24*2.3*B9)+(B24*C10)+(B24*C11)+(B26*0.5),-1)` → 10 |  |
| Purlin Length 40x40x2mm (MTS) | row 28 | `=ROUNDUP(($B$22*1.2*3),0)` → 8 |  |
| 3.5ft GI Shed (sqft) | row 12 | typed 0.0 → 0 |  |

Structure / hardware lines:

| Row | Line | Make | Unit | J (qty) | L (rate) |
|---|---|---|---|---|---|
| 34 | Nut Bolt & Washer Set: 100mm X M10 (Anchor Bolt) | Reputed | Nos. | `=J45*4` → 16 | 16 |
| 36 | Nut Bolt & Washer Set: M8 x 100 Hot Dip Galvanised for Purlin | Reputed | Nos. | typed 0.0 → 0 | 10 |
| 43 | Structure: ISI standard 80 microns GI structure | 80x40x2 | MTS | typed 18.0 → 18 | 288 |
| 44 | Structure:  | 40x40x2 (Purlin) | MTS | `=J$14*1.2*3` → 7.2 | 155 |
| 45 | Structure:  | Base plate | Nos. | typed 4.0 → 4 | 200 |
| 46 | Structure: Ladder and Walkway | 40x40x2 | MTS. | typed 0.0 → 0 | 880 |
| 47 | Structure: Ladder and Walkway |  | MTS. | typed 0.0 → 0 | 150 |
| 48 | Structure: Over the shed Al structure |  | kW | typed 0.0 → 0 | 2900 |
| 49 | U-Clamp: With Spring and SS- 304 Nut & Bolt | Reputed | Nos. | typed 3.0 → 3 | 40 |
| 50 | Z-Clamp: With Spring and SS- 304 Nut & Bolt | Reputed | Nos. | typed 6.0 → 6 | 40 |
| 52 | J-Bolt: M-8 SS-304 | 80*42*25mm | Nos. | typed 0.0 → 0 | 0 |

Side sub-table cells (columns O–W, row ≥ 30):

| Cell | Formula / typed | Value |
|---|---|---|
| R30 | typed 'Structure ' | Structure  |
| S30 | `=roundup(21000/0.85,0)` | 24706 |
| T30 | typed 'GI Pre-fabricated' | GI Pre-fabricated |
| R31 | typed 'BOS' | BOS |
| S31 | `=sum(O18:O42)` | 10981 |
| T31 | typed 'ACDB, DCDB, Switchgear. Wiring, Earthing, LA' | ACDB, DCDB, Switchgear. Wiring, Earthing, LA |
| R32 | typed 'INC and Transport' | INC and Transport |
| S32 | typed 30000.0 | 30000 |
| T32 | typed 'In Pune' | In Pune |
| R33 | typed 'Liaisoning ' | Liaisoning  |
| S33 | typed 'Extra at Actual' | Extra at Actual |
| T33 | typed 'Depends on Location ' | Depends on Location  |
| R34 | typed 'Sub-total' | Sub-total |
| S34 | `=Sum(S27:S32)` | 144394 |
| R35 | typed 'GST' | GST |
| S35 | `=round(S34*T35,0)` | 12851 |
| T35 | typed 0.089 | 0.089 |
| R36 | typed 'Total' | Total |
| S36 | `=S35+S34` | 157245 |
| Q43 | typed 'Rafter ' | Rafter  |
| R43 | typed 2.0 | 2 |
| S43 | typed 2.0 | 2 |
| T43 | `=S43*R43` | 4 |
| Q44 | typed 'Legs' | Legs |
| R44 | typed 1.0 | 1 |
| S44 | typed 2.0 | 2 |
| T44 | `=S44*R44` | 2 |
| R45 | typed 2.0 | 2 |
| S45 | typed 2.0 | 2 |
| T45 | `=S45*R45` | 4 |
| Q46 | typed 'Cross Bracing' | Cross Bracing |
| R46 | typed 2.0 | 2 |
| S46 | typed 2.0 | 2 |
| T46 | `=S46*R46` | 4 |
| T47 | `=SUM(T43:T46)` | 14 |

#### Ananda / `34.2kW Non-raised Strucutre Sol`

Parameter block (column A/B/C):

| Label | Cell | B | C |
|---|---|---|---|
| Structure Height Lower (FT.) | row 10 | typed 7.0 → 7 | `=($B$10*0.305)` → 2.135 |
| Structure Height Upper (FT.) | row 11 | typed 9.0 → 9 | `=(B11*0.305)` → 2.745 |
| No. of rafters | row 26 | typed 18.0 → 18 |  |
| No of legs | row 27 | `=ROUNDUP(B9/2,0)+1` → 5 | `=if(B9/3=int(B9/3),0,1)` → 1 |
| Bracing Support Length | row 28 | `=3*B9/2` → 12 |  |
| Rafter Length 80x40x2mm (MTS) | row 29 | `=ROUNDUP((B26*2.3*B9)+(B26*C10)+(B26*C11)+(B28*0.5),-1)` → 430 |  |
| Purlin Length 40x40x2mm (MTS) | row 30 | `=ROUNDUP(($B$22*1.2*3),0)` → 206 |  |
| 3.5ft GI Shed (sqft) | row 12 | typed 0.0 → 0 |  |

Structure / hardware lines:

| Row | Line | Make | Unit | J (qty) | L (rate) |
|---|---|---|---|---|---|
| 35 | Nut Bolt & Washer Set: 100mm X M10 (Anchor Bolt) | Reputed | Nos. | `=J46*4` → 180 | 16 |
| 37 | Nut Bolt & Washer Set: M8 x 100 Hot Dip Galvanised for Purlin | Reputed | Nos. | typed 0.0 → 0 | 10 |
| 44 | Structure: ISI standard 80 microns GI structure | 80x40x2 | MTS | `=roundup(T45/6,0)*6` → 150 | 288 |
| 45 | Structure:  | 40x40x2 (Purlin) | MTS | `=J$14*1.2*3+12` → 217.2 | 155 |
| 46 | Structure:  | Base plate | Nos. | `=S45*1.5` → 45 | 120 |
| 47 | Structure: Ladder and Cross bracing | 40x40x2 | MTS. | typed 24.0 → 24 | 160 |
| 48 | Structure: Walkway |  | MTS. | typed 21.0 → 21 | 800 |
| 49 | Structure: Over the shed Al structure |  | kW | typed 0.0 → 0 | 2900 |
| 50 | U-Clamp: With Spring and SS- 304 Nut & Bolt | Reputed | Nos. | typed 78.0 → 78 | 40 |
| 51 | Z-Clamp: With Spring and SS- 304 Nut & Bolt | Reputed | Nos. | typed 18.0 → 18 | 40 |
| 53 | Civil: Block | 300*300*300 | Nos. | typed 22.0 → 22 | 350 |

Side sub-table cells (columns O–W, row ≥ 30):

| Cell | Formula / typed | Value |
|---|---|---|
| P37 | typed 'Support' | Support |
| R37 | typed 1.5 | 1.5 |
| S37 | `=S45` | 30 |
| T37 | `=S37*R37` | 45 |
| P38 | typed 'Rafter ' | Rafter  |
| Q38 | typed 'B&C' | B&C |
| R38 | typed 4.3 | 4.3 |
| S38 | typed 4.0 | 4 |
| T38 | `=S38*R38` | 17.2 |
| Q39 | typed 'A' | A |
| R39 | typed 2.0 | 2 |
| S39 | typed 13.0 | 13 |
| T39 | `=S39*R39` | 26 |
| P40 | typed 'Legs' | Legs |
| Q40 | typed 'B&C' | B&C |
| R40 | `=4/3.28` | 1.2195 |
| S40 | typed 4.0 | 4 |
| T40 | `=S40*R40` | 4.878 |
| R41 | `=5/3.28` | 1.5244 |
| S41 | typed 4.0 | 4 |
| T41 | `=S41*R41` | 6.0976 |
| Q42 | typed 'A ' | A  |
| R42 | `=6/3.28` | 1.8293 |
| S42 | typed 11.0 | 11 |
| T42 | `=S42*R42` | 20.122 |
| R43 | `=8/3.28` | 2.439 |
| S43 | typed 11.0 | 11 |
| T43 | `=S43*R43` | 26.8293 |
| S45 | `=sum(S40:S44)` | 30 |
| T45 | `=sum(T37:T44)` | 146.127 |

#### Ananda / `40.2kW Non-raised Strucutre Sol`

Parameter block (column A/B/C):

| Label | Cell | B | C |
|---|---|---|---|
| Structure Height Lower (FT.) | row 10 | typed 7.0 → 7 | `=($B$10*0.305)` → 2.135 |
| Structure Height Upper (FT.) | row 11 | typed 9.0 → 9 | `=(B11*0.305)` → 2.745 |
| No. of rafters | row 38 | typed 18.0 → 18 |  |
| No of legs | row 39 | `=ROUNDUP(B9/2,0)+1` → 5 | `=if(B9/3=int(B9/3),0,1)` → 1 |
| Bracing Support Length | row 40 | `=3*B9/2` → 12 |  |
| Rafter Length 80x40x2mm (MTS) | row 41 | `=ROUNDUP((B38*2.3*B9)+(B38*C10)+(B38*C11)+(B40*0.5),-1)` → 430 |  |
| Purlin Length 40x40x2mm (MTS) | row 42 | `=ROUNDUP(($B$28*1.2*3),0)` → 270 |  |
| 3.5ft GI Shed (sqft) | row 12 | typed 0.0 → 0 |  |

Structure / hardware lines:

| Row | Line | Make | Unit | J (qty) | L (rate) |
|---|---|---|---|---|---|
| 47 | Nut Bolt & Washer Set: 100mm X M10 (Anchor Bolt) | Reputed | Nos. | `=J58*4` → 180 | 16 |
| 49 | Nut Bolt & Washer Set: M8 x 100 Hot Dip Galvanised for Purlin | Reputed | Nos. | typed 0.0 → 0 | 10 |
| 56 | Structure: ISI standard 80 microns GI structure | 80x40x2 | MTS | `=roundup(T57/6,0)*6` → 150 | 338 |
| 57 | Structure:  | 40x40x2 (Purlin) | MTS | `=J$14*1.2*3+12` → 282 | 180 |
| 58 | Structure:  | Base plate | Nos. | `=S57*1.5` → 45 | 120 |
| 59 | Structure: Ladder and Cross bracing | 40x40x2 | MTS. | typed 24.0 → 24 | 160 |
| 60 | Structure: Walkway |  | MTS. | typed 21.0 → 21 | 800 |
| 61 | Structure: Over the shed Al structure |  | kW | typed 0.0 → 0 | 2900 |
| 62 | U-Clamp: With Spring and SS- 304 Nut & Bolt | Reputed | Nos. | typed 78.0 → 78 | 40 |
| 63 | Z-Clamp: With Spring and SS- 304 Nut & Bolt | Reputed | Nos. | typed 18.0 → 18 | 40 |
| 65 | Civil: Block | 300*300*300 | Nos. | typed 22.0 → 22 | 350 |

Side sub-table cells (columns O–W, row ≥ 30):

| Cell | Formula / typed | Value |
|---|---|---|
| P31 | typed 175.0 | 175 |
| Q31 | typed 226.0 | 226 |
| R31 | `=AVERAGE(P31:Q31)` | 200.5 |
| P36 | typed 377.0 | 377 |
| Q36 | typed 688.0 | 688 |
| R36 | `=AVERAGE(P36:Q36)` | 532.5 |
| P37 | typed '6sqmm Cu' | 6sqmm Cu |
| Q37 | typed '10Sqmm Cu' | 10Sqmm Cu |
| P49 | typed 'Support' | Support |
| R49 | typed 1.5 | 1.5 |
| S49 | `=S57` | 30 |
| T49 | `=S49*R49` | 45 |
| P50 | typed 'Rafter ' | Rafter  |
| Q50 | typed 'B&C' | B&C |
| R50 | typed 4.3 | 4.3 |
| S50 | typed 4.0 | 4 |
| T50 | `=S50*R50` | 17.2 |
| Q51 | typed 'A' | A |
| R51 | typed 2.0 | 2 |
| S51 | typed 13.0 | 13 |
| T51 | `=S51*R51` | 26 |
| P52 | typed 'Legs' | Legs |
| Q52 | typed 'B&C' | B&C |
| R52 | `=4/3.28` | 1.2195 |
| S52 | typed 4.0 | 4 |
| T52 | `=S52*R52` | 4.878 |
| R53 | `=5/3.28` | 1.5244 |
| S53 | typed 4.0 | 4 |
| T53 | `=S53*R53` | 6.0976 |
| R54 | `=6/3.28` | 1.8293 |
| S54 | typed 11.0 | 11 |
| T54 | `=S54*R54` | 20.122 |
| R55 | `=8/3.28` | 2.439 |
| S55 | typed 11.0 | 11 |
| T55 | `=S55*R55` | 26.8293 |
| S57 | `=sum(S52:S56)` | 30 |
| T57 | `=sum(T49:T56)` | 146.127 |

#### Ananda / `10.8kW Non-raised Strucutre Sol`

Parameter block (column A/B/C):

| Label | Cell | B | C |
|---|---|---|---|
| Structure Height Lower (FT.) | row 10 | typed 7.0 → 7 | `=($B$10*0.305)` → 2.135 |
| Structure Height Upper (FT.) | row 11 | typed 9.0 → 9 | `=(B11*0.305)` → 2.745 |
| No. of rafters | row 25 | typed 18.0 → 18 |  |
| No of legs | row 26 | `=ROUNDUP(B9/2,0)+1` → 4 | `=if(B9/3=int(B9/3),0,1)` → 1 |
| Bracing Support Length | row 27 | `=3*B9/2` → 7.5 |  |
| Rafter Length 80x40x2mm (MTS) | row 28 | `=ROUNDUP((B25*2.3*B9)+(B25*C10)+(B25*C11)+(B27*0.5),-1)` → 300 |  |
| Purlin Length 40x40x2mm (MTS) | row 29 | `=ROUNDUP(($B$22*1.2*3),0)` → 65 |  |
| 3.5ft GI Shed (sqft) | row 12 | typed 0.0 → 0 |  |

Structure / hardware lines:

| Row | Line | Make | Unit | J (qty) | L (rate) |
|---|---|---|---|---|---|
| 35 | Nut Bolt & Washer Set: 100mm X M10 (Anchor Bolt) | Reputed | Nos. | `=J46*4` → 80 | 16 |
| 37 | Nut Bolt & Washer Set: M8 x 100 Hot Dip Galvanised for Purlin | Reputed | Nos. | typed 0.0 → 0 | 10 |
| 44 | Structure: ISI standard 80 microns GI structure | 80x40x2 | MTS | typed 48.0 → 48 | 288 |
| 45 | Structure:  | 40x40x2 (Purlin) | MTS | `=J$14*1.2*3+4.5` → 69.3 | 155 |
| 46 | Structure:  | Base plate | Nos. | `=R53*2` → 20 | 120 |
| 47 | Structure: Ladder and Cross bracing | 40x40x2 | MTS. | typed 12.0 → 12 | 160 |
| 48 | Structure: Walkway |  | MTS. | typed 0.0 → 0 | 800 |
| 49 | Structure: Over the shed Al structure |  | kW | typed 0.0 → 0 | 2900 |
| 50 | U-Clamp: With Spring and SS- 304 Nut & Bolt | Reputed | Nos. | typed 78.0 → 78 | 40 |
| 51 | Z-Clamp: With Spring and SS- 304 Nut & Bolt | Reputed | Nos. | typed 18.0 → 18 | 40 |
| 53 | J-Bolt: M-8 SS-304 | 80*42*25mm | Nos. | typed 0.0 → 0 | 0 |

Side sub-table cells (columns O–W, row ≥ 30):

| Cell | Formula / typed | Value |
|---|---|---|
| P46 | typed 'Support' | Support |
| Q46 | typed 1.25 | 1.25 |
| R46 | `=R53` | 10 |
| S46 | `=R46*Q46` | 12.5 |
| P47 | typed 'Rafter ' | Rafter  |
| Q47 | typed 4.3 | 4.3 |
| R47 | typed 5.0 | 5 |
| S47 | `=R47*Q47` | 21.5 |
| Q48 | typed 6.6 | 6.6 |
| R48 | typed 0.0 | 0 |
| S48 | `=R48*Q48` | 0 |
| P49 | typed 'Legs' | Legs |
| Q49 | `=4/3.28` | 1.2195 |
| R49 | typed 5.0 | 5 |
| S49 | `=R49*Q49` | 6.0976 |
| Q50 | `=6/3.28` | 1.8293 |
| R50 | typed 5.0 | 5 |
| S50 | `=R50*Q50` | 9.1463 |
| R53 | `=sum(R49:R52)` | 10 |
| S53 | `=SUM(S46:S51)` | 49.2439 |

#### Ananda / `4.2kW Non-raised Strucutre Sola`

Parameter block (column A/B/C):

| Label | Cell | B | C |
|---|---|---|---|
| Structure Height Lower (FT.) | row 10 | typed 7.0 → 7 | `=($B$10*0.305)` → 2.135 |
| Structure Height Upper (FT.) | row 11 | typed 9.0 → 9 | `=(B11*0.305)` → 2.745 |
| No. of rafters | row 25 | typed 18.0 → 18 |  |
| No of legs | row 26 | `=ROUNDUP(B9/2,0)+1` → 4 | `=if(B9/3=int(B9/3),0,1)` → 1 |
| Bracing Support Length | row 27 | `=3*B9/2` → 7.5 |  |
| Rafter Length 80x40x2mm (MTS) | row 28 | `=ROUNDUP((B25*2.3*B9)+(B25*C10)+(B25*C11)+(B27*0.5),-1)` → 300 |  |
| Purlin Length 40x40x2mm (MTS) | row 29 | `=ROUNDUP(($B$22*1.2*3),0)` → 26 |  |
| 3.5ft GI Shed (sqft) | row 12 | typed 0.0 → 0 |  |

Structure / hardware lines:

| Row | Line | Make | Unit | J (qty) | L (rate) |
|---|---|---|---|---|---|
| 35 | Nut Bolt & Washer Set: 100mm X M10 (Anchor Bolt) | Reputed | Nos. | `=J46*4` → 48 | 16 |
| 37 | Nut Bolt & Washer Set: M8 x 100 Hot Dip Galvanised for Purlin | Reputed | Nos. | typed 0.0 → 0 | 10 |
| 44 | Structure: ISI standard 80 microns GI structure | 80x40x2 | MTS | typed 42.0 → 42 | 288 |
| 45 | Structure:  | 40x40x2 (Purlin) | MTS | `=J$14*1.2*3+4.5` → 29.7 | 155 |
| 46 | Structure:  | Base plate | Nos. | `=R53*2` → 12 | 120 |
| 47 | Structure: Ladder and Cross bracing | 40x40x2 | MTS. | typed 6.0 → 6 | 160 |
| 48 | Structure: Walkway |  | MTS. | typed 0.0 → 0 | 800 |
| 49 | Structure: Over the shed Al structure |  | kW | typed 0.0 → 0 | 2900 |
| 50 | U-Clamp: With Spring and SS- 304 Nut & Bolt | Reputed | Nos. | typed 78.0 → 78 | 40 |
| 51 | Z-Clamp: With Spring and SS- 304 Nut & Bolt | Reputed | Nos. | typed 18.0 → 18 | 40 |
| 53 | J-Bolt: M-8 SS-304 | 80*42*25mm | Nos. | typed 0.0 → 0 | 0 |

Side sub-table cells (columns O–W, row ≥ 30):

| Cell | Formula / typed | Value |
|---|---|---|
| P46 | typed 'Support' | Support |
| Q46 | typed 1.25 | 1.25 |
| R46 | `=R53` | 6 |
| S46 | `=R46*Q46` | 7.5 |
| P47 | typed 'Rafter ' | Rafter  |
| Q47 | typed 4.3 | 4.3 |
| R47 | typed 5.0 | 5 |
| S47 | `=R47*Q47` | 21.5 |
| Q48 | typed 6.6 | 6.6 |
| R48 | typed 0.0 | 0 |
| S48 | `=R48*Q48` | 0 |
| P49 | typed 'Legs' | Legs |
| Q49 | `=4/3.28` | 1.2195 |
| R49 | typed 3.0 | 3 |
| S49 | `=R49*Q49` | 3.6585 |
| Q50 | `=6/3.28` | 1.8293 |
| R50 | typed 3.0 | 3 |
| S50 | `=R50*Q50` | 5.4878 |
| R53 | `=sum(R49:R52)` | 6 |
| S53 | `=SUM(S46:S51)` | 38.1463 |

#### Ashwini / `3 kW Raised Structure Solar BOQ`

Parameter block (column A/B/C):

| Label | Cell | B | C |
|---|---|---|---|
| Structure Height Lower (FT.) | row 10 | typed 7.0 → 7 | `=($B$10*0.305)` → 2.135 |
| Structure Height Upper (FT.) | row 11 | typed 9.0 → 9 | `=(B11*0.305)` → 2.745 |
| No. of rafters | row 25 | typed 18.0 → 18 |  |
| No of legs | row 26 | `=ROUNDUP(B9/2,0)+1` → 2 | `=if(B9/3=int(B9/3),0,1)` → 1 |
| Bracing Support Length | row 27 | `=3*B9/2` → 3 |  |
| Rafter Length 80x40x2mm (MTS) | row 28 | `=ROUNDUP((B25*2.3*B9)+(B25*C10)+(B25*C11)+(B27*0.5),-1)` → 180 |  |
| Purlin Length 40x40x2mm (MTS) | row 29 | `=ROUNDUP(($B$22*1.2*3),0)` → 18 |  |
| 3.5ft GI Shed (sqft) | row 12 | typed 0.0 → 0 |  |

Structure / hardware lines:

| Row | Line | Make | Unit | J (qty) | L (rate) |
|---|---|---|---|---|---|
| 35 | Nut Bolt & Washer Set: 100mm X M10 (Anchor Bolt) | Reputed | Nos. | `=J46*4` → 32 | 16 |
| 37 | Nut Bolt & Washer Set: M8 x 100 Hot Dip Galvanised for Purlin | Reputed | Nos. | typed 0.0 → 0 | 10 |
| 44 | Structure: ISI standard 80 microns GI structure | 80x40x2 | MTS | `=roundup(S53/6,0)*6` → 24 | 288 |
| 45 | Structure:  | 40x40x2 (Purlin) | MTS | `=J$14*1.2*3+3.6` → 21.6 | 155 |
| 46 | Structure:  | Base plate | Nos. | `=R53*2` → 8 | 120 |
| 47 | Structure: Ladder and Cross bracing | 40x40x2 | MTS. | typed 12.0 → 12 | 160 |
| 48 | Structure: Walkway |  | MTS. | typed 3.6 → 3.6 | 800 |
| 49 | Structure: Over the shed Al structure |  | kW | typed 0.0 → 0 | 2900 |
| 50 | U-Clamp: With Spring and SS- 304 Nut & Bolt | Reputed | Nos. | typed 9.0 → 9 | 40 |
| 51 | Z-Clamp: With Spring and SS- 304 Nut & Bolt | Reputed | Nos. | typed 12.0 → 12 | 40 |
| 53 | J-Bolt: M-8 SS-304 | 80*42*25mm | Nos. | typed 0.0 → 0 | 0 |

Side sub-table cells (columns O–W, row ≥ 30):

| Cell | Formula / typed | Value |
|---|---|---|
| P46 | typed 'Support' | Support |
| Q46 | typed 0.7 | 0.7 |
| R46 | `=R53` | 4 |
| S46 | `=R46*Q46` | 2.8 |
| P47 | typed 'Rafter ' | Rafter  |
| Q47 | `=2.4*2-0.7+0.5` | 4.6 |
| R47 | typed 2.0 | 2 |
| S47 | `=R47*Q47` | 9.2 |
| P49 | typed 'Legs' | Legs |
| Q49 | `=7/3.28` | 2.1341 |
| R49 | typed 2.0 | 2 |
| S49 | `=R49*Q49` | 4.2683 |
| Q50 | `=9/3.28` | 2.7439 |
| R50 | typed 2.0 | 2 |
| S50 | `=R50*Q50` | 5.4878 |
| R53 | `=sum(R49:R52)` | 4 |
| S53 | `=SUM(S46:S51)` | 21.7561 |

#### Ashwini / `4.8 kW Raised Structure Solar B`

Parameter block (column A/B/C):

| Label | Cell | B | C |
|---|---|---|---|
| Structure Height Lower (FT.) | row 10 | typed 7.0 → 7 | `=($B$10*0.305)` → 2.135 |
| Structure Height Upper (FT.) | row 11 | typed 9.0 → 9 | `=(B11*0.305)` → 2.745 |
| No. of rafters | row 25 | typed 18.0 → 18 |  |
| No of legs | row 26 | `=ROUNDUP(B9/2,0)+1` → 2 | `=if(B9/3=int(B9/3),0,1)` → 1 |
| Bracing Support Length | row 27 | `=3*B9/2` → 3 |  |
| Rafter Length 80x40x2mm (MTS) | row 28 | `=ROUNDUP((B25*2.3*B9)+(B25*C10)+(B25*C11)+(B27*0.5),-1)` → 180 |  |
| Purlin Length 40x40x2mm (MTS) | row 29 | `=ROUNDUP(($B$22*1.2*3),0)` → 29 |  |
| 3.5ft GI Shed (sqft) | row 12 | typed 0.0 → 0 |  |

Structure / hardware lines:

| Row | Line | Make | Unit | J (qty) | L (rate) |
|---|---|---|---|---|---|
| 35 | Nut Bolt & Washer Set: 100mm X M10 (Anchor Bolt) | Reputed | Nos. | `=J46*4` → 48 | 16 |
| 37 | Nut Bolt & Washer Set: M8 x 100 Hot Dip Galvanised for Purlin | Reputed | Nos. | typed 0.0 → 0 | 10 |
| 44 | Structure: ISI standard 80 microns GI structure | 80x40x2 | MTS | `=roundup(S53/6,0)*6` → 36 | 288 |
| 45 | Structure:  | 40x40x2 (Purlin) | MTS | `=J$14*1.2*3+3.6` → 32.4 | 155 |
| 46 | Structure:  | Base plate | Nos. | `=R53*2` → 12 | 120 |
| 47 | Structure: Ladder and Cross bracing | 40x40x2 | MTS. | typed 12.0 → 12 | 160 |
| 48 | Structure: Walkway |  | MTS. | typed 4.5 → 4.5 | 800 |
| 49 | Structure: Over the shed Al structure |  | kW | typed 0.0 → 0 | 2900 |
| 50 | U-Clamp: With Spring and SS- 304 Nut & Bolt | Reputed | Nos. | typed 18.0 → 18 | 40 |
| 51 | Z-Clamp: With Spring and SS- 304 Nut & Bolt | Reputed | Nos. | typed 12.0 → 12 | 40 |
| 53 | J-Bolt: M-8 SS-304 | 80*42*25mm | Nos. | typed 0.0 → 0 | 0 |

Side sub-table cells (columns O–W, row ≥ 30):

| Cell | Formula / typed | Value |
|---|---|---|
| P46 | typed 'Support' | Support |
| Q46 | typed 0.7 | 0.7 |
| R46 | `=R53` | 6 |
| S46 | `=R46*Q46` | 4.2 |
| P47 | typed 'Rafter ' | Rafter  |
| Q47 | `=2.4*2-0.7+0.5` | 4.6 |
| R47 | typed 3.0 | 3 |
| S47 | `=R47*Q47` | 13.8 |
| P49 | typed 'Legs' | Legs |
| Q49 | `=7/3.28` | 2.1341 |
| R49 | typed 3.0 | 3 |
| S49 | `=R49*Q49` | 6.4024 |
| Q50 | `=9/3.28` | 2.7439 |
| R50 | typed 3.0 | 3 |
| S50 | `=R50*Q50` | 8.2317 |
| R53 | `=sum(R49:R52)` | 6 |
| S53 | `=SUM(S46:S51)` | 32.6341 |

#### Celebration / `25 kW Non-Raised Structure Sola`

Parameter block (column A/B/C):

| Label | Cell | B | C |
|---|---|---|---|
| Structure Height Lower (FT.) | row 10 | typed 7.0 → 7 | `=($B$10*0.305)` → 2.135 |
| Structure Height Upper (FT.) | row 11 | typed 9.0 → 9 | `=(B11*0.305)` → 2.745 |
| No. of rafters | row 25 | typed 18.0 → 18 |  |
| No of legs | row 26 | `=ROUNDUP(B9/2,0)+1` → 2 | `=if(B9/3=int(B9/3),0,1)` → 1 |
| Bracing Support Length | row 27 | `=3*B9/2` → 3 |  |
| Rafter Length 80x40x2mm (MTS) | row 28 | `=ROUNDUP((B25*2.3*B9)+(B25*C10)+(B25*C11)+(B27*0.5),-1)` → 180 |  |
| Purlin Length 40x40x2mm (MTS) | row 29 | `=ROUNDUP(($B$22*1.2*3),0)` → 152 |  |
| 3.5ft GI Shed (sqft) | row 12 | typed 0.0 → 0 |  |

Structure / hardware lines:

| Row | Line | Make | Unit | J (qty) | L (rate) |
|---|---|---|---|---|---|
| 35 | Nut Bolt & Washer Set: 100mm X M10 (Anchor Bolt) | Reputed | Nos. | `=J46*4` → 160 | 16 |
| 37 | Nut Bolt & Washer Set: M8 x 100 Hot Dip Galvanised for Purlin | Reputed | Nos. | typed 0.0 → 0 | 10 |
| 44 | Structure: ISI standard 80 microns GI structure | 80x40x2 | MTS | `=roundup(S53/6,0)*6` → 102 | 338 |
| 45 | Structure:  | 40x40x2 (Purlin) | MTS | `=round((7*1.2*3+3.6)/6,0)*6` → 30 | 180 |
| 46 | Structure:  | Base plate | Nos. | `=R53*2` → 40 | 120 |
| 47 | Structure: Ladder and Cross bracing | 40x40x2 | MTS. | typed 0.0 → 0 | 160 |
| 48 | Structure: Walkway |  | MTS. | typed 9.6 → 9.6 | 800 |
| 49 | Structure: Over the shed Al structure |  | kW | typed 9.6 → 9.6 | 1500 |
| 50 | U-Clamp: With Spring and SS- 304 Nut & Bolt | Reputed | Nos. | typed 90.0 → 90 | 40 |
| 51 | Z-Clamp: With Spring and SS- 304 Nut & Bolt | Reputed | Nos. | typed 72.0 → 72 | 40 |
| 53 | J-Bolt: M-8 SS-304 | 80*42*25mm | Nos. | `=R53` → 20 | 0 |

Side sub-table cells (columns O–W, row ≥ 30):

| Cell | Formula / typed | Value |
|---|---|---|
| P42 | typed '9.6kW is on Shed' | 9.6kW is on Shed |
| P44 | typed 'For Tank and Lift Room' | For Tank and Lift Room |
| P46 | typed 'Support' | Support |
| Q46 | typed 0.75 | 0.75 |
| R46 | `=R53` | 20 |
| S46 | `=R46*Q46` | 15 |
| P47 | typed 'Rafter ' | Rafter  |
| Q47 | `=2.4*2-0.7+0.5` | 4.6 |
| R47 | typed 10.0 | 10 |
| S47 | `=R47*Q47` | 46 |
| P49 | typed 'Legs' | Legs |
| Q49 | `=7/3.28` | 2.1341 |
| R49 | typed 10.0 | 10 |
| S49 | `=R49*Q49` | 21.3415 |
| Q50 | `=5/3.28` | 1.5244 |
| R50 | typed 10.0 | 10 |
| S50 | `=R50*Q50` | 15.2439 |
| R53 | `=sum(R49:R51)` | 20 |
| S53 | `=SUM(S46:S51)` | 97.5854 |

#### Celebration / `25 kW Non-Raised + Shed Hybrid`

Parameter block (column A/B/C):

| Label | Cell | B | C |
|---|---|---|---|
| Structure Height Lower (FT.) | row 10 | typed 7.0 → 7 | `=($B$10*0.305)` → 2.135 |
| Structure Height Upper (FT.) | row 11 | typed 9.0 → 9 | `=(B11*0.305)` → 2.745 |
| No. of rafters | row 26 | typed 18.0 → 18 |  |
| No of legs | row 27 | `=ROUNDUP(B9/2,0)+1` → 2 | `=if(B9/3=int(B9/3),0,1)` → 1 |
| Bracing Support Length | row 28 | `=3*B9/2` → 3 |  |
| Rafter Length 80x40x2mm (MTS) | row 29 | `=ROUNDUP((B26*2.3*B9)+(B26*C10)+(B26*C11)+(B28*0.5),-1)` → 180 |  |
| Purlin Length 40x40x2mm (MTS) | row 30 | `=ROUNDUP(($B$22*1.2*3),0)` → 152 |  |
| 3.5ft GI Shed (sqft) | row 12 | typed 0.0 → 0 |  |

Structure / hardware lines:

| Row | Line | Make | Unit | J (qty) | L (rate) |
|---|---|---|---|---|---|
| 36 | Nut Bolt & Washer Set: 100mm X M10 (Anchor Bolt) | Reputed | Nos. | `=J47*4` → 96 | 16 |
| 38 | Nut Bolt & Washer Set: M8 x 100 Hot Dip Galvanised for Purlin | Reputed | Nos. | typed 0.0 → 0 | 10 |
| 45 | Structure: ISI standard 80 microns GI structure | 80x40x2 | MTS | `=roundup(S54/6,0)*6` → 48 | 338 |
| 46 | Structure:  | 40x40x2 (Purlin) | MTS | `=round((7*1.2*3+3.6)/6,0)*6` → 30 | 180 |
| 47 | Structure:  | Base plate | Nos. | `=R54*2` → 24 | 120 |
| 48 | Structure: Ladder and Cross bracing | 40x40x2 | MTS. | typed 0.0 → 0 | 160 |
| 49 | Structure: Walkway |  | MTS. | typed 9.6 → 9.6 | 800 |
| 50 | Structure: Over the shed Al structure |  | kW | `=26*0.6` → 15.6 | 3000 |
| 51 | U-Clamp: With Spring and SS- 304 Nut & Bolt | Reputed | Nos. | typed 84.0 → 84 | 40 |
| 52 | Z-Clamp: With Spring and SS- 304 Nut & Bolt | Reputed | Nos. | typed 12.0 → 12 | 40 |
| 54 | J-Bolt: M-8 SS-304 | 80*42*25mm | Nos. | `=R54` → 12 | 0 |

Side sub-table cells (columns O–W, row ≥ 30):

| Cell | Formula / typed | Value |
|---|---|---|
| Q35 | typed 150000.0 | 150000 |
| P43 | typed '9.6kW is on Shed' | 9.6kW is on Shed |
| P45 | typed 'For Tank and Lift Room' | For Tank and Lift Room |
| P47 | typed 'Support' | Support |
| Q47 | typed 0.75 | 0.75 |
| R47 | `=R54` | 12 |
| S47 | `=R47*Q47` | 9 |
| P48 | typed 'Rafter ' | Rafter  |
| Q48 | `=2.4*2-0.7+0.5` | 4.6 |
| R48 | typed 6.0 | 6 |
| S48 | `=R48*Q48` | 27.6 |
| P50 | typed 'Legs' | Legs |
| Q50 | `=2/3.28` | 0.6098 |
| R50 | typed 6.0 | 6 |
| S50 | `=R50*Q50` | 3.6585 |
| Q51 | `=4/3.28` | 1.2195 |
| R51 | typed 6.0 | 6 |
| S51 | `=R51*Q51` | 7.3171 |
| R54 | `=sum(R50:R52)` | 12 |
| S54 | `=SUM(S47:S52)` | 47.5756 |

#### Foundit / `6 kW Shed Structure DCR Solar B`

Parameter block (column A/B/C):

| Label | Cell | B | C |
|---|---|---|---|
| Structure Height Lower (FT.) | row 10 | typed 7.0 → 7 | `=($B$10*0.305)` → 2.135 |
| Structure Height Upper (FT.) | row 11 | typed 9.0 → 9 | `=(B11*0.305)` → 2.745 |
| No. of rafters | row 26 | typed 18.0 → 18 |  |
| No of legs | row 27 | `=ROUNDUP(B9/2,0)+1` → 2 | `=if(B9/3=int(B9/3),0,1)` → 1 |
| Bracing Support Length | row 28 | `=3*B9/2` → 3 |  |
| Rafter Length 80x40x2mm (MTS) | row 29 | `=ROUNDUP((B26*2.3*B9)+(B26*C10)+(B26*C11)+(B28*0.5),-1)` → 180 |  |
| Purlin Length 40x40x2mm (MTS) | row 30 | `=ROUNDUP(($B$22*1.2*3),0)` → 18 |  |
| 3.5ft GI Shed (sqft) | row 12 | typed 0.0 → 0 |  |

Structure / hardware lines:

| Row | Line | Make | Unit | J (qty) | L (rate) |
|---|---|---|---|---|---|
| 36 | Nut Bolt & Washer Set: 100mm X M10 (Anchor Bolt) | Reputed | Nos. | `=J47*4` → 0 | 16 |
| 38 | Nut Bolt & Washer Set: M8 x 100 Hot Dip Galvanised for Purlin | Reputed | Nos. | typed 0.0 → 0 | 10 |
| 45 | Structure: ISI standard 80 microns GI structure | 80x40x2 | MTS | `=roundup(S54/6,0)*6` → 0 | 0 |
| 46 | Structure:  | 40x40x2 (Purlin) | MTS | `=J$14*1.2*3+3.6` → 21.6 | 0 |
| 47 | Structure:  | Base plate | Nos. | `=R54*2` → 0 | 0 |
| 48 | Structure: Ladder and Cross bracing | 40x40x2 | MTS. | typed 12.0 → 12 | 0 |
| 49 | Structure: Walkway |  | MTS. | typed 10.0 → 10 | 0 |
| 50 | Structure: Over the shed Al structure |  | kW | typed 3.0 → 3 | 0 |
| 51 | U-Clamp: With Spring and SS- 304 Nut & Bolt | Reputed | Nos. | typed 33.0 → 33 | 0 |
| 52 | Z-Clamp: With Spring and SS- 304 Nut & Bolt | Reputed | Nos. | typed 18.0 → 18 | 0 |
| 54 | J-Bolt: M-8 SS-304 | 80*42*25mm | Nos. | typed 6.0 → 6 | 0 |

Side sub-table cells (columns O–W, row ≥ 30):

| Cell | Formula / typed | Value |
|---|---|---|
| U40 | `=8.2/3.28` | 2.5 |
| O47 | typed 'Support' | Support |
| Q47 | typed 1.0 | 1 |
| R47 | `=R54` | 0 |
| S47 | `=R47*Q47` | 0 |
| O48 | typed 'Rafter ' | Rafter  |
| Q48 | `=2.4*3-0.7+0.5` | 7 |
| R48 | typed 0.0 | 0 |
| S48 | `=R48*Q48` | 0 |
| O49 | typed 'Legs' | Legs |
| P49 | typed 'On Parafeet' | On Parafeet |
| Q49 | `=6/3.28` | 1.8293 |
| R49 | typed 0.0 | 0 |
| S49 | `=R49*Q49` | 0 |
| P50 | typed 'On Roof Parafeet' | On Roof Parafeet |
| Q50 | `=11/3.28` | 3.3537 |
| R50 | typed 0.0 | 0 |
| S50 | `=R50*Q50` | 0 |
| P51 | typed 'On Parafeet' | On Parafeet |
| Q51 | `=4/3.28` | 1.2195 |
| R51 | typed 0.0 | 0 |
| S51 | `=R51*Q51` | 0 |
| P52 | typed 'On Shed' | On Shed |
| Q52 | `=4/3.28` | 1.2195 |
| R52 | typed 0.0 | 0 |
| S52 | `=Q52*R52` | 0 |
| R53 | typed 0.0 | 0 |
| S53 | `=Q53*R53` | 0 |
| R54 | typed 0.0 | 0 |
| S54 | typed 0.0 | 0 |

#### Foundit / `6 kW Shed Structure NDCR Solar`

Parameter block (column A/B/C):

| Label | Cell | B | C |
|---|---|---|---|
| Structure Height Lower (FT.) | row 10 | typed 0.0 → 0 | `=($B$10*0.305)` → 0 |
| Structure Height Upper (FT.) | row 11 | typed 0.0 → 0 | `=(B11*0.305)` → 0 |
| No. of rafters | row 26 | typed 18.0 → 18 |  |
| No of legs | row 27 | `=ROUNDUP(B9/2,0)+1` → 2 | `=if(B9/3=int(B9/3),0,1)` → 1 |
| Bracing Support Length | row 28 | `=3*B9/2` → 3 |  |
| Rafter Length 80x40x2mm (MTS) | row 29 | `=ROUNDUP((B26*2.3*B9)+(B26*C10)+(B26*C11)+(B28*0.5),-1)` → 90 |  |
| Purlin Length 40x40x2mm (MTS) | row 30 | `=ROUNDUP(($B$22*1.2*3),0)` → 36 |  |
| 3.5ft GI Shed (sqft) | row 12 | typed 0.0 → 0 |  |

Structure / hardware lines:

| Row | Line | Make | Unit | J (qty) | L (rate) |
|---|---|---|---|---|---|
| 36 | Nut Bolt & Washer Set: 100mm X M10 (Anchor Bolt) | Reputed | Nos. | `=J47*4` → 0 | 16 |
| 38 | Nut Bolt & Washer Set: M8 x 100 Hot Dip Galvanised for Purlin | Reputed | Nos. | typed 0.0 → 0 | 10 |
| 45 | Structure: ISI standard 80 microns GI structure | 80x40x2 | MTS | `=roundup(S54/6,0)*6` → 0 | 0 |
| 46 | Structure:  | 40x40x2 (Purlin) | MTS | `=J$14*1.2*3+3.6` → 39.6 | 0 |
| 47 | Structure:  | Base plate | Nos. | `=R54*2` → 0 | 0 |
| 48 | Structure: Ladder and Cross bracing | 40x40x2 | MTS. | typed 12.0 → 12 | 0 |
| 49 | Structure: Walkway |  | MTS. | typed 10.0 → 10 | 0 |
| 50 | Structure: Over the shed Al structure |  | kW | typed 6.0 → 6 | 2500 |
| 51 | U-Clamp: With Spring and SS- 304 Nut & Bolt | Reputed | Nos. | typed 33.0 → 33 | 0 |
| 52 | Z-Clamp: With Spring and SS- 304 Nut & Bolt | Reputed | Nos. | typed 18.0 → 18 | 0 |
| 54 | J-Bolt: M-8 SS-304 | 80*42*25mm | Nos. | typed 6.0 → 6 | 0 |

Side sub-table cells (columns O–W, row ≥ 30):

| Cell | Formula / typed | Value |
|---|---|---|
| U40 | `=8.2/3.28` | 2.5 |
| O47 | typed 'Support' | Support |
| Q47 | typed 1.0 | 1 |
| R47 | `=R54` | 0 |
| S47 | `=R47*Q47` | 0 |
| O48 | typed 'Rafter ' | Rafter  |
| Q48 | `=2.4*3-0.7+0.5` | 7 |
| R48 | typed 0.0 | 0 |
| S48 | `=R48*Q48` | 0 |
| O49 | typed 'Legs' | Legs |
| P49 | typed 'On Parafeet' | On Parafeet |
| Q49 | `=6/3.28` | 1.8293 |
| R49 | typed 0.0 | 0 |
| S49 | `=R49*Q49` | 0 |
| P50 | typed 'On Roof Parafeet' | On Roof Parafeet |
| Q50 | `=11/3.28` | 3.3537 |
| R50 | typed 0.0 | 0 |
| S50 | `=R50*Q50` | 0 |
| P51 | typed 'On Parafeet' | On Parafeet |
| Q51 | `=4/3.28` | 1.2195 |
| R51 | typed 0.0 | 0 |
| S51 | `=R51*Q51` | 0 |
| P52 | typed 'On Shed' | On Shed |
| Q52 | `=4/3.28` | 1.2195 |
| R52 | typed 0.0 | 0 |
| S52 | `=Q52*R52` | 0 |
| R53 | typed 0.0 | 0 |
| S53 | `=Q53*R53` | 0 |
| R54 | typed 0.0 | 0 |
| S54 | typed 0.0 | 0 |

#### Fredrick / `3.6 kW Raised Structure Solar B`

Parameter block (column A/B/C):

| Label | Cell | B | C |
|---|---|---|---|
| Structure Height Lower (FT.) | row 10 | typed 0.0 → 0 | `=($B$10*0.305)` → 0 |
| Structure Height Upper (FT.) | row 11 | typed 0.0 → 0 | `=(B11*0.305)` → 0 |
| No. of rafters | row 26 | typed 18.0 → 18 |  |
| No of legs | row 27 | `=ROUNDUP(B9/2,0)+1` → 4 | `=if(B9/3=int(B9/3),0,1)` → 1 |
| Bracing Support Length | row 28 | `=3*B9/2` → 7.5 |  |
| Rafter Length 80x40x2mm (MTS) | row 29 | `=ROUNDUP((B26*2.3*B9)+(B26*C10)+(B26*C11)+(B28*0.5),-1)` → 220 |  |
| Purlin Length 40x40x2mm (MTS) | row 30 | `=ROUNDUP(($B$22*1.2*3),0)` → 33 |  |
| 3.5ft GI Shed (sqft) | row 12 | typed 0.0 → 0 |  |

Structure / hardware lines:

| Row | Line | Make | Unit | J (qty) | L (rate) |
|---|---|---|---|---|---|
| 36 | Nut Bolt & Washer Set: 100mm X M10 (Anchor Bolt) | Reputed | Nos. | `=J48*4` → 0 | 16 |
| 38 | Nut Bolt & Washer Set: M8 x 100 Hot Dip Galvanised for Purlin | Reputed | Nos. | typed 0.0 → 0 | 10 |
| 45 | Structure: ISI standard 80 microns GI structure | 80x40x2 | MTS | `=ROUNDUP(R36/6,0)*6` → 0 | 360 |
| 46 | Structure:  | 75x75x2 | MTS | `=J14*1.2*3` → 32.4 | 413 |
| 47 | Structure:  | 40x40x2 (Purlin) | MTS | `=J$14*1.2*3+3.6` → 36 | 190 |
| 48 | Structure:  | Base plate | Nos. | `=Q46*2` → 0 | 120 |
| 49 | Structure: Ladder | 40x40x2 | MTS. | typed 24.0 → 24 | 160 |
| 50 | Structure: Walkway |  | MTS. | typed 29.0 → 29 | 800 |
| 51 | Structure: Over the shed Al structure |  | kW | typed 4.2 → 4.2 | 1500 |
| 52 | U-Clamp: With Spring and SS- 304 Nut & Bolt | Reputed | Nos. | typed 60.0 → 60 | 40 |
| 53 | Z-Clamp: With Spring and SS- 304 Nut & Bolt | Reputed | Nos. | typed 30.0 → 30 | 40 |
| 55 | Civil: Block | 300*300*300 | Nos. | `=Q46` → — | 500 |

Side sub-table cells (columns O–W, row ≥ 30):

| Cell | Formula / typed | Value |
|---|---|---|
| O31 | typed 'Legs (Front)' | Legs (Front) |
| P31 | `=7/3.28` | 2.1341 |
| Q31 | typed 0.0 | 0 |
| R31 | `=Q31*P31` | 0 |
| O32 | typed 'Legs (Middle)' | Legs (Middle) |
| P32 | `=8/3.28` | 2.439 |
| Q32 | typed 0.0 | 0 |
| R32 | `=Q32*P32` | 0 |
| O33 | typed 'Legs (Middle)' | Legs (Middle) |
| P33 | `=9/3.28` | 2.7439 |
| Q33 | typed 0.0 | 0 |
| R33 | `=Q33*P33` | 0 |
| O36 | typed 'Total' | Total |
| Q36 | `=SUM(Q22:Q26,Q31:Q35)` | 0 |
| R36 | `=SUM(R19:R35)` | 0 |
| Q47 | typed '.' | . |

---

## Appendix C: how this report was produced

1. `extract.py` read every cell (formula and cached value) of all 6 workbooks with openpyxl.
2. `runall.ts` ran the unmodified `calcBOQ` + `DEFAULT_CATALOGUE` on each sheet's inputs (laType ESE / Conventional / NA).
3. `gen.py` and `gen2.py` produced the tables.

The scripts live in the session scratchpad; per §13 (5B) they would be committed as the fixture extractor. No repository source, test or migration file was modified.
