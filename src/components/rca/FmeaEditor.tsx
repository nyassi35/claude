"use client";
import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { deleteFmeaAction, upsertFmeaAction } from "@/app/actions";
import { Alert, Badge, Button, Card, EmptyState } from "@/components/ui";
import { useAction } from "@/components/forms/useAction";
import { actionPriority, classifyFmeaRisk, rpn, RATING_CRITERIA } from "@/lib/calc/fmea";
import type { FmeaItem, OrgSettings } from "@/lib/types";
import { fmtDate } from "@/lib/utils";

type Row = Partial<FmeaItem>;
const TEXT_FIELDS: [keyof FmeaItem, string][] = [
  ["process_step", "Process step *"],
  ["function_requirement", "Function / requirement"],
  ["failure_mode", "Potential failure mode *"],
  ["effects", "Potential effects"],
  ["causes", "Potential causes / mechanisms"],
  ["prevention_controls", "Current prevention controls"],
  ["detection_controls", "Current detection controls"],
  ["recommended_actions", "Recommended actions"],
  ["action_owner", "Action owner"],
];

const apColor = (ap: string) => (ap === "H" ? "red" : ap === "M" ? "amber" : "green") as "red" | "amber" | "green";

function Rating({ label, value, onChange, kind, optional }: { label: string; value: number | null | undefined; onChange: (v: number | null) => void; kind: keyof typeof RATING_CRITERIA; optional?: boolean }) {
  return (
    <div>
      <label className="label" title={RATING_CRITERIA[kind].map((c) => `${c.range}: ${c.text}`).join("\n")}>{label}</label>
      <select aria-label={label} className="input w-20" value={value ?? ""} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}>
        {optional && <option value="">—</option>}
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
    </div>
  );
}

function RowForm({ initial, onSave, onCancel, pending, steps }: { initial: Row; onSave: (r: Row) => void; onCancel: () => void; pending: boolean; steps: string[] }) {
  const [r, setR] = useState<Row>(initial);
  const s = r.severity ?? 5, o = r.occurrence ?? 5, d = r.detection ?? 5;
  return (
    <form className="space-y-3 rounded-md border border-brand-200 bg-brand-50/40 p-3" onSubmit={(e) => { e.preventDefault(); onSave({ ...r, severity: s, occurrence: o, detection: d }); }}>
      <div className="grid gap-3 md:grid-cols-3">
        {TEXT_FIELDS.map(([k, label]) => (
          <div key={k}>
            <label className="label" htmlFor={`fm-${k}`}>{label}</label>
            <input id={`fm-${k}`} className="input" list={k === "process_step" ? "fmea-steps" : undefined} value={(r[k] as string) ?? ""} required={label.endsWith("*")} onChange={(e) => setR({ ...r, [k]: e.target.value })} />
          </div>
        ))}
        <datalist id="fmea-steps">{steps.map((x) => <option key={x} value={x} />)}</datalist>
        <div>
          <label className="label" htmlFor="fm-due">Due date</label>
          <input id="fm-due" type="date" className="input" value={r.due_date ?? ""} onChange={(e) => setR({ ...r, due_date: e.target.value })} />
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <Rating label="Severity (S)" kind="severity" value={s} onChange={(v) => setR({ ...r, severity: v ?? 5 })} />
        <Rating label="Occurrence (O)" kind="occurrence" value={o} onChange={(v) => setR({ ...r, occurrence: v ?? 5 })} />
        <Rating label="Detection (D)" kind="detection" value={d} onChange={(v) => setR({ ...r, detection: v ?? 5 })} />
        <p className="pb-2 text-sm">RPN = {s}×{o}×{d} = <span className="font-semibold">{rpn(s, o, d)}</span> · AP <Badge color={apColor(actionPriority(s, o, d))}>{actionPriority(s, o, d)}</Badge></p>
        <span className="mx-2 h-8 w-px bg-slate-300" />
        <Rating label="Revised S" kind="severity" optional value={r.revised_severity} onChange={(v) => setR({ ...r, revised_severity: v })} />
        <Rating label="Revised O" kind="occurrence" optional value={r.revised_occurrence} onChange={(v) => setR({ ...r, revised_occurrence: v })} />
        <Rating label="Revised D" kind="detection" optional value={r.revised_detection} onChange={(v) => setR({ ...r, revised_detection: v })} />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={pending}>Save row</Button>
      </div>
    </form>
  );
}

