"use client";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { resetTemplateAction, saveTemplateAction } from "@/app/actions";
import { Alert, Badge, Button, Card, Field } from "@/components/ui";
import type { CategoryTemplate, Question } from "@/lib/categories/types";
import type { TemplateOverride } from "@/lib/categories/engine";
import { useAction } from "./useAction";

const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);
type QDraft = { id: string; label: string; type: Question["type"]; options: string; required: boolean; field: string; op: string; value: string; rationale: string };

export function TemplateEditor({ base, override, canEdit }: { base: CategoryTemplate; override: TemplateOverride | null; canEdit: boolean }) {
  const o = override ?? {};
  const [steps, setSteps] = useState((o.processSteps ?? base.processSteps).join("\n"));
  const [modes, setModes] = useState((o.failureModes ?? base.failureModes).join("\n"));
  const [hazards, setHazards] = useState((o.hazards ?? base.hazards).join("\n"));
  const [qc, setQc] = useState((o.qualityCharacteristics ?? base.qualityCharacteristics).join("\n"));
  const [params, setParams] = useState((o.parameters ?? base.parameters).map((p) => `${p.name} | ${p.unit}`).join("\n"));
  const [ptypes, setPtypes] = useState((o.problemTypes ?? base.problemTypes).map((p) => `${p.key} | ${p.label}`).join("\n"));
  const [hidden, setHidden] = useState<string[]>(o.hiddenQuestionIds ?? []);
  const [qs, setQs] = useState<QDraft[]>(
    (o.extraQuestions ?? []).map((q) => {
      const c = q.showIf && "field" in q.showIf ? q.showIf : null;
      return { id: q.id, label: q.label, type: q.type, options: (q.options ?? []).join(", "), required: !!q.required, field: c?.field ?? "", op: c?.op ?? "eq", value: c?.value !== undefined ? String(c.value) : "", rationale: q.rationale ?? "" };
    }),
  );
  const { exec, pending, feedback } = useAction();

  function save() {
    const config: TemplateOverride = {
      processSteps: lines(steps),
      failureModes: lines(modes),
      hazards: lines(hazards),
      qualityCharacteristics: lines(qc),
      parameters: lines(params).map((l) => { const [name, unit = ""] = l.split("|").map((x) => x.trim()); return { name, unit }; }),
      problemTypes: lines(ptypes).map((l) => { const [key, label] = l.split("|").map((x) => x.trim()); return { key, label: label ?? key }; }),
      hiddenQuestionIds: hidden,
      extraQuestions: qs.map((q) => ({
        id: q.id,
        label: q.label,
        type: q.type,
        section: q.field ? "followup" : "process",
        options: ["select", "multiselect"].includes(q.type) ? q.options.split(",").map((x) => x.trim()).filter(Boolean) : undefined,
        required: q.required,
        rationale: q.rationale || undefined,
        showIf: q.field ? { field: q.field, op: q.op as "eq", value: q.op === "truthy" ? undefined : q.value } : undefined,
      })),
    };
    exec(() => saveTemplateAction(base.key, config), { success: "Template saved — new and existing investigations in this category now use it." });
  }

  const area = (label: string, v: string, set: (s: string) => void, hint?: string) => (
    <Field label={label} hint={hint}><textarea className="input font-mono text-xs" rows={6} value={v} onChange={(e) => set(e.target.value)} disabled={!canEdit} /></Field>
  );
  return (
    <div className="space-y-4">
      {feedback}
      {override && <Alert kind="info">This category has organization-specific changes. <button className="underline" disabled={!canEdit || pending} onClick={() => confirm("Reset to the built-in template?") && exec(() => resetTemplateAction(base.key), { success: "Reset to built-in template" })}>Reset to built-in</button></Alert>}
      <Card title="Process definition">
        <div className="grid gap-3 md:grid-cols-2">
          {area("Process steps (one per line)", steps, setSteps)}
          {area("Failure modes (one per line)", modes, setModes)}
          {area("Hazards", hazards, setHazards)}
          {area("Quality characteristics", qc, setQc)}
          {area("Process parameters (name | unit)", params, setParams)}
          {area("Category-specific problem types (key | label)", ptypes, setPtypes, "Keys: lower_snake_case. Common types (downtime, quality_oos, …) are always available.")}
        </div>
      </Card>
      <Card title="Built-in questions" description="Untick to hide a question for this organization.">
        <ul className="grid gap-1 text-sm md:grid-cols-2">
          {base.questions.map((q) => (
            <li key={q.id} className="flex items-start gap-2">
              <input type="checkbox" aria-label={`Show ${q.id}`} checked={!hidden.includes(q.id)} disabled={!canEdit} onChange={(e) => setHidden(e.target.checked ? hidden.filter((h) => h !== q.id) : [...hidden, q.id])} />
              <span>{q.label} {q.showIf && <Badge color="purple">conditional</Badge>}</span>
            </li>
          ))}
          {!base.questions.length && <li className="text-slate-500">No built-in category questions.</li>}
        </ul>
      </Card>
      <Card title="Custom questions" actions={canEdit && <Button size="sm" variant="secondary" onClick={() => setQs([...qs, { id: `custom_${qs.length + 1}`, label: "", type: "text", options: "", required: false, field: "", op: "eq", value: "", rationale: "" }])}><Plus className="h-4 w-4" /> Question</Button>}>
        {qs.length === 0 && <p className="text-sm text-slate-500">No custom questions.</p>}
        <div className="space-y-2">
          {qs.map((q, i) => {
            const set = (patch: Partial<QDraft>) => setQs(qs.map((x, j) => (j === i ? { ...x, ...patch } : x)));
            return (
              <div key={i} className="grid gap-2 rounded border border-slate-200 p-2 md:grid-cols-6">
                <input aria-label="Question id" className="input py-1 font-mono text-xs" value={q.id} onChange={(e) => set({ id: e.target.value })} disabled={!canEdit} />
                <input aria-label="Question label" className="input py-1 text-xs md:col-span-3" placeholder="Question text" value={q.label} onChange={(e) => set({ label: e.target.value })} disabled={!canEdit} />
                <select aria-label="Type" className="input py-1 text-xs" value={q.type} onChange={(e) => set({ type: e.target.value as Question["type"] })} disabled={!canEdit}>{["text", "textarea", "number", "select", "multiselect", "boolean", "date"].map((t) => <option key={t}>{t}</option>)}</select>
                <div className="flex items-center gap-2"><label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={q.required} onChange={(e) => set({ required: e.target.checked })} disabled={!canEdit} /> required</label>{canEdit && <button aria-label="Remove question" onClick={() => setQs(qs.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4 text-slate-400" /></button>}</div>
                {["select", "multiselect"].includes(q.type) && <input aria-label="Options" className="input py-1 text-xs md:col-span-6" placeholder="Options, comma-separated" value={q.options} onChange={(e) => set({ options: e.target.value })} disabled={!canEdit} />}
                <span className="self-center text-xs text-slate-500">Show only if</span>
                <input aria-label="Condition field" className="input py-1 font-mono text-xs md:col-span-2" placeholder="problem.problem_type (blank = always)" value={q.field} onChange={(e) => set({ field: e.target.value })} disabled={!canEdit} />
                <select aria-label="Operator" className="input py-1 text-xs" value={q.op} onChange={(e) => set({ op: e.target.value })} disabled={!canEdit}>{["eq", "neq", "matches", "truthy"].map((t) => <option key={t}>{t}</option>)}</select>
                <input aria-label="Condition value" className="input py-1 text-xs md:col-span-2" placeholder="value / regex" value={q.value} onChange={(e) => set({ value: e.target.value })} disabled={!canEdit} />
                <input aria-label="Rationale" className="input py-1 text-xs md:col-span-6" placeholder="Why this question is asked (shown to users)" value={q.rationale} onChange={(e) => set({ rationale: e.target.value })} disabled={!canEdit} />
              </div>
            );
          })}
        </div>
      </Card>
      {canEdit && <div className="flex justify-end"><Button onClick={save} disabled={pending}>Save template</Button></div>}
    </div>
  );
}
