import { loadInvestigation } from "@/lib/investigation-context";
import { can } from "@/lib/auth/permissions";
import { Card } from "@/components/ui";
import { RiskForm } from "@/components/forms/RiskForm";

export default async function RiskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await loadInvestigation(id);
  const closed = ["closed", "cancelled"].includes(d.investigation.status);
  return (
    <Card title="Risk and impact assessment">
      <RiskForm inv={d.investigation} mode="page" currency={d.s.settings.currency} readOnly={closed || !can(d.s.role, "analysis.edit")} />
    </Card>
  );
}
