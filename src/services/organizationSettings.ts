// src/services/organizationSettings.ts
// Pure validation for company branding (PUT /api/organization) — split out of
// the route so it can be tested without Express or Supabase.

export interface OrganizationSettings {
  companyName: string | null;
  logoDataUrl: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
}

// ~350 KB of base64 ≈ 260 KB image. The client downscales to 512px before
// upload, so a real logo lands far below this; the cap stops abuse.
export const MAX_LOGO_CHARS = 350_000;
// Raster only: an SVG data URL could carry script if it ever gets rendered
// outside an <img> (e.g. inlined into an exported document).
const LOGO_PREFIX = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

const LIMITS = { companyName: 80, phone: 40, email: 120, address: 300 } as const;

export type ValidationResult = { ok: true; value: OrganizationSettings } | { ok: false; error: string };

function cleanText(v: unknown, max: number, field: string): string | null | Error {
  if (v === undefined || v === null) return null;
  if (typeof v !== "string") return new Error(`${field} must be text.`);
  const s = v.trim();
  if (!s) return null;
  if (s.length > max) return new Error(`${field} must be at most ${max} characters.`);
  return s;
}

export function validateOrganizationSettings(body: unknown): ValidationResult {
  if (!body || typeof body !== "object") return { ok: false, error: "Request body must be an object." };
  const b = body as Record<string, unknown>;

  const companyName = cleanText(b.companyName, LIMITS.companyName, "Company name");
  const phone = cleanText(b.phone, LIMITS.phone, "Phone");
  const email = cleanText(b.email, LIMITS.email, "Email");
  const address = cleanText(b.address, LIMITS.address, "Address");
  for (const r of [companyName, phone, email, address]) if (r instanceof Error) return { ok: false, error: r.message };
  if (typeof email === "string" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "Email doesn't look valid." };

  let logoDataUrl: string | null = null;
  if (b.logoDataUrl !== undefined && b.logoDataUrl !== null && b.logoDataUrl !== "") {
    if (typeof b.logoDataUrl !== "string" || !LOGO_PREFIX.test(b.logoDataUrl)) {
      return { ok: false, error: "Logo must be a PNG, JPG or WebP image." };
    }
    if (b.logoDataUrl.length > MAX_LOGO_CHARS) return { ok: false, error: "Logo is too large — use an image under ~250 KB." };
    logoDataUrl = b.logoDataUrl;
  }

  return {
    ok: true,
    value: {
      companyName: companyName as string | null,
      logoDataUrl,
      phone: phone as string | null,
      email: email as string | null,
      address: address as string | null,
    },
  };
}
