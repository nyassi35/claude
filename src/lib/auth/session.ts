import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createDemoDriver, loadStore } from "@/lib/db/demo-driver";
import { createSupabaseDriver } from "@/lib/db/supabase-driver";
import { scopedDb, type ScopedDb } from "@/lib/db/scoped";
import type { Driver } from "@/lib/db/types";
import { buildDemoStore } from "@/lib/seed/demo-data";
import { demoModeAllowed, isDemoMode } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DEFAULT_ORG_SETTINGS, type OrgSettings, type Role } from "@/lib/types";

export const DEMO_USER_COOKIE = "rc_demo_user";
export const ACTIVE_ORG_COOKIE = "rc_org";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
}
export interface OrgMembership {
  org_id: string;
  org_name: string;
  role: Role;
}
export interface Session {
  mode: "demo" | "supabase";
  user: SessionUser;
  memberships: OrgMembership[];
  orgId: string;
  orgName: string;
  role: Role;
  settings: OrgSettings;
  db: ScopedDb;
  driver: Driver;
}

type Base = { mode: "demo" | "supabase"; user: SessionUser; memberships: OrgMembership[]; driver: Driver };

async function loadBase(): Promise<Base | null> {
  const jar = await cookies();
  if (isDemoMode()) {
    if (!demoModeAllowed()) return null;
    const store = loadStore(buildDemoStore);
    const uid = jar.get(DEMO_USER_COOKIE)?.value;
    const u = store.users.find((x) => x.id === uid);
    if (!u) return null;
    const memberships = store.tables.memberships
      .filter((m) => m.user_id === u.id)
      .map((m) => ({ org_id: m.org_id as string, role: m.role as Role, org_name: store.organizations.find((o) => o.id === m.org_id)?.name ?? "Organization" }));
    return { mode: "demo", user: { id: u.id, email: u.email, name: u.full_name }, memberships, driver: createDemoDriver(() => u.id) };
  }
  const sb = await createSupabaseServerClient();
  const { data, error } = await sb.auth.getUser();
  if (error || !data.user) return null;
  const { data: mem } = await sb.from("memberships").select("org_id, role, organizations(name)").eq("user_id", data.user.id);
  const memberships = (mem ?? []).map((m) => ({
    org_id: m.org_id as string,
    role: m.role as Role,
    org_name: ((m as unknown as { organizations: { name: string } | null }).organizations?.name) ?? "Organization",
  }));
  const meta = data.user.user_metadata as { full_name?: string } | undefined;
  return {
    mode: "supabase",
    user: { id: data.user.id, email: data.user.email ?? "", name: meta?.full_name || data.user.email || "User" },
    memberships,
    driver: createSupabaseDriver(sb),
  };
}

/** Current session or null. Cached per request. */
export const getSession = cache(async (): Promise<Session | null> => {
  const base = await loadBase();
  if (!base || !base.memberships.length) return null;
  const jar = await cookies();
  const wanted = jar.get(ACTIVE_ORG_COOKIE)?.value;
  const active = base.memberships.find((m) => m.org_id === wanted) ?? base.memberships[0];
  const org = await base.driver.getOrganization(active.org_id);
  return {
    ...base,
    orgId: active.org_id,
    orgName: org?.name ?? active.org_name,
    role: active.role,
    settings: { ...DEFAULT_ORG_SETTINGS, ...((org?.settings as Partial<OrgSettings>) ?? {}) },
    db: scopedDb(base.driver, active.org_id),
  };
});

/** Signed-in user regardless of org membership (for onboarding). */
export const getAuthUser = cache(async () => loadBase());

export async function requireSession(): Promise<Session> {
  const s = await getSession();
  if (s) return s;
  const base = await getAuthUser();
  if (base && !base.memberships.length) redirect("/onboarding");
  redirect("/login");
}
