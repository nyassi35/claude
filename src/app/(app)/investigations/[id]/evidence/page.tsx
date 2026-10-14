import { loadInvestigation } from "@/lib/investigation-context";
import { can } from "@/lib/auth/permissions";
import { EvidencePanel } from "@/components/investigation/EvidencePanel";

export default async function EvidencePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await loadInvestigation(id);
  return (
    <EvidencePanel
      invId={id}
      evidence={d.evidence}
      timeline={d.timeline}
      measurements={d.measurements}
      canAdd={can(d.s.role, "evidence.add")}
      canManage={can(d.s.role, "evidence.manage")}
      userId={d.s.user.id}
      closed={["closed", "cancelled"].includes(d.investigation.status)}
    />
  );
}
