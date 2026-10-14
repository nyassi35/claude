import { loadInvestigation } from "@/lib/investigation-context";
import { CapaPanel } from "@/components/investigation/CapaPanel";
import { capaCtx } from "@/lib/capa-ctx";

export default async function CapaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await loadInvestigation(id);
  return <CapaPanel invId={id} actions={d.capa} causes={d.causes} ctx={capaCtx(d.s, d.members)} closed={["closed", "cancelled"].includes(d.investigation.status)} />;
}
