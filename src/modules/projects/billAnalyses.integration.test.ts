// src/modules/projects/billAnalyses.integration.test.ts
// Run with: npx tsx src/modules/projects/billAnalyses.integration.test.ts
//
// End-to-end over HTTP against the real route handlers and the EnergyBae DEV
// database (.env.local): a C&I analysis, handed over exactly as
// CommercialBillAnalysis's onResult produces it, is
//   1. saved standalone,
//   2. saved to an existing project,
//   3. linked to a NEW project created from the bill,
//   4. used to start a new solar system,
// plus tenant isolation and permission checks. Only the session cookie is
// stubbed (the user/org/permissions requireAuth would resolve).
//
// Refuses to run against any database but Dev. Cleans up by the exact ids it
// created — never by a filter.
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import dotenv from "dotenv";
import express from "express";
import { getSupabase } from "../../services/supabaseClient";
import type { RequestUser } from "../../services/authMiddleware";
import { ALL_PERMISSIONS, SYSTEM_ROLES } from "../../permissions";
import { registerProjectRoutes } from "./projectsApi";
import { registerCustomerRoutes } from "./customersApi";
import { billCustomerType, billToSystemInput } from "./billAnalysisRules";
import { buildBlankCommercialBillData } from "../commercial/types";
import { DEFAULT_SIZING } from "../commercial/commercialCalculations";
import { analyseCommercial } from "../commercial/consumptionSizing";
import type { CommercialAnalysisResult } from "../commercial/CommercialBillAnalysis";

dotenv.config({ path: ".env.local" });
const DEV_PROJECT = "pafvngnhupxjegbvflcx";
if (!process.env.SUPABASE_URL?.includes(DEV_PROJECT)) {
  console.error(`Refusing to run: SUPABASE_URL is not the EnergyBae Dev project (${DEV_PROJECT}).`);
  process.exit(1);
}

