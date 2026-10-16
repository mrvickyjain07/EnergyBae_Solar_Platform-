// src/components/BillEnhancer.tsx
// "Enhance & Clear Bill" — strictly opt-in. Upload behaves exactly like the
// plain Uploader always has: onFileLoaded fires immediately on file
// selection, and the existing "Begin Extraction" flow is untouched. This
// component only adds the clickable sparkle button (see Uploader.tsx) that
// the user can click AFTER uploading to run enhancement on the file already
// selected. If they never click it, OCR proceeds on the original file —
// there is no automatic or mandatory enhancement step.
//
// A single preview section covers both states: right after upload it shows
// just the original (rasterized client-side so PDFs are viewable too), and
// once enhancement completes it grows to a two-column original/enhanced
// layout in the same spot, rather than the original never being previewable
// until the user chooses to enhance.
//
// All rasterization (PDF pages, EXIF orientation) happens client-side with
// the browser Canvas API and pdfjs-dist; the actual pixel enhancement runs
// server-side (see src/services/billEnhancement.ts) via POST /api/enhance-bill.
import { MAX_BILL_BYTES, MAX_BILL_LABEL, MAX_REQUEST_BYTES, dataUrlBytes } from "../uploadLimits";
import React, { useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { saveAs } from "file-saver";
import type * as PdfjsLib from "pdfjs-dist";
import {
  ZoomIn,
  ZoomOut,
  ChevronLeft,
  ChevronRight,
  Download,
  RefreshCw,
  Check,
  AlertTriangle,
  Info,
} from "lucide-react";
import Uploader from "./Uploader";
import { Component as AiLoader } from "@/components/ui/ai-loader";
import { classifyPdfTextDensity } from "@/services/pdfClassification";

// Loaded on demand (not a top-level import) so pdfjs-dist — a multi-MB
// library — lands in its own chunk instead of bloating the main bundle for
// every user, most of whom never touch a PDF at all.
let pdfjsLibPromise: Promise<typeof PdfjsLib> | null = null;
function loadPdfjs(): Promise<typeof PdfjsLib> {
  if (!pdfjsLibPromise) {
    pdfjsLibPromise = Promise.all([
      import("pdfjs-dist"),
      import("pdfjs-dist/build/pdf.worker.mjs?url"),
    ]).then(([lib, worker]) => {
      lib.GlobalWorkerOptions.workerSrc = worker.default;
      return lib;
    });
  }
  return pdfjsLibPromise;
}

interface EnhancedPage {
  enhanced: string;
  ready: boolean;
  reasons: string[];
}

interface EnhancedFile {
  base64Data: string;
  fileName: string;
}

interface BillEnhancerProps {
  onFileLoaded: (base64Data: string, fileName: string) => void;
  isLoading?: boolean;
  selectedFileName: string | null;
  /** The caller's current file as a data URL — powers the uploader's View
   *  button. Comes from the caller because this component's own preview
   *  state is lost whenever it unmounts (e.g. while a scan runs). */
  fileSrc?: string | null;
}

const STATUS_STAGES = ["Detecting Document...", "Enhancing Image...", "Improving Text...", "Optimizing for OCR...", "Ready for Analysis"];

function base64ToFile(base64Data: string, fileName: string): Promise<File> {
  return fetch(base64Data)
    .then((r) => r.blob())
    .then((blob) => new File([blob], fileName, { type: blob.type }));
}

// Draws through a canvas so EXIF orientation (mobile-camera photos are
// frequently stored sideways with a rotation flag, not pre-rotated pixels)
// is baked into the pixels before anything is uploaded — a native browser
// feature (`imageOrientation: "from-image"`), no library needed.
async function rasterizeImage(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available in this browser.");
  ctx.drawImage(bitmap, 0, 0);
  return canvas.toDataURL("image/png");
}

async function rasterizePdf(file: File): Promise<{ pages: string[]; textDensity: "digital" | "scanned" }> {
  const pdfjsLib = await loadPdfjs();
  const arrayBuffer = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const textLengths: number[] = [];
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const textContent = await page.getTextContent();
    const text = textContent.items.map((item: any) => ("str" in item ? item.str : "")).join("");
    textLengths.push(text.length);

    // 2.5x scale: enough resolution for small tariff-table text without
    // producing an unreasonably large upload for a typical A4 bill page.
    const viewport = page.getViewport({ scale: 2.5 });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is not available in this browser.");
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;
    pages.push(canvas.toDataURL("image/png"));
  }

  return { pages, textDensity: classifyPdfTextDensity(textLengths) };
}

