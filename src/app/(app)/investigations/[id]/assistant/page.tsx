import { loadInvestigation } from "@/lib/investigation-context";
import { can } from "@/lib/auth/permissions";
import { AssistantPanel } from "@/components/investigation/AssistantPanel";

export default async function AssistantPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await loadInvestigation(id);
  const open = !["closed", "cancelled"].includes(d.investigation.status);
  return <AssistantPanel invId={id} canRun={can(d.s.role, "ai.use")} canAddCauses={open && can(d.s.role, "analysis.edit")} />;
}
