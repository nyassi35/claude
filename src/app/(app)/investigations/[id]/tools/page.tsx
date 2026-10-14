import Link from "next/link";
import { loadInvestigation } from "@/lib/investigation-context";
import { METHOD_CATALOG } from "@/lib/rca/catalog";
import { recommendMethods } from "@/lib/ai/engine";
import { Badge, StatusBadge } from "@/components/ui";

const CORE: Record<string, string> = { five_whys: "five-whys", ishikawa: "ishikawa", fmea: "fmea", dmaic: "dmaic", capa: "capa" };

export default async function ToolsIndex({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await loadInvestigation(id);
  const recs = new Map(recommendMethods(d).map((r) => [r.method, r]));
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {METHOD_CATALOG.map((m) => {
        const a = d.analyses.find((x) => x.method === m.key);
        const rec = recs.get(m.key);
        return (
          <Link key={m.key} href={`/investigations/${id}/${CORE[m.key] ?? `tools/${m.key}`}`} className="card block p-4 transition hover:border-brand-400">
            <div className="flex items-start justify-between gap-2">
              <p className="font-medium text-slate-900">{m.name}</p>
              <div className="flex gap-1">{rec && <Badge color={rec.priority === "recommended" ? "blue" : "slate"}>{rec.priority}</Badge>}{a && <StatusBadge value={a.status} />}</div>
            </div>
            <p className="mt-1 text-xs text-slate-600"><span className="font-semibold">When:</span> {m.whenUseful}</p>
            {rec && <p className="mt-1 text-xs text-brand-700">{rec.reason}</p>}
          </Link>
        );
      })}
    </div>
  );
}
