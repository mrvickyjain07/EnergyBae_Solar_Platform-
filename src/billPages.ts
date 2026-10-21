// src/billPages.ts
// One bill can arrive as several files — a PDF, or photos of the front and
// back. They are merged here, in the browser, into ONE PDF in page order, so
// every extraction route keeps its "one file in" contract (the same reason
// enhancement used to reassemble pages into a PDF): Gemini already reads a
// multi-page PDF as one document, and nothing on the server changes.
//
// The merged file must still fit one request (src/uploadLimits.ts), so image
// pages are shrunk evenly when the total is over the limit; PDF pages are
// copied as-is, never rasterised (that would drop their text layer).
import { MAX_BILL_BYTES, dataUrlBytes, dataUrlMime } from "./uploadLimits";

export const MAX_BILL_PAGES = 8;

const b64 = (dataUrl: string) => dataUrl.slice(dataUrl.indexOf(",") + 1);

/** Merge ordered parts (PDF / JPEG / PNG data URLs) into one PDF data URL. A single part is returned untouched. */
export async function combineBillParts(parts: string[]): Promise<string> {
  if (parts.length === 1) return parts[0];
  const { PDFDocument } = await import("pdf-lib"); // only multi-page bills need it — keeps it out of the main bundle
  const out = await PDFDocument.create();
  for (const part of parts) {
    const mime = dataUrlMime(part);
    if (mime === "application/pdf") {
      const src = await PDFDocument.load(b64(part), { ignoreEncryption: true });
      for (const page of await out.copyPages(src, src.getPageIndices())) out.addPage(page);
    } else if (mime === "image/jpeg" || mime === "image/png") {
      const img = mime === "image/jpeg" ? await out.embedJpg(b64(part)) : await out.embedPng(b64(part));
      // A4-wide page at the photo's aspect ratio — the page size is layout only, Gemini reads the embedded pixels.
      const width = 595;
      const height = (width * img.height) / img.width;
      out.addPage([width, height]).drawImage(img, { x: 0, y: 0, width, height });
    } else {
      throw new Error("This page type can't be combined with others — save it as a JPG, PNG or PDF.");
    }
  }
  return out.saveAsBase64({ dataUri: true });
}

// Re-encode an image as JPEG (EXIF rotation baked in, longest side ≤ maxSide),
// stepping quality and size down until it fits maxBytes. Browser only.
export async function toJpeg(source: Blob, maxBytes = MAX_BILL_BYTES, maxSide = 2400): Promise<string> {
  const bitmap = await createImageBitmap(source, { imageOrientation: "from-image" });
  let scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  for (let attempt = 0; attempt < 8; attempt++) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is not available in this browser.");
    ctx.fillStyle = "#fff"; // transparent PNG areas → white, not black, in JPEG
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", attempt < 2 ? 0.85 : 0.75);
    if (dataUrlBytes(dataUrl) <= maxBytes) return dataUrl;
    if (attempt >= 1) scale *= 0.8;
  }
  throw new Error("still too large after compression");
}

const dataUrlToBlob = (dataUrl: string) => fetch(dataUrl).then((r) => r.blob());

/** The one file a scan sends: parts merged, image pages shrunk evenly if the total is over the upload limit. */
export async function buildBillFile(parts: string[]): Promise<string> {
  const merged = await combineBillParts(parts);
  if (dataUrlBytes(merged) <= MAX_BILL_BYTES) return merged;
  const isImage = (p: string) => dataUrlMime(p)?.startsWith("image/");
  const images = parts.filter(isImage).length;
  const pdfBytes = parts.filter((p) => !isImage(p)).reduce((n, p) => n + dataUrlBytes(p), 0);
  const perImage = (MAX_BILL_BYTES * 0.92 - pdfBytes) / Math.max(1, images);
  if (images === 0 || perImage < 150 * 1024) throw new Error("These pages are too large to send together — remove a page or upload a smaller PDF.");
  const shrunk = await Promise.all(parts.map(async (p) => (isImage(p) ? toJpeg(await dataUrlToBlob(p), perImage) : p)));
  const result = await combineBillParts(shrunk);
  if (dataUrlBytes(result) > MAX_BILL_BYTES) throw new Error("These pages are too large to send together — remove a page or upload a smaller PDF.");
  return result;
}
