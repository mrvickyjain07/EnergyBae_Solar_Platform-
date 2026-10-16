import React from "react";

// Small local presentational helpers shared across the Proposal Maker form
// sections — kept private to this module (the app has no shared Input/Select
// primitives to reuse; see CommercialBillAnalysis.tsx which hand-rolls the
// same pattern per-file). This just avoids repeating the same Tailwind
// class string ~60 times across ProposalForm.tsx.

const inputBase =
  "w-full px-3 py-2 rounded-lg bg-[var(--bg-surface)] border text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none transition-colors duration-200 disabled:opacity-50";

function borderClass(invalid?: boolean) {
  return invalid
    ? "border-red-500/60 focus:border-red-500 focus:ring-2 focus:ring-red-500/20"
    : "border-[var(--border-subtle)] focus:border-[var(--accent-green)] focus:ring-2 focus:ring-[var(--accent-green)]/20";
}

export function FieldLabel({ children, required, hint }: { children: React.ReactNode; required?: boolean; hint?: string }) {
  return (
    <label className="text-xs text-[var(--text-muted)] font-medium mb-1.5 flex items-center gap-1.5">
      {children}
      {required && <span className="text-[var(--accent-green)]">*</span>}
      {hint && <span className="normal-case font-medium text-[var(--accent-green)]/80 bg-[var(--accent-green)]/10 px-1.5 py-0.5 rounded text-[9px] tracking-normal">{hint}</span>}
    </label>
  );
}

interface BaseFieldProps {
  label: string;
  required?: boolean;
  invalid?: boolean;
  hint?: string;
  errorText?: string;
}

export function TextField({
  label,
  required,
  invalid,
  hint,
  errorText,
  ...rest
}: BaseFieldProps & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <FieldLabel required={required} hint={hint}>
        {label}
      </FieldLabel>
      <input {...rest} className={`${inputBase} ${borderClass(invalid)}`} />
      {invalid && errorText && <p className="text-[10px] text-red-400 font-mono mt-1">{errorText}</p>}
    </div>
  );
}

export function TextAreaField({
  label,
  required,
  invalid,
  hint,
  errorText,
  ...rest
}: BaseFieldProps & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <div>
      <FieldLabel required={required} hint={hint}>
        {label}
      </FieldLabel>
      <textarea {...rest} className={`${inputBase} ${borderClass(invalid)} resize-y min-h-[60px]`} />
      {invalid && errorText && <p className="text-[10px] text-red-400 font-mono mt-1">{errorText}</p>}
    </div>
  );
}

export function SelectField({
  label,
  required,
  invalid,
  hint,
  errorText,
  children,
  ...rest
}: BaseFieldProps & React.SelectHTMLAttributes<HTMLSelectElement> & { children: React.ReactNode }) {
  return (
    <div>
      <FieldLabel required={required} hint={hint}>
        {label}
      </FieldLabel>
      <select {...rest} className={`${inputBase} ${borderClass(invalid)} cursor-pointer`}>
        {children}
      </select>
      {invalid && errorText && <p className="text-[10px] text-red-400 font-mono mt-1">{errorText}</p>}
    </div>
  );
}

const CARD_COLS = { 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "sm:grid-cols-2 xl:grid-cols-4", 5: "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5" } as Record<number, string>;

/**
 * Click-to-pick options (radio group) — for short fixed lists where a select
 * hides the choices. With descriptions it renders as compact single-row
 * choice cards (icon · title/description · radio), after 21st.dev's
 * "Choicebox" (halaska-studio) and "Icon Card Radio Group" (sean0205), without
 * their Radix deps; otherwise as a segmented control.
 */
export function ChoiceField<T extends string>({ label, required, invalid, errorText, hint, value, options, onChange }: BaseFieldProps & {
  value: string;
  options: { value: T; label: string; description?: string; icon?: React.ComponentType<{ className?: string }> }[];
  onChange: (v: T) => void;
}) {
  const cards = options.some((o) => o.description);
  return (
    <div>
      <FieldLabel required={required} hint={hint}>{label}</FieldLabel>
      <div role="radiogroup" aria-label={label} className={cards ? `grid grid-cols-1 ${CARD_COLS[options.length] ?? "sm:grid-cols-3"} gap-2` : "flex flex-wrap gap-1 rounded-lg bg-[var(--hover-bg)] p-0.5 border border-[var(--border-subtle)]"}>
        {options.map((o) => {
          const on = value === o.value;
          const Icon = o.icon;
          if (!cards) return (
            <button key={o.value} type="button" role="radio" aria-checked={on} onClick={() => onChange(o.value)}
              className={`flex-1 min-w-fit rounded-md px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${on ? "bg-[var(--bg-surface)] text-[var(--accent-green)] shadow-sm ring-1 ring-[var(--accent-green)]/30" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}>
              {o.label}
            </button>
          );
          return (
            <button key={o.value} type="button" role="radio" aria-checked={on} onClick={() => onChange(o.value)} title={o.description}
              className={`flex min-w-0 items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-green)]/40 ${on ? "border-[var(--accent-green)] bg-[var(--accent-green)]/[0.05]" : invalid ? "border-red-500/60" : "border-[var(--border-subtle)] hover:border-[var(--border-strong)] hover:bg-[var(--hover-bg)]"}`}>
              {Icon && (
                <span className={`grid size-8 shrink-0 place-items-center rounded-lg border ${on ? "border-[var(--accent-green)]/30 bg-[var(--accent-green)]/10 text-[var(--accent-green)]" : "border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)]"}`}>
                  <Icon className="size-4" />
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-[var(--text-primary)]">{o.label}</span>
                {o.description && <span className="block truncate text-[11px] text-[var(--text-muted)]">{o.description}</span>}
              </span>
              <span aria-hidden className={`grid size-4 shrink-0 place-items-center rounded-full border transition ${on ? "border-[var(--accent-green)]" : "border-[var(--border-strong)]"}`}>
                {on && <span className="size-2 rounded-full bg-[var(--accent-green)]" />}
              </span>
            </button>
          );
        })}
      </div>
      {invalid && errorText && <p className="text-[10px] text-red-400 font-mono mt-1">{errorText}</p>}
    </div>
  );
}

export function FieldGrid({ cols = 2, children }: { cols?: 2 | 3; children: React.ReactNode }) {
  return <div className={`grid grid-cols-1 ${cols === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2"} gap-3`}>{children}</div>;
}

export function SectionCard({ title, subtitle, children, icon: Icon }: { title: string; subtitle?: string; children: React.ReactNode; icon?: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="glass-panel rounded-2xl p-5 bg-[var(--bg-card)] space-y-4">
      <div className="flex items-center gap-2 pb-3 border-b border-[var(--border-subtle)]">
        {Icon && (
          <div className="p-1.5 rounded-lg bg-[var(--accent-green)]/10 text-[var(--accent-green)]">
            <Icon className="w-3.5 h-3.5" />
          </div>
        )}
        <div>
          <h4 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h4>
          {subtitle && <p className="text-[10px] text-[var(--text-muted)] font-mono">{subtitle}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}
