// src/services/authClient.ts
// Thin fetch wrappers around the auth API — same style as googleAuthService.ts
// being a dedicated services file. Cookies ride along automatically on every
// same-origin fetch() (Express serves the API and the built frontend from
// the same origin/port), so no Authorization header handling is needed here.
export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  /** Role key in the ACTIVE organization (built-in key or "custom"). Display only — use permissions. */
  role: string;
  roleName: string;
  /**
   * Permissions in the ACTIVE organization. They drive what the UI shows; the
   * server re-checks every request, so hiding something here is never the security.
   */
  permissions: string[];
  organization: { id: string; name: string };
  /** Every company this user can switch to (always includes the active one). */
  organizations: { id: string; name: string; roleName: string }[];
}

function toCurrentUser(body: any): CurrentUser {
  return { ...body.user, organization: body.organization, organizations: body.organizations ?? [] };
}

export async function loginWithGoogleIdToken(idToken: string): Promise<CurrentUser> {
  const res = await fetch("/api/auth/google-login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error || "Login failed.");
  return toCurrentUser(body);
}

export async function logout(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST" });
}

export async function fetchCurrentUser(): Promise<CurrentUser | null> {
  const res = await fetch("/api/auth/me");
  if (!res.ok) return null;
  return toCurrentUser(await res.json());
}

export async function switchOrganization(organizationId: string): Promise<CurrentUser> {
  const res = await fetch("/api/auth/switch-organization", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ organizationId }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error || "Couldn't switch company.");
  return toCurrentUser(body);
}
