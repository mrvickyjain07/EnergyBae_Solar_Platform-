// src/services/billEnhancement.ts
// "Enhance & Clear Bill" pre-processing stage. Sits entirely in front of the
// existing /api/extract pipeline (server.ts) and never touches its prompt,
// schema, or retry logic — enhancement hands off a normal single file
// (image or PDF), so both the residential and commercial extraction routes
// stay exactly as they are.
//
// Every pixel operation here is deterministic (sharp, a real image-processing
// library — no generative model touches the bill image). That is the actual
// safety mechanism behind "never hallucinate a value": a filter can blur a
// digit, but it cannot invent one. The Gemini quality check below only judges
// readability in prose (ready/not-ready + reasons) — it is never asked to
// transcribe or restate any value, so it cannot introduce a wrong number
// either.
import sharp from "sharp";
import { Type } from "@google/genai";
import { generateWithGeminiFallback, GEMINI_MODEL } from "./geminiExtraction";

// Pages narrower/shorter than this on their short side get upscaled with a
// real resampling kernel (lanczos3) — sharpens without inventing detail,
// unlike an ML super-resolution model, which was ruled out for exactly the
// "never hallucinate" requirement.
const MIN_DIMENSION_FOR_UPSCALE = 1500;

// ── 1. Deterministic pixel enhancement ──────────────────────────────────────
// median(1): light denoise with a 1px radius — large enough to smooth JPEG
//   speckle, small enough that thin digit strokes and decimal points survive.
// clahe: local contrast correction, the direct answer to "uneven lighting /
//   shadows" in the spec — operates on lightness, so colored stamps/logos
//   are not desaturated the way a flat grayscale conversion would.
// sharpen: unsharp-mask-style edge sharpening for text legibility.
// Output is high-quality JPEG (q92, no chroma subsampling) rather than PNG:
// a lossless PNG of an upscaled bill photo is 4–8 MB, over Vercel's 4.5 MB
// response cap, and the scan had to re-encode it to fit 3 MB anyway. At q92
// 4:4:4 the 0-vs-O / 1-vs-I strokes survive.
export async function enhancePageBuffer(buffer: Buffer): Promise<Buffer> {
  const meta = await sharp(buffer).rotate().metadata();
  const width = meta.width || 0;
  const height = meta.height || 0;

  // Tile size as a fraction of the image, not a fixed pixel count — a fixed
  // small tile (e.g. 8px) on a full-resolution bill photo carves the page
  // into hundreds of independently-equalized tiles, which shows up as visible
  // rectangular contrast halos around every line of text. Roughly an 8x8
  // tile grid across the shorter side keeps the "fix uneven lighting/shadows"
  // benefit without that block artifact.
  const shortSide = Math.min(width, height);
  const claheTile = Math.min(128, Math.max(16, Math.round((shortSide || MIN_DIMENSION_FOR_UPSCALE) / 8)));

  let pipeline = sharp(buffer)
    .rotate() // applies EXIF orientation (mobile-camera photos); no-op if already upright
    .median(1)
    .clahe({ width: claheTile, height: claheTile, maxSlope: 3 })
    .sharpen({ sigma: 1, m1: 1, m2: 2 });

  if (shortSide > 0 && shortSide < MIN_DIMENSION_FOR_UPSCALE) {
    const scale = MIN_DIMENSION_FOR_UPSCALE / shortSide;
    pipeline = pipeline.resize({
      width: Math.round(width * scale),
      height: Math.round(height * scale),
      kernel: sharp.kernel.lanczos3,
    });
  }

  return pipeline.jpeg({ quality: 92, chromaSubsampling: "4:4:4" }).toBuffer();
}

// ── 2. OCR-readiness quality gate ───────────────────────────────────────────
// One Gemini call per bill (not per page) — a per-page call would multiply
// quota usage on top of the extraction call itself, against a free tier
// CLAUDE.md already flags as scarce (500 requests/day, shared with both
// extraction routes).
const QUALITY_PROMPT = `You are a document-quality inspector for scanned electricity bills, which may be in Marathi (Devanagari), Hindi (Devanagari), English, or a mix of these.

You are given one or more page images of a single bill, in page order. For EACH page, judge only whether it is sharp, well-lit, correctly oriented, and high enough resolution for reliable OCR of numbers, dates, meter readings, tariff codes, amounts, and Devanagari/Hindi text.

Do NOT transcribe, extract, translate, or restate any bill value or text anywhere in your response. This is a readability check only, not extraction.

Return one verdict per page, in the same order as the images: "ready" (true only if that page is reliably OCR-readable) and "reasons" (short phrases naming any problem — blur, shadow, low resolution, wrong orientation, illegible Devanagari text, etc; empty array if none).`;

const QUALITY_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    pages: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          ready: { type: Type.BOOLEAN },
          reasons: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ["ready", "reasons"],
      },
    },
  },
  required: ["pages"],
};

export interface PageQuality {
  ready: boolean;
  reasons: string[];
}

export async function assessDocumentQuality(pages: Buffer[]): Promise<{ overallReady: boolean; perPage: PageQuality[] }> {
  const imageParts = pages.map((buf) => ({
    inlineData: { mimeType: "image/jpeg", data: buf.toString("base64") },
  }));
  const textPart = { text: QUALITY_PROMPT };

  const response = await generateWithGeminiFallback(
    `Gemini-BillQuality-${pages.length}pg`,
    (client, model) =>
      client.models.generateContent({
        model,
        contents: { parts: [...imageParts, textPart] },
        config: {
          responseMimeType: "application/json",
          responseSchema: QUALITY_RESPONSE_SCHEMA,
          temperature: 0,
        },
      })
  );

  const rawText = response.text || "";
  const cleaned = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

  let parsed: { pages?: Array<{ ready?: unknown; reasons?: unknown }> } = {};
  try {
    parsed = JSON.parse(cleaned || "{}");
  } catch {
    return {
      overallReady: false,
      perPage: pages.map(() => ({ ready: false, reasons: ["Automated quality check returned an unreadable response."] })),
    };
  }

  const perPage: PageQuality[] =
    Array.isArray(parsed.pages) && parsed.pages.length === pages.length
      ? parsed.pages.map((p) => ({
          ready: !!p.ready,
          reasons: Array.isArray(p.reasons) ? p.reasons.map(String) : [],
        }))
      : pages.map(() => ({ ready: false, reasons: ["Automated quality check did not return a verdict for every page."] }));

  return {
    overallReady: perPage.every((p) => p.ready),
    perPage,
  };
}
