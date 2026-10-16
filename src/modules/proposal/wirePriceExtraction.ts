// src/modules/proposal/wirePriceExtraction.ts
// AI extraction path for wire-price uploads: turns a photographed/scanned/
// PDF price list into structured rows, reusing the same Gemini pipeline
// server.ts already uses for utility-bill OCR (src/services/geminiExtraction.ts).
import { Type } from "@google/genai";
import { generateWithGeminiFallback, GEMINI_MODEL } from "../../services/geminiExtraction";
import { normalizeToPerMetre } from "./wirePriceUnits";
import { normalizeMaterialText } from "./matchWirePrice";

export interface ExtractedWireRow {
  internal_name: string;
  size_sqmm: number | null;
  cores: number | null;
  material: string | null;
  price_per_m: number;
  /** printed figure before per-metre conversion — preview/audit only */
  price_raw: number;
  /** metres the printed figure covers (100 for a "Rate Per/100 mtr" sheet) */
  price_covers_metres: number;
}

const WIRE_PRICE_PROMPT = `
You are reading a wire/cable price list — a supplier's price sheet, a screenshot of a
product listing, or a photographed printed rate card. Extract EVERY priced product as
its own row.

## CRITICAL: cross-tab / matrix rate tables

These sheets are usually a GRID, not a list. A typical layout has conductor sizes down
the first column and CORE COUNTS across the header row:

    Sq.m | 1 core | 2 core | 3 core | 4 core | ... | 24 core
    0.5  |  2040  |  5270  |  7395  |  9605  | ... |  55100
    0.75 |  2945  |  7505  | 10350  | 13550  | ... |  80600

Every populated CELL is a separate product. For the grid above you must emit
one row per cell: (0.5 sqmm, 1 core, 2040), (0.5 sqmm, 2 core, 5270),
(0.5 sqmm, 3 core, 7395) ... and so on for EVERY size row x EVERY core column.
A 20-row x 14-column grid means ~280 rows, not 20. Do NOT emit one row per size
and do NOT collapse a size's core columns into a single row — that silently
throws away most of the price list.

Skip cells that are blank, greyed out, shaded-empty, or marked NA — those
combinations aren't sold.

The same sheet usually ALSO contains smaller side tables. Extract House Wire and
Submersible Cable side tables too, in addition to the main grid — never instead
of it. SKIP side tables that aren't solar-installation wiring, even though
they're priced on the same sheet: Telephone Cables, LAN Cable, Coaxial Cable,
CCTV Cable, and Speaker Wire are never used in a solar install — do not emit
rows for them.

## Fields

- name: a clear product name. For a matrix cell, build it from the table title plus the
  cell's coordinates, e.g. "Polycab Industrial Flexible Cable 0.5 sqmm 3 core". For a
  side table use the label shown, e.g. "House Wire 1.5 Sqmm FRLF (300/200)".
- size_sqmm: conductor size in sq mm as a bare number (4, 1.5, 6). Null if not stated.
- cores: number of cores, taken from the COLUMN HEADER for matrix cells (a "3 core"
  column means cores = 3). Usually a bare integer, but write exactly 3.5 for a column
  headed "3.5 core" / "3.5C" — a real cable construction (3 full conductors + one
  reduced-size neutral), distinct from a 4-core cable. Do NOT round 3.5 up to 4.
  For "3+1" write 4. Null if not stated.
- material: "Cu" for copper, "Al" for aluminium. Not every sheet has a Cu/Al
  column — the material is often only named in the section/table TITLE or in
  the product name itself, and it applies to every row under that heading:
    "Aluminium Armoured Cable", "Al. XLPE ...", "Alu Conductor"  -> Al
    "Copper Flexible Cable", "Cu Conductor", "House Wire" (always copper)  -> Cu
  Look for "aluminium"/"aluminum"/"alu"/"al." and "copper"/"cu" (case-insensitive,
  whole word) anywhere in the sheet/table title or the row's own product name
  before giving up. Only use null when genuinely neither the title nor the name
  gives any hint either way.
- price: the number exactly as printed in the cell, with no currency symbol, no commas,
  and NO arithmetic applied. Report 2040 as 2040.
- price_covers_metres: how many metres that printed price covers. THIS IS THE MOST
  ERROR-PRONE FIELD — getting it wrong puts a 100x error into a customer quote, so
  work it out deliberately for every row using these rules in order:

  1. LOOK AT THE ROW'S OWN SUB-TABLE HEADING FIRST. These sheets are a patchwork of
     small tables, and each one usually states its own length in its title or in the
     column header directly above the price. Real examples and what they mean:
        "TELEPHONE CABLES UNARMD (90MTR)"     -> 90
        "CCTV CABLE (90)"                      -> 90
        "LAN CABLE 305 MTR"                    -> 305
        "COAXIAL CABLES" with columns
             "100 MTR" and "305 MTR"           -> 100 for the 100 MTR column,
                                                  305 for the 305 MTR column
        "SUBMERSIBLE CABLES", column "Rate/100"-> 100
        "Rate Per/100 mtr"                     -> 100
        "Per Meter" / "/Meter" / "per mtr"     -> 1
     A length written in a product NAME counts too: "Coaxial Cable RG-11 CCS 305 MTR"
     is priced per 305 m, and "House Wire ... (90m coil)" is priced per 90 m.

  2. IF AND ONLY IF the row's own sub-table states no length, INHERIT the sheet-level
     heading — the big title at the top, e.g. "Polycab Industrial Flexible Cable Rate
     Per/100 mtr" means 100. Most sub-tables on such a sheet share that basis, so
     inheriting 100 is far more likely correct than assuming 1.

  3. Only use 1 when the sheet genuinely quotes per-metre rates nowhere and states no
     pack length at all.

  NOT every number in a heading is a length. Voltage grades and conductor specs look
  similar but must be IGNORED for this field — e.g. "FRLF(300/200)", "FRLS (300/200)",
  "1100V", "300/500V", "(40/38)", "(300/200)" are wire specifications, NOT pack
  lengths. A length is written with a unit: "90 MTR", "305 mtr", "Per/100 mtr".
  Every row in one column must share the same basis — if sibling rows in a column
  resolve to 100, an odd row out must not silently become 200.

  Do NOT default to 1 just because a sub-table is unlabelled — that is the single most
  common mistake on these sheets. And never fold the division into "price": report the
  printed number in "price" and the length in "price_covers_metres" separately.

Skip anything that isn't a priced wire/cable product (headings, HSN code lines, address
blocks, GST notes, category labels). If a price genuinely can't be read, skip that cell
rather than guessing a number.
`;

