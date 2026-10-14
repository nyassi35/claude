import { createDemoDriver, setStore } from "@/lib/db/demo-driver";
import { scopedDb } from "@/lib/db/scoped";
import { buildDemoStore, DEMO_USERS } from "@/lib/seed/demo-data";
import type { Ctx } from "@/lib/services/context";
import { DEFAULT_ORG_SETTINGS, type Role } from "@/lib/types";

process.env.DEMO_STORE_PATH = ":memory:";

/** Fresh in-memory demo store for each test. */
export function resetStore() {
  const s = buildDemoStore();
  setStore(s);
  return s;
}

export function ctxFor(email: string): Ctx {
  const u = DEMO_USERS.find((x) => x.email === email)!;
  const driver = createDemoDriver(() => u.id);
  return { user: { id: u.id, email: u.email, name: u.full_name }, role: u.role as Role, orgId: u.org, settings: { ...DEFAULT_ORG_SETTINGS }, db: scopedDb(driver, u.org), driver };
}

export const as = {
  admin: () => ctxFor("admin@northwind.example"),
  manager: () => ctxFor("manager@northwind.example"),
  engineer: () => ctxFor("engineer@northwind.example"),
  operator: () => ctxFor("operator@northwind.example"),
  reviewer: () => ctxFor("reviewer@northwind.example"),
  viewer: () => ctxFor("viewer@northwind.example"),
  other: () => ctxFor("qa@contoso.example"),
};
