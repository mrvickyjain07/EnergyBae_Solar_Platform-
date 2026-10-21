// src/components/BillEnhancer.tsx
// The single-bill upload: a bill is an ordered list of PAGES — a PDF, or
// photos of the front and back (from the gallery or the camera). The user
// can add, retake, reorder and remove pages; every change is merged into ONE
// file (src/billPages.ts) and handed to the caller via onFileLoaded, so the
// caller's "Scan bill" and both extraction routes are unchanged — a
// multi-photo bill reaches Gemini as one multi-page PDF, i.e. one analysis.
//
// "Enhance" stays strictly opt-in and per page: each page is sent to
// POST /api/enhance-bill on its own (a whole bill in one request overran
// Vercel's 4.5 MB body cap — the old "too large to enhance online" dead end).
// A failed enhancement only marks that page; its original is kept and the
// bill can still be scanned. Pixel work is server-side (billEnhancement.ts);
// PDF rasterising for enhancement and thumbnails is client-side (pdfjs-dist).
//
// The caller unmounts this component during a residential scan, so the page
// list is kept in a module-level session and restored only when the caller's
// current file is exactly the one this session produced — a different bill
// never inherits stale pages.
import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence } from "motion/react";
import type * as PdfjsLib from "pdfjs-dist";
import { AlertTriangle, Camera, ChevronLeft, ChevronRight, FileText, Info, Loader2, Plus, RefreshCw, Sparkles, Trash2, X } from "lucide-react";
import Uploader, { ACCEPT, BillViewer, prepareBillFiles, type LoadedFile } from "./Uploader";
import { MAX_BILL_PAGES, buildBillFile, toJpeg } from "../billPages";
import { MAX_REQUEST_BYTES, dataUrlMime } from "../uploadLimits";
import { classifyPdfTextDensity } from "@/services/pdfClassification";

// Loaded on demand (not a top-level import) so pdfjs-dist — a multi-MB
// library — lands in its own chunk instead of bloating the main bundle.
let pdfjsLibPromise: Promise<typeof PdfjsLib> | null = null;
function loadPdfjs(): Promise<typeof PdfjsLib> {
  if (!pdfjsLibPromise) {
    pdfjsLibPromise = Promise.all([import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.mjs?url")]).then(([lib, worker]) => {
      lib.GlobalWorkerOptions.workerSrc = worker.default;
      return lib;
    });
  }
  return pdfjsLibPromise;
}

// Renders PDF pages to JPEG data URLs (+ text length per page, for the
// digital-vs-scanned check). scale 2 keeps small tariff-table text legible
// while one page stays well under the per-request limit.
async function renderPdf(dataUrl: string, scale: number, maxPages = Infinity) {
  const pdfjsLib = await loadPdfjs();
  const data = new Uint8Array(await (await fetch(dataUrl)).arrayBuffer());
  const doc = await pdfjsLib.getDocument({ data }).promise;
  const images: string[] = [];
  const textLengths: number[] = [];
  for (let i = 1; i <= Math.min(doc.numPages, maxPages); i++) {
    const page = await doc.getPage(i);
    const text = await page.getTextContent();
    textLengths.push(text.items.map((item: any) => ("str" in item ? item.str : "")).join("").length);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is not available in this browser.");
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;
    images.push(canvas.toDataURL("image/jpeg", 0.9));
  }
  return { images, textDensity: classifyPdfTextDensity(textLengths) };
}

interface BillPage {
  id: string;
  name: string;
  isPdf: boolean;
  sig: string; // same file picked twice → same sig → not added again
  original: string; // as uploaded — sent untouched when it is the bill's only page
  jpeg?: string; // image pages: upright JPEG used when merging (undefined if the browser can't decode it)
  thumb?: string;
  enhanced?: string[]; // one JPEG per page from /api/enhance-bill
  useEnhanced: boolean;
  enhancing: boolean;
  enhanceError?: string;
  note?: string;
  warnings?: string[];
}

