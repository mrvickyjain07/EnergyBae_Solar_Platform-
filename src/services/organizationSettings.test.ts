// src/services/organizationSettings.test.ts
// Run with: npx tsx src/services/organizationSettings.test.ts
import assert from "node:assert/strict";
import { validateOrganizationSettings, MAX_LOGO_CHARS } from "./organizationSettings";

let passed = 0;
function check(label: string, actual: unknown, expected: unknown) {
  assert.deepEqual(actual, expected, `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  passed++;
  console.log(`  ok — ${label}`);
}

const png = "data:image/png;base64,iVBORw0KGgo=";
const ok = (b: unknown) => { const r = validateOrganizationSettings(b); return "error" in r ? r.error : r.value; };

check("valid full branding", ok({ companyName: "  SunWorks ", logoDataUrl: png, phone: "+91 98", email: "a@b.in", address: "Pune" }),
  { companyName: "SunWorks", logoDataUrl: png, phone: "+91 98", email: "a@b.in", address: "Pune" });
check("blank strings become null (clearing a field)", ok({ companyName: "", phone: "   " }),
  { companyName: null, logoDataUrl: null, phone: null, email: null, address: null });
check("empty logo removes it", (ok({ logoDataUrl: "" }) as any).logoDataUrl, null);
check("SVG logos rejected (script risk)", ok({ logoDataUrl: "data:image/svg+xml;base64,PHN2Zz4=" }), "Logo must be a PNG, JPG or WebP image.");
check("non-data-URL logo rejected", ok({ logoDataUrl: "https://evil.example/x.png" }), "Logo must be a PNG, JPG or WebP image.");
check("oversized logo rejected", ok({ logoDataUrl: "data:image/png;base64," + "A".repeat(MAX_LOGO_CHARS) }), "Logo is too large — use an image under ~250 KB.");
check("bad email rejected", ok({ email: "not-an-email" }), "Email doesn't look valid.");
check("over-long name rejected", ok({ companyName: "x".repeat(81) }), "Company name must be at most 80 characters.");
check("non-string field rejected", ok({ phone: 12345 }), "Phone must be text.");
check("non-object body rejected", ok(null), "Request body must be an object.");

console.log(`\n${passed} checks passed.`);
