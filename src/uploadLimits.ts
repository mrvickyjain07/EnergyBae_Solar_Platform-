// src/uploadLimits.ts
// One source of truth for bill-upload limits, shared by the browser (checks
// and image compression before upload) and the server (MIME allowlist).
//
// Why 3 MB: uploads are base64 data-URLs inside a JSON body (see CLAUDE.md —
// no multipart), and Vercel functions reject request bodies over 4.5 MB.
// base64 grows a file by 4/3, so 3 MB of file is ~4.0 MB on the wire, which
// leaves headroom for the data-URL prefix and the JSON envelope. Bigger
// files need a different upload architecture (direct-to-storage signed
// uploads) — not a bigger number here.

export const MAX_BILL_BYTES = 3 * 1024 * 1024;
export const MAX_BILL_LABEL = "3 MB";
/** Vercel's hard cap on a function request body, minus a safety margin. */
export const MAX_REQUEST_BYTES = Math.floor(4.4 * 1024 * 1024);

/** MIME types the extraction routes accept (Gemini reads all of these). */
export const ACCEPTED_BILL_MIME: readonly string[] = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/heic",
  "image/heif",
];

/** Size of `bytes` of file once base64-encoded. */
export function base64Length(bytes: number): number {
  return 4 * Math.ceil(bytes / 3);
}

/** Decoded byte size of a data URL (or bare base64 string), without decoding it. */
export function dataUrlBytes(dataUrl: string): number {
  const b64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const padding = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((b64.length * 3) / 4) - padding);
}

/** MIME type declared by a data URL, or null if it has no data-URL prefix. */
export function dataUrlMime(dataUrl: string): string | null {
  const m = /^data:([a-zA-Z0-9]+\/[a-zA-Z0-9+.-]+);base64,/.exec(dataUrl);
  return m ? m[1].toLowerCase() : null;
}

export function isAcceptedBillMime(mime: string | null): boolean {
  return mime !== null && ACCEPTED_BILL_MIME.includes(mime);
}

export function formatMB(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** What the uploader should do with a picked file before it is sent. */
export type UploadDecision =
  | { action: "send" }
  | { action: "compress" } // image over the limit → re-encode as JPEG in the browser
  | { action: "reject"; reason: string };

export function decideUpload(file: { type: string; name: string; size: number }): UploadDecision {
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  if (file.size === 0) return { action: "reject", reason: "File is empty or unreadable." };
  if (file.size <= MAX_BILL_BYTES) return { action: "send" };
  // Never re-encode a PDF — lossy rasterising would cost OCR accuracy and
  // drop selectable text. The user can export a smaller PDF or upload a photo.
  if (isPdf) {
    return {
      action: "reject",
      reason: `PDF is ${formatMB(file.size)} — the limit is ${MAX_BILL_LABEL}. Save a smaller PDF (e.g. "Reduce file size") or upload a photo/screenshot of the bill.`,
    };
  }
  return { action: "compress" };
}
