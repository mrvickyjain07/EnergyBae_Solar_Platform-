// src/components/ui/EmptyState.tsx
// Adapted from 21st.dev "Empty State" (@serafimcloud): dashed card with a
// fanned stack of icon tiles that spread on hover. Rebuilt on the app's theme
// tokens — no shadcn Button / cva / radix dependency added for one component.
import React from "react";
import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  title: string;
  description: React.ReactNode;
  icons: LucideIcon[];
  children?: React.ReactNode;
  className?: string;
}

const tile =
  "bg-[var(--bg-card)] size-12 grid place-items-center rounded-xl shadow-lg ring-1 ring-[var(--border-subtle)] transition duration-500 group-hover:duration-200";

export default function EmptyState({ title, description, icons, children, className = "" }: EmptyStateProps) {
  const [a, b, c] = icons;
  const icon = (I: LucideIcon | undefined) => I && <I className="w-6 h-6 text-[var(--text-muted)]" aria-hidden />;
  return (
    <div
      className={`group text-center border-2 border-dashed border-[var(--border-subtle)] hover:border-[var(--border-strong)] rounded-2xl px-6 py-12 sm:p-14 w-full bg-[var(--bg-card)]/40 hover:bg-[var(--hover-bg)]/50 transition duration-500 hover:duration-200 ${className}`}
    >
      <div className="flex justify-center isolate">
        {icons.length >= 3 ? (
          <>
            <div className={`${tile} relative left-2.5 top-1.5 -rotate-6 group-hover:-translate-x-5 group-hover:-rotate-12 group-hover:-translate-y-0.5`}>{icon(a)}</div>
            <div className={`${tile} relative z-10 group-hover:-translate-y-0.5`}>{icon(b)}</div>
            <div className={`${tile} relative right-2.5 top-1.5 rotate-6 group-hover:translate-x-5 group-hover:rotate-12 group-hover:-translate-y-0.5`}>{icon(c)}</div>
          </>
        ) : (
          <div className={`${tile} group-hover:-translate-y-0.5`}>{icon(a)}</div>
        )}
      </div>
      <h2 className="mt-6 text-base font-semibold text-[var(--text-primary)]">{title}</h2>
      <div className="mt-1.5 text-sm text-[var(--text-muted)] max-w-md mx-auto leading-relaxed">{description}</div>
      {children && <div className="mt-5 flex flex-wrap justify-center gap-2">{children}</div>}
    </div>
  );
}