export default function BillEnhancer({ onFileLoaded, isLoading, selectedFileName, fileSrc }: BillEnhancerProps) {
  // The original upload, captured purely as a side-channel so the preview
  // and the sparkle button have something to work with later — onFileLoaded
  // below still fires immediately and unconditionally, exactly like plain
  // Uploader always has.
  const [originalBase64, setOriginalBase64] = useState<string | null>(null);
  const [originalFileName, setOriginalFileName] = useState<string | null>(null);
  const [sourceType, setSourceType] = useState<"image" | "pdf">("image");
  const [isDigitalPdf, setIsDigitalPdf] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [originalPages, setOriginalPages] = useState<string[]>([]);

  const [stage, setStage] = useState<"idle" | "processing">("idle");
  const [stageIdx, setStageIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [skipNote, setSkipNote] = useState<string | null>(null);

  const [enhancedPages, setEnhancedPages] = useState<EnhancedPage[]>([]);
  const [enhancedFile, setEnhancedFile] = useState<EnhancedFile | null>(null);
  const [overallReady, setOverallReady] = useState(true);
  const [activePageIdx, setActivePageIdx] = useState(0);
  const [zoom, setZoom] = useState(1);
  // Which version the scan will actually use. The "Use …" buttons already
  // swapped the file correctly, but nothing on screen changed — for PDFs even
  // the filename stays the same — so the buttons read as broken.
  const [choice, setChoice] = useState<"original" | "enhanced">("original");

  const stageTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopStageTimer = () => {
    if (stageTimer.current) {
      clearInterval(stageTimer.current);
      stageTimer.current = null;
    }
  };

  // Rasterizes the just-uploaded file so it can be previewed immediately
  // (images render as-is; PDF pages are rendered to canvas) — this is the
  // same rasterization enhancement needs, so running it once here means
  // handleEnhanceClick can reuse originalPages instead of redoing the work.
  const buildPreview = async (base64: string, name: string) => {
    setPreviewLoading(true);
    try {
      const file = await base64ToFile(base64, name);
      const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
      setSourceType(isPdf ? "pdf" : "image");
      if (isPdf) {
        const { pages, textDensity } = await rasterizePdf(file);
        setOriginalPages(pages);
        setIsDigitalPdf(textDensity === "digital");
      } else {
        setOriginalPages([await rasterizeImage(file)]);
        setIsDigitalPdf(false);
      }
    } catch {
      // Preview is best-effort — the original file is still fully usable
      // for extraction even if it can't be rasterized for display.
      setOriginalPages([]);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleOriginalLoaded = (base64: string, name: string) => {
    setOriginalBase64(base64);
    setOriginalFileName(name);
    // A fresh upload invalidates any enhancement run against the previous file.
    stopStageTimer();
    setStage("idle");
    setError(null);
    setSkipNote(null);
    setOriginalPages([]);
    setEnhancedPages([]);
    setEnhancedFile(null);
    setActivePageIdx(0);
    setZoom(1);
    setChoice("original");
    onFileLoaded(base64, name);
    void buildPreview(base64, name);
  };

  const handleEnhanceClick = async () => {
    if (!originalFileName || originalPages.length === 0) return;

    if (isDigitalPdf) {
      setSkipNote(`"${originalFileName}" already contains selectable text — no enhancement needed, using it as-is.`);
      return;
    }

    // Every page travels in one request — refuse up front rather than let
    // the host's request-size cap fail it with an unreadable error.
    const body = JSON.stringify({ fileName: originalFileName, sourceType, pages: originalPages });
    if (body.length > MAX_REQUEST_BYTES) {
      setError(`This ${originalPages.length > 1 ? `${originalPages.length}-page document` : "image"} is too large to enhance online. The original bill is still selected — scan it as-is.`);
      return;
    }

    stopStageTimer();
    setError(null);
    setSkipNote(null);
    setStage("processing");
    setStageIdx(0);
    // Cosmetic staggered progress, same pattern as the existing residential
    // and commercial extraction status displays — stops one label short of
    // "Ready for Analysis" until the request actually resolves.
    stageTimer.current = setInterval(() => {
      setStageIdx((prev) => (prev < STATUS_STAGES.length - 2 ? prev + 1 : prev));
    }, 900);

    try {
      const response = await fetch("/api/enhance-bill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      const result = await response.json();
      stopStageTimer();

      if (!result.success) {
        throw new Error(result.error || "Unable to enhance this document.");
      }

      setStageIdx(STATUS_STAGES.length - 1);
      setEnhancedPages(result.pages);
      setEnhancedFile(result.enhancedFile);
      setOverallReady(result.overallReady);
      setActivePageIdx(0);
      setZoom(1);
      setStage("idle");
    } catch (err: any) {
      stopStageTimer();
      setStage("idle");
      setError(err?.message || "Unable to process this document. The original bill is still selected for analysis.");
    }
  };

  const handleUseEnhanced = () => {
    if (!enhancedFile) return;
    if (dataUrlBytes(enhancedFile.base64Data) > MAX_BILL_BYTES) {
      setError(`The enhanced version is larger than ${MAX_BILL_LABEL}, so it can't be uploaded for scanning. The original bill is still selected.`);
      return;
    }
    onFileLoaded(enhancedFile.base64Data, enhancedFile.fileName);
    setChoice("enhanced");
  };

  const handleUseOriginal = () => {
    if (!originalBase64 || !originalFileName) return;
    onFileLoaded(originalBase64, originalFileName);
    setChoice("original");
  };

  const handleReprocess = () => {
    // A re-run produces a NEW enhanced file; if the old one was selected the
    // scan would silently keep using it. Fall back to the original until the
    // user picks the fresh result.
    if (choice === "enhanced") handleUseOriginal();
    void handleEnhanceClick();
  };

  const handleDownload = async () => {
    if (!enhancedFile) return;
    const blob = await (await fetch(enhancedFile.base64Data)).blob();
    saveAs(blob, enhancedFile.fileName);
  };

  const hasEnhanced = enhancedPages.length > 0;
  const activeReasons = enhancedPages[activePageIdx]?.reasons ?? [];

  return (
    <div className="space-y-4">
      <Uploader
        onFileLoaded={handleOriginalLoaded}
        onEnhanceClick={originalPages.length > 0 ? handleEnhanceClick : undefined}
        enhancing={stage === "processing"}
        isLoading={!!isLoading || stage === "processing"}
        selectedFileName={selectedFileName}
        previewSrc={originalPages[0]}
        fileSrc={fileSrc}
      />

      <AnimatePresence>
        {stage === "processing" && (
          // Full-screen glassmorphism overlay — a single instance while
          // enhancement is running, so backdrop-filter here doesn't hit the
          // scroll-jank cost the .glass-panel comment above warns about
          // (that's about many simultaneous panels, not one full-screen one).
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--panel-glass)] backdrop-blur-2xl backdrop-saturate-150"
          >
            <AiLoader text={STATUS_STAGES[Math.min(stageIdx, STATUS_STAGES.length - 1)]} />
          </motion.div>
        )}
      </AnimatePresence>

      {previewLoading && originalPages.length === 0 && (
        <div className="text-center text-xs text-[var(--text-muted)] py-1">Loading preview…</div>
      )}

      {skipNote && (
        <div className="p-3 rounded-xl bg-[var(--hover-bg)] flex items-start gap-2.5 text-sm text-[var(--text-secondary)]">
          <Info className="w-4 h-4 mt-0.5 shrink-0 text-[var(--text-muted)]" />
          <span>{skipNote}</span>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl border border-red-500/30 bg-red-500/10 flex items-start gap-3 text-sm">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-red-500" />
          <div className="flex-1 min-w-0">
            <p className="font-medium text-[var(--text-primary)]">Enhancement failed</p>
            <p className="mt-1 text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap break-words">{error}</p>
            <button
              type="button"
              onClick={handleReprocess}
              className="mt-3 h-8 px-3 inline-flex items-center gap-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-medium cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Retry enhancement
            </button>
          </div>
        </div>
      )}

      {hasEnhanced && (
        <div className="space-y-4">
          {!overallReady && (
            <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 flex items-start gap-3 text-sm">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-500" />
              <div className="space-y-1">
                <p className="font-medium text-[var(--text-primary)]">
                  The bill quality is too low for reliable analysis. Please upload a clearer image or scan.
                </p>
                {activeReasons.length > 0 && (
                  <ul className="list-disc list-inside space-y-0.5 text-[var(--text-secondary)]">
                    {activeReasons.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          {originalPages.length > 1 && (
            <div className="flex items-center justify-center gap-3 text-xs text-[var(--text-muted)]">
              <button
                type="button"
                onClick={() => setActivePageIdx((i) => Math.max(0, i - 1))}
                disabled={activePageIdx === 0}
                className="p-1.5 rounded-lg border border-[var(--border-subtle)] disabled:opacity-30 cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              Page {activePageIdx + 1} of {originalPages.length}
              <button
                type="button"
                onClick={() => setActivePageIdx((i) => Math.min(originalPages.length - 1, i + 1))}
                disabled={activePageIdx === originalPages.length - 1}
                className="p-1.5 rounded-lg border border-[var(--border-subtle)] disabled:opacity-30 cursor-pointer"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <div className="flex items-center justify-center gap-2 text-xs text-[var(--text-muted)]">
            <button type="button" onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))} className="p-1.5 rounded-lg border border-[var(--border-subtle)] cursor-pointer">
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            {Math.round(zoom * 100)}%
            <button type="button" onClick={() => setZoom((z) => Math.min(3, z + 0.25))} className="p-1.5 rounded-lg border border-[var(--border-subtle)] cursor-pointer">
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Each preview is itself clickable to choose it; the chosen one gets
              the accent ring and a "Selected" badge. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {([
              { key: "original" as const, label: "Original", src: originalPages[activePageIdx], onPick: handleUseOriginal },
              { key: "enhanced" as const, label: "Enhanced", src: enhancedPages[activePageIdx]?.enhanced, onPick: handleUseEnhanced },
            ]).map((v) => {
              const selected = choice === v.key;
              return (
                <div key={v.key} className="space-y-1.5">
                  <div className="flex items-center justify-center gap-2 text-xs">
                    <span className={selected ? "font-medium text-[var(--text-primary)]" : "text-[var(--text-muted)]"}>{v.label}</span>
                    {selected && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--accent-green)]/10 text-[var(--accent-green)] px-2 py-0.5 font-medium">
                        <Check className="w-3 h-3" /> Selected
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={v.onPick}
                    aria-pressed={selected}
                    title={`Use the ${v.label.toLowerCase()} bill for analysis`}
                    className={`block w-full rounded-2xl overflow-auto max-h-[420px] p-2 bg-[var(--bg-card)] cursor-pointer transition-shadow ${
                      selected
                        ? "border-2 border-[var(--accent-green)] shadow-[0_0_0_4px_color-mix(in_srgb,var(--accent-green)_15%,transparent)]"
                        : "border border-[var(--border-subtle)] hover:border-[var(--border-strong)]"
                    }`}
                  >
                    <img
                      src={v.src}
                      alt={`${v.label} bill page`}
                      style={{ transform: `scale(${zoom})`, transformOrigin: "top center" }}
                      className="w-full h-auto"
                    />
                  </button>
                </div>
              );
            })}
          </div>

          <div className="flex flex-col items-center gap-3 pt-1">
            {/* Segmented choice — which file "Scan bill" sends. */}
            <div role="radiogroup" aria-label="Bill version to analyse" className="inline-flex items-center gap-1 p-1 rounded-lg bg-[var(--border-subtle)]">
              {([
                { key: "enhanced" as const, label: "Use enhanced bill", onPick: handleUseEnhanced },
                { key: "original" as const, label: "Use original bill", onPick: handleUseOriginal },
              ]).map((b) => {
                const selected = choice === b.key;
                return (
                  <button
                    key={b.key}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={b.onPick}
                    className={`h-9 px-4 rounded-md text-sm font-medium inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                      selected ? "bg-[var(--accent-solid)] text-white shadow-sm" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    }`}
                  >
                    {selected && <Check className="w-4 h-4" />} {b.label}
                  </button>
                );
              })}
            </div>

            <p className="text-sm text-[var(--text-muted)]" aria-live="polite">
              <span className="font-medium text-[var(--text-primary)]">{choice === "enhanced" ? "Enhanced" : "Original"} bill</span> will be scanned when you click Scan bill.
            </p>

            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={handleReprocess}
                className="h-8 px-3 rounded-lg border border-[var(--border-subtle)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)] inline-flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Re-process
              </button>
              <button
                type="button"
                onClick={handleDownload}
                className="h-8 px-3 rounded-lg border border-[var(--border-subtle)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)] inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" /> Download enhanced
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
