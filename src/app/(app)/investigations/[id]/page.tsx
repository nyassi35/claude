import Link from "next/link";
import { CheckCircle2, Circle } from "lucide-react";
import { loadInvestigation } from "@/lib/investigation-context";
import { can } from "@/lib/auth/permissions";
import { recommendMethods, missingInformation } from "@/lib/ai/engine";
import { problemTypesFor } from "@/lib/categories/engine";
import { Badge, Card, StatusBadge } from "@/components/ui";
import { SignOffForm, StatusControl } from "@/components/investigation/StatusControl";
import { fmtDate, titleCase } from "@/lib/utils";

const METHOD_SLUG: Record<string, string> = { five_whys: "five-whys", ishikawa: "ishikawa", fmea: "fmea", dmaic: "dmaic", capa: "capa" };

export default async function Overview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await loadInvestigation(id);
  const { s, investigation: i } = d;
  const p = i.problem ?? {};
  const recs = recommendMethods(d);
  const missing = missingInformation(d, d.template);
  const confirmed = d.causes.filter((c) => c.status === "confirmed");
  const steps = [
    { label: "Production context", done: i.wizard_step > 1, href: "intake?step=1" },
    { label: "Problem definition & KPIs", done: !!p.what_happened && !!p.expected && i.kpis.length > 0, href: "intake?step=2" },
    { label: "Process information", done: (i.process?.parameters?.length ?? 0) > 0 || !!i.process?.flow, href: "intake?step=3" },
    { label: "Category follow-up questions", done: Object.keys(i.answers ?? {}).length > 0, href: "intake?step=4" },
    { label: "Risk assessment", done: Object.keys(i.risk?.ratings ?? {}).length > 0, href: "risk" },
    { label: "Evidence recorded", done: d.evidence.length > 0, href: "evidence" },
    { label: "Candidate causes identified", done: d.causes.length > 0, href: "causes" },
    { label: "Root cause confirmed (evidence + approval)", done: confirmed.length > 0, href: "causes" },
    { label: "Corrective / preventive actions", done: d.capa.some((a) => a.action_type !== "containment"), href: "capa" },
    { label: "Effectiveness verified", done: d.capa.length > 0 && d.capa.every((a) => ["effective", "closed"].includes(a.status)), href: "capa" },
    { label: "Control plan", done: d.controlPlan.length > 0, href: "control-plan" },
  ];
  const done = steps.filter((x) => x.done).length;
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <Card title="Problem statement">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div className="sm:col-span-2"><dt className="label">What happened</dt><dd>{p.what_happened || <span className="text-slate-400">Not yet described</span>}</dd></div>
            <div><dt className="label">Expected</dt><dd>{p.expected || "—"}</dd></div>
            <div><dt className="label">Actual</dt><dd>{p.actual || "—"}</dd></div>
            <div><dt className="label">Problem type</dt><dd>{problemTypesFor(d.template).find((x) => x.key === p.problem_type)?.label ?? "—"}</dd></div>
            <div><dt className="label">Previously occurred</dt><dd>{p.previous_occurrence ? titleCase(p.previous_occurrence) : "—"}</dd></div>
            <div><dt className="label">Affected</dt><dd>{p.affected || "—"}</dd></div>
            <div><dt className="label">Impact</dt><dd>{p.impact || "—"}</dd></div>
          </dl>
          {i.kpis.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <table className="table-base">
                <thead><tr><th>KPI</th><th>Baseline</th><th>Target</th><th>Actual</th></tr></thead>
                <tbody>{i.kpis.map((k) => <tr key={k.key + k.label}><td>{k.label} <span className="text-xs text-slate-500">({k.unit})</span></td><td>{k.baseline ?? "—"}</td><td>{k.target ?? "—"}</td><td className="font-semibold">{k.actual ?? "—"}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </Card>
        <Card title="Causes" actions={<Link href={`/investigations/${id}/causes`} className="text-sm text-brand-700 hover:underline">Open register</Link>}>
          {d.causes.length ? (
            <ul className="divide-y divide-slate-100 text-sm">
              {d.causes.map((c) => (
                <li key={c.id} className="flex items-start justify-between gap-3 py-2">
                  <span>{c.description}<span className="block text-xs text-slate-500">{titleCase(c.cause_type)} · confidence {c.confidence}</span></span>
                  <StatusBadge value={c.status} />
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-slate-500">No causes recorded yet. Use the 5 Whys, Ishikawa or the AI assistant to generate hypotheses.</p>}
        </Card>
        <Card title="Recommended methods" description="Based on problem type, severity, risk and available data — not every method is needed">
          <ul className="grid gap-2 sm:grid-cols-2">
            {recs.map((r) => (
              <li key={r.method} className="rounded-md border border-slate-200 p-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <Link href={`/investigations/${id}/${METHOD_SLUG[r.method] ?? `tools/${r.method}`}`} className="font-medium text-brand-700 hover:underline">{r.name}</Link>
                  <Badge color={r.priority === "recommended" ? "blue" : "slate"}>{r.priority}</Badge>
                </div>
                <p className="mt-0.5 text-xs text-slate-500">{r.reason}</p>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Timeline">
          {d.timeline.length ? (
            <ol className="relative ml-2 border-l border-slate-200 text-sm">
              {d.timeline.map((t) => (
                <li key={t.id} className="mb-3 ml-4">
                  <span className={`absolute -left-1.5 mt-1 h-3 w-3 rounded-full border-2 border-white ${t.is_verified ? "bg-emerald-500" : "bg-amber-400"}`} />
                  <p className="text-xs text-slate-500">{fmtDate(t.occurred_at, true)} {t.source && `· ${t.source}`} {!t.is_verified && "· unverified"}</p>
                  <p>{t.description}</p>
                </li>
              ))}
            </ol>
          ) : <p className="text-sm text-slate-500">No timeline events. Add them under Evidence & data.</p>}
        </Card>
      </div>
      <div className="space-y-4">
        <Card title={`Progress ${done}/${steps.length}`}>
          <ul className="space-y-1.5 text-sm">
            {steps.map((x) => (
              <li key={x.label} className="flex items-center gap-2">
                {x.done ? <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-label="done" /> : <Circle className="h-4 w-4 text-slate-300" aria-label="not done" />}
                <Link href={`/investigations/${id}/${x.href}`} className="hover:underline">{x.label}</Link>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Status">
          <StatusControl id={id} status={i.status} canClose={can(s.role, "investigation.close")} canEdit={can(s.role, "investigation.edit")} canDelete={can(s.role, "investigation.delete")} />
        </Card>
        <Card title="Missing information" description={`${missing.length} item(s)`}>
          {missing.length ? (
            <ul className="space-y-1.5 text-sm">
              {missing.slice(0, 8).map((m) => <li key={m.area + m.item}><span className="text-xs font-semibold text-slate-500">{m.area}:</span> {m.item}</li>)}
              {missing.length > 8 && <li><Link className="text-brand-700 hover:underline" href={`/investigations/${id}/assistant`}>See all in the AI assistant →</Link></li>}
            </ul>
          ) : <p className="text-sm text-emerald-700">No obvious gaps detected.</p>}
        </Card>
        <Card title="Approvals & sign-off">
          {d.approvals.length ? (
            <ul className="mb-3 space-y-1.5 text-sm">
              {d.approvals.map((a) => (
                <li key={a.id}><StatusBadge value={a.decision} /> <span className="font-medium">{a.approver_name}</span> — {titleCase(a.record_type)} <span className="text-xs text-slate-500">{fmtDate(a.created_at, true)}</span>{a.comment && <p className="text-xs text-slate-600">{a.comment}</p>}</li>
              ))}
            </ul>
          ) : <p className="mb-3 text-sm text-slate-500">No sign-offs yet.</p>}
          {can(s.role, "approval.sign") && <SignOffForm id={id} />}
        </Card>
      </div>
    </div>
  );
}
