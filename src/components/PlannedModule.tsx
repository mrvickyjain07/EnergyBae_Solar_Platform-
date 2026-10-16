// src/components/PlannedModule.tsx
// The page for a module whose backend doesn't exist yet. It never renders
// sample rows or fake counts — it explains what the module will do, what it
// depends on, and routes the user to the screens that DO work today.
import React from "react";
import {
  FolderKanban, Users, Building2, ListTodo, CalendarClock, MessageSquare, LayoutTemplate, Gauge, Copy,
  Palette, FileText, Image, BarChart3, PieChart, TrendingUp, ArrowRight, CheckCircle2, Construction,
  type LucideIcon,
} from "lucide-react";
import EmptyState from "./ui/EmptyState";
import StatusPill from "./ui/StatusPill";
import { ROUTES, type AppRoute } from "../navigation";

interface PlannedContent {
  icons: [LucideIcon, LucideIcon, LucideIcon];
  headline: string;
  pitch: string;
  capabilities: string[];
  dependsOn: string;
  useToday: { route: AppRoute; label: string }[];
}

export type PlannedRoute = "tasks" | "proposal-templates" | "reports";

const CONTENT: Record<PlannedRoute, PlannedContent> = {
  tasks: {
    icons: [ListTodo, CalendarClock, MessageSquare],
    headline: "Task management is coming",
    pitch: "Assign follow-ups, reviews and site work to your team, linked to the project, system or proposal they belong to.",
    capabilities: [
      "Status (To do · In progress · Blocked · Done), priority, assignee and due date",
      "Comments and a full activity history per task",
      "Tasks created automatically — e.g. “Review BOQ” when a BOQ is generated, “Follow up” when a proposal is sent",
      "Role-based visibility: your tasks, your team's, or the whole company",
    ],
    dependsOn: "A tasks table with assignment, comments and an activity log — not built yet. Projects and role permissions it builds on are in place.",
    useToday: [{ route: "proposals", label: "Proposals awaiting review" }],
  },
  "proposal-templates": {
    icons: [Palette, FileText, Image],
    headline: "Branded proposal templates are coming",
    pitch: "Design proposals that look like your company: your logo, colours, sections, warranty, payment terms and signature.",
    capabilities: [
      "Section blocks you can reorder and hide — cover, system summary, BOQ, savings, ROI, terms",
      "Theme: logo, brand colours, fonts, table style, header and footer",
      "Variables like {{customer_name}} and {{system_capacity}} filled from the project",
      "Live preview, then PDF, secure link, WhatsApp or email",
    ],
    dependsOn: "A proposal-template model and a PDF renderer. Today exports use one fixed layout; your logo and details in Settings appear in the app but not yet on exported proposals.",
    useToday: [{ route: "settings", label: "Set company branding" }, { route: "proposals", label: "Export a proposal" }],
  },
  reports: {
    icons: [BarChart3, PieChart, TrendingUp],
    headline: "Reports are coming",
    pitch: "Understand your pipeline: capacity quoted, conversion, average ₹/kW and team performance.",
    capabilities: [
      "Quoted vs won capacity (kW) and value over time",
      "Proposal conversion and time-to-approval",
      "Template and brand usage by capacity range",
    ],
    dependsOn: "Proposal outcome tracking (sent, viewed, accepted) — not built yet. Projects and capacity data it reports on are in place.",
    useToday: [{ route: "dashboard", label: "Proposal activity on the dashboard" }],
  },
};

const actionBtn =
  "h-9 px-3.5 inline-flex items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--hover-bg)] cursor-pointer";

export default function PlannedModule({ route, onGo }: { route: PlannedRoute; onGo: (r: AppRoute) => void }) {
  const c = CONTENT[route];
  return (
    <div className="space-y-6">
      <EmptyState
        icons={c.icons}
        title={c.headline}
        description={
          <>
            <span className="inline-flex mb-2"><StatusPill status="planned" /></span>
            <br />
            {c.pitch}
          </>
        }
      >
        {c.useToday.map((u) => (
          <button key={u.route} type="button" className={actionBtn} onClick={() => onGo(u.route)}>
            {u.label} <ArrowRight className="w-4 h-4 text-[var(--text-muted)]" />
          </button>
        ))}
      </EmptyState>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="glass-panel rounded-2xl p-6 lg:col-span-2">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">What {ROUTES[route].label} will do</h3>
          <ul className="mt-4 space-y-3">
            {c.capabilities.map((cap) => (
              <li key={cap} className="flex items-start gap-3 text-sm text-[var(--text-secondary)]">
                <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-[var(--solar-text)]" aria-hidden />
                {cap}
              </li>
            ))}
          </ul>
        </section>
        <section className="glass-panel rounded-2xl p-6">
          <h3 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
            <Construction className="w-4 h-4 text-[var(--text-muted)]" aria-hidden /> Needs first
          </h3>
          <p className="mt-3 text-sm text-[var(--text-muted)] leading-relaxed">{c.dependsOn}</p>
        </section>
      </div>
    </div>
  );
}
