// scripts/seedAdmin.ts
// Break-glass: grant a Google account access to an organization when no
// admin can do it from the Team page (e.g. the only admin lost access).
// Access is a membership (organization_memberships, migration 0015), so this
// needs to know WHICH company.
//
// Usage: npx tsx scripts/seedAdmin.ts <email> <name> [roleKey] [organizationId]
//   roleKey: a built-in role (owner, admin, sales_manager, …) — default owner.
//   organizationId may be omitted only while exactly one organization exists.
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import { getSupabase } from "../src/services/supabaseClient";
import { SYSTEM_ROLES, systemRole } from "../src/permissions";

async function main() {
  const [rawEmail, name, role = "owner", orgArg] = process.argv.slice(2);
  const email = rawEmail?.trim().toLowerCase();
  if (!email || !name) {
    console.error("Usage: npx tsx scripts/seedAdmin.ts <email> <name> [roleKey] [organizationId]");
    process.exit(1);
  }
  if (!systemRole(role)) {
    console.error(`Invalid role "${role}" — use one of: ${SYSTEM_ROLES.map((r) => r.key).join(", ")}.`);
    process.exit(1);
  }
  const sb = getSupabase();

  let organizationId = orgArg;
  if (!organizationId) {
    const { data: orgs, error } = await sb.from("organizations").select("id, name");
    if (error) throw error;
    if (orgs?.length !== 1) {
      console.error(`There are ${orgs?.length ?? 0} organizations — pass the organizationId explicitly:`);
      for (const o of orgs ?? []) console.error(`  ${o.id}  ${o.name}`);
      process.exit(1);
    }
    organizationId = orgs[0].id;
  }

  const { data: user, error: userErr } = await sb
    .from("users")
    .upsert({ email, name, updated_at: new Date().toISOString() }, { onConflict: "email" })
    .select("id, email, name")
    .single();
  if (userErr) throw userErr;

  const { error: memberErr } = await sb
    .from("organization_memberships")
    .upsert(
      { organization_id: organizationId, user_id: user.id, role, custom_role_id: null, is_active: true, updated_at: new Date().toISOString() },
      { onConflict: "organization_id,user_id" },
    );
  if (memberErr) throw memberErr;

  console.log(`Seeded ${user.email} as ${role} in organization ${organizationId}`);
}

main().catch((err) => {
  console.error("Failed:", err.message);
  process.exit(1);
});
