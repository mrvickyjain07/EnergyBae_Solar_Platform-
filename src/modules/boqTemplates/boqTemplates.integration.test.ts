// src/modules/boqTemplates/boqTemplates.integration.test.ts
// Run with: npx tsx src/modules/boqTemplates/boqTemplates.integration.test.ts
//
// Phase 5C end-to-end over HTTP against the real route handlers and the
// EnergyBae DEV database (migration 0019 must be applied there). Uses two
// throwaway companies so the real Dev company is never touched; both are
// removed at the end via purge_boq_templates (the only path that may delete
// published versions). Only the session is stubbed (user / org / permissions).
// Refuses to run against any database but Dev.
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import dotenv from "dotenv";
import express from "express";
import { getSupabase } from "../../services/supabaseClient";
import type { RequestUser } from "../../services/authMiddleware";
import { ALL_PERMISSIONS, SYSTEM_ROLES } from "../../permissions";
import { registerBoqTemplateRoutes } from "./boqTemplatesApi";
import { DEFAULT_RANGES, LEGACY_SEED_DOCUMENT } from "./templateRules";

dotenv.config({ path: ".env.local" });
const DEV_PROJECT = "pafvngnhupxjegbvflcx";
if (!process.env.SUPABASE_URL?.includes(DEV_PROJECT)) {
  console.error(`Refusing to run: SUPABASE_URL is not the EnergyBae Dev project (${DEV_PROJECT}).`);
  process.exit(1);
}

