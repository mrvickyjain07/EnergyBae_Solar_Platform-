// src/navIcons.ts — one icon per route, shared by the sidebar and command palette.
import {
  LayoutDashboard, FolderKanban, Users, ListTodo, FileScan, Calculator, LayoutTemplate, FileText, Palette,
  Package, IndianRupee, UsersRound, ShieldCheck, BarChart3, Settings, type LucideIcon,
} from "lucide-react";
import type { AppRoute } from "./navigation";

export const ROUTE_ICONS: Record<AppRoute, LucideIcon> = {
  dashboard: LayoutDashboard,
  projects: FolderKanban,
  customers: Users,
  tasks: ListTodo,
  "bill-analysis": FileScan,
  boq: Calculator,
  "boq-templates": LayoutTemplate,
  proposals: FileText,
  "proposal-templates": Palette,
  catalogue: Package,
  pricing: IndianRupee,
  team: UsersRound,
  roles: ShieldCheck,
  reports: BarChart3,
  settings: Settings,
};
