// src/services/authService.ts
// Our own session token — hand-rolled HS256 JWT via node:crypto, deliberately
// NOT using the jsonwebtoken package: this app both signs and verifies its
// own tokens (no external issuer/interop), so a library buys nothing. This
// is distinct from googleIdentity.ts, which verifies Google's RS256 tokens
// against Google's rotating public keys — that trust boundary DOES use a
// library (google-auth-library), since hand-rolling JWKS verification is a
// different, much riskier class of problem than self-signed HMAC.
import { createHmac, timingSafeEqual } from "node:crypto";

// The token names WHO (sub) and WHICH company they're acting for (org). It
// deliberately carries no role: the role is per-organization and read from
// organization_memberships on every request (authMiddleware.ts), so revoking
// access or changing a role takes effect immediately.
export interface SessionPayload {
  sub: string;
  email: string;
  name: string;
  org: string;
  iat: number;
  exp: number;
}

export const SESSION_COOKIE_NAME = "eb_session";
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET not set — check .env.local");
  return secret;
}

function base64url(input: Buffer | string): string {
  return (Buffer.isBuffer(input) ? input : Buffer.from(input)).toString("base64url");
}

function sign(data: string): string {
  return base64url(createHmac("sha256", getSecret()).update(data).digest());
}

export function signSessionToken(payload: { sub: string; email: string; name: string; org: string }, opts?: { ttlSeconds?: number }): string {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const body: SessionPayload = { ...payload, iat: now, exp: now + (opts?.ttlSeconds ?? SESSION_TTL_SECONDS) };
  const encodedBody = base64url(JSON.stringify(body));
  const signature = sign(`${header}.${encodedBody}`);
  return `${header}.${encodedBody}.${signature}`;
}

export function verifySessionToken(token: string): SessionPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, encodedBody, signature] = parts;

  // Compare the base64url STRINGS, not decoded bytes: the last of the 43
  // characters carries 2 padding bits, so several spellings decode to the
  // same 32 bytes — a byte comparison would accept those altered tokens.
  const expectedSig = Buffer.from(sign(`${header}.${encodedBody}`));
  const actualSig = Buffer.from(signature);
  if (expectedSig.length !== actualSig.length || !timingSafeEqual(expectedSig, actualSig)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encodedBody, "base64url").toString("utf8")) as SessionPayload;
    if (typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function serializeSessionCookie(token: string | null): string {
  if (token === null) {
    return `${SESSION_COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`;
  }
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE_NAME}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}${secure}`;
}

export function parseSessionCookie(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const name = part.slice(0, eq).trim();
    if (name === SESSION_COOKIE_NAME) return part.slice(eq + 1).trim();
  }
  return null;
}

