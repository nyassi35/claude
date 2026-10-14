import { Sidebar } from "@/components/shell/Sidebar";
import { can } from "@/lib/auth/permissions";
import { requireSession } from "@/lib/auth/session";
import { ROLE_LABELS } from "@/lib/types";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await requireSession();
  return (
    <div className="min-h-screen">
      <Sidebar
        user={{ name: s.user.name, email: s.user.email }}
        roleLabel={ROLE_LABELS[s.role]}
        orgId={s.orgId}
        orgs={s.memberships}
        mode={s.mode}
        canCreate={can(s.role, "investigation.create")}
      />
      <div className="lg:pl-64">
        {s.mode === "demo" && (
          <div className="no-print border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-center text-xs text-amber-900">
            Demo mode — data is stored locally in <code>.data/demo-store.json</code>. Configure Supabase for authentication and production use.
          </div>
        )}
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
