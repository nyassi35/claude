import { loadInvestigation } from "@/lib/investigation-context";
import { can } from "@/lib/auth/permissions";
import { DmaicWorkspace } from "@/components/rca/DmaicWorkspace";
import type { Dmaic } from "@/lib/rca/methods";

export default async function DmaicPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await loadInvestigation(id);
  const a = d.analyses.find((x) => x.method === "dmaic");
  const readOnly = !can(d.s.role, "analysis.edit") || ["closed", "cancelled"].includes(d.investigation.status);
  return <DmaicWorkspace invId={id} initial={(a?.data as Dmaic) ?? null} readOnly={readOnly} canApprove={can(d.s.role, "approval.sign") && can(d.s.role, "analysis.edit")} kpis={d.investigation.kpis} causes={d.causes} />;
}
