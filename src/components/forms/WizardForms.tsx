"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { saveWizardStepAction } from "@/app/actions";
import { Alert, Badge, Button, Field } from "@/components/ui";
import { evaluateCondition, problemTypesFor } from "@/lib/categories/engine";
import { KPI_DEFS } from "@/lib/categories/common";
import { COMMON_FOLLOWUPS } from "@/lib/categories/common";
import type { CategoryTemplate, Question } from "@/lib/categories/types";
import type { Investigation, KpiValue, ProcessParameter } from "@/lib/types";
import { useAction } from "./useAction";

const num = (v: string) => (v === "" ? null : Number(v));

function useStepSave(inv: Investigation, step: number) {
  const router = useRouter();
  const a = useAction();
  const save = (data: unknown, advance: boolean) =>
    a.exec(() => saveWizardStepAction(inv.id, step, data), {
      success: advance ? undefined : "Draft saved",
      onOk: () => advance && router.push(`/investigations/${inv.id}/intake?step=${step + 1}`),
    });
  return { ...a, save };
}

function StepButtons({ pending, onSave }: { pending: boolean; onSave: (advance: boolean) => void }) {
  return (
    <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
      <Button type="button" variant="secondary" disabled={pending} onClick={() => onSave(false)}>Save draft</Button>
      <Button type="button" disabled={pending} onClick={() => onSave(true)}>{pending ? "Saving…" : "Save & continue"}</Button>
    </div>
  );
}

