// src/services/authMiddleware.ts
// Express glue for the session cookie set by authApi.ts's /api/auth/google-login.
// No test file — route/middleware glue, same untested class as
// catalogueApi.ts/wirePricesApi.ts (the pure logic it calls, authService.ts
// and tenancy.ts, have their own test files).
import type { NextFunction, Request, Response } from "express";
import { parseSessionCookie, verifySessionToken } from "./authService";
import { resolvePermissions, type Permission } from "../permissions";
import { getSupabase } from "./supabaseClient";

// A valid uuid so Postgres-typed organization_id filters don't reject it.
const GUEST_ORG = "00000000-0000-0000-0000-000000000000";
// The ONLY routes an anonymous visitor may call, relative to the /api mount —
// verified against the routes registered in server.ts: residential extraction,
// bill enhancement, the residential Excel download, and C&I extraction +
// single/batch Excel export. None reads or writes Supabase. Everything else
// (saved bills, projects, proposals, BOQ, pricing, wire prices, users, roles,
// organization, /api/status) is 401 for anonymous callers. There is no server
// Drive route: Drive import runs in the browser with the user's own Google
// token, and its UI requires bill_analysis.import, which this guest lacks.
const GUEST_PATHS = /^\/(extract|enhance-bill|download-excel|commercial\/(extract|export|batch-export))$/;

export interface RequestUser {
  sub: string;
  email: string;
  name: string;
  /** Active organization — every tenant-owned query must filter by this. */
  org: string;
  /** Role key in the active organization (built-in key or "custom"), read from the DB on this request. */
  role: string;
  /** Resolved from the DB on this request — the ONLY input to authorization. */
  permissions: Permission[];
}

export interface AuthedRequest extends Request {
  user?: RequestUser;
}

// Verifies the cookie, then re-reads the membership for the token's
// organization on EVERY request. That lookup is the tenant boundary: a user
// removed from a company (or whose role changed) is cut off on their very
// next request, not when the 7-day token expires. Fails closed — any lookup
// error is a 503, never a pass-through.
// ponytail: one indexed query per API call; add a short-TTL cache keyed by
// (sub, org) if request volume ever makes this measurable.
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = parseSessionCookie(req.headers.cookie);
  const payload = token ? verifySessionToken(token) : null;
  // Public standalone scanner: a visitor without a session is an anonymous
  // guest who may ONLY scan and export (no database routes at all — saved
  // bills would otherwise be shared between every member of the public).
  // Allowlist, so any route added later stays closed to the public by default.
  if (!payload || !payload.org) {
    if (!GUEST_PATHS.test(req.path)) return res.status(401).json({ error: "Not available on the public scanner." });
    (req as AuthedRequest).user = {
      sub: "guest", email: "guest@local", name: "Guest", org: GUEST_ORG,
      role: "guest", permissions: ["bill_analysis.create", "bill_analysis.view"],
    };
    return next();
  }

  try {
    const { data, error } = await getSupabase()
      .from("organization_memberships")
      .select("role, is_active, custom_roles(permissions)")
      .eq("user_id", payload.sub)
      .eq("organization_id", payload.org)
      .maybeSingle();
    if (error) throw error;
    if (!data || !data.is_active) {
      return res.status(401).json({ error: "Your access to this company has been removed." });
    }
    const custom = (data as any).custom_roles as { permissions: string[] } | null;
    (req as AuthedRequest).user = {
      sub: payload.sub, email: payload.email, name: payload.name, org: payload.org,
      role: data.role, permissions: resolvePermissions(data.role, custom?.permissions),
    };
    next();
  } catch (err: any) {
    console.error("[EnergyBae] requireAuth membership lookup failed:", err.message);
    res.status(503).json({ error: "Could not verify your access. Try again in a moment." });
  }
}

/**
 * Route guard: the caller must hold EVERY listed permission. Declared on the
 * route itself (`app.get(path, requirePermission("x.view"), handler)`), so a
 * route's access rule sits next to its code; src/routePermissions.test.ts
 * fails the build if an /api route declares none. Must run after requireAuth.
 */
export function requirePermission(...required: Permission[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as AuthedRequest).user;
    if (!user) return res.status(401).json({ error: "Not authenticated." });
    if (!hasPermission(req, ...required)) {
      return res.status(403).json({ error: "You don't have permission to do that. Ask your company admin." });
    }
    next();
  };
}

/** Explicit "any active member of the company" — for data every role may read (e.g. branding). */
export const requireMember = requirePermission();

/** For checks that depend on the request body (e.g. finalising vs saving a draft). */
export function hasPermission(req: Request, ...required: Permission[]): boolean {
  const held = (req as AuthedRequest).user?.permissions ?? [];
  return required.every((p) => held.includes(p));
}

export function permissionsOf(req: Request): Permission[] {
  return (req as AuthedRequest).user?.permissions ?? [];
}

/** The caller's active organization. Only valid behind requireAuth. */
export function orgOf(req: Request): string {
  const org = (req as AuthedRequest).user?.org;
  if (!org) throw new Error("orgOf() called on a request without an authenticated organization");
  return org;
}
