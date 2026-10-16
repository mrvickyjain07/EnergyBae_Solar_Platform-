// src/services/authService.test.ts
// Run with: npx tsx src/services/authService.test.ts
process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";

import assert from "node:assert/strict";
import {
  signSessionToken,
  verifySessionToken,
  serializeSessionCookie,
  parseSessionCookie,
  SESSION_COOKIE_NAME,
} from "./authService";

let passed = 0;
function check(label: string, actual: unknown, expected: unknown) {
  assert.deepEqual(actual, expected, `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  passed++;
  console.log(`  ok — ${label}`);
}

const payload = { sub: "user-1", email: "sir@example.com", name: "Sir", org: "org-1" };

// ── sign/verify round-trip ──────────────────────────────────────────────────
{
  const token = signSessionToken(payload);
  const verified = verifySessionToken(token);
  check("round-trip preserves sub/email/name/org", verified && { sub: verified.sub, email: verified.email, name: verified.name, org: verified.org }, payload);
}

// ── tampered signature is rejected ──────────────────────────────────────────
{
  const token = signSessionToken(payload);
  const parts = token.split(".");
  const tampered = `${parts[0]}.${parts[1]}.${parts[2].slice(0, -1)}${parts[2].slice(-1) === "A" ? "B" : "A"}`;
  check("tampered signature returns null", verifySessionToken(tampered), null);
}

// ── non-canonical signature spelling is rejected ────────────────────────────
// The 43rd base64url char carries 2 padding bits, so up to 3 other chars
// decode to the same signature bytes. Each must still be rejected.
{
  const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  const token = signSessionToken(payload);
  const [h, b, sig] = token.split(".");
  const idx = ALPHABET.indexOf(sig.slice(-1));
  const variants = [0, 1, 2, 3].map((k) => (idx & ~3) | k).filter((i) => i !== idx);
  check("original token still verifies", verifySessionToken(token) !== null, true);
  check(
    "every padding-bit variant of the signature is rejected",
    variants.map((i) => verifySessionToken(`${h}.${b}.${sig.slice(0, -1)}${ALPHABET[i]}`)),
    variants.map(() => null),
  );
}

// ── tampered payload is rejected (even if signature format still parses) ───
{
  const token = signSessionToken(payload);
  const parts = token.split(".");
  const forgedPayload = Buffer.from(JSON.stringify({ ...payload, org: "someone-elses-org", sub: "someone-else" })).toString("base64url");
  const forged = `${parts[0]}.${forgedPayload}.${parts[2]}`;
  check("forged payload with stale signature returns null", verifySessionToken(forged), null);
}

// ── expired token is rejected ───────────────────────────────────────────────
{
  const token = signSessionToken(payload, { ttlSeconds: -10 });
  check("expired token returns null", verifySessionToken(token), null);
}

// ── malformed tokens are rejected, not thrown ───────────────────────────────
check("malformed token (no dots) returns null", verifySessionToken("not-a-jwt"), null);
check("empty string returns null", verifySessionToken(""), null);

// ── cookie serialize/parse ──────────────────────────────────────────────────
{
  const token = signSessionToken(payload);
  const setCookie = serializeSessionCookie(token);
  check("serialized cookie includes HttpOnly", setCookie.includes("HttpOnly"), true);
  check("serialized cookie includes the token", setCookie.includes(`${SESSION_COOKIE_NAME}=${token}`), true);

  // Simulate the browser sending it back as a Cookie: request header, mixed
  // in with other unrelated cookies.
  const cookieHeader = `other_cookie=abc; ${SESSION_COOKIE_NAME}=${token}; another=xyz`;
  check("parseSessionCookie extracts the token from a multi-cookie header", parseSessionCookie(cookieHeader), token);
}

check("parseSessionCookie returns null when header is undefined", parseSessionCookie(undefined), null);
check("parseSessionCookie returns null when the session cookie is absent", parseSessionCookie("other=abc; another=xyz"), null);

{
  const logoutCookie = serializeSessionCookie(null);
  check("logout cookie clears the value", logoutCookie.includes(`${SESSION_COOKIE_NAME}=;`), true);
  check("logout cookie expires immediately", logoutCookie.includes("Max-Age=0"), true);
}

console.log(`\n${passed} checks passed.`);