// ------------------------------------------------------------------ Step 2: Problem definition
export function ProblemForm({ inv, template, readOnly }: { inv: Investigation; template: CategoryTemplate; readOnly?: boolean }) {
  const [p, setP] = useState({ ...inv.problem });
  const defaultKpis: KpiValue[] = inv.kpis.length
    ? inv.kpis
    : template.kpis.map((k) => KPI_DEFS.find((d) => d.key === k)).filter(Boolean).map((d) => ({ key: d!.key, label: d!.label, unit: d!.unit, baseline: null, target: null, actual: null }));
  const [kpis, setKpis] = useState<KpiValue[]>(defaultKpis);
  const { save, pending, feedback } = useStepSave(inv, 2);
  const set = (k: string, v: string) => setP({ ...p, [k]: v });
  const text = (k: keyof typeof p, label: string, placeholder?: string, area = true) => (
    <Field label={label} htmlFor={`p-${k}`}>
      {area ? (
        <textarea id={`p-${k}`} className="input" rows={2} value={(p[k] as string) ?? ""} placeholder={placeholder} onChange={(e) => set(k, e.target.value)} disabled={readOnly} />
      ) : (
        <input id={`p-${k}`} className="input" value={(p[k] as string) ?? ""} placeholder={placeholder} onChange={(e) => set(k, e.target.value)} disabled={readOnly} />
      )}
    </Field>
  );
  const kpiOptions = KPI_DEFS.filter((d) => !kpis.some((k) => k.key === d.key));
  return (
    <div className="space-y-4">
      {feedback}
      <Field label="Problem type" htmlFor="ptype" hint="Drives the follow-up questions in step 4">
        <select id="ptype" className="input" value={p.problem_type ?? ""} onChange={(e) => set("problem_type", e.target.value)} disabled={readOnly}>
          <option value="">— Select —</option>
          {problemTypesFor(template).map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
        </select>
      </Field>
      {text("what_happened", "What happened? *", "Describe the observed problem factually — avoid assuming causes")}
      <div className="grid gap-4 md:grid-cols-2">
        {text("expected", "What should have happened?", "Target / specification / standard")}
        {text("actual", "What was the actual result?", "Measured value(s)")}
        {text("started", "When did the problem start?", "Date, batch, week…", false)}
        {text("where_observed", "Where was it observed?", "Station, location on part, test…", false)}
        {text("frequency", "How frequently does it occur?", "Every batch, 3 per shift…", false)}
        {text("affected", "Which products / batches / machines are affected?")}
        {text("impact", "What is the measurable impact?", "kg, hours, cost, customers…")}
        <Field label="Has this occurred before?" htmlFor="prev">
          <select id="prev" className="input" value={p.previous_occurrence ?? ""} onChange={(e) => set("previous_occurrence", e.target.value)} disabled={readOnly}>
            <option value="">— Select —</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
            <option value="unknown">Unknown</option>
          </select>
        </Field>
      </div>
      {p.previous_occurrence === "yes" && text("previous_details", "Previous occurrences (references, dates, actions taken)")}
      <div>
        <p className="label">Measurable KPIs</p>
        <div className="overflow-x-auto">
          <table className="table-base min-w-[600px]">
            <thead><tr><th>KPI</th><th>Unit</th><th>Baseline</th><th>Target</th><th>Actual</th><th /></tr></thead>
            <tbody>
              {kpis.map((k, idx) => (
                <tr key={k.key + idx}>
                  <td className="font-medium">{k.label}</td>
                  <td><input aria-label={`${k.label} unit`} className="input w-24" value={k.unit} onChange={(e) => setKpis(kpis.map((x, j) => (j === idx ? { ...x, unit: e.target.value } : x)))} disabled={readOnly} /></td>
                  {(["baseline", "target", "actual"] as const).map((f) => (
                    <td key={f}><input aria-label={`${k.label} ${f}`} type="number" step="any" className="input w-28" value={k[f] ?? ""} onChange={(e) => setKpis(kpis.map((x, j) => (j === idx ? { ...x, [f]: num(e.target.value) } : x)))} disabled={readOnly} /></td>
                  ))}
                  <td><button type="button" aria-label={`Remove ${k.label}`} onClick={() => setKpis(kpis.filter((_, j) => j !== idx))} className="text-slate-400 hover:text-red-600" disabled={readOnly}><Trash2 className="h-4 w-4" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!readOnly && kpiOptions.length > 0 && (
          <select aria-label="Add KPI" className="input mt-2 w-60" value="" onChange={(e) => { const d = KPI_DEFS.find((x) => x.key === e.target.value); if (d) setKpis([...kpis, { key: d.key, label: d.label, unit: d.unit, baseline: null, target: null, actual: null }]); }}>
            <option value="">+ Add KPI…</option>
            {kpiOptions.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
          </select>
        )}
      </div>
      {!readOnly && <StepButtons pending={pending} onSave={(adv) => save({ problem: p, kpis }, adv)} />}
    </div>
  );
}

// ------------------------------------------------------------------ Step 3: Process information
export function ProcessForm({ inv, template, readOnly }: { inv: Investigation; template: CategoryTemplate; readOnly?: boolean }) {
  const [p, setP] = useState({ ...inv.process });
  const [params, setParams] = useState<ProcessParameter[]>(inv.process?.parameters?.length ? inv.process.parameters : template.parameters.slice(0, 5).map((x) => ({ name: x.name, unit: x.unit, target: null, lsl: null, usl: null, actual: null })));
  const { save, pending, feedback } = useStepSave(inv, 3);
  const area = (k: keyof typeof p, label: string, placeholder?: string) => (
    <Field label={label} htmlFor={`pr-${k}`}>
      <textarea id={`pr-${k}`} className="input" rows={2} value={(p[k] as string) ?? ""} placeholder={placeholder} onChange={(e) => setP({ ...p, [k]: e.target.value })} disabled={readOnly} />
    </Field>
  );
  const unused = template.parameters.filter((x) => !params.some((y) => y.name === x.name));
  return (
    <div className="space-y-4">
      {feedback}
      <div className="grid gap-4 md:grid-cols-2">
        {area("flow", "Process flow / sequence of operations", template.processSteps.join(" → "))}
        {area("sop", "SOP / target settings", "Document reference and key settings")}
        {area("raw_materials", "Raw materials & suppliers", "Lots, suppliers, certificates")}
        {area("machine_settings", "Machine settings")}
        {area("maintenance_history", "Maintenance history", "Recent PM, repairs, failures")}
        {area("training", "Operator training & shift information")}
        {area("environment", "Environmental conditions", "Temperature, humidity, weather…")}
        {area("recent_changes", "Recent changes (materials, people, methods, machines, software)", "Leave empty if none — a change triggers change analysis")}
      </div>
      <div>
        <p className="label">Process parameters — target, specification limits and actual</p>
        <div className="overflow-x-auto">
          <table className="table-base min-w-[700px]">
            <thead><tr><th>Parameter</th><th>Unit</th><th>Target</th><th>LSL</th><th>USL</th><th>Actual</th><th /></tr></thead>
            <tbody>
              {params.map((x, idx) => {
                const out = typeof x.actual === "number" && ((typeof x.lsl === "number" && x.actual < x.lsl) || (typeof x.usl === "number" && x.actual > x.usl));
                return (
                  <tr key={idx}>
                    <td><input aria-label="Parameter name" className="input w-44" value={x.name} onChange={(e) => setParams(params.map((y, j) => (j === idx ? { ...y, name: e.target.value } : y)))} disabled={readOnly} /></td>
                    <td><input aria-label="Unit" className="input w-20" value={x.unit} onChange={(e) => setParams(params.map((y, j) => (j === idx ? { ...y, unit: e.target.value } : y)))} disabled={readOnly} /></td>
                    {(["target", "lsl", "usl", "actual"] as const).map((f) => (
                      <td key={f}><input aria-label={`${x.name} ${f}`} type="number" step="any" className="input w-24" value={x[f] ?? ""} onChange={(e) => setParams(params.map((y, j) => (j === idx ? { ...y, [f]: num(e.target.value) } : y)))} disabled={readOnly} /></td>
                    ))}
                    <td className="whitespace-nowrap">
                      {out && <Badge color="red">Out of spec</Badge>}
                      {!readOnly && <button type="button" aria-label="Remove parameter" onClick={() => setParams(params.filter((_, j) => j !== idx))} className="ml-1 text-slate-400 hover:text-red-600"><Trash2 className="inline h-4 w-4" /></button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!readOnly && (
          <div className="mt-2 flex flex-wrap gap-2">
            {unused.slice(0, 8).map((u) => (
              <button key={u.name} type="button" className="rounded-full border border-slate-300 px-2 py-0.5 text-xs hover:bg-slate-50" onClick={() => setParams([...params, { name: u.name, unit: u.unit, target: null, lsl: null, usl: null, actual: null }])}>+ {u.name}</button>
            ))}
            <button type="button" className="inline-flex items-center gap-1 rounded-full border border-dashed border-slate-300 px-2 py-0.5 text-xs" onClick={() => setParams([...params, { name: "", unit: "", target: null, lsl: null, usl: null, actual: null }])}><Plus className="h-3 w-3" /> Custom</button>
          </div>
        )}
        <p className="mt-2 text-xs text-slate-500">Time-series measurements, photos, logs and documents are added under <span className="font-medium">Evidence & data</span> (CSV/XLSX import supported).</p>
      </div>
      {!readOnly && <StepButtons pending={pending} onSave={(adv) => save({ process: { ...p, parameters: params.filter((x) => x.name.trim()) } }, adv)} />}
    </div>
  );
}

// ------------------------------------------------------------------ Step 4: Dynamic follow-up questions
function QuestionInput({ q, value, onChange, disabled }: { q: Question; value: unknown; onChange: (v: unknown) => void; disabled?: boolean }) {
  const id = `q-${q.id}`;
  switch (q.type) {
    case "textarea":
      return <textarea id={id} className="input" rows={2} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} disabled={disabled} />;
    case "number":
      return <input id={id} type="number" step="any" className="input w-48" value={(value as number) ?? ""} onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))} disabled={disabled} />;
    case "date":
      return <input id={id} type="date" className="input w-48" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} disabled={disabled} />;
    case "boolean":
      return (
        <select id={id} className="input w-48" value={value === true ? "yes" : value === false ? "no" : ""} onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value === "yes")} disabled={disabled}>
          <option value="">—</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </select>
      );
    case "select":
      return (
        <select id={id} className="input" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value || undefined)} disabled={disabled}>
          <option value="">—</option>
          {q.options?.map((o) => <option key={o}>{o}</option>)}
        </select>
      );
    case "multiselect": {
      const arr = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="flex flex-wrap gap-2" role="group" aria-labelledby={`${id}-label`}>
          {q.options?.map((o) => (
            <label key={o} className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 px-2 py-1 text-xs">
              <input type="checkbox" checked={arr.includes(o)} onChange={(e) => onChange(e.target.checked ? [...arr, o] : arr.filter((x) => x !== o))} disabled={disabled} /> {o}
            </label>
          ))}
        </div>
      );
    }
    default:
      return <input id={id} className="input" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} disabled={disabled} />;
  }
}