let passed = 0;
function check(label: string, actual: unknown, expected: unknown) {
  assert.deepEqual(actual, expected, `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  passed++;
  console.log(`  ok — ${label}`);
}

const sb = getSupabase();
const perms = (key: string) => SYSTEM_ROLES.find((r) => r.key === key)!.permissions;

// ── a realistic LT TOD bill, as the C&I screen hands it up ────────────────
const bill = buildBlankCommercialBillData();
const result: CommercialAnalysisResult = {
  data: {
    ...bill,
    consumerName: "ZZ-IT Shree Industries",
    consumerNo: "170850070400",
    address: "Plot 12, MIDC Bhosari, Pune",
    connectionType: "LT",
    category: "Industrial",
    fixedCharges: 500,
    sanctionedLoad: 200,
    sanctionedLoadUnit: "HP",
    billingMonth: "Sep-2026",
    activeKwh: 5000,
    billingHistoryUnit: "kVAh",
    billingHistory: Array.from({ length: 12 }, (_, i) => ({ monthLabel: `M${i + 1}`, units: 5000, billAmount: 60000 })),
    todSlots: [{ slot: "A", units: 1000 }, { slot: "B", units: 2000 }, { slot: "C", units: 1500 }, { slot: "D", units: 500 }],
    filename: "zz-it-bill.pdf",
  },
  ...DEFAULT_SIZING,
};
// What the C&I screen itself shows (its "Derived calculations" block).
const screen = analyseCommercial([{ data: result.data, sourceId: result.data.filename }], result).pipeline;

const created = { bills: [] as string[], systems: [] as string[], projects: [] as string[], customers: [] as string[], orgB: null as string | null };

async function main() {
  const { data: orgRow } = await sb.from("organizations").select("id").limit(1).single();
  const orgA = orgRow!.id as string;
  const { data: member } = await sb.from("organization_memberships").select("user_id").eq("organization_id", orgA).limit(1).single();
  const userId = member!.user_id as string;
  const { data: orgBRow, error: orgBErr } = await sb.from("organizations").insert({ name: "ZZ-IT Other Company" }).select("id").single();
  if (orgBErr) throw orgBErr;
  created.orgB = orgBRow.id;

  let as: RequestUser = { sub: userId, email: "it@test", name: "IT", org: orgA, role: "owner", permissions: [...ALL_PERMISSIONS] };
  const asRole = (role: string, org = orgA, permissions = perms(role)) => { as = { ...as, role, org, permissions }; };

  const app = express();
  app.use(express.json({ limit: "5mb" }));
  app.use((req, _res, next) => { (req as any).user = as; next(); });
  registerCustomerRoutes(app);
  registerProjectRoutes(app);
  const server = app.listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const call = async (method: string, path: string, body?: unknown) => {
    const res = await fetch(base + path, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, json: (await res.json().catch(() => ({}))) as any };
  };
  const ciBody = (extra: object = {}) => ({ category: "commercial", source_file_name: result.data.filename, data: result, ...extra });

  try {
    // ── 1. standalone ──────────────────────────────────────────────────
    asRole("sales_executive");
    const solo = await call("POST", "/api/bill-analyses", ciBody({ recommended_kw: 999 }));
    check("standalone save works with no project", [solo.status, solo.json.billAnalysis?.project_id], [200, null]);
    created.bills.push(solo.json.billAnalysis.id);
    const b1 = solo.json.billAnalysis;
    check("server kW = the C&I screen's theoretical energy-based kWp", b1.recommended_kw, Math.round(screen.fullKwp * 1000) / 1000);
    check("golden: 5000 kWh × 12 ÷ 1400, no margin, TOD proxy ignored → 71 × 600 W = 42.6 kW", b1.recommended_kw, 42.6);
    check("client-sent recommendation ignored", b1.recommended_kw !== 999, true);
    check("avg units = active kWh (history kVAh not used)", b1.avg_monthly_units, 5000);
    check("consumer fields picked from the C&I bill", [b1.consumer_name, b1.consumer_number, b1.sanctioned_load_kw, b1.category], ["ZZ-IT Shree Industries", "170850070400", 149.2, "commercial"]);
    check("C&I snapshot stored intact", [b1.data.data.todSlots.length, b1.data.data.billingHistory.length, b1.data.panelWatt], [4, 12, 600]);
    const soloList = await call("GET", "/api/bill-analyses?standalone=true");
    check("listed as standalone", soloList.json.billAnalyses.some((b: any) => b.id === b1.id && b.project === null), true);

    // ── 2. save to an existing project ─────────────────────────────────
    const cust = await call("POST", "/api/customers", { name: "ZZ-IT Existing Customer", customer_type: "COMMERCIAL" });
    created.customers.push(cust.json.customer.id);
    const proj = await call("POST", "/api/projects", { customer_id: cust.json.customer.id, name: "ZZ-IT Existing Project" });
    created.projects.push(proj.json.project.id);
    const linked = await call("POST", "/api/bill-analyses", ciBody({ project_id: proj.json.project.id }));
    created.bills.push(linked.json.billAnalysis.id);
    check("saved to an existing project", [linked.status, linked.json.billAnalysis.project_id], [200, proj.json.project.id]);
    const detail = await call("GET", `/api/projects/${proj.json.project.id}`);
    check("project detail lists the bill", detail.json.billAnalyses.map((b: any) => b.id), [linked.json.billAnalysis.id]);

    // ── 3. new project created from the C&I analysis ───────────────────
    const seedType = billCustomerType("commercial", result.data.category);
    check("bill seeds an Industrial customer", seedType, "INDUSTRIAL");
    const newCust = await call("POST", "/api/customers", { name: result.data.consumerName, address: result.data.address, customer_type: seedType });
    created.customers.push(newCust.json.customer.id);
    const newProj = await call("POST", "/api/projects", { customer_id: newCust.json.customer.id, name: "ZZ-IT Rooftop 2026", site_address: result.data.address });
    created.projects.push(newProj.json.project.id);
    const link = await call("PATCH", `/api/bill-analyses/${b1.id}`, { project_id: newProj.json.project.id });
    check("standalone bill linked to the new project", [link.status, link.json.billAnalysis.project_id], [200, newProj.json.project.id]);

    // ── 4. start a new solar system from it ────────────────────────────
    const sys = await call("POST", `/api/projects/${newProj.json.project.id}/systems`, billToSystemInput(link.json.billAnalysis));
    created.systems.push(sys.json.system.id);
    check("system prefilled from the C&I analysis", [sys.status, sys.json.system.capacity_kw, sys.json.system.panel_wp, sys.json.system.phase, sys.json.system.name], [200, 42.6, 600, null, "Meter 170850070400"]);

    // ── tenant isolation (another company, full permissions) ───────────
    asRole("owner", created.orgB!, [...ALL_PERMISSIONS]);
    const otherList = await call("GET", "/api/bill-analyses");
    check("other company sees none of these bills", otherList.json.billAnalyses.filter((b: any) => created.bills.includes(b.id)), []);
    check("other company can't attach a bill to our project", (await call("POST", "/api/bill-analyses", ciBody({ project_id: proj.json.project.id }))).status, 404);
    check("other company can't relink our bill", (await call("PATCH", `/api/bill-analyses/${b1.id}`, { project_id: null })).status, 404);
    check("other company can't delete our bill", (await call("DELETE", `/api/bill-analyses/${b1.id}`)).status, 404);
    check("other company can't read our project's bills", (await call("GET", `/api/projects/${proj.json.project.id}`)).status, 404);

    // ── permissions ────────────────────────────────────────────────────
    asRole("engineering"); // bill_analysis.view only
    check("view-only role can't save", (await call("POST", "/api/bill-analyses", ciBody())).status, 403);
    asRole("sales_executive"); // no bill_analysis.delete
    check("sales executive can't delete", (await call("DELETE", `/api/bill-analyses/${b1.id}`)).status, 403);
    asRole("custom", orgA, ["bill_analysis.create"]); // can save bills, can't see projects
    check("linking needs project.view", (await call("POST", "/api/bill-analyses", ciBody({ project_id: proj.json.project.id }))).status, 403);
    const noProj = await call("POST", "/api/bill-analyses", ciBody());
    created.bills.push(noProj.json.billAnalysis?.id);
    check("…but standalone save still works", noProj.status, 200);
    check("relinking needs bill_analysis.update", (await call("PATCH", `/api/bill-analyses/${b1.id}`, { project_id: null })).status, 403);

    // ── deleting a bill keeps the system made from it ──────────────────
    asRole("owner", orgA, [...ALL_PERMISSIONS]);
    check("bad project id rejected", (await call("PATCH", `/api/bill-analyses/${b1.id}`, { project_id: 42 })).status, 400);
    check("owner deletes the bill", (await call("DELETE", `/api/bill-analyses/${b1.id}`)).status, 200);
    created.bills = created.bills.filter((id) => id !== b1.id);
    const after = await call("GET", `/api/projects/${newProj.json.project.id}`);
    check("system survives its bill", [after.json.systems.length, after.json.billAnalyses.length], [1, 0]);
  } finally {
    server.close();
    // Exact ids only, children first.
    const ids = (a: (string | undefined)[]) => a.filter(Boolean) as string[];
    if (ids(created.bills).length) await sb.from("bill_analyses").delete().in("id", ids(created.bills));
    if (created.systems.length) await sb.from("project_systems").delete().in("id", created.systems);
    if (created.projects.length) await sb.from("projects").delete().in("id", created.projects);
    if (created.customers.length) await sb.from("customers").delete().in("id", created.customers);
    if (created.orgB) await sb.from("organizations").delete().eq("id", created.orgB);
  }
  console.log(`\n${passed} passed`);
}

main().catch((e) => { console.error(e); process.exit(1); });
