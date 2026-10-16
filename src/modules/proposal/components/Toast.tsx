import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";

export type ToastKind = "success" | "error" | "info";

export interface ToastState {
  id: number;
  kind: ToastKind;
  message: string;
}

const ICONS: Record<ToastKind, React.ComponentType<{ className?: string }>> = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
};

// Every toast shares the same frosted-glass surface; only the icon carries
// the semantic colour (SaaS convention — a tinted whole card is noisy).
const ICON_COLOR: Record<ToastKind, string> = {
  success: "text-emerald-500",
  error: "text-red-500",
  info: "text-[var(--accent-green)]",
};

// Lightweight, module-scoped toast stack — the app has no shared Toast
// primitive yet (verified: no toast/notification component exists anywhere
// in src/components), so this follows the same self-contained pattern as
// GoogleSheetsExportModal.tsx rather than introducing a global provider.
export default function ToastStack({ toasts, onDismiss }: { toasts: ToastState[]; onDismiss: (id: number) => void }) {
  return (
    <div className="fixed bottom-4 right-4 z-[70] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      <AnimatePresence>
        {toasts.map((t) => {
          const Icon = ICONS[t.kind];
          return (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, scale: 0.96 }}
              transition={{ duration: 0.2 }}
              className="glass-popover pointer-events-auto flex items-start gap-2.5 px-4 py-3 rounded-xl text-[13px] text-[var(--text-primary)]"
            >
              <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${ICON_COLOR[t.kind]}`} />
              <span className="flex-1 leading-relaxed">{t.message}</span>
              <button onClick={() => onDismiss(t.id)} className="shrink-0 opacity-60 hover:opacity-100 transition cursor-pointer">
                <X className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
