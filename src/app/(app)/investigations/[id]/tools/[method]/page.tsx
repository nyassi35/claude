import { notFound } from "next/navigation";
import { loadInvestigation } from "@/lib/investigation-context";
import { can } from "@/lib/auth/permissions";
import { METHOD_CATALOG } from "@/lib/rca/catalog";
import { Card } from "@/components/ui";
import { TableTool } from "@/components/rca/TableTool";
import { TABLE_TOOLS } from "@/lib/rca/table-tools";
import { BowtieTool, CeMatrixTool, FaultTreeTool, ParetoTool } from "@/components/rca/SpecialTools";
import { ComparativeTool, SpcTool, TrendTool } from "@/components/rca/DataTools";

export default async function ToolPage({ params }: { params: Promise<{ id: string; method: string }> }) {
  const { id, method } = await params;
  const info = METHOD_CATALOG.find((m) => m.key === method);
  if (!info) notFound();
  const d = await loadInvestigation(id);
  const readOnly = !can(d.s.role, "analysis.edit") || ["closed", "cancelled"].includes(d.investigation.status);
  const data = (d.analyses.find((x) => x.method === method)?.data ?? null) as never;
  let body: React.ReactNode = null;
  if (TABLE_TOOLS[method]) body = <TableTool invId={id} method={method} initial={data} readOnly={readOnly} />;
  else if (method === "pareto") body = <ParetoTool invId={id} initial={data} readOnly={readOnly} />;
  else if (method === "fault_tree") body = <FaultTreeTool invId={id} initial={data} readOnly={readOnly} />;
  else if (method === "ce_matrix") body = <CeMatrixTool invId={id} initial={data} readOnly={readOnly} />;
  else if (method === "bowtie") body = <BowtieTool invId={id} initial={data} readOnly={readOnly} />;
  else if (method === "trend") body = <TrendTool invId={id} measurements={d.measurements} initial={data} readOnly={readOnly} />;
  else if (method === "spc") body = <SpcTool invId={id} measurements={d.measurements} initial={data} readOnly={readOnly} />;
  else if (method === "comparative") body = <ComparativeTool invId={id} measurements={d.measurements} initial={data} readOnly={readOnly} />;
  else notFound();
  return (
    <div className="space-y-4">
      <Card title={info.name}>
        <dl className="grid gap-3 text-sm md:grid-cols-4">
          <div><dt className="label">When useful</dt><dd>{info.whenUseful}</dd></div>
          <div><dt className="label">Input required</dt><dd>{info.inputs}</dd></div>
          <div><dt className="label">How it works</dt><dd>{info.how}</dd></div>
          <div><dt className="label">Output</dt><dd>{info.output}</dd></div>
        </dl>
      </Card>
      {body}
    </div>
  );
}
