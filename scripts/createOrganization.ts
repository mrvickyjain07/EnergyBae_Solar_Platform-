// scripts/createOrganization.ts
// Onboard a new vendor company: creates the organization and makes the given
// Google account its Owner. This is the onboarding path until self-serve
// signup exists (SaaS onboarding phase). The new company starts with an
// empty catalogue/price list — the app falls back to the built-in default
// catalogue until someone with catalogue.update saves prices.
//
// Usage: npx tsx scripts/createOrganization.ts "<Company name>" <ownerEmail> "<Owner name>"
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import { getSupabase } from "../src/services/supabaseClient";

async function main() {
  const [companyName, rawEmail, ownerName] = process.argv.slice(2);
  const email = rawEmail?.trim().toLowerCase();
  if (!companyName?.trim() || !email || !ownerName?.trim()) {
    console.error('Usage: npx tsx scripts/createOrganization.ts "<Company name>" <ownerEmail> "<Owner name>"');
    process.exit(1);
  }
  const sb = getSupabase();

  const { data: org, error: orgErr } = await sb.from("organizations").insert({ name: companyName.trim() }).select("id, name").single();
  if (orgErr) throw orgErr;

  // An existing identity (they already belong to another company) is reused as-is.
  let { data: user, error: findErr } = await sb.from("users").select("id").eq("email", email).maybeSingle();
  if (findErr) throw findErr;
  if (!user) {
    const { data: created, error: createErr } = await sb.from("users").insert({ email, name: ownerName.trim() }).select("id").single();
    if (createErr) throw createErr;
    user = created;
  }

  const { error: memberErr } = await sb.from("organization_memberships").insert({ organization_id: org.id, user_id: user!.id, role: "owner" });
  if (memberErr) throw memberErr;

  // The company's own editable copy of the default capacity ranges and BOQ
  // templates (migration 0019). The API would also seed on first use.
  const { error: seedErr } = await sb.rpc("seed_boq_templates", { p_org: org.id });
  if (seedErr) throw seedErr;

  console.log(`Created "${org.name}" (${org.id}); ${email} is its Owner.`);
}

main().catch((err) => {
  console.error("Failed:", err.message);
  process.exit(1);
});
