import { FileDown, FileSpreadsheet } from "lucide-react";
import { requireSession } from "@/lib/auth/session";
import { buildReport, REPORT_SECTIONS } from "@/lib/report/model";
import { reportInput } from "@/lib/report/input";
import { ReportView } from "@/components/report/ReportView";
import { PrintButton } from "@/components/report/PrintButton";
import { Card } from "@/components/ui";
import { loadInvestigation } from "@/lib/investigation-context";

export default async function ReportPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ s?: string | string[] }> }) {
  const { id } = await params;
  const sp = await searchParams;
  await loadInvestigation(id); // 404 for foreign ids
  const s = await requireSession();
  const chosen = sp.s ? ([] as string[]).concat(sp.s) : REPORT_SECTIONS.map((x) => x.key);
  const report = buildReport(await reportInput(s, id), chosen);
  const q = `sections=${chosen.join(",")}`;
  return (
    <div className="space-y-4">
      <Card title="Report contents" description="Choose which sections and analysis methods appear in the report, then download or print." className="no-print">
        <form method="get" className="space-y-3">
          <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
            {REPORT_SECTIONS.map((x) => (
              <label key={x.key} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="s" value={x.key} defaultChecked={chosen.includes(x.key)} /> {x.title}{x.method && <span className="text-xs text-slate-400">(method)</span>}
              </label>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50">Update preview</button>
            <a className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700" href={`/api/investigations/${id}/export?format=pdf&${q}`}><FileDown className="h-4 w-4" /> Download PDF</a>
            <a className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50" href={`/api/investigations/${id}/export?format=xlsx&${q}`}><FileSpreadsheet className="h-4 w-4" /> Excel (.xlsx)</a>
            <PrintButton />
            <span className="text-xs text-slate-500">CSV:</span>
            {["causes", "fmea", "capa", "evidence", "measurements", "timeline", "controlPlan"].map((t) => (
              <a key={t} className="text-xs text-brand-700 hover:underline" href={`/api/investigations/${id}/export?format=csv&table=${t}`}>{t}</a>
            ))}
          </div>
        </form>
      </Card>
      <ReportView {...report} />
    </div>
  );
}
