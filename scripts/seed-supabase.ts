/**
 * Seeds a Supabase project with the demonstration organizations, users and three industry
 * scenarios. Uses the SERVICE ROLE key (bypasses RLS) — run only from a trusted machine:
 *
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... DEMO_PASSWORD=... npm run seed:supabase
 *
 * Re-running is safe: existing demo users are reused and existing demo organizations are skipped.
 */
import { createClient } from "@supabase/supabase-js";
import { buildDemoStore, DEMO_USERS } from "../src/lib/seed/demo-data";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.DEMO_PASSWORD;
if (!url || !key || !password) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and DEMO_PASSWORD (min 10 chars).");
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false } });
const USER_FIELDS = ["owner_id", "created_by", "approved_by", "assignee_id", "closure_approved_by", "approver_id", "updated_by", "user_id"];
const ORDER = ["plants", "production_lines", "investigations", "timeline_events", "evidence", "measurements", "causes", "rca_analyses", "fmea_items", "capa_actions", "control_plan_items", "approvals"] as const;

async function main() {
  const store = buildDemoStore();
  const idMap = new Map<string, string>();
  const { data: existing } = await sb.auth.admin.listUsers({ perPage: 1000 });
  for (const u of DEMO_USERS) {
    const found = existing?.users.find((x) => x.email === u.email);
    if (found) idMap.set(u.id, found.id);
    else {
      const { data, error } = await sb.auth.admin.createUser({ email: u.email, password, email_confirm: true, user_metadata: { full_name: u.full_name } });
      if (error) throw error;
      idMap.set(u.id, data.user.id);
    }
  }
  const { data: orgs } = await sb.from("organizations").select("id").in("id", store.organizations.map((o) => o.id));
  if (orgs?.length) {
    console.log("Demo organizations already exist — users ensured, data not re-seeded.");
    return;
  }
  const remap = (row: Record<string, unknown>) => {
    const out = { ...row };
    for (const f of USER_FIELDS) if (typeof out[f] === "string" && idMap.has(out[f] as string)) out[f] = idMap.get(out[f] as string);
    delete out.rpn;
    delete out.revised_rpn;
    return out;
  };
  const { error: oe } = await sb.from("organizations").insert(store.organizations);
  if (oe) throw oe;
  const { error: me } = await sb.from("memberships").insert(store.tables.memberships.map(remap));
  if (me) throw me;
  for (const t of ORDER) {
    const rows = store.tables[t].map(remap);
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await sb.from(t).insert(rows.slice(i, i + 500));
      if (error) throw new Error(`${t}: ${error.message}`);
    }
    console.log(`seeded ${t}: ${rows.length}`);
  }
  console.log("Done. Sign in as e.g. engineer@northwind.example with DEMO_PASSWORD.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
