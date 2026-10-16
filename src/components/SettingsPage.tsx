// src/components/SettingsPage.tsx
// Settings as a real page (it used to be a modal off the profile menu).
// Company branding writes organization_settings via PUT /api/organization
// (admin-only on the server); appearance is per-browser.
import React, { useRef, useState } from "react";
import { Sun, Moon, Plug, CreditCard, SlidersHorizontal } from "lucide-react";
import { useTheme } from "../contexts/ThemeContext";
import { useAuth } from "../contexts/AuthContext";
import { useOrganization } from "../contexts/OrganizationContext";
import StatusPill from "./ui/StatusPill";

// ── Company branding (Settings section) ────────────────────────────────────
const MAX_LOGO_SOURCE_BYTES = 5 * 1024 * 1024;

// Downscale to ≤512px and re-encode (WebP keeps transparency and is small;
// browsers without WebP encoding fall back to PNG) so the stored data URL
// stays well under the server's cap.
function downscaleLogo(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Couldn't read that file."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("That file isn't a readable image."));
      img.onload = () => {
        const scale = Math.min(1, 512 / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/webp", 0.9));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

function BrandingSection() {
  const { user } = useAuth();
  const { org, save } = useOrganization();
  const { can } = useAuth();
  const isAdmin = can("organization.branding.update");
  const initial = {
    companyName: org?.companyName ?? "",
    logoDataUrl: org?.logoDataUrl ?? null,
    phone: org?.phone ?? "",
    email: org?.email ?? "",
    address: org?.address ?? "",
  };
  const [form, setForm] = useState(initial);
  const [status, setStatus] = useState<{ kind: "idle" | "saving" | "saved" | "error"; msg?: string }>({ kind: "idle" });
  const fileRef = useRef<HTMLInputElement>(null);
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const notReady = org?.configured === false;

  const pickLogo = async (file: File | undefined) => {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return setStatus({ kind: "error", msg: "Use a PNG, JPG or WebP image." });
    if (file.size > MAX_LOGO_SOURCE_BYTES) return setStatus({ kind: "error", msg: "That image is over 5 MB — pick a smaller file." });
    try {
      setForm((f) => ({ ...f, logoDataUrl: null }));
      const url = await downscaleLogo(file);
      setForm((f) => ({ ...f, logoDataUrl: url }));
      setStatus({ kind: "idle" });
    } catch (e: any) {
      setStatus({ kind: "error", msg: e.message });
    }
  };

  const onSave = async () => {
    setStatus({ kind: "saving" });
    try {
      await save({ ...form, companyName: form.companyName || null, phone: form.phone || null, email: form.email || null, address: form.address || null });
      setStatus({ kind: "saved", msg: "Branding saved." });
    } catch (e: any) {
      setStatus({ kind: "error", msg: e.message });
    }
  };

  const field = "w-full h-9 px-3 rounded-lg bg-[var(--bg-card)] border border-[var(--border-strong)] text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-green)] focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent-green)_15%,transparent)] disabled:opacity-70 disabled:bg-[var(--hover-bg)]";

  return (
    <section>
      <h3 className="text-sm font-semibold text-[var(--text-primary)]">Company branding</h3>
      <p className="text-xs text-[var(--text-muted)] mt-0.5">
        {isAdmin ? "Your logo and details, shown across the app for everyone in your company." : "Set by your company admin — shown across the app."}
      </p>

      {notReady && (
        <div className="mt-3 p-3 rounded-lg border border-amber-500/30 bg-amber-500/10 text-xs text-[var(--text-secondary)]">
          Branding storage isn't set up yet — the database migration <span className="font-mono">0014_organization_settings</span> needs to be applied.
        </div>
      )}

      <div className="mt-3 flex items-center gap-4">
        <div className="size-20 rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--bg-primary)] grid place-items-center overflow-hidden shrink-0">
          {form.logoDataUrl ? (
            <img src={form.logoDataUrl} alt="Company logo" className="max-w-full max-h-full object-contain p-1.5" />
          ) : (
            <span className="text-[11px] text-[var(--text-muted)] text-center px-2">No logo</span>
          )}
        </div>
        {isAdmin && (
          <div className="space-y-2">
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
              onChange={(e) => { void pickLogo(e.target.files?.[0]); e.target.value = ""; }} />
            <div className="flex gap-2">
              <button type="button" onClick={() => fileRef.current?.click()} disabled={notReady}
                className="h-8 px-3 rounded-lg bg-[var(--accent-solid)] text-white text-xs font-medium hover:opacity-90 cursor-pointer disabled:opacity-50">
                {form.logoDataUrl ? "Replace logo" : "Upload logo"}
              </button>
              {form.logoDataUrl && (
                <button type="button" onClick={() => setForm((f) => ({ ...f, logoDataUrl: null }))}
                  className="h-8 px-3 rounded-lg border border-[var(--border-subtle)] text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] cursor-pointer">
                  Remove
                </button>
              )}
            </div>
            <p className="text-[11px] text-[var(--text-muted)]">PNG, JPG or WebP · square or wide · transparent background works best</p>
          </div>
        )}
      </div>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        {([
          ["companyName", "Company name", "e.g. SunWorks Energy"],
          ["phone", "Phone", "+91 98xxx xxxxx"],
          ["email", "Email", "contact@company.in"],
        ] as const).map(([key, label, ph]) => (
          <label key={key} className={key === "companyName" ? "sm:col-span-2" : ""}>
            <span className="block text-xs font-medium text-[var(--text-secondary)] mb-1">{label}</span>
            <input className={field} value={form[key]} placeholder={ph} disabled={!isAdmin || notReady}
              onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} />
          </label>
        ))}
        <label className="sm:col-span-2">
          <span className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Address</span>
          <textarea className={`${field} h-auto py-2 resize-none`} rows={2} value={form.address} placeholder="Office address shown on proposals" disabled={!isAdmin || notReady}
            onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
        </label>
      </div>

      {isAdmin && (
        <div className="mt-4 flex items-center justify-end gap-3">
          {status.kind === "error" && <p className="text-xs text-red-500 mr-auto">{status.msg}</p>}
          {status.kind === "saved" && !dirty && <p className="text-xs text-emerald-500 mr-auto">{status.msg}</p>}
          <button type="button" onClick={onSave} disabled={!dirty || status.kind === "saving" || notReady}
            className="h-9 px-4 rounded-lg bg-[var(--accent-solid)] text-white text-sm font-medium hover:opacity-90 cursor-pointer disabled:opacity-40">
            {status.kind === "saving" ? "Saving…" : "Save branding"}
          </button>
        </div>
      )}
    </section>
  );
}

const PLANNED_SETTINGS = [
  { icon: SlidersHorizontal, title: "BOQ defaults", body: "Default panel, inverter brands and commercial rates per capacity range." },
  { icon: Plug, title: "Integrations", body: "Email sender, WhatsApp sharing and Google Drive for your company." },
  { icon: CreditCard, title: "Subscription & billing", body: "Your plan, usage and invoices." },
];

export default function SettingsPage() {
  const { theme, toggleTheme } = useTheme();
  const { user } = useAuth();
  if (!user) return null;

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2 space-y-6">
        <div className="glass-panel rounded-2xl p-6">
          <BrandingSection />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {PLANNED_SETTINGS.map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-2xl border border-dashed border-[var(--border-subtle)] p-5">
              <div className="flex items-center justify-between">
                <Icon className="w-5 h-5 text-[var(--text-muted)]" aria-hidden />
                <StatusPill status="planned" />
              </div>
              <p className="mt-3 text-sm font-semibold text-[var(--text-primary)]">{title}</p>
              <p className="mt-1 text-xs text-[var(--text-muted)] leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-6">
        <section className="glass-panel rounded-2xl p-6">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Appearance</h3>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">Saved on this browser.</p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            {(["light", "dark"] as const).map((t) => {
              const active = theme === t;
              const Icon = t === "light" ? Sun : Moon;
              return (
                <button key={t} type="button" onClick={() => { if (!active) toggleTheme(); }} aria-pressed={active}
                  className={`flex items-center gap-2.5 p-3 rounded-xl border text-sm font-medium cursor-pointer transition-colors ${
                    active ? "border-[var(--accent-green)] bg-[var(--accent-green)]/5 text-[var(--text-primary)] shadow-[0_0_0_1px_var(--accent-green)]" : "border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--hover-bg)]"
                  }`}>
                  <Icon className="w-4 h-4" /> {t === "light" ? "Light" : "Dark"}
                </button>
              );
            })}
          </div>
        </section>
        <section className="glass-panel rounded-2xl p-6">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Account</h3>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">Managed through Google sign-in.</p>
          <dl className="mt-3 rounded-xl bg-[var(--hover-bg)] divide-y divide-[var(--border-subtle)] text-sm">
            {[["Name", user.name], ["Email", user.email], ["Company", user.organization.name], ["Role", user.roleName]].map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-4 px-4 py-2.5">
                <dt className="text-[var(--text-muted)]">{k}</dt>
                <dd className="text-[var(--text-primary)] font-medium truncate">{v}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </div>
  );
}
