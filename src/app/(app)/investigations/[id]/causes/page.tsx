import { loadInvestigation } from "@/lib/investigation-context";
import { can } from "@/lib/auth/permissions";
import { CauseRegister } from "@/components/investigation/CauseRegister";

export default async function CausesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await loadInvestigation(id);
  return (
    <CauseRegister
      invId={id}
      causes={d.causes}
      evidence={d.evidence.map((e) => ({ id: e.id, title: e.title, verified: e.is_verified }))}
      canEdit={can(d.s.role, "analysis.edit")}
      canConfirm={can(d.s.role, "cause.confirm")}
      closed={["closed", "cancelled"].includes(d.investigation.status)}
      names={Object.fromEntries(d.members.map((m) => [m.user_id, m.profile?.full_name || m.profile?.email || ""]))}
    />
  );
}