const WIRE_PRICE_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    rows: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          size_sqmm: { type: Type.NUMBER },
          cores: { type: Type.NUMBER },
          material: { type: Type.STRING },
          // Printed figure + the length it covers, kept separate so the
          // per-metre conversion happens in tested code (wirePriceUnits.ts)
          // rather than depending on the model to do arithmetic.
          price: { type: Type.NUMBER },
          price_covers_metres: { type: Type.NUMBER },
        },
        required: ["name", "price"],
      },
    },
  },
  required: ["rows"],
};

export async function extractWirePricesFromDocument(buffer: Buffer, mimeType: string): Promise<ExtractedWireRow[]> {
  const encoded = buffer.toString("base64");
  const filePart = { inlineData: { mimeType, data: encoded } };
  const textPart = { text: WIRE_PRICE_PROMPT };

  const response = await generateWithGeminiFallback("WirePriceExtraction", (client) =>
    client.models.generateContent({
      model: GEMINI_MODEL,
      contents: { parts: [filePart, textPart] },
      config: {
        responseMimeType: "application/json",
        responseSchema: WIRE_PRICE_RESPONSE_SCHEMA,
        temperature: 0,
        // A 20-size x 14-core matrix is ~280 rows of JSON. The default output
        // cap truncates that mid-object and the parse fails, so give the
        // response real headroom.
        maxOutputTokens: 65536,
      },
    })
  );

  const text = response.text ?? "{}";
  let parsed: {
    rows?: Array<{ name?: string; size_sqmm?: number; cores?: number; material?: string; price?: number; price_covers_metres?: number }>;
  };
  try {
    parsed = JSON.parse(text);
  } catch (err: any) {
    // A truncated response is a size problem, not an image-quality problem —
    // say so, otherwise the UI tells the user to retake a photo of a PDF.
    const truncated = /Unterminated|Expected .* after property value|Unexpected end/i.test(err.message || "");
    const e = new Error(
      truncated
        ? "The price sheet is too large to extract in one pass — the response was cut off. Split the PDF into fewer pages and upload them one at a time."
        : "Could not read the extraction result."
    );
    e.name = "ExtractionUnavailableError";
    throw e;
  }
  const rawRows = Array.isArray(parsed.rows) ? parsed.rows : [];

  return rawRows
    .filter((r) => r.name && typeof r.price === "number" && Number.isFinite(r.price))
    .map((r) => {
      const covers = typeof r.price_covers_metres === "number" ? r.price_covers_metres : 1;
      return {
        internal_name: String(r.name),
        size_sqmm: typeof r.size_sqmm === "number" && Number.isFinite(r.size_sqmm) ? r.size_sqmm : null,
        // Not rounded — a real "3.5 core" cable must survive as 3.5, not 4.
        cores: typeof r.cores === "number" && Number.isFinite(r.cores) ? r.cores : null,
        // The model sometimes emits the *string* "null"/"NA" for an unstated
        // material; storing that verbatim makes it look like a real material
        // named "null" and breaks every downstream match. Normalize to null.
        material: normalizeMaterialText(r.material),
        // Conversion happens here, not in the model — see wirePriceUnits.ts.
        price_per_m: normalizeToPerMetre(r.price as number, covers),
        // Carried through for the preview so the office can sanity-check the
        // basis (₹2040 per 100 m -> ₹20.40/m) before committing the import.
        price_raw: r.price as number,
        price_covers_metres: covers,
      };
    });
}
