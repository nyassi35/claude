import { NextResponse, type NextRequest } from "next/server";
import { loadStore } from "@/lib/db/demo-driver";
import { buildDemoStore } from "@/lib/seed/demo-data";
import { demoModeAllowed, isDemoMode } from "@/lib/supabase/config";
import { ACTIVE_ORG_COOKIE, DEMO_USER_COOKIE } from "@/lib/auth/session";

/** Demo-mode sign-in / sign-out. Disabled whenever Supabase is configured. */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const action = form.get("action");
  const res = NextResponse.redirect(new URL(action === "logout" ? "/login" : "/dashboard", req.url), 303);
  if (action === "logout") {
    res.cookies.delete(DEMO_USER_COOKIE);
    res.cookies.delete(ACTIVE_ORG_COOKIE);
    return res;
  }
  if (!isDemoMode() || !demoModeAllowed()) return NextResponse.json({ error: "Demo mode is disabled" }, { status: 403 });
  const store = loadStore(buildDemoStore);
  const user = store.users.find((u) => u.id === form.get("user_id"));
  if (!user) return NextResponse.json({ error: "Unknown demo user" }, { status: 400 });
  res.cookies.set(DEMO_USER_COOKIE, user.id, { httpOnly: true, sameSite: "lax", path: "/", secure: process.env.NODE_ENV === "production" });
  res.cookies.delete(ACTIVE_ORG_COOKIE);
  return res;
}