let session: { pages: BillPage[]; output: string } | null = null;

const baseName = (name: string) => name.replace(/\.[^.]+$/, "");
const dataUrlToBlob = (dataUrl: string) => fetch(dataUrl).then((r) => r.blob());

async function makePage(file: LoadedFile, sig: string): Promise<BillPage> {
  const isPdf = dataUrlMime(file.base64Data) === "application/pdf";
  const page: BillPage = { id: crypto.randomUUID(), name: file.fileName, isPdf, sig, original: file.base64Data, useEnhanced: false, enhancing: false };
  if (isPdf) {
    page.thumb = await renderPdf(file.base64Data, 0.6, 1).then((r) => r.images[0]).catch(() => undefined);
  } else {
    page.jpeg = await dataUrlToBlob(file.base64Data).then((b) => toJpeg(b)).catch(() => undefined);
    page.thumb = page.jpeg ?? file.base64Data;
  }
  return page;
}

function seedPages(fileSrc: string | null | undefined, name: string | null): BillPage[] {
  if (session && session.output === (fileSrc ?? "")) return session.pages;
  if (!fileSrc || !name) return [];
  // e.g. the bundled sample bill, or a file set by the caller — one page as-is.
  const isPdf = dataUrlMime(fileSrc) === "application/pdf";
  return [{ id: crypto.randomUUID(), name, isPdf, sig: name, original: fileSrc, thumb: isPdf ? undefined : fileSrc, useEnhanced: false, enhancing: false }];
}

const partsOf = (page: BillPage, merging: boolean) =>
  page.useEnhanced && page.enhanced ? page.enhanced : [merging && !page.isPdf ? page.jpeg ?? page.original : page.original];

interface BillEnhancerProps {
  onFileLoaded: (base64Data: string, fileName: string) => void;
  isLoading?: boolean;
  selectedFileName: string | null;
  /** The caller's current file (data URL) — used to restore this bill's pages after a remount. */
  fileSrc?: string | null;
}

