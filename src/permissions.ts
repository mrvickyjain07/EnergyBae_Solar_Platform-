// src/permissions.ts
// The authorization model, shared by server and client. Permissions — not
// role names — are the security primitive: every API route declares the
// permission it needs (requirePermission in services/authMiddleware.ts) and
// the UI only ever asks can(permission).
//
// Built-in roles live HERE, in code, so every company gets identical,
// tested definitions and changing one is a reviewed code change. Companies
// add their own custom roles (custom_roles table, migration 0016) built from
// the same permission keys.
//
// Scope (own / team / organization) is not modelled yet — every permission
// is organization-wide. Add a scope dimension when Projects/Tasks exist and
// "only my records" becomes a real requirement.

export const PERMISSION_GROUPS = [
  // "import" = Google Drive folder import (and the Google Sheets export that
  // shares its Drive OAuth scopes). Standalone-scanner addition: the public
  // guest never holds it, so Drive is employee-only.
  { id: "bill_analysis", label: "Bill Analysis", actions: ["view", "create", "update", "delete", "import"] },
  { id: "boq", label: "BOQ", actions: ["view", "create", "update", "delete", "generate", "export"] },
  { id: "boq_template", label: "BOQ Templates", actions: ["view", "create", "update", "delete", "publish"] },
  { id: "proposal", label: "Proposals", actions: ["view", "create", "update", "delete", "finalize", "approve", "export", "share"] },
  { id: "catalogue", label: "Catalogue", actions: ["view", "create", "update", "delete"] },
  { id: "pricing", label: "Pricing", actions: ["view", "update", "import", "approve"] },
  { id: "project", label: "Projects", actions: ["view", "create", "update", "delete"] },
  { id: "customer", label: "Customers", actions: ["view", "create", "update", "delete"] },
  { id: "task", label: "Tasks", actions: ["view", "create", "update", "delete", "assign", "complete", "comment"] },
  { id: "user", label: "Team", actions: ["view", "invite", "update", "deactivate"] },
  { id: "role", label: "Roles", actions: ["view", "create", "update", "delete", "assign"] },
  { id: "organization", label: "Company", actions: ["view", "update", "branding.update"] },
] as const;

export type Permission = string;

export const ALL_PERMISSIONS: Permission[] = PERMISSION_GROUPS.flatMap((g) => g.actions.map((a) => `${g.id}.${a}`));
const KNOWN = new Set(ALL_PERMISSIONS);

export function isPermission(p: unknown): p is Permission {
  return typeof p === "string" && KNOWN.has(p);
}

const all = (group: string) => ALL_PERMISSIONS.filter((p) => p.startsWith(`${group}.`));
const pick = (group: string, ...actions: string[]) => actions.map((a) => `${group}.${a}`);

export type SystemRoleKey = "owner" | "admin" | "sales_manager" | "sales_executive" | "engineering" | "procurement" | "finance";

export interface SystemRole {
  key: SystemRoleKey;
  name: string;
  description: string;
  permissions: Permission[];
}

// Tasks/projects/customers/templates permissions are granted now so roles
// don't need re-editing when those modules ship; they gate nothing until then.
const SALES_EXECUTIVE: Permission[] = [
  // Exactly what the pre-RBAC "employee" role could do, plus not-yet-built modules.
  ...pick("bill_analysis", "view", "create", "update", "import"),
  ...pick("boq", "view", "create", "update", "generate", "export"),
  ...pick("proposal", "view", "create", "update", "finalize", "export", "share"),
  "catalogue.view",
  "pricing.view",
  "boq_template.view",
  ...pick("project", "view", "create", "update"),
  ...pick("customer", "view", "create", "update"),
  ...pick("task", "view", "create", "update", "complete", "comment"),
  "organization.view",
];

export const SYSTEM_ROLES: SystemRole[] = [
  { key: "owner", name: "Owner", description: "Full control of the company account.", permissions: [...ALL_PERMISSIONS] },
  {
    key: "admin",
    name: "Admin",
    description: "Runs day-to-day operations: team, prices, approvals. Can't change company settings.",
    permissions: ALL_PERMISSIONS.filter((p) => p !== "organization.update"),
  },
  {
    key: "sales_manager",
    name: "Sales Manager",
    description: "Leads the sales team and approves proposals.",
    permissions: [
      ...SALES_EXECUTIVE,
      ...pick("bill_analysis", "delete"),
      ...pick("proposal", "approve", "delete"),
      ...pick("project", "delete"),
      ...pick("customer", "delete"),
      ...pick("task", "assign", "delete"),
      "user.view",
    ],
  },
  { key: "sales_executive", name: "Sales Executive", description: "Analyses bills, builds BOQs and proposals.", permissions: SALES_EXECUTIVE },
  {
    key: "engineering",
    name: "Design / Engineering",
    description: "Owns system design, BOQs and BOQ templates.",
    permissions: [
      "bill_analysis.view",
      ...all("boq"),
      ...all("boq_template"),
      ...pick("catalogue", "view", "create", "update"),
      "pricing.view",
      ...pick("proposal", "view", "export"),
      ...pick("project", "view", "update"),
      "customer.view",
      ...pick("task", "view", "create", "update", "complete", "comment"),
      "organization.view",
    ],
  },
  {
    key: "procurement",
    name: "Procurement",
    description: "Maintains the product catalogue and supplier prices.",
    permissions: [
      ...all("catalogue"),
      ...pick("pricing", "view", "update", "import"),
      ...pick("boq", "view", "export"),
      "boq_template.view",
      "proposal.view",
      "project.view",
      ...pick("task", "view", "create", "update", "complete", "comment"),
      "organization.view",
    ],
  },
  {
    key: "finance",
    name: "Finance",
    description: "Approves pricing and commercial terms.",
    permissions: [
      ...pick("pricing", "view", "update", "approve"),
      "catalogue.view",
      ...pick("boq", "view", "export"),
      ...pick("proposal", "view", "approve", "export"),
      ...pick("project", "view"),
      ...pick("customer", "view"),
      ...pick("task", "view", "create", "update", "complete", "comment"),
      "organization.view",
    ],
  },
];

const SYSTEM_BY_KEY = new Map(SYSTEM_ROLES.map((r) => [r.key, r]));

export function systemRole(key: string): SystemRole | undefined {
  return SYSTEM_BY_KEY.get(key as SystemRoleKey);
}

/** Permissions of a membership: its system role's, or its custom role's (unknown keys dropped). */
export function resolvePermissions(role: string, customPermissions?: readonly string[] | null): Permission[] {
  if (role === "custom") return [...new Set((customPermissions ?? []).filter(isPermission))];
  return systemRole(role)?.permissions ?? [];
}

/** Anti-escalation: you may only hand out permissions you hold yourself. */
export function canGrant(actor: readonly Permission[], granted: readonly Permission[]): boolean {
  const mine = new Set(actor);
  return granted.every((p) => mine.has(p));
}
