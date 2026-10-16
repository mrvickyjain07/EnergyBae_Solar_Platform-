// src/modules/auth/authApi.ts
// Login/logout/me/switch-organization. Registered BEFORE the blanket
// requireAuth gate in server.ts — login must be reachable while logged out,
// and me/switch do their own cookie check rather than relying on the
// middleware (me must be able to recover a session whose company access was
// removed by moving it to another company the user still belongs to).
import type { Express, Response } from "express";
import { getSupabase } from "../../services/supabaseClient";
import { verifyGoogleIdToken } from "../../services/googleIdentity";
import { signSessionToken, serializeSessionCookie, parseSessionCookie, verifySessionToken } from "../../services/authService";
import { pickActiveOrganization, buildSessionView, MembershipRow } from "../../services/tenancy";

async function loadMemberships(userId: string): Promise<MembershipRow[]> {
  const { data, error } = await getSupabase()
    .from("organization_memberships")
    .select("organization_id, role, is_active, created_at, organizations(name), custom_roles(name, permissions)")
    .eq("user_id", userId);
  if (error) throw error;
  return (data ?? []).map((m: any) => ({
    organization_id: m.organization_id,
    organization_name: m.organizations?.name ?? "Company",
    role: m.role,
    custom_role_name: m.custom_roles?.name ?? null,
    custom_permissions: m.custom_roles?.permissions ?? null,
    is_active: m.is_active,
    created_at: m.created_at,
  }));
}

/** Issues the cookie for `user` acting in their best available organization and sends the session view. */
async function startSession(res: Response, user: { id: string; email: string; name: string }, preferredOrg?: string | null) {
  const memberships = await loadMemberships(user.id);
  const active = pickActiveOrganization(memberships, preferredOrg);
  if (!active) {
    res.setHeader("Set-Cookie", serializeSessionCookie(null));
    return res.status(403).json({ error: "No access. Ask your company admin to add your Google account." });
  }
  const token = signSessionToken({ sub: user.id, email: user.email, name: user.name, org: active.organization_id });
  res.setHeader("Set-Cookie", serializeSessionCookie(token));
  res.json(buildSessionView(user, memberships, active));
}

export function registerAuthRoutes(app: Express) {
  app.post("/api/auth/google-login", async (req, res) => {
    const idToken = req.body?.idToken as string | undefined;
    if (!idToken) return res.status(400).json({ error: "Request body must include idToken." });

    const identity = await verifyGoogleIdToken(idToken);
    if (!identity) return res.status(401).json({ error: "Google sign-in failed." });

    try {
      const { data: user, error } = await getSupabase().from("users").select("id, email, name").eq("email", identity.email.trim().toLowerCase()).maybeSingle();
      if (error) throw error;
      if (!user) return res.status(403).json({ error: "No access. Ask your company admin to add your Google account." });
      await startSession(res, user);
    } catch (err: any) {
      console.error("[EnergyBae] POST /api/auth/google-login failed:", err.message);
      res.status(500).json({ error: "Login failed." });
    }
  });

  app.post("/api/auth/logout", (_req, res) => {
    res.setHeader("Set-Cookie", serializeSessionCookie(null));
    res.json({ success: true });
  });

  // Re-reads everything from the DB. If the token's company access was
  // revoked but the user still belongs to another company, the session
  // moves there (new cookie) instead of logging them out.
  app.get("/api/auth/me", async (req, res) => {
    const token = parseSessionCookie(req.headers.cookie);
    const payload = token ? verifySessionToken(token) : null;
    // No session = anonymous public visitor (the client falls back to its guest view).
    if (!payload) return res.status(401).json({ error: "Not authenticated." });

    try {
      const { data: user, error } = await getSupabase().from("users").select("id, email, name").eq("id", payload.sub).maybeSingle();
      if (error) throw error;
      if (!user) return res.status(401).json({ error: "Not authenticated." });
      await startSession(res, user, payload.org);
    } catch (err: any) {
      console.error("[EnergyBae] GET /api/auth/me failed:", err.message);
      res.status(500).json({ error: "Failed to load session." });
    }
  });

  app.post("/api/auth/switch-organization", async (req, res) => {
    const token = parseSessionCookie(req.headers.cookie);
    const payload = token ? verifySessionToken(token) : null;
    if (!payload) return res.status(401).json({ error: "Not authenticated." });
    const organizationId = req.body?.organizationId;
    if (typeof organizationId !== "string" || !organizationId) {
      return res.status(400).json({ error: "Request body must include organizationId." });
    }

    try {
      const memberships = await loadMemberships(payload.sub);
      const target = memberships.find((m) => m.organization_id === organizationId && m.is_active);
      // Same response whether the company doesn't exist or the user isn't in
      // it — no way to probe for other companies' ids.
      if (!target) return res.status(403).json({ error: "You don't have access to that company." });
      const { data: user, error } = await getSupabase().from("users").select("id, email, name").eq("id", payload.sub).maybeSingle();
      if (error) throw error;
      if (!user) return res.status(401).json({ error: "Not authenticated." });
      await startSession(res, user, target.organization_id);
    } catch (err: any) {
      console.error("[EnergyBae] POST /api/auth/switch-organization failed:", err.message);
      res.status(500).json({ error: "Failed to switch company." });
    }
  });
}
