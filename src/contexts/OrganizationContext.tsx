// src/contexts/OrganizationContext.tsx
// Company branding (logo, name, contacts) for the whole app — read once after
// sign-in, updated from Settings, consumed by the Sidebar (and next by the
// proposal exports). Backed by GET/PUT /api/organization.
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useAuth } from "./AuthContext";

export interface Organization {
  companyName: string | null;
  logoDataUrl: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  updatedAt: string | null;
  /** false until migration 0014 has been applied. */
  configured: boolean;
}

interface OrganizationContextType {
  org: Organization | null;
  save: (next: Omit<Organization, "updatedAt" | "configured">) => Promise<void>;
}

const OrganizationContext = createContext<OrganizationContextType | undefined>(undefined);

export const OrganizationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [org, setOrg] = useState<Organization | null>(null);

  useEffect(() => {
    if (!user) { setOrg(null); return; }
    fetch("/api/organization")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setOrg)
      // Branding is cosmetic — on failure the app just shows the default logo.
      .catch(() => setOrg(null));
  }, [user]);

  const save = useCallback(async (next: Omit<Organization, "updatedAt" | "configured">) => {
    const res = await fetch("/api/organization", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `Save failed (${res.status})`);
    setOrg(body);
  }, []);

  return <OrganizationContext.Provider value={{ org, save }}>{children}</OrganizationContext.Provider>;
};

export const useOrganization = (): OrganizationContextType => {
  const ctx = useContext(OrganizationContext);
  if (!ctx) throw new Error("useOrganization must be used within an OrganizationProvider");
  return ctx;
};
