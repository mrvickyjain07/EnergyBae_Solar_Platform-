// src/components/ConfirmDeleteModal.tsx
// GitHub-style "type to confirm" destructive-action dialog — replaces the
// browser's own confirm()/prompt(), which is easy to click through on
// muscle memory. The Delete button stays disabled until the typed text
// exactly matches confirmWord, same as GitHub's repo-delete dialog.
import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { AlertTriangle, X } from "lucide-react";

interface ConfirmDeleteModalProps {
  open: boolean;
  title: string;
  message: string;
  /** The exact text the user must type to enable the Delete button. */
  confirmWord: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDeleteModal({ open, title, message, confirmWord, onConfirm, onCancel }: ConfirmDeleteModalProps) {
  const [typed, setTyped] = useState("");
  if (!open) return null;

  const handleCancel = () => {
    setTyped("");
    onCancel();
  };
  const handleConfirm = () => {
    if (typed !== confirmWord) return;
    setTyped("");
    onConfirm();
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 glass-overlay flex items-center justify-center p-4"
        onClick={handleCancel}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          onClick={(e) => e.stopPropagation()}
          className="glass-popover w-full max-w-md rounded-2xl p-6"
          // Inline so it beats .glass-popover's own border (unlayered CSS
          // outranks Tailwind's layered border utilities).
          style={{ borderColor: "rgba(239, 68, 68, 0.35)" }}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 text-red-400 font-bold text-sm">
              <AlertTriangle className="w-4 h-4" />
              {title}
            </div>
            <button onClick={handleCancel} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
              <X className="w-4 h-4" />
            </button>
          </div>

          <p className="text-sm text-[var(--text-secondary)] mb-4">{message}</p>

          <label className="block text-xs text-[var(--text-muted)] mb-1.5">
            To confirm, type "<span className="font-mono font-bold text-[var(--text-primary)]">{confirmWord}</span>" in the box below.
          </label>
          <input
            autoFocus
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleConfirm()}
            className="w-full px-3 py-2 rounded-lg bg-[var(--hover-bg)] border border-[var(--border-subtle)] text-sm text-[var(--text-primary)] outline-none focus:border-red-500/60 mb-4"
          />

          <div className="flex justify-end gap-2">
            <button type="button" onClick={handleCancel}
              className="px-4 py-2 rounded-lg border border-[var(--border-subtle)] text-[var(--text-secondary)] text-xs font-semibold cursor-pointer">
              Cancel
            </button>
            <button type="button" disabled={typed !== confirmWord} onClick={handleConfirm}
              className="px-4 py-2 rounded-lg bg-red-600 text-white text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer">
              Delete
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
