// src/services/pdfClassification.ts
// Pure decision logic for "Enhance & Clear Bill": a PDF with a real text
// layer is already OCR-ready (Gemini reads it natively today), so running it
// through the image-enhancement pipeline would only risk degrading it. A
// scanned/photographed PDF has no text layer and needs the pipeline.
// Split out as pure logic (no pdfjs, no DOM) so it can be tested directly,
// matching the repo's existing convention (boqWorkspace.ts, filterOptions.ts).

// Below this many total characters across all pages, treat the PDF as a
// scanned image even if pdfjs found a token or two (e.g. a stray watermark
// or page-number layer some scanners still embed).
const MIN_SELECTABLE_TEXT_CHARS = 40;

export function classifyPdfTextDensity(pageTextLengths: number[]): "digital" | "scanned" {
  const total = pageTextLengths.reduce((sum, len) => sum + Math.max(0, len), 0);
  return total >= MIN_SELECTABLE_TEXT_CHARS ? "digital" : "scanned";
}
