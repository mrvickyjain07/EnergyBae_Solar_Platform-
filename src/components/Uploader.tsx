// src/components/Uploader.tsx
// Bill drop zone. Visual design ported from 21st.dev "File Upload"
// (@extend-hq): a fan of file-type cards that spreads while dragging, a
// "Browse files" pill and, for a single bill, "Use camera". Rebuilt on lucide-react + the app's tokens instead of pulling in
// @hugeicons and border-beam; the drag glow is a CSS ring.
//
// This is only the empty drop zone: every selection goes to onFilesLoaded at
// once. Once a single bill has pages, BillEnhancer.tsx shows them (with add,
// camera, reorder, remove and per-page enhancement).
import React, { useState, useRef, useEffect } from "react";
import { motion } from "motion/react";
import { MAX_BILL_LABEL, decideUpload } from "../uploadLimits";
import { toJpeg } from "../billPages";
import { FileText, Upload, X, ExternalLink, FolderOpen, ShieldCheck, Zap, BarChart3, CloudUpload, Camera } from "lucide-react";

// Upload illustration: stacked MSEDCL bills floating over a solar panel,
// ringed by a glowing orbit with light flowing along it, plus floating
// document / energy / chart badges. Pure SVG + CSS (transform/opacity
// animations only); reacts to drag-over by lifting and brightening.
function UploadIllustration({ active }: { active: boolean }) {
  const bill = (rot: number, x: number, y: number, delay: string, front = false) => (
    <div
      className="ba-float-rot absolute w-[118px] h-[150px] rounded-xl border border-white/40 shadow-xl"
      style={{
        left: x, top: y, ["--r" as any]: `${rot}deg`, animationDelay: delay,
        background: front ? "linear-gradient(160deg,#ede9fe,#c4b5fd)" : "linear-gradient(160deg,#ddd6fe,#a78bfa)",
      }}
    >
      {front && (
        <div className="p-3">
          <p className="text-[13px] font-bold tracking-wide text-violet-900/80">MSEDCL</p>
          <div className="mt-2 space-y-1.5">
            {[90, 70, 80, 55, 75, 60].map((w, i) => (
              <div key={i} className="h-1.5 rounded-full bg-violet-900/15" style={{ width: `${w}%` }} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
  const badge = (Icon: typeof Zap, cls: string, delay: string) => (
    <div className={`ba-float absolute size-11 rounded-full border border-emerald-400/50 bg-[var(--bg-card)]/80 backdrop-blur grid place-items-center shadow-[0_0_18px_rgba(52,211,153,.35)] ${cls}`} style={{ animationDelay: delay }}>
      <Icon className="w-5 h-5 text-emerald-400" />
    </div>
  );

  return (
    <div className={`relative hidden sm:block h-48 md:h-56 transition-transform duration-500 ${active ? "-translate-y-2 scale-[1.03]" : ""}`} aria-hidden>
    {/* Drawn at a fixed 288px height, scaled down as a unit so the page fits one screen. */}
    <div className="absolute inset-x-0 top-1/2 h-72 -translate-y-1/2 scale-[0.82] origin-center">
      {/* Solar panel base */}
      <svg className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[92%] h-24 opacity-70" viewBox="0 0 300 80" preserveAspectRatio="none">
        <polygon points="40,10 260,10 300,80 0,80" fill="#1e3a5f" />
        {[1, 2, 3, 4, 5].map((i) => <line key={`v${i}`} x1={40 + i * 36.6} y1="10" x2={i * 50} y2="80" stroke="#60a5fa" strokeOpacity=".35" />)}
        {[1, 2, 3].map((i) => <line key={`h${i}`} x1={40 - i * 10} y1={10 + i * 17.5} x2={260 + i * 10} y2={10 + i * 17.5} stroke="#60a5fa" strokeOpacity=".35" />)}
      </svg>

      {/* Orbit ring with light flowing along it */}
      <svg className="absolute left-1/2 top-[52%] -translate-x-1/2 -translate-y-1/2 w-[88%] h-28" viewBox="0 0 300 100" aria-hidden>
        <ellipse cx="150" cy="50" rx="140" ry="36" fill="none" stroke="#34d399" strokeOpacity=".25" strokeWidth="2" transform="rotate(-8 150 50)" />
        <ellipse className="ba-dash" cx="150" cy="50" rx="140" ry="36" fill="none" stroke="#34d399" strokeWidth="2.5" strokeLinecap="round" transform="rotate(-8 150 50)" style={{ filter: "drop-shadow(0 0 6px #34d399)" }} />
      </svg>

      {/* Stacked bills */}
      <div className="absolute left-1/2 top-6 -translate-x-1/2 w-[200px] h-[190px]">
        {bill(-12, 8, 18, "0s")}
        {bill(-4, 30, 8, ".4s")}
        {bill(6, 54, 4, ".8s", true)}
        {/* Upload cloud */}
        <div className={`ba-float absolute left-[70px] top-[128px] w-16 h-14 rounded-2xl grid place-items-center text-white transition-shadow ${active ? "shadow-[0_0_30px_rgba(139,92,246,.8)]" : "shadow-[0_0_22px_rgba(139,92,246,.55)]"}`}
          style={{ background: "linear-gradient(145deg,#8b5cf6,#6d28d9)", animationDelay: ".2s" }}>
          <CloudUpload className="w-7 h-7" />
        </div>
      </div>

      {badge(FileText, "left-[8%] top-[42%]", ".6s")}
      {badge(Zap, "right-[10%] top-[26%]", "1.1s")}
      {badge(BarChart3, "right-[14%] bottom-[14%]", "1.6s")}
    </div>
    </div>
  );
}

// Full-size look at the uploaded bill. Images render directly; PDFs go
// through a blob: URL because Chrome refuses to show data: PDFs in a frame.
export function BillViewer({ src, name, onClose }: { src: string; name: string; onClose: () => void }) {
  const isPdf = src.startsWith("data:application/pdf");
  const [url, setUrl] = useState<string | null>(isPdf ? null : src);

  useEffect(() => {
    if (!isPdf) return;
    let objectUrl: string | null = null;
    fetch(src).then((r) => r.blob()).then((b) => { objectUrl = URL.createObjectURL(b); setUrl(objectUrl); }).catch(() => setUrl(null));
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [src, isPdf]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] glass-overlay flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={`Preview of ${name}`}
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        onClick={(e) => e.stopPropagation()}
        className="glass-popover w-full max-w-5xl h-[88vh] rounded-2xl flex flex-col overflow-hidden"
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border-subtle)]">
          <p className="flex-1 min-w-0 text-sm font-medium text-[var(--text-primary)] truncate">{name}</p>
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="h-8 px-2.5 inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--hover-bg)]"
            >
              <ExternalLink className="w-3.5 h-3.5" /> Open in new tab
            </a>
          )}
          <button type="button" onClick={onClose} aria-label="Close preview" className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)] cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 min-h-0 bg-[var(--bg-primary)] overflow-auto flex items-start justify-center">
          {!url ? (
            <p className="m-auto text-sm text-[var(--text-muted)]">Loading preview…</p>
          ) : isPdf ? (
            <iframe src={url} title={name} className="w-full h-full border-0" />
          ) : (
            <img src={url} alt={name} className="max-w-full h-auto p-4" />
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

export interface LoadedFile {
  base64Data: string;
  fileName: string;
}

interface UploaderProps {
  // Every selection arrives here in one call. Batch mode (`multiple`) treats
  // each file as its own bill; single mode (BillEnhancer) treats them as the
  // pages of ONE bill — the picker allows several files either way.
  onFilesLoaded: (files: LoadedFile[]) => void;
  multiple?: boolean;
  // Single mode: shows "Use camera" (BillEnhancer owns the capture input).
  onCameraClick?: () => void;
  isLoading: boolean;
  selectedFileName: string | null;
}

export const ACCEPT = "image/*,application/pdf";

// Oversized photos are re-encoded as JPEG in the browser (toJpeg) so they
// fit the upload limit (src/uploadLimits.ts). PDFs never are (see decideUpload).
const isAccepted = (f: File) => f.type === "application/pdf" || f.type.startsWith("image/") || /\.(pdf|png|jpe?g|webp|heic)$/i.test(f.name);

const readAsDataUrl = (file: File) =>
  new Promise<LoadedFile | null>((resolve) => {
    const reader = new FileReader();
    reader.onload = (event) =>
      resolve(event.target?.result ? { base64Data: event.target.result as string, fileName: file.name } : null);
    // An unreadable file resolves null rather than rejecting, so one bad
    // file never drops the rest of a selection.
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });

// Size check / compression per file: one rejected file never blocks the
// rest of a selection — it is listed, the others go through.
const prepare = async (file: File): Promise<LoadedFile | string> => {
  const decision = decideUpload(file);
  if (decision.action === "reject") return `${file.name}: ${decision.reason}`;
  if (decision.action === "send") return (await readAsDataUrl(file)) ?? `${file.name}: couldn't be read.`;
  try {
    return { base64Data: await toJpeg(file), fileName: file.name.replace(/\.[^.]+$/, "") + ".jpg" };
  } catch {
    return `${file.name}: image is over ${MAX_BILL_LABEL} and couldn't be compressed in this browser — save it as a smaller JPG and try again.`;
  }
};

/** Validate + read a picked/dropped selection. Shared by the drop zone and BillEnhancer's add-page / camera inputs. */
export async function prepareBillFiles(fileList: FileList | null): Promise<{ ok: LoadedFile[]; problems: string[] }> {
  const all = Array.from(fileList ?? []);
  const accepted = all.filter(isAccepted);
  if (all.length && !accepted.length) return { ok: [], problems: ["That file type isn't supported — upload a PDF, PNG or JPG."] };
  const results = await Promise.all(accepted.map(prepare));
  const problems = results.filter((r): r is string => typeof r === "string");
  const unsupported = all.length - accepted.length;
  if (unsupported > 0) problems.push(`${unsupported} file${unsupported > 1 ? "s" : ""} skipped — only PDF, PNG and JPG are supported.`);
  return { ok: results.filter((r): r is LoadedFile => typeof r !== "string"), problems };
}

export default function Uploader({ onFilesLoaded, multiple = false, onCameraClick, isLoading, selectedFileName }: UploaderProps) {
  const [isDragActive, setIsDragActive] = useState(false);
  const [rejection, setRejection] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Counter, not a boolean — dragleave fires when crossing into child
  // elements, which made the old zone flicker.
  const dragDepth = useRef(0);

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0 || isLoading) return;
    const { ok, problems } = await prepareBillFiles(fileList);
    setRejection(problems.length ? problems.join("\n") : null);
    if (ok.length) onFilesLoaded(ok);
  };

  const dragProps = {
    onDragEnter: (e: React.DragEvent) => { e.preventDefault(); dragDepth.current += 1; setIsDragActive(true); },
    onDragLeave: (e: React.DragEvent) => {
      e.preventDefault();
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setIsDragActive(false);
    },
    onDragOver: (e: React.DragEvent) => e.preventDefault(),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      dragDepth.current = 0;
      setIsDragActive(false);
      void handleFiles(e.dataTransfer.files);
    },
  };

  const openPicker = () => { if (!isLoading) fileInputRef.current?.click(); };

  const input = (
    <input
      ref={fileInputRef}
      type="file"
      accept={ACCEPT}
      multiple
      onChange={(e) => { void handleFiles(e.target.files); e.target.value = ""; }}
      className="hidden"
      disabled={isLoading}
    />
  );

  // ── Empty drop zone: one illustrated card for single AND batch uploads ──
  // (batch only changes the copy to plural and shows how many are queued).
  return (
    <div
      id={multiple ? undefined : "bill-upload"}
      {...dragProps}
      className={`relative overflow-hidden rounded-2xl border-2 border-dashed transition-[border-color,box-shadow,background-color] duration-200 ${
        isDragActive
          ? "border-[var(--accent-green)] bg-[var(--accent-green)]/[0.06] shadow-[0_0_0_6px_color-mix(in_srgb,var(--accent-green)_14%,transparent)]"
          : "border-[var(--accent-green)]/35 bg-gradient-to-br from-[var(--accent-green)]/[0.04] via-transparent to-emerald-500/[0.04]"
      } ${isLoading ? "opacity-60 pointer-events-none" : ""}`}
    >
      {input}
      <div className="grid md:grid-cols-2 items-center gap-2">
        <UploadIllustration active={isDragActive} />
        <div className="px-5 py-6 sm:px-6 sm:pt-0 md:py-6 md:pr-8 md:pl-2 text-center md:text-left">
          <h3 className="text-lg font-semibold text-[var(--text-primary)]">
            {isDragActive ? "Drop it here" : multiple ? "Upload several bills" : "Upload your electricity bill"}
          </h3>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            {multiple
              ? "Select or drop many MSEDCL bills — each is analysed separately and all export onto one sheet."
              : "PDF or clear photos of an MSEDCL bill — add the front and back together; they are read as one bill."}
          </p>
          <button
            type="button"
            onClick={openPicker}
            className="mt-4 w-full h-11 inline-flex items-center justify-center gap-2.5 rounded-xl bg-[var(--accent-solid)] text-white text-[15px] font-medium shadow-lg shadow-[color-mix(in_srgb,var(--accent-solid)_35%,transparent)] hover:-translate-y-0.5 hover:shadow-xl active:translate-y-0 transition-all cursor-pointer"
          >
            <Upload className="w-5 h-5" /> {multiple ? "Click to upload or drop your bills" : "Click to upload or drop your bill"}
          </button>
          <p className="mt-2 text-xs text-[var(--text-muted)] text-center">MSEDCL bill{multiple ? "s" : ""} · PDF, PNG or JPG · up to {MAX_BILL_LABEL}{multiple ? " each" : ""} · larger photos are compressed automatically</p>
          {rejection && <p className="mt-2 text-xs text-red-500 text-center whitespace-pre-line">{rejection}</p>}
          <div className="my-3 flex items-center gap-3 text-xs text-[var(--text-muted)]" aria-hidden>
            <span className="h-px flex-1 bg-[var(--border-subtle)]" /> or <span className="h-px flex-1 bg-[var(--border-subtle)]" />
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={openPicker}
              className="h-11 sm:h-9 px-4 inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--hover-bg)] cursor-pointer"
            >
              <FolderOpen className="w-4 h-4 text-[var(--text-muted)]" /> Browse files
            </button>
            {onCameraClick && (
              <button
                type="button"
                onClick={onCameraClick}
                className="h-11 sm:h-9 px-4 inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--hover-bg)] cursor-pointer"
              >
                <Camera className="w-4 h-4 text-[var(--text-muted)]" /> Use camera
              </button>
            )}
            {/* Batch: the caller passes "N bills queued" as selectedFileName. */}
            {multiple && selectedFileName && (
              <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-[var(--accent-green)]/10 text-[var(--accent-green)]">{selectedFileName}</span>
            )}
          </div>
          {/* Honest: the bill is sent to the AI model to be read — so no "private" claim. */}
          <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-emerald-500">
            <ShieldCheck className="w-4 h-4" /> Used only to read {multiple ? "these bills" : "this bill"}
          </p>
        </div>
      </div>
    </div>
  );
}