let passed = 0;
function check(label: string, actual: unknown, expected: unknown) {
  assert.deepStrictEqual(actual, expected, `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  passed++;
  console.log(`  ok — ${label}`);
}
const sb = getSupabase();
const perms = (key: string) => SYSTEM_ROLES.find((r) => r.key === key)!.permissions;
const orgs: string[] = [];

async function main() {
  const { error: tableErr } = await sb.from("capacity_ranges").select("id").limit(1);
  if (tableErr) throw new Error(`Migration 0019 is not applied to Dev (${tableErr.message}).`);

  const { data: anyUser } = await sb.from("users").select("id").limit(1).single();
  const userId = anyUser!.id as string;
  for (const name of ["ZZ-5C Company A", "ZZ-5C Company B"]) {
    const { data, error } = await sb.from("organizations").insert({ name }).select("id").single();
    if (error) throw error;
    orgs.push(data.id);
  }
  const [orgA, orgB] = orgs;

  let as: RequestUser = { sub: userId, email: "it@test", name: "IT", org: orgA, role: "owner", permissions: [...ALL_PERMISSIONS] };
  const asRole = (role: string, org = orgA, permissions = perms(role)) => { as = { ...as, role, org, permissions }; };
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { (req as any).user = as; next(); });
  registerBoqTemplateRoutes(app);
  const server = app.listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const call = async (method: string, path: string, body?: unknown) => {
    const res = await fetch(base + path, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, json: (await res.json().catch(() => ({}))) as any };
  };

  try {
    // ── Seeding: each company gets its own copy on first use ──
    const listA = await call("GET", "/api/boq-templates");
    check("first read seeds the company", listA.status, 200);
    check("five default ranges, in order, with approved bounds", listA.json.ranges.map((r: any) => [r.label, Number(r.min_kw), r.max_kw === null ? null : Number(r.max_kw)]), DEFAULT_RANGES.map((r) => [r.label, r.min_kw, r.max_kw]));
    check("one default template per range, each v1 published", listA.json.templates.map((t: any) => [t.name, t.is_default, t.versions.map((v: any) => [v.version, v.status])]), DEFAULT_RANGES.map(() => ["Standard (current calculator)", true, [[1, "published"]]]));
    const seeded = await call("GET", `/api/boq-templates/${listA.json.templates[0].id}`);
    check("SQL seed document === LEGACY_SEED_DOCUMENT (templateRules.ts)", seeded.json.versions[0].definition, LEGACY_SEED_DOCUMENT);
    check("company defaults returned for inherited rates", typeof seeded.json.companyDefaults.installation, "number");
    const again = await call("GET", "/api/capacity-ranges");
    check("seeding is idempotent", again.json.ranges.length, 5);

    // ── Organization isolation ──
    asRole("owner", orgB, [...ALL_PERMISSIONS]);
    const listB = await call("GET", "/api/boq-templates");
    const idsA = new Set(listA.json.templates.map((t: any) => t.id));
    check("company B gets its own, separate copy", [listB.json.templates.length, listB.json.templates.some((t: any) => idsA.has(t.id))], [5, false]);
    const tA = listA.json.templates[0];
    const vA = seeded.json.versions[0];
    check("B can't read A's template", (await call("GET", `/api/boq-templates/${tA.id}`)).status, 404);
    check("B can't create a version of A's template", (await call("POST", `/api/boq-templates/${tA.id}/versions`)).status, 404);
    check("B can't edit A's version", (await call("PATCH", `/api/boq-template-versions/${vA.id}`, { definition: LEGACY_SEED_DOCUMENT })).status, 404);
    check("B can't publish A's version", (await call("POST", `/api/boq-template-versions/${vA.id}/publish`)).status, 404);
    check("B can't create a template in A's range", (await call("POST", "/api/boq-templates", { name: "x", capacity_range_id: tA.capacity_range_id })).status, 400);
    check("B can't patch A's template", (await call("PATCH", `/api/boq-templates/${tA.id}`, { name: "hijack" })).status, 404);
    const aRangesForB = listA.json.ranges.map((r: any) => ({ id: r.id, label: r.label, min_kw: Number(r.min_kw), max_kw: r.max_kw === null ? null : Number(r.max_kw) }));
    check("B can't rewrite A's ranges by id", (await call("PUT", "/api/capacity-ranges", { ranges: aRangesForB })).status, 400);

    // ── Capacity range CRUD + boundary validation ──
    asRole("owner", orgA, [...ALL_PERMISSIONS]);
    const ranges = listA.json.ranges.map((r: any) => ({ id: r.id, label: r.label, min_kw: Number(r.min_kw), max_kw: r.max_kw === null ? null : Number(r.max_kw) }));
    check("gap rejected by API", (await call("PUT", "/api/capacity-ranges", { ranges: ranges.map((r: any, i: number) => (i === 1 ? { ...r, min_kw: 7 } : r)) })).status, 400);
    check("non-open last range rejected", (await call("PUT", "/api/capacity-ranges", { ranges: ranges.map((r: any, i: number) => (i === 4 ? { ...r, max_kw: 500 } : r)) })).status, 400);
    check("removing a range that has templates is refused", (await call("PUT", "/api/capacity-ranges", { ranges: ranges.slice(0, 4).map((r: any, i: number) => (i === 3 ? { ...r, max_kw: null } : r)) })).status, 409);
    const renamed = await call("PUT", "/api/capacity-ranges", { ranges: [...ranges.slice(0, 4).map((r: any) => ({ ...r, label: r.label + " (Std)" })), { ...ranges[4], min_kw: 100, max_kw: 250 }, { label: "250+ kW", min_kw: 250, max_kw: null }] });
    check("rename + split last range (data-driven)", [renamed.status, renamed.json.ranges.length, renamed.json.ranges[5]?.label, Number(renamed.json.ranges[4]?.max_kw)], [200, 6, "250+ kW", 250]);
    const newRangeId = renamed.json.ranges[5].id;
    const shrunk = await call("PUT", "/api/capacity-ranges", { ranges: renamed.json.ranges.slice(0, 5).map((r: any, i: number) => ({ id: r.id, label: r.label, min_kw: Number(r.min_kw), max_kw: i === 4 ? null : Number(r.max_kw) })) });
    check("an unused range can be removed", [shrunk.status, shrunk.json.ranges.length, shrunk.json.ranges.some((r: any) => r.id === newRangeId)], [200, 5, false]);

    // ── Template CRUD ──
    const created = await call("POST", "/api/boq-templates", { name: "Premium On-Grid", capacity_range_id: tA.capacity_range_id, system_type: "On-Grid", panel_type: "DCR" });
    check("template created as draft v1 copied from the range default", [created.status, created.json.version.version, created.json.version.status, created.json.template.is_default], [200, 1, "draft", false]);
    check("copied definition equals the source's", created.json.version.definition, LEGACY_SEED_DOCUMENT);
    const tid = created.json.template.id;
    const did = created.json.version.id;
    check("bad metadata rejected", (await call("POST", "/api/boq-templates", { name: "", capacity_range_id: tA.capacity_range_id })).status, 400);
    check("unknown panel type rejected", (await call("POST", "/api/boq-templates", { name: "x", capacity_range_id: tA.capacity_range_id, panel_type: "Mono" })).status, 400);
    check("one open draft per template", (await call("POST", `/api/boq-templates/${tid}/versions`)).status, 409);

    // ── Draft editing: commercial + defaults persist ──
    const edited = structuredClone(LEGACY_SEED_DOCUMENT) as any;
    Object.assign(edited.commercial, { installationPerKw: 4000, liaisoningPerKw: 3500, transportPct: 3, profitPct: 14.9, gstPct: 8.9, quoteAdjustmentPerW: 2, quoteSequence: "approved-v1" });
    edited.commercial.insurance = { coverMultiplier: 1.2, factorA: 2, factorB: 7, fixedAmount: 0 };
    Object.assign(edited.defaults.cable, { dcSpareM: 10, acSpareM: 10 });
    Object.assign(edited.defaults.structure, { uClamps: 9, zClamps: 12, frontLegHeightFt: 7, backLegHeightFt: 9 });
    edited.defaults.earthing.type = "Conventional";
    edited.defaults.acdb.rule = "per_inverter";
    edited.notes = "Ashwini-style raised structure defaults";
    const saved = await call("PATCH", `/api/boq-template-versions/${did}`, { definition: edited });
    check("draft saved", saved.status, 200);
    const reread = await call("GET", `/api/boq-templates/${tid}`);
    check("commercial settings persisted", reread.json.versions[0].definition.commercial, edited.commercial);
    check("defaults persisted", reread.json.versions[0].definition.defaults, edited.defaults);
    check("invalid draft rejected", (await call("PATCH", `/api/boq-template-versions/${did}`, { definition: { ...edited, commercial: { ...edited.commercial, profitPct: 150 } } })).status, 400);
    check("unknown engine rejected", (await call("PATCH", `/api/boq-template-versions/${did}`, { definition: { ...edited, engine: { kind: "js", code: "x" } } })).status, 400);

    // ── Publish permissions ──
    asRole("sales_executive"); // boq_template.view only
    check("view-only role can read", (await call("GET", `/api/boq-templates/${tid}`)).status, 200);
    check("view-only role can't edit a draft", (await call("PATCH", `/api/boq-template-versions/${did}`, { definition: edited })).status, 403);
    check("view-only role can't publish", (await call("POST", `/api/boq-template-versions/${did}/publish`)).status, 403);
    check("view-only role can't change ranges", (await call("PUT", "/api/capacity-ranges", { ranges })).status, 403);
    asRole("custom", orgA, ["boq_template.view", "boq_template.update"]);
    check("update without publish can't publish", (await call("POST", `/api/boq-template-versions/${did}/publish`)).status, 403);
    check("update without delete can't archive", (await call("PATCH", `/api/boq-templates/${tid}`, { archived: true })).status, 403);

    // ── Publish → immutable ──
    asRole("engineering"); // has boq_template.publish
    const pub = await call("POST", `/api/boq-template-versions/${did}/publish`);
    check("engineering publishes; published_at / published_by recorded", [pub.status, pub.json.version.status, !!pub.json.version.published_at, pub.json.version.published_by], [200, "published", true, userId]);
    check("published version can't be edited (API)", (await call("PATCH", `/api/boq-template-versions/${did}`, { definition: LEGACY_SEED_DOCUMENT })).status, 409);
    check("published version can't be re-published", (await call("POST", `/api/boq-template-versions/${did}/publish`)).status, 409);
    const dbUpdate = await sb.from("boq_template_versions").update({ definition: {} }).eq("organization_id", orgA).eq("id", did);
    check("published version can't be edited (database trigger)", dbUpdate.error?.message.includes("immutable") ?? false, true);
    const dbDelete = await sb.from("boq_template_versions").delete().eq("organization_id", orgA).eq("id", did);
    check("published version can't be deleted (database trigger)", dbDelete.error?.message.includes("immutable") ?? false, true);
    const afterAttempts = await call("GET", `/api/boq-templates/${tid}`);
    check("published definition unchanged after all attempts", afterAttempts.json.versions[0].definition, edited);

    // ── Version numbering ──
    const v2 = await call("POST", `/api/boq-templates/${tid}/versions`);
    check("new version = v2 draft copied from v1", [v2.status, v2.json.version.version, v2.json.version.status, v2.json.version.definition], [200, 2, "draft", edited]);
    const dup = await sb.from("boq_template_versions").insert({ organization_id: orgA, template_id: tid, version: 2, status: "published", definition: edited, published_at: new Date().toISOString() });
    check("version numbers are unique per template (database)", dup.error?.code, "23505");
    const tweak = structuredClone(edited);
    tweak.commercial.profitPct = 15;
    await call("PATCH", `/api/boq-template-versions/${v2.json.version.id}`, { definition: tweak });
    await call("POST", `/api/boq-template-versions/${v2.json.version.id}/publish`);
    const v3 = await call("POST", `/api/boq-templates/${tid}/versions`);
    const hist = await call("GET", `/api/boq-templates/${tid}`);
    check("history: v3 draft, v2 and v1 published, v1 still has the old profit", [v3.json.version.version, hist.json.versions.map((v: any) => [v.version, v.status]), hist.json.versions[2].definition.commercial.profitPct], [3, [[3, "draft"], [2, "published"], [1, "published"]], 14.9]);

    // ── Default switching + archive ──
    asRole("owner", orgA, [...ALL_PERMISSIONS]);
    const mk = await call("PATCH", `/api/boq-templates/${tid}`, { is_default: true });
    const list2 = await call("GET", "/api/boq-templates");
    const defaultsInRange = list2.json.templates.filter((t: any) => t.capacity_range_id === tA.capacity_range_id && t.is_default).map((t: any) => t.id);
    check("making a template default unsets the previous default", [mk.status, defaultsInRange], [200, [tid]]);
    const arch = await call("PATCH", `/api/boq-templates/${tid}`, { archived: true });
    check("archiving keeps versions, clears default", [arch.status, !!arch.json.template.archived_at, arch.json.template.is_default], [200, true, false]);
    check("archived template can't get a new version", (await call("POST", `/api/boq-templates/${tid}/versions`)).status, 400);
    const company = await call("GET", "/api/boq-templates");
    const bUntouched = (await (async () => { asRole("owner", orgB, [...ALL_PERMISSIONS]); return call("GET", "/api/boq-templates"); })()).json;
    check("company B unaffected by all of A's changes", [bUntouched.ranges.map((r: any) => r.label), bUntouched.templates.length], [DEFAULT_RANGES.map((r) => r.label), 5]);
    check("company A sees its changes", company.json.templates.length, 6);
  } finally {
    server.close();
    for (const org of orgs) {
      const { error } = await sb.rpc("purge_boq_templates", { p_org: org });
      if (error) console.error("purge failed", error.message);
      await sb.from("organizations").delete().eq("id", org);
    }
  }
  console.log(`\n${passed} passed`);
}

main().catch((e) => { console.error(e); process.exit(1); });
