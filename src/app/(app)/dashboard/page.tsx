import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { dashboardData } from "@/lib/services/dashboard";
import { listPlants } from "@/lib/services/admin";
import { Badge, Card, EmptyState, PageHeader, Stat, StatusBadge } from "@/components/ui";
import { FilterBar } from "@/components/forms/FilterBar";
import { HBarChart, ParetoChart, SimpleLineChart, StackedCategoryChart } from "@/components/charts";
import { SIX_M_LABELS, type SixM } from "@/lib/types";
import { fmtDate, titleCase } from "@/lib/utils";
import { getBuiltinTemplate } from "@/lib/categories/engine";

export const metadata = { title: "Dashboard" };

export default async function Dashboard({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const s = await requireSession();
  const [d, ref] = await Promise.all([dashboardData(s, sp), listPlants(s)]);
  const k = d.kpis;
  return (
    <>
      <PageHeader title="Engineering dashboard" subtitle={`${s.orgName} — investigations, root causes, risk and CAPA performance`} />
      <FilterBar params={sp} plants={ref.plants} lines={ref.lines} extra />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-5">
        <Stat label="Total investigations" value={k.total} href="/investigations" />
        <Stat label="Open" value={k.open} tone="blue" sub={`${k.overdue} overdue`} href="/investigations?status=open" />
        <Stat label="Overdue investigations" value={k.overdue} tone={k.overdue ? "red" : "slate"} />
        <Stat label="Awaiting evidence" value={k.awaitingEvidence} tone={k.awaitingEvidence ? "amber" : "slate"} href="/investigations?status=awaiting_evidence" />
        <Stat label="Confirmed root causes" value={k.confirmedCauses} tone="green" />
        <Stat label="High-risk failure modes" value={k.highRiskFailureModes} tone={k.highRiskFailureModes ? "red" : "slate"} sub="RPN, severity or AP = H" />
        <Stat label="CAPA actions" value={k.capaTotal} sub={`${k.capaOverdue} overdue`} href="/capa" />
        <Stat label="CAPA completion" value={k.capaCompletionRate === null ? "—" : `${k.capaCompletionRate}%`} sub="effective or closed / all" />
        <Stat label="CAPA effectiveness" value={k.capaEffectivenessRate === null ? "—" : `${k.capaEffectivenessRate}%`} sub="effective / verified" tone="green" />
        <Stat label="Recurring problems" value={d.recurring.length} tone={d.recurring.length ? "amber" : "slate"} />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <Card title="Defect / failure Pareto" description="Aggregated from Pareto analyses in the filtered investigations">
          {d.defectPareto.length ? <ParetoChart rows={d.defectPareto} /> : <EmptyState title="No Pareto data yet">Add a Pareto analysis to an investigation.</EmptyState>}
        </Card>
        <Card title="Downtime trend" description="Hours per month from KPIs and downtime measurements">
          <SimpleLineChart data={d.trends} x="month" lines={[{ key: "downtime", name: "Downtime (h)" }]} unit="h" />
        </Card>
        <Card title="Investigations opened vs. closed" description="Per month">
          <SimpleLineChart data={d.trends} x="month" lines={[{ key: "opened", name: "Opened" }, { key: "closed", name: "Closed" }]} />
        </Card>
        <Card title="Root cause categories (6M)" description="Confirmed causes vs. open candidate causes">
          <StackedCategoryChart data={d.categoryDist.map((c) => ({ label: SIX_M_LABELS[c.category as SixM].split(" /")[0], confirmed: c.confirmed, candidate: c.candidate }))} />
        </Card>
        <Card title="Investigations by status">
          <HBarChart data={d.statusDist.map((x) => ({ label: titleCase(x.status), value: x.count }))} />
        </Card>
        <Card title="Recurring problems" description="Same category and problem type, or reported as a recurrence">
          {d.recurring.length ? (
            <ul className="divide-y divide-slate-100 text-sm">
              {d.recurring.map((r) => (
                <li key={r.key} className="py-2">
                  <p className="font-medium">{getBuiltinTemplate(r.category).name} — {titleCase(r.problemType)} <Badge color="amber">{r.count}×</Badge></p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {r.investigations.map((i, n) => <span key={i.id}>{n > 0 && ", "}<Link className="text-brand-700 hover:underline" href={`/investigations/${i.id}`}>{i.number}</Link></span>)}
                  </p>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-slate-500">No recurring problems detected.</p>}
        </Card>
        <Card title="High-risk failure modes" description={`RPN ≥ ${s.settings.rpn_threshold}, severity ≥ ${s.settings.severity_escalation}${s.settings.use_action_priority ? ", or Action Priority H" : ""}`}>
          {d.highRisk.length ? (
            <table className="table-base">
              <thead><tr><th>Investigation</th><th>Failure mode</th><th>S/O/D</th><th>RPN</th></tr></thead>
              <tbody>
                {d.highRisk.map((r) => (
                  <tr key={r.id}>
                    <td><Link className="text-brand-700 hover:underline" href={`/investigations/${r.investigation_id}/fmea`}>{r.number}</Link></td>
                    <td>{r.failure_mode}<p className="text-xs text-slate-500">{r.reasons.join(" · ")}</p></td>
                    <td className="tabular-nums">{r.severity}/{r.occurrence}/{r.detection}</td>
                    <td className="font-semibold tabular-nums">{r.rpn}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="text-sm text-slate-500">No high-risk failure modes.</p>}
        </Card>
        <Card title="Overdue CAPA actions">
          {d.overdueActions.length ? (
            <ul className="divide-y divide-slate-100 text-sm">
              {d.overdueActions.map((a) => (
                <li key={a.id} className="flex items-start justify-between gap-2 py-2">
                  <div>
                    <Link className="font-medium text-brand-700 hover:underline" href={`/investigations/${a.investigation_id}/capa`}>{a.number}</Link> — {a.description}
                    <p className="text-xs text-slate-500">Due {fmtDate(a.due_date)} · {a.responsible_name ?? "Unassigned"}</p>
                  </div>
                  <StatusBadge value={a.status} />
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-slate-500">No overdue actions.</p>}
        </Card>
      </div>
    </>
  );
}
