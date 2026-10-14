import { loadInvestigation } from "@/lib/investigation-context";
import { InvestigationTabs } from "@/components/investigation/Tabs";
import { Alert, StatusBadge } from "@/components/ui";
import { fmtDate } from "@/lib/utils";
import { riskSummary } from "@/lib/calc/metrics";

export default async function InvestigationLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await loadInvestigation(id);
  const i = d.investigation;
  const risk = riskSummary(i.risk?.ratings ?? {});
  const tabs = [
    { slug: "", label: "Overview" },
    { slug: "intake", label: "Intake" },
    { slug: "evidence", label: "Evidence & data", badge: d.evidence.length + d.measurements.length ? d.evidence.length : undefined },
    { slug: "causes", label: "Causes", badge: d.causes.length || undefined },
    { slug: "five-whys", label: "5 Whys" },
    { slug: "ishikawa", label: "Ishikawa" },
    { slug: "fmea", label: "FMEA", badge: d.fmea.length || undefined },
    { slug: "dmaic", label: "DMAIC" },
    { slug: "tools", label: "More tools" },
    { slug: "assistant", label: "AI assistant" },
    { slug: "risk", label: "Risk & impact" },
    { slug: "capa", label: "CAPA", badge: d.capa.length || undefined },
    { slug: "control-plan", label: "Control plan" },
    { slug: "report", label: "Report" },
  ];
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-xs text-slate-500">{i.number} · {d.template.name}</p>
          <h1 className="text-xl font-semibold text-slate-900">{i.title}</h1>
          <p className="mt-1 text-xs text-slate-500">
            Owner {d.memberName(i.owner_id)} · Occurred {fmtDate(i.occurred_at, true)} · Due {fmtDate(i.due_date)}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <StatusBadge value={i.status} />
          <StatusBadge value={i.severity} />
          <StatusBadge value={i.priority} />
        </div>
      </div>
      {risk.escalate.length > 0 && !i.risk?.escalated && (
        <Alert kind="warning" title="Escalation required" className="no-print mb-3">
          High rating for {risk.escalate.join(", ").replace(/_/g, " ")}. Notify the responsible safety / quality / environmental authority and follow site procedures. This software does not replace emergency procedures or authorised decisions.
        </Alert>
      )}
      <InvestigationTabs id={id} tabs={tabs} />
      {children}
    </div>
  );
}
