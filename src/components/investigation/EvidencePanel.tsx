"use client";
import { useRef, useState } from "react";
import { Download, Paperclip, Trash2, Upload } from "lucide-react";
import {
  addEvidenceAction,
  addTimelineAction,
  deleteEvidenceAction,
  deleteMeasurementsAction,
  deleteTimelineAction,
  importMeasurementsAction,
  importMeasurementsFileAction,
  updateEvidenceAction,
} from "@/app/actions";
import { Alert, Badge, Button, Card, EmptyState, Field } from "@/components/ui";
import { useAction } from "@/components/forms/useAction";
import { EVIDENCE_KINDS, type Evidence, type Measurement, type TimelineEvent } from "@/lib/types";
import { fmtDate, fmtNum, titleCase } from "@/lib/utils";
import { summary } from "@/lib/calc/stats";

const TEMPLATE_CSV = "parameter,value,unit,batch,group_label,measured_at,lsl,usl,target,source\nFeedstock moisture,18.5,%,W41,below_target,2026-10-06,,18,15,Oven-dry\n";

export function EvidencePanel(props: { invId: string; evidence: Evidence[]; timeline: TimelineEvent[]; measurements: Measurement[]; canAdd: boolean; canManage: boolean; userId: string; closed: boolean }) {
  const { invId, canAdd, canManage, closed } = props;
  const ev = useAction();
  const tl = useAction();
  const ms = useAction();
  const formRef = useRef<HTMLFormElement>(null);
  const tlRef = useRef<HTMLFormElement>(null);
  const [importResult, setImportResult] = useState<{ inserted: number; errors: { row: number; issues: string[] }[] } | null>(null);
  const [manual, setManual] = useState({ parameter: "", value: "", unit: "", batch: "", group_label: "", measured_at: "" });
  const editable = !closed;

  const params = [...new Set(props.measurements.map((m) => m.parameter))];

  return (
    <div className="space-y-4">
      {closed && <Alert kind="info">This investigation is closed. Evidence is read-only.</Alert>}
      <Card title="Evidence register" description="Facts must be traceable to a source. Unverified items are treated as assumptions by the analysis engine.">
        {ev.feedback}
        {props.evidence.length ? (
          <div className="overflow-x-auto">
            <table className="table-base min-w-[760px]">
              <thead><tr><th>Evidence</th><th>Kind</th><th>Source</th><th>Collected</th><th>Status</th><th /></tr></thead>
              <tbody>
                {props.evidence.map((e) => (
                  <tr key={e.id}>
                    <td>
                      <p className="font-medium">{e.title}</p>
                      {e.description && <p className="text-xs text-slate-500">{e.description}</p>}
                      {e.file_name && <a href={`/api/evidence/${e.id}/file`} className="mt-0.5 inline-flex items-center gap-1 text-xs text-brand-700 hover:underline"><Paperclip className="h-3 w-3" /> {e.file_name}</a>}
                    </td>
                    <td><Badge>{titleCase(e.kind)}</Badge></td>
                    <td className="text-xs">{e.source ?? "—"}</td>
                    <td className="text-xs">{e.collected_by ?? "—"}<br />{fmtDate(e.collected_at)}</td>
                    <td>{e.is_verified ? <Badge color="green">Verified</Badge> : <Badge color="amber">Unverified</Badge>}</td>
                    <td className="whitespace-nowrap text-right">
                      {canManage && editable && (
                        <>
                          <Button size="sm" variant="ghost" disabled={ev.pending} onClick={() => ev.exec(() => updateEvidenceAction(invId, e.id, { is_verified: !e.is_verified }))}>{e.is_verified ? "Unverify" : "Verify"}</Button>
                          <button aria-label={`Delete ${e.title}`} className="ml-1 text-slate-400 hover:text-red-600" onClick={() => confirm("Delete this evidence item?") && ev.exec(() => deleteEvidenceAction(invId, e.id))}><Trash2 className="inline h-4 w-4" /></button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState title="No evidence yet">Add records, measurements, photos, logs, interview notes or test results.</EmptyState>}
        {canAdd && editable && (
          <form
            ref={formRef}
            className="mt-4 grid gap-3 rounded-md bg-slate-50 p-3 md:grid-cols-3"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              ev.exec(() => addEvidenceAction(invId, fd), { success: "Evidence added", onOk: () => formRef.current?.reset() });
            }}
          >
            <Field label="Title *" htmlFor="ev-title" className="md:col-span-2"><input id="ev-title" name="title" className="input" required minLength={2} /></Field>
            <Field label="Kind" htmlFor="ev-kind"><select id="ev-kind" name="kind" className="input">{EVIDENCE_KINDS.map((k) => <option key={k} value={k}>{titleCase(k)}</option>)}</select></Field>
            <Field label="Description" htmlFor="ev-desc" className="md:col-span-3"><textarea id="ev-desc" name="description" className="input" rows={2} /></Field>
            <Field label="Source (system, document, person)" htmlFor="ev-src"><input id="ev-src" name="source" className="input" /></Field>
            <Field label="Collected by" htmlFor="ev-by"><input id="ev-by" name="collected_by" className="input" /></Field>
            <Field label="Collected on" htmlFor="ev-at"><input id="ev-at" name="collected_at" type="date" className="input" /></Field>
            <Field label="Attachment (photo, PDF, CSV, XLSX, DOCX — max 25 MB)" htmlFor="ev-file" className="md:col-span-2"><input id="ev-file" name="file" type="file" className="text-sm" accept=".png,.jpg,.jpeg,.webp,.pdf,.csv,.txt,.xlsx,.xls,.docx" /></Field>
            <div className="flex items-end justify-between gap-2">
              {canManage && <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" name="is_verified" /> Verified</label>}
              <Button type="submit" disabled={ev.pending}><Upload className="h-4 w-4" /> Add evidence</Button>
            </div>
          </form>
        )}
      </Card>

      <Card title="Event timeline">
        {tl.feedback}
        {props.timeline.length ? (
          <ul className="divide-y divide-slate-100 text-sm">
            {props.timeline.map((t) => (
              <li key={t.id} className="flex items-start justify-between gap-2 py-2">
                <div><span className="text-xs text-slate-500">{fmtDate(t.occurred_at, true)}</span> {t.is_verified ? <Badge color="green">verified</Badge> : <Badge color="amber">unverified</Badge>}<p>{t.description}</p>{t.source && <p className="text-xs text-slate-500">Source: {t.source}</p>}</div>
                {canManage && editable && <button aria-label="Delete timeline event" className="text-slate-400 hover:text-red-600" onClick={() => tl.exec(() => deleteTimelineAction(invId, t.id))}><Trash2 className="h-4 w-4" /></button>}
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-slate-500">No events yet.</p>}
        {canAdd && editable && (
          <form ref={tlRef} className="mt-3 grid gap-2 md:grid-cols-[200px_1fr_180px_auto_auto]" onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const at = String(f.get("occurred_at") || "");
            tl.exec(() => addTimelineAction(invId, { occurred_at: at ? new Date(at).toISOString() : "", description: f.get("description"), source: f.get("source"), is_verified: f.get("is_verified") === "on" }), { onOk: () => tlRef.current?.reset() });
          }}>
            <input aria-label="Event time" name="occurred_at" type="datetime-local" className="input" required />
            <input aria-label="Event description" name="description" className="input" placeholder="What happened" required />
            <input aria-label="Event source" name="source" className="input" placeholder="Source" />
            <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="is_verified" /> verified</label>
            <Button type="submit" variant="secondary" disabled={tl.pending}>Add event</Button>
          </form>
        )}
      </Card>

      <Card
        title="Measurement data"
        description="Used for trend, correlation, comparative (good vs. defective) and SPC analysis. Label groups (e.g. affected / unaffected) to enable comparisons."
        actions={<a className="inline-flex items-center gap-1 text-sm text-brand-700 hover:underline" download="measurements-template.csv" href={`data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE_CSV)}`}><Download className="h-4 w-4" /> CSV template</a>}
      >
        {ms.feedback}
        {importResult && (
          <Alert kind={importResult.errors.length ? "warning" : "success"} title={`${importResult.inserted} row(s) imported${importResult.errors.length ? `, ${importResult.errors.length} rejected` : ""}`}>
            {importResult.errors.length > 0 && <ul>{importResult.errors.slice(0, 10).map((e) => <li key={e.row}>Row {e.row}: {e.issues.join("; ")}</li>)}</ul>}
          </Alert>
        )}
        {params.length ? (
          <div className="overflow-x-auto">
            <table className="table-base min-w-[640px]">
              <thead><tr><th>Parameter</th><th>n</th><th>Mean</th><th>SD</th><th>Min–Max</th><th>Groups</th><th /></tr></thead>
              <tbody>
                {params.map((p) => {
                  const rows = props.measurements.filter((m) => m.parameter === p);
                  const st = summary(rows.map((r) => r.value));
                  return (
                    <tr key={p}>
                      <td className="font-medium">{p} <span className="text-xs text-slate-500">{rows[0]?.unit}</span></td>
                      <td>{st.n}</td>
                      <td className="tabular-nums">{fmtNum(st.mean, 3)}</td>
                      <td className="tabular-nums">{fmtNum(st.sd, 3)}</td>
                      <td className="tabular-nums">{fmtNum(st.min)}–{fmtNum(st.max)}</td>
                      <td className="text-xs">{[...new Set(rows.map((r) => r.group_label).filter(Boolean))].join(", ") || "—"}</td>
                      <td>{canManage && editable && <button aria-label={`Delete ${p} data`} className="text-slate-400 hover:text-red-600" onClick={() => confirm(`Delete all ${rows.length} values of ${p}?`) && ms.exec(() => deleteMeasurementsAction(invId, p))}><Trash2 className="h-4 w-4" /></button>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <p className="text-sm text-slate-500">No measurements yet.</p>}
        {canAdd && editable && (
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <form className="rounded-md bg-slate-50 p-3" onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              ms.exec(() => importMeasurementsFileAction(invId, fd), { onOk: (r) => setImportResult(r as typeof importResult) });
            }}>
              <p className="mb-2 text-sm font-medium">Import CSV / XLSX</p>
              <p className="mb-2 text-xs text-slate-500">Columns: parameter, value (required); unit, batch, group_label, measured_at, lsl, usl, target, source. Invalid rows are reported and skipped.</p>
              <input aria-label="Measurement file" type="file" name="file" accept=".csv,.xlsx" required className="text-sm" />
              <Button type="submit" variant="secondary" className="mt-2" disabled={ms.pending}>Import</Button>
            </form>
            <form className="grid grid-cols-2 gap-2 rounded-md bg-slate-50 p-3" onSubmit={(e) => {
              e.preventDefault();
              ms.exec(() => importMeasurementsAction(invId, [{ ...manual, measured_at: manual.measured_at ? new Date(manual.measured_at).toISOString() : null }]), {
                onOk: (r) => { setImportResult(r as typeof importResult); setManual({ ...manual, value: "" }); },
              });
            }}>
              <p className="col-span-2 text-sm font-medium">Add a single value</p>
              <input aria-label="Parameter" className="input" placeholder="Parameter *" value={manual.parameter} onChange={(e) => setManual({ ...manual, parameter: e.target.value })} required list="param-list" />
              <datalist id="param-list">{params.map((p) => <option key={p} value={p} />)}</datalist>
              <input aria-label="Value" className="input" placeholder="Value *" value={manual.value} onChange={(e) => setManual({ ...manual, value: e.target.value })} required />
              <input aria-label="Unit" className="input" placeholder="Unit" value={manual.unit} onChange={(e) => setManual({ ...manual, unit: e.target.value })} />
              <input aria-label="Batch" className="input" placeholder="Batch / key" value={manual.batch} onChange={(e) => setManual({ ...manual, batch: e.target.value })} />
              <input aria-label="Group" className="input" placeholder="Group label" value={manual.group_label} onChange={(e) => setManual({ ...manual, group_label: e.target.value })} />
              <input aria-label="Measured at" className="input" type="datetime-local" value={manual.measured_at} onChange={(e) => setManual({ ...manual, measured_at: e.target.value })} />
              <Button type="submit" variant="secondary" className="col-span-2" disabled={ms.pending}>Add value</Button>
            </form>
          </div>
        )}
      </Card>
    </div>
  );
}
