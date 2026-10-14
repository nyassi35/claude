import { loadInvestigation } from "@/lib/investigation-context";
import { can } from "@/lib/auth/permissions";
import { ControlPlanEditor } from "@/components/investigation/ControlPlanEditor";

export default async function ControlPlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await loadInvestigation(id);
  return <ControlPlanEditor invId={id} rows={d.controlPlan} readOnly={!can(d.s.role, "analysis.edit") || ["closed", "cancelled"].includes(d.investigation.status)} />;
}