export default function BillEnhancer({ onFileLoaded, isLoading, selectedFileName, fileSrc }: BillEnhancerProps) {
  const [pages, setPages] = useState<BillPage[]>(() => seedPages(fileSrc, selectedFileName));
  const pagesRef = useRef(pages);
  pagesRef.current = pages;
  const [notice, setNotice] = useState<string | null>(null);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [viewing, setViewing] = useState<{ src: string; name: string } | null>(null);
  const addRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const retakeId = useRef<string | null>(null);
  const busy = !!isLoading;

  const update = (id: string, patch: Partial<BillPage>) => setPages((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  // Every change to which bytes would be sent → rebuild the one scan file.
  const outputKey = pages.map((p) => `${p.id}:${p.useEnhanced && p.enhanced ? "e" : "o"}`).join("|");
  useEffect(() => {
    const current = pagesRef.current;
    if (current.length === 0) return;
    let cancelled = false;
    setPreparing(true);
    setBuildError(null);
    const merging = current.length > 1;
    buildBillFile(current.flatMap((p) => partsOf(p, merging)))
      .then((data) => {
        if (cancelled) return;
        const first = current[0];
        const name =
          !merging && data === first.original
            ? first.name
            : `${baseName(first.name)}${merging ? `-${current.length}-pages` : "-enhanced"}.${dataUrlMime(data) === "application/pdf" ? "pdf" : "jpg"}`;
        session = { pages: current, output: data };
        if (data !== fileSrc) onFileLoaded(data, name);
      })
      .catch((err: any) => {
        if (cancelled) return;
        setBuildError(err?.message || "These pages couldn't be prepared for scanning.");
        session = { pages: current, output: "" };
        onFileLoaded("", ""); // nothing scannable — hides the caller's Scan button
      })
      .finally(() => { if (!cancelled) setPreparing(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rebuild only when the sent bytes change
  }, [outputKey]);

  // The caller cleared its bill (e.g. "clear" after a scan) → drop these pages too.
  useEffect(() => {
    if (!fileSrc && pagesRef.current.length && !preparing && !buildError) {
      setPages([]);
      session = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a caller-side change matters
  }, [fileSrc]);

  const addFiles = async (files: LoadedFile[]) => {
    const replacing = retakeId.current;
    retakeId.current = null;
    const existing = pagesRef.current.filter((p) => p.id !== replacing);
    const fresh: BillPage[] = [];
    let dupes = 0;
    for (const f of files) {
      const sig = `${f.fileName}:${f.base64Data.length}:${f.base64Data.slice(-48)}`;
      if ([...existing, ...fresh].some((p) => p.sig === sig)) { dupes++; continue; }
      fresh.push(await makePage(f, sig));
    }
    const room = MAX_BILL_PAGES - existing.length;
    const kept = fresh.slice(0, Math.max(0, room));
    const problems = [
      dupes ? `${dupes} file${dupes > 1 ? "s were" : " was"} already added — skipped.` : "",
      fresh.length > kept.length ? `A bill can have up to ${MAX_BILL_PAGES} pages — ${fresh.length - kept.length} skipped.` : "",
    ].filter(Boolean);
    setNotice(problems.join("\n") || null);
    if (!kept.length) return;
    setPages((prev) => {
      if (replacing && prev.some((p) => p.id === replacing)) {
        return prev.flatMap((p) => (p.id === replacing ? kept : [p]));
      }
      return [...prev, ...kept];
    });
  };

  const onPicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    const { ok, problems } = await prepareBillFiles(list);
    e.target.value = "";
    if (problems.length) setNotice(problems.join("\n"));
    if (ok.length) await addFiles(ok);
    else retakeId.current = null;
  };

  const removePage = (id: string) => {
    const next = pagesRef.current.filter((p) => p.id !== id);
    setPages(next);
    if (next.length === 0) clearAll();
  };

  const clearAll = () => {
    setPages([]);
    setBuildError(null);
    setNotice(null);
    session = null;
    onFileLoaded("", "");
  };

  const move = (idx: number, dir: -1 | 1) =>
    setPages((prev) => {
      const next = [...prev];
      [next[idx], next[idx + dir]] = [next[idx + dir], next[idx]];
      return next;
    });

  const openCamera = (replaceId?: string) => {
    if (busy) return;
    retakeId.current = replaceId ?? null;
    cameraRef.current?.click();
  };

  const enhance = async (id: string) => {
    const page = pagesRef.current.find((p) => p.id === id);
    if (!page || page.enhancing) return;
    update(id, { enhancing: true, enhanceError: undefined, note: undefined, warnings: undefined });
    try {
      let rasters: string[];
      if (page.isPdf) {
        const { images, textDensity } = await renderPdf(page.original, 2);
        if (textDensity === "digital") {
          update(id, { enhancing: false, note: "This PDF already has selectable text — no enhancement needed." });
          return;
        }
        rasters = images;
      } else {
        rasters = [page.jpeg ?? page.original];
      }
      const enhanced: string[] = [];
      const warnings: string[] = [];
      for (const raster of rasters) {
        const body = JSON.stringify({ fileName: page.name, pages: [raster] });
        if (body.length > MAX_REQUEST_BYTES) throw new Error("This page is too large to enhance online.");
        const res = await fetch("/api/enhance-bill", { method: "POST", headers: { "Content-Type": "application/json" }, body });
        const result = await res.json().catch(() => ({ success: false, error: `The enhancement service didn't respond (HTTP ${res.status}).` }));
        if (!result.success) throw new Error(result.error || "Unable to enhance this page.");
        enhanced.push(result.pages[0].enhanced);
        if (!result.pages[0].ready) warnings.push(...result.pages[0].reasons);
      }
      update(id, { enhancing: false, enhanced, warnings: warnings.length ? [...new Set(warnings)] : undefined });
    } catch (err: any) {
      update(id, { enhancing: false, enhanceError: err?.message || "Enhancement failed." });
    }
  };

  const hiddenInputs = (
    <>
      <input ref={addRef} type="file" accept={ACCEPT} multiple className="hidden" onChange={onPicked} disabled={busy} />
      {/* capture opens the rear camera on phones; desktop browsers ignore it and show the file picker. */}
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onPicked} disabled={busy} />
    </>
  );

  if (pages.length === 0) {
    return (
      <div className="space-y-3">
        {hiddenInputs}
        <Uploader onFilesLoaded={addFiles} onCameraClick={() => openCamera()} isLoading={busy} selectedFileName={null} />
        {notice && <p className="text-xs text-red-500 text-center whitespace-pre-line">{notice}</p>}
      </div>
    );
  }

  const many = pages.length > 1;
  const btn = "inline-flex items-center justify-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-primary)] hover:bg-[var(--hover-bg)] cursor-pointer disabled:opacity-40 disabled:cursor-default";

  return (
    <div className="space-y-4" id="bill-upload">
      {hiddenInputs}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-[var(--text-secondary)]">
          <span className="font-medium text-[var(--text-primary)]">{pages.length} page{many ? "s" : ""}</span> · {many ? "read together as one bill" : "one bill"}
          {preparing && <span className="ml-2 text-xs text-[var(--text-muted)]">preparing…</span>}
        </p>
        <button type="button" onClick={clearAll} disabled={busy} className={`${btn} h-9 px-3 text-xs`}>
          <Trash2 className="w-3.5 h-3.5 text-[var(--text-muted)]" /> Start over
        </button>
      </div>

      <ol className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {pages.map((page, idx) => {
          const shown = page.useEnhanced && page.enhanced ? page.enhanced[0] : page.thumb;
          const label = `Page ${idx + 1}${many && idx < 2 ? (idx === 0 ? " · Front" : " · Back") : ""}`;
          return (
            <li key={page.id} className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] overflow-hidden flex flex-col">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => page.original.startsWith("data:") && setViewing({ src: page.useEnhanced && page.enhanced ? page.enhanced[0] : page.original, name: page.name })}
                  aria-label={`View ${label}`}
                  className="block w-full aspect-[3/4] bg-[var(--bg-primary)] cursor-zoom-in"
                >
                  {shown ? (
                    <img src={shown} alt={label} className="w-full h-full object-contain" />
                  ) : (
                    <FileText className="w-8 h-8 m-auto text-[var(--text-muted)]" />
                  )}
                </button>
                <span className="absolute left-1.5 top-1.5 rounded-md bg-black/60 text-white text-[11px] font-medium px-1.5 py-0.5">{label}</span>
                <button
                  type="button"
                  onClick={() => removePage(page.id)}
                  disabled={busy}
                  aria-label={`Remove ${label}`}
                  className="absolute right-1.5 top-1.5 w-8 h-8 grid place-items-center rounded-full bg-black/60 text-white hover:bg-black/80 cursor-pointer disabled:opacity-40"
                >
                  <X className="w-4 h-4" />
                </button>
                {page.enhancing && (
                  <div className="absolute inset-0 grid place-items-center bg-black/40 text-white text-xs gap-1">
                    <span className="inline-flex items-center gap-1.5"><Loader2 className="w-4 h-4 animate-spin" /> Enhancing…</span>
                  </div>
                )}
              </div>

              <div className="p-2 space-y-2 text-xs">
                <p className="truncate text-[var(--text-muted)]" title={page.name}>{page.name}</p>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button type="button" onClick={() => move(idx, -1)} disabled={busy || idx === 0} aria-label="Move earlier" className={`${btn} w-9 h-9`}>
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button type="button" onClick={() => move(idx, 1)} disabled={busy || idx === pages.length - 1} aria-label="Move later" className={`${btn} w-9 h-9`}>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  {!page.isPdf && (
                    <button type="button" onClick={() => openCamera(page.id)} disabled={busy} aria-label={`Retake ${label}`} title="Retake with camera" className={`${btn} w-9 h-9`}>
                      <Camera className="w-4 h-4" />
                    </button>
                  )}
                  {!page.enhanced && (
                    <button
                      type="button"
                      onClick={() => enhance(page.id)}
                      disabled={busy || page.enhancing || !page.original.startsWith("data:")}
                      title="Enhance & clear this page (optional)"
                      className={`${btn} h-9 px-2 flex-1 basis-full sm:basis-auto min-w-0`}
                    >
                      <Sparkles className="w-4 h-4 text-[var(--accent-green)] shrink-0" /> <span className="truncate">Enhance</span>
                    </button>
                  )}
                </div>

                {page.enhanced && (
                  <div role="radiogroup" aria-label={`Version of ${label} to scan`} className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-[var(--border-subtle)]">
                    {([false, true] as const).map((useEnhanced) => (
                      <button
                        key={String(useEnhanced)}
                        type="button"
                        role="radio"
                        aria-checked={page.useEnhanced === useEnhanced}
                        onClick={() => update(page.id, { useEnhanced })}
                        disabled={busy}
                        className={`h-8 rounded-md font-medium cursor-pointer ${page.useEnhanced === useEnhanced ? "bg-[var(--accent-solid)] text-white" : "text-[var(--text-secondary)]"}`}
                      >
                        {useEnhanced ? "Enhanced" : "Original"}
                      </button>
                    ))}
                  </div>
                )}
                {page.enhanceError && (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 space-y-1.5">
                    <p className="text-[var(--text-primary)]">Enhancement failed — the original page will be scanned.</p>
                    <p className="text-[var(--text-secondary)] break-words">{page.enhanceError}</p>
                    <button type="button" onClick={() => enhance(page.id)} disabled={busy} className={`${btn} h-8 px-2`}>
                      <RefreshCw className="w-3.5 h-3.5" /> Retry
                    </button>
                  </div>
                )}
                {page.note && <p className="flex gap-1.5 text-[var(--text-secondary)]"><Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />{page.note}</p>}
                {page.warnings && (
                  <p className="flex gap-1.5 text-amber-600 dark:text-amber-400"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />Low quality: {page.warnings.join(", ")}</p>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {pages.length < MAX_BILL_PAGES && (
        <div className="flex flex-col sm:flex-row gap-2">
          <button type="button" onClick={() => addRef.current?.click()} disabled={busy} className={`${btn} h-11 sm:h-9 px-4 text-sm font-medium`}>
            <Plus className="w-4 h-4 text-[var(--text-muted)]" /> Add pages
          </button>
          <button type="button" onClick={() => openCamera()} disabled={busy} className={`${btn} h-11 sm:h-9 px-4 text-sm font-medium`}>
            <Camera className="w-4 h-4 text-[var(--text-muted)]" /> {pages.length === 1 ? "Photograph the back side" : "Add another page"}
          </button>
        </div>
      )}

      {notice && <p className="text-xs text-red-500 whitespace-pre-line">{notice}</p>}
      {buildError && (
        <div className="p-3 rounded-xl border border-red-500/30 bg-red-500/10 flex items-start gap-2.5 text-sm">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-red-500" />
          <p className="text-[var(--text-secondary)]">{buildError}</p>
        </div>
      )}

      {/* Portalled to <body>: the page slides in with a CSS transform, and a
          transformed ancestor would trap this fixed overlay inside it. */}
      {createPortal(
        <AnimatePresence>{viewing && <BillViewer src={viewing.src} name={viewing.name} onClose={() => setViewing(null)} />}</AnimatePresence>,
        document.body,
      )}
    </div>
  );
}
