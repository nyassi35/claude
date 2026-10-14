import { loadInvestigation } from "@/lib/investigation-context";
import { can } from "@/lib/auth/permissions";
import { IshikawaEditor } from "@/components/rca/IshikawaEditor";
import type { Ishikawa } from "@/lib/rca/methods";

export default async function IshikawaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await loadInvestigation(id);
  const a = d.analyses.find((x) => x.method === "ishikawa");
  const readOnly = !can(d.s.role, "analysis.edit") || ["closed", "cancelled"].includes(d.investigation.status);
  return <IshikawaEditor invId={id} initial={(a?.data as Ishikawa) ?? null} readOnly={readOnly} defaultEffect={d.investigation.title} hints={d.template.fishboneHints} />;
}
