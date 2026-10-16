import React, { createContext, useContext, useEffect, useState } from "react";
import {
  CurrentUser,
  loginWithGoogleIdToken,
  logout as logoutRequest,
  switchOrganization as switchOrganizationRequest,
} from "../services/authClient";
import { syncTenantCache } from "../modules/proposal/storage";
import { signOut as signOutGoogle } from "../services/googleAuthService";

interface AuthContextType {
  user: CurrentUser | null;
  loading: boolean;
  /** True for an employee with a real session; false for the anonymous public guest. */
  signedIn: boolean;
  loginWithGoogle: (idToken: string) => Promise<void>;
  logout: () => Promise<void>;
  /** UI-only permission check for the active company (the server enforces). */
  can: (permission: string) => boolean;
  /** Switches the active company, then reloads so no in-memory state from the old company survives. */
  switchOrganization: (organizationId: string) => Promise<void>;
}

// Exported only so component tests can supply a signed-in user; the app uses AuthProvider.
export const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ── Public guest ──────────────────────────────────────────────────────────────
// Anyone without an employee session. Never an owner/admin: it holds exactly
// the permissions the server grants anonymous requests (authMiddleware.ts).
const GUEST_USER: CurrentUser = {
  id: "guest",
  email: "guest@local",
  name: "Guest",
  role: "guest",
  roleName: "Visitor",
  // Matches the server's public guest (authMiddleware.ts): scan + export only.
  permissions: ["bill_analysis.create", "bill_analysis.view"],
  organization: { id: "guest-org", name: "EnergyBae" },
  organizations: [{ id: "guest-org", name: "EnergyBae", roleName: "Visitor" }],
};
// ─────────────────────────────────────────────────────────────────────────────

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  const adopt = (u: CurrentUser | null) => {
    if (u) syncTenantCache(u.organization.id);
    setUser(u);
  };

  useEffect(() => {
    // Public scanner: no sign-in — everyone is the guest (scan + export only).
    adopt(GUEST_USER);
    setLoading(false);
  }, []);

  const loginWithGoogle = async (idToken: string) => {
    adopt(await loginWithGoogleIdToken(idToken));
  };

  const logout = async () => {
    await logoutRequest();
    // Revoke + drop the Drive/Sheets access token (sessionStorage) so the next
    // person on a shared computer can't reuse the employee's Google access.
    signOutGoogle();
    // After logout, restore guest access instead of showing the login screen.
    adopt(GUEST_USER);
  };

  const can = (permission: string) => !!user?.permissions.includes(permission);

  const switchOrganization = async (organizationId: string) => {
    syncTenantCache((await switchOrganizationRequest(organizationId)).organization.id);
    window.location.reload();
  };

  // Session presence, not a role check: the guest object is the only user
  // that never came from the server.
  const signedIn = !!user && user !== GUEST_USER;

  return (
    <AuthContext.Provider value={{ user, loading, signedIn, loginWithGoogle, logout, switchOrganization, can }}>{children}</AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