export function FmeaEditor({ invId, rows, settings, readOnly, steps }: { invId: string; rows: FmeaItem[]; settings: OrgSettings; readOnly: boolean; steps: string[] }) {
  const { exec, pending, feedback } = useAction();
  const [editing, setEditing] = useState<string | null>(null);
  const [sort, setSort] = useState<"order" | "rpn" | "severity">("order");
  const sorted = [...rows].sort((a, b) => (sort === "rpn" ? b.rpn - a.rpn : sort === "severity" ? b.severity - a.severity || b.rpn - a.rpn : a.sort_order - b.sort_order));
  const save = (id: string | null, r: Row) => {
    const { id: _i, org_id: _o, investigation_id: _v, rpn: _r, revised_rpn: _rr, created_at: _c, updated_at: _u, ...payload } = r as FmeaItem;
    void _i; void _o; void _v; void _r; void _rr; void _c; void _u;
    exec(() => upsertFmeaAction(invId, id, { ...payload, sort_order: payload.sort_order ?? rows.length }), { onOk: () => setEditing(null), success: "FMEA row saved" });
  };
  return (
    <div className="space-y-4">
      {feedback}
      <Card
        title="Process FMEA (PFMEA)"
        description={`High-risk if RPN ≥ ${settings.rpn_threshold}, or severity ≥ ${settings.severity_escalation}${settings.use_action_priority ? ", or AIAG-VDA-style Action Priority = H" : ""}. Thresholds are configurable in Settings.`}
        actions={
          <>
            <select aria-label="Sort" className="input w-40 py-1 text-xs" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
              <option value="order">Process order</option>
              <option value="rpn">Highest RPN</option>
              <option value="severity">Highest severity</option>
            </select>
            {!readOnly && <Button size="sm" onClick={() => setEditing("new")}><Plus className="h-4 w-4" /> Add failure mode</Button>}
          </>
        }
      >
        {editing === "new" && <div className="mb-4"><RowForm initial={{}} steps={steps} pending={pending} onCancel={() => setEditing(null)} onSave={(r) => save(null, r)} /></div>}
        {rows.length === 0 && editing !== "new" ? (
          <EmptyState title="No failure modes yet">Add process steps, their failure modes and current controls, then rate S, O and D.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base min-w-[1200px] text-xs">
              <thead>
                <tr>
                  <th>Process step / function</th><th>Failure mode</th><th>Effects</th><th>Causes</th><th>Prevention</th><th>Detection</th>
                  <th>S</th><th>O</th><th>D</th><th>RPN</th><th>AP</th><th>Recommended action / owner / due</th><th>Revised</th><th />
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => {
                  if (editing === r.id) return <tr key={r.id}><td colSpan={14}><RowForm initial={r} steps={steps} pending={pending} onCancel={() => setEditing(null)} onSave={(x) => save(r.id, x)} /></td></tr>;
                  const flag = classifyFmeaRisk(r, settings);
                  const ap = actionPriority(r.severity, r.occurrence, r.detection);
                  return (
                    <tr key={r.id} className={flag.highRisk ? "bg-red-50/60" : undefined}>
                      <td><p className="font-medium">{r.process_step}</p><p className="text-slate-500">{r.function_requirement}</p></td>
                      <td className="font-medium">{r.failure_mode}</td>
                      <td>{r.effects}</td><td>{r.causes}</td><td>{r.prevention_controls}</td><td>{r.detection_controls}</td>
                      <td className="font-semibold">{r.severity}</td><td>{r.occurrence}</td><td>{r.detection}</td>
                      <td><span className="font-semibold">{r.rpn}</span>{flag.highRisk && <p className="mt-0.5 text-[10px] text-red-700" title={flag.reasons.join("\n")}>⚠ {flag.reasons[0]}</p>}</td>
                      <td><Badge color={apColor(ap)}>{ap}</Badge></td>
                      <td>{r.recommended_actions || "—"}<p className="text-slate-500">{[r.action_owner, r.due_date && fmtDate(r.due_date)].filter(Boolean).join(" · ")}</p></td>
                      <td>{r.revised_rpn ? <>{r.revised_severity}/{r.revised_occurrence}/{r.revised_detection} → <span className="font-semibold">{r.revised_rpn}</span> <Badge color={apColor(actionPriority(r.revised_severity!, r.revised_occurrence!, r.revised_detection!))}>{actionPriority(r.revised_severity!, r.revised_occurrence!, r.revised_detection!)}</Badge></> : "—"}</td>
                      <td className="whitespace-nowrap">
                        {!readOnly && (
                          <>
                            <button aria-label="Edit row" className="text-slate-500 hover:text-brand-700" onClick={() => setEditing(r.id)}><Pencil className="h-3.5 w-3.5" /></button>
                            <button aria-label="Delete row" className="ml-2 text-slate-400 hover:text-red-600" onClick={() => confirm("Delete this failure mode?") && exec(() => deleteFmeaAction(invId, r.id))}><Trash2 className="h-3.5 w-3.5" /></button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Alert kind="info" title="About RPN and Action Priority">
        RPN = S × O × D is a ranking aid, not a measure of risk: very different combinations give the same RPN, and a severity-10 failure with low occurrence can have a low RPN. Items are therefore also escalated on severity alone.
        Action Priority (H/M/L) is a separate AIAG-VDA-style lookup that weighs Severity first, then Occurrence, then Detection — it is not derived from RPN. Verify the AP table against your organisation&apos;s licensed handbook before relying on it.
      </Alert>
      <Card title="Rating criteria (1–10)">
        <div className="grid gap-4 md:grid-cols-3">
          {(Object.keys(RATING_CRITERIA) as (keyof typeof RATING_CRITERIA)[]).map((k) => (
            <div key={k}>
              <p className="mb-1 text-sm font-semibold capitalize">{k}</p>
              <ul className="space-y-1 text-xs">{RATING_CRITERIA[k].map((c) => <li key={c.range}><span className="font-semibold">{c.range}:</span> {c.text}</li>)}</ul>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
