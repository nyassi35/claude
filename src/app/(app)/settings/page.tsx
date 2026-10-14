import { requireSession } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { listMembers, listPlants } from "@/lib/services/admin";
import { MembersPanel, OrgSettingsForm, PlantsPanel } from "@/components/forms/SettingsForms";
import { Alert } from "@/components/ui";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const s = await requireSession();
  const [members, ref] = await Promise.all([listMembers(s), listPlants(s)]);
  return (
    <div className="space-y-4">
      {!can(s.role, "settings.manage") && <Alert kind="info">Only administrators can change organization settings, users and templates.</Alert>}
      <OrgSettingsForm name={s.orgName} settings={s.settings} canEdit={can(s.role, "settings.manage")} />
      <MembersPanel demo={s.mode === "demo"} currentUserId={s.user.id} canManage={can(s.role, "users.manage")} members={members.map((m) => ({ id: m.id, user_id: m.user_id, role: m.role, name: m.profile?.full_name ?? m.user_id, email: m.profile?.email ?? "" }))} />
      <PlantsPanel plants={ref.plants} lines={ref.lines} canManage={can(s.role, "plants.manage")} />
      <Alert kind="info" title="Backup & recovery">
        In Supabase, enable Point-in-Time Recovery (Pro plan) or schedule <code>pg_dump</code> backups; store evidence-bucket backups separately. See README → Backup and recovery.
      </Alert>
    </div>
  );
}
