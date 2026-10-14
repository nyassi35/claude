import { Suspense } from "react";
import { AuthForm } from "@/components/auth/AuthForm";
import { Alert } from "@/components/ui";
import { loadStore } from "@/lib/db/demo-driver";
import { buildDemoStore } from "@/lib/seed/demo-data";
import { demoModeAllowed, isDemoMode } from "@/lib/supabase/config";
import { ROLE_LABELS, type Role } from "@/lib/types";

export const metadata = { title: "Sign in" };

export default function LoginPage() {
  if (!isDemoMode()) {
    return (
      <Suspense>
        <AuthForm mode="login" />
      </Suspense>
    );
  }
  if (!demoModeAllowed()) {
    return <Alert kind="error" title="Not configured">Supabase environment variables are missing and demo mode is disabled in production. See README → Supabase configuration.</Alert>;
  }
  const store = loadStore(buildDemoStore);
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Sign in (demo mode)</h1>
      <Alert kind="info">
        Supabase is not configured, so the app is running on a local demo store. Pick a user to explore each role. Configure Supabase (see README) to enable real authentication.
      </Alert>
      <div className="space-y-2">
        {store.users.map((u) => {
          const m = store.tables.memberships.find((x) => x.user_id === u.id);
          const org = store.organizations.find((o) => o.id === m?.org_id);
          return (
            <form key={u.id} action="/api/auth/demo" method="post">
              <input type="hidden" name="user_id" value={u.id} />
              <button type="submit" className="flex w-full items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-left hover:border-brand-400 hover:bg-brand-50" data-testid={`demo-login-${u.email}`}>
                <span>
                  <span className="block text-sm font-medium">{u.full_name}</span>
                  <span className="block text-xs text-slate-500">{u.email} · {org?.name}</span>
                </span>
                <span className="text-xs font-medium text-brand-700">{ROLE_LABELS[(m?.role as Role) ?? "viewer"]}</span>
              </button>
            </form>
          );
        })}
      </div>
    </div>
  );
}
