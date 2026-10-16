// src/navigation.ts
// The app's information architecture in one pure file: every route, its
// page title, which sidebar section it lives in, and — crucially — whether
// the module actually works yet. Sidebar, top bar and command palette all
// read this, so a module moves from "planned" to "live" in exactly one place.
//
// Status is a statement of fact about the backend, not a design choice:
//   live    — backed by real APIs/tables today
//   partial — usable today, but narrower than the target (e.g. BOQ is one
//             universal formula set, not capacity-range templates)
//   planned — no backend yet; the page is an honest empty state

export type AppRoute =
  | "dashboard"
  | "projects"
  | "customers"
  | "tasks"
  | "bill-analysis"
  | "boq"
  | "boq-templates"
  | "proposals"
  | "proposal-templates"
  | "catalogue"
  | "pricing"
  | "team"
  | "roles"
  | "reports"
  | "settings";

export type ModuleStatus = "live" | "partial" | "planned";

export interface RouteMeta {
  label: string;
  description: string;
  status: ModuleStatus;
  /** Hidden without this permission. UX only — every API route enforces its own permission. */
  permission?: string;
}

export const ROUTES: Record<AppRoute, RouteMeta> = {
  dashboard: { label: "Dashboard", description: "Your solar business at a glance", status: "live" },
  projects: { label: "Projects", description: "Every opportunity, its solar systems and proposals", status: "live", permission: "project.view" },
  customers: { label: "Customers", description: "The people and companies you quote for", status: "live", permission: "customer.view" },
  tasks: { label: "Tasks", description: "Follow-ups, reviews and site work across your team", status: "planned" },
  "bill-analysis": { label: "Bill Analysis", description: "Home, Society and Commercial & Industrial bills", status: "live" },
  boq: { label: "BOQ", description: "Size the system and build a priced bill of quantities", status: "partial" },
  "boq-templates": { label: "BOQ Templates", description: "Capacity ranges, templates and their versions", status: "partial", permission: "boq_template.view" },
  proposals: { label: "Proposals", description: "Saved quotes, their status and admin review", status: "live" },
  "proposal-templates": { label: "Proposal Templates", description: "Your branded proposal layouts and sections", status: "planned" },
  catalogue: { label: "Catalogue", description: "Inverters, protection devices and BOS items", status: "live", permission: "catalogue.update" },
  pricing: { label: "Pricing", description: "Wire prices, overhead charges and margins", status: "live", permission: "pricing.update" },
  team: { label: "Team", description: "Who can sign in and their access", status: "live", permission: "user.view" },
  roles: { label: "Roles & Permissions", description: "What each role in your company can do", status: "live", permission: "role.view" },
  reports: { label: "Reports", description: "Sales, conversion and capacity reporting", status: "planned" },
  settings: { label: "Settings", description: "Company branding, appearance and your account", status: "live" },
};

export interface NavSection {
  /** null = the unlabeled top group. */
  label: string | null;
  items: AppRoute[];
}

// STANDALONE eBill Scanner: the app is the bill scanner, nothing else. The
// rest of the SaaS IA (ROUTES above) is kept so shared components still type-
// check, but only these routes can be shown or navigated to (App.tsx clamps
// every route change to this set). The full section list lives in the
// EnergyBae SaaS repo.
export const SCANNER_ROUTES: ReadonlySet<AppRoute> = new Set<AppRoute>(["bill-analysis", "settings"]);

export const NAV_SECTIONS: NavSection[] = [
  { label: null, items: ["bill-analysis"] },
  { label: "Account", items: ["settings"] },
];

export type Can = (permission: string) => boolean;

export function canAccess(route: AppRoute, can: Can): boolean {
  const p = ROUTES[route].permission;
  return !p || can(p);
}

export function visibleSections(can: Can): NavSection[] {
  return NAV_SECTIONS
    .map((s) => ({ ...s, items: s.items.filter((r) => canAccess(r, can)) }))
    .filter((s) => s.items.length > 0);
}

/** Routes rendered by the one shared Proposal Maker instance (its draft state must survive switching between them). */
export const PROPOSAL_MAKER_ROUTES: ReadonlySet<AppRoute> = new Set(["boq", "catalogue", "pricing"]);
