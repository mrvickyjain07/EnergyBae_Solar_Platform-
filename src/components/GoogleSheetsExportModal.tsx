import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Cloud, FolderOpen, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { SlotData } from "./ComparativeSheet";
import { getAccessToken, isSignedIn } from "../services/googleAuthService";
import { parseFolderIdFromUrl, openFolderPicker } from "../services/googleDriveService";
import { exportToGoogleSheets, ExportStage, ExportResult } from "../services/worksheetExportService";

interface GoogleSheetsExportModalProps {
  open: boolean;
  onClose: () => void;
  slot1: SlotData;
  solarPanelUsed: number;
}

const LAST_FOLDER_STORAGE_KEY = "energybae_last_drive_folder_id";

export default function GoogleSheetsExportModal({ open, onClose, slot1, solarPanelUsed }: GoogleSheetsExportModalProps) {
  const [folderUrl, setFolderUrl] = useState("");
  const [stage, setStage] = useState<ExportStage | "idle">("idle");
  const [isBusy, setIsBusy] = useState(false);
  const [result, setResult] = useState<ExportResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (open && !folderUrl) {
      const lastFolder = localStorage.getItem(LAST_FOLDER_STORAGE_KEY);
      if (lastFolder) setFolderUrl(lastFolder);
    }
  }, [open]);

  if (!open) return null;

  const handlePickFolder = async () => {
    setErrorMsg(null);
    setIsBusy(true);
    try {
      const token = await getAccessToken();
      const folder = await openFolderPicker(token);
      if (folder) {
        setFolderUrl(folder.id);
        localStorage.setItem(LAST_FOLDER_STORAGE_KEY, folder.id);
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Google authentication failed.");
    } finally {
      setIsBusy(false);
    }
  };

  const handleSave = async () => {
    setErrorMsg(null);
    const folderId = parseFolderIdFromUrl(folderUrl);
    if (!folderId) {
      setErrorMsg("Unable to access selected folder.");
      return;
    }

    setIsBusy(true);
    setResult(null);
    try {
      const exportResult = await exportToGoogleSheets({
        slot1Data: slot1,
        solarPanelUsed,
        consumerName: slot1.consumerName,
        folderId,
        onProgress: (s) => setStage(s),
      });
      localStorage.setItem(LAST_FOLDER_STORAGE_KEY, folderId);
      setResult(exportResult);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to create Google Spreadsheet.");
    } finally {
      setIsBusy(false);
      setStage("idle");
    }
  };

  const handleClose = () => {
    setResult(null);
    setErrorMsg(null);
    setStage("idle");
    onClose();
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
        onClick={handleClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-md rounded-2xl bg-[var(--card-bg,#0f1726)] border border-[var(--border-subtle)] p-6 shadow-2xl"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 text-[var(--text-primary)] font-bold text-sm">
              <Cloud className="w-4 h-4 text-[#4285F4]" />
              Save to Google Sheets
            </div>
            <button onClick={handleClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
              <X className="w-4 h-4" />
            </button>
          </div>

          {result ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                <CheckCircle2 className="w-4 h-4" />
                Spreadsheet Created Successfully
              </div>
              <div className="text-xs text-[var(--text-muted)] space-y-1">
                <div><span className="text-[var(--text-primary)] font-semibold">Customer:</span> {slot1.consumerName || "Untitled Customer"}</div>
                <div><span className="text-[var(--text-primary)] font-semibold">Folder:</span> {result.folderName}</div>
              </div>
              <a
                href={result.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block mt-2 px-4 py-2 rounded-lg bg-[#4285F4] text-white text-xs font-bold"
              >
                Open Sheet
              </a>
            </div>
          ) : (
            <div className="space-y-4">
              {!isSignedIn() && (
                <div className="text-xs text-[var(--text-muted)]">
                  You'll be asked to sign in with Google before saving.
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[var(--text-primary)]">Google Drive Folder</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={folderUrl}
                    onChange={(e) => setFolderUrl(e.target.value)}
                    placeholder="Paste folder URL or ID"
                    className="flex-1 px-3 py-2 rounded-lg bg-[var(--hover-bg)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] outline-none"
                  />
                  <button
                    type="button"
                    onClick={handlePickFolder}
                    disabled={isBusy}
                    className="px-3 py-2 rounded-lg bg-[var(--hover-bg)] border border-[var(--border-subtle)] text-[var(--text-primary)] disabled:opacity-50"
                    title="Choose folder"
                  >
                    <FolderOpen className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {isBusy && stage !== "idle" && (
                <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  {stage}
                </div>
              )}

              {errorMsg && (
                <div className="flex items-center gap-2 text-xs text-red-400">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {errorMsg}
                </div>
              )}

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                type="button"
                onClick={handleSave}
                disabled={isBusy || !folderUrl.trim()}
                className="w-full px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#4285F4] to-[#0F9D58] text-xs font-bold text-white shadow-lg disabled:opacity-50 cursor-pointer"
              >
                {isBusy ? "Saving..." : "Save to Google Sheets"}
              </motion.button>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