export function FollowUpForm({ inv, template, readOnly }: { inv: Investigation; template: CategoryTemplate; readOnly?: boolean }) {
  const [answers, setAnswers] = useState<Record<string, unknown>>({ ...inv.answers });
  const { save, pending, feedback } = useStepSave(inv, 4);
  const ctx = { problem: inv.problem, process: inv.process, answers };
  const all = useMemo(() => [...template.questions, ...COMMON_FOLLOWUPS], [template]);
  const visible = all.filter((q) => evaluateCondition(q.showIf, ctx));
  const hiddenCount = all.length - visible.length;
  const groups = [
    { title: `${template.name} — process questions`, items: visible.filter((q) => !q.showIf) },
    { title: "Targeted follow-up questions", items: visible.filter((q) => !!q.showIf) },
  ];
  const missingReq = visible.filter((q) => q.required && (answers[q.id] === undefined || answers[q.id] === ""));
  return (
    <div className="space-y-5">
      {feedback}
      {!inv.problem?.problem_type && <Alert kind="info">Select a problem type in step 2 to unlock targeted follow-up questions.</Alert>}
      <p className="text-xs text-slate-500">{visible.length} question(s) apply · {hiddenCount} hidden by conditional logic because they do not match the problem type or earlier answers. Answers to hidden questions are not stored.</p>
      {groups.map((g) =>
        g.items.length ? (
          <div key={g.title}>
            <h3 className="mb-2 text-sm font-semibold text-slate-800">{g.title}</h3>
            <div className="space-y-4">
              {g.items.map((q) => (
                <div key={q.id} className="rounded-md border border-slate-200 p-3" data-testid={`question-${q.id}`}>
                  <label id={`q-${q.id}-label`} htmlFor={`q-${q.id}`} className="mb-1 block text-sm font-medium text-slate-800">
                    {q.label} {q.required && <span className="text-red-600">*</span>} {q.unit && <span className="text-xs text-slate-500">({q.unit})</span>}
                  </label>
                  {q.rationale && <p className="mb-1.5 text-xs text-brand-700">Why we ask: {q.rationale}</p>}
                  {q.help && <p className="mb-1.5 text-xs text-slate-500">{q.help}</p>}
                  <QuestionInput q={q} value={answers[q.id]} onChange={(v) => setAnswers({ ...answers, [q.id]: v })} disabled={readOnly} />
                </div>
              ))}
            </div>
          </div>
        ) : null,
      )}
      {missingReq.length > 0 && <Alert kind="warning">Required: {missingReq.map((q) => q.label).join("; ")}</Alert>}
      {!readOnly && <StepButtons pending={pending} onSave={(adv) => save({ answers }, adv)} />}
    </div>
  );
}
