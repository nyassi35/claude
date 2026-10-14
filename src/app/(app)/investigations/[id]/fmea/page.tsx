import { loadInvestigation } from "@/lib/investigation-context";
import { can } from "@/lib/auth/permissions";
import { FmeaEditor } from "@/components/rca/FmeaEditor";

export default async function FmeaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await loadInvestigation(id);
  const readOnly = !can(d.s.role, "analysis.edit") || ["closed", "cancelled"].includes(d.investigation.status);
  return <FmeaEditor invId={id} rows={d.fmea} settings={d.s.settings} readOnly={readOnly} steps={d.template.processSteps} />;
}
