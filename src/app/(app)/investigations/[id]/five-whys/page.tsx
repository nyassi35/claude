import { loadInvestigation } from "@/lib/investigation-context";
import { can } from "@/lib/auth/permissions";
import { FiveWhysEditor } from "@/components/rca/FiveWhysEditor";
import type { FiveWhys } from "@/lib/rca/methods";

export default async function FiveWhysPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await loadInvestigation(id);
  const a = d.analyses.find((x) => x.method === "five_whys");
  const readOnly = !can(d.s.role, "analysis.edit") || ["closed", "cancelled"].includes(d.investigation.status);
  return <FiveWhysEditor invId={id} initial={(a?.data as FiveWhys) ?? null} readOnly={readOnly} defaultProblem={d.investigation.problem?.what_happened ?? d.investigation.title} />;
}
