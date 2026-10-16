// src/services/billEnhancementApi.ts
// Route for the "Enhance & Clear Bill" pre-processing stage. Named *Api.ts to
// match the existing route-registrar convention (commercialApi.ts,
// catalogueApi.ts, wirePricesApi.ts) even though this one lives in
// src/services rather than a module folder — enhancement is shared by both
// the residential and commercial single-bill flows, so it has no one module
// to belong to.
//
// Deliberately does not touch /api/extract: the client sends back a single
// enhanced file (image or reassembled PDF) in the exact same shape the
// existing extraction routes already accept, so this route can be added
// without changing either extraction pipeline.
import type { Express } from "express";
import { enhancePageBuffer, assessDocumentQuality, assemblePagesIntoPdf } from "./billEnhancement";
import { ExtractionUnavailableError } from "./geminiExtraction";

const MAX_PAGE_SIZE_MB = 20;
const MAX_PAGES = 20;

function decodePageImage(value: string): Buffer {
  const clean = value.replace(/^data:[^;]+;base64,/, "");
  if (!clean) throw new Error("Empty page image payload.");
  return Buffer.from(clean, "base64");
}

export function registerBillEnhanceRoutes(app: Express) {
  app.post("/api/enhance-bill", async (req, res) => {
    const { fileName, sourceType, pages } = req.body as {
      fileName?: string;
      sourceType?: "image" | "pdf";
      pages?: string[];
    };

    console.log(`[EnergyBae][Enhance] ── New enhancement request ──────────────────`);
    console.log(
      `[EnergyBae][Enhance] File: "${fileName || "unnamed file"}" | sourceType: ${sourceType} | pages: ${Array.isArray(pages) ? pages.length : 0}`
    );

    if (!Array.isArray(pages) || pages.length === 0) {
      return res.status(400).json({ success: false, error: "No page images provided." });
    }
    if (pages.length > MAX_PAGES) {
      return res.status(413).json({ success: false, error: `Too many pages (${pages.length}). Limit is ${MAX_PAGES}.` });
    }

    try {
      const originalBuffers = pages.map(decodePageImage);
      for (const buf of originalBuffers) {
        const sizeMB = buf.length / (1024 * 1024);
        if (sizeMB > MAX_PAGE_SIZE_MB) {
          return res.status(413).json({
            success: false,
            error: `A page image is too large (${sizeMB.toFixed(1)} MB). Limit is ${MAX_PAGE_SIZE_MB} MB per page.`,
          });
        }
      }

      console.log(`[EnergyBae][Enhance] Running sharp pipeline over ${originalBuffers.length} page(s)...`);
      const enhancedBuffers = await Promise.all(originalBuffers.map(enhancePageBuffer));

      let overallReady = true;
      let perPage = enhancedBuffers.map(() => ({ ready: true, reasons: [] as string[] }));
      try {
        console.log(`[EnergyBae][Enhance] Running Gemini quality check...`);
        const quality = await assessDocumentQuality(enhancedBuffers);
        overallReady = quality.overallReady;
        perPage = quality.perPage;
      } catch (qualityErr: any) {
        // The sharp enhancement already succeeded — don't discard it just
        // because this separate Gemini call is unavailable (e.g. quota).
        // Fail open with a note; the Preview step still lets the user judge
        // readability visually before confirming.
        console.warn(`[EnergyBae][Enhance] Quality check unavailable: ${qualityErr?.message || qualityErr}`);
        perPage = enhancedBuffers.map(() => ({
          ready: true,
          reasons: ["Automated quality check was unavailable — please verify readability visually before analyzing."],
        }));
      }

      const isPdf = sourceType === "pdf";
      const enhancedFile = isPdf
        ? {
            base64Data: `data:application/pdf;base64,${(await assemblePagesIntoPdf(enhancedBuffers)).toString("base64")}`,
            fileName: fileName || "enhanced-bill.pdf",
          }
        : {
            base64Data: `data:image/png;base64,${enhancedBuffers[0].toString("base64")}`,
            fileName: (fileName || "enhanced-bill").replace(/\.[^.]+$/, "") + ".png",
          };

      res.json({
        success: true,
        overallReady,
        pages: enhancedBuffers.map((buf, i) => ({
          enhanced: `data:image/png;base64,${buf.toString("base64")}`,
          ready: perPage[i]?.ready ?? true,
          reasons: perPage[i]?.reasons ?? [],
        })),
        enhancedFile,
      });
    } catch (error: any) {
      const rawMessage: string = error?.message || String(error);
      console.error("[EnergyBae][Enhance] ✗ Enhancement failed:", rawMessage);
      res.status(500).json({
        success: false,
        error:
          error instanceof ExtractionUnavailableError
            ? rawMessage
            : "Unable to enhance this document. Please try again, or use the original file for analysis.",
      });
    }
  });
}
