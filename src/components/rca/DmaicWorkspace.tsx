"use client";
import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, Plus, Save, Trash2 } from "lucide-react";
import { saveAnalysisAction, signApprovalAction } from "@/app/actions";
import { Alert, Badge, Button, Card, StatusBadge } from "@/components/ui";
import { useAction } from "@/components/forms/useAction";
import { DMAIC_DELIVERABLES, DMAIC_PHASES, type DmaicPhase } from "@/lib/rca/catalog";
import { countermeasureScore, dmaicPhaseStatus, type Dmaic } from "@/lib/rca/methods";
import type { Cause, KpiValue } from "@/lib/types";
import { cn, newId, titleCase } from "@/lib/utils";

const PHASE_TOOLS: Record<DmaicPhase, { label: string; href: string }[]> = {
  define: [{ label: "Problem definition (intake)", href: "intake?step=2" }],
  measure: [{ label: "Measurement data", href: "evidence" }, { label: "Pareto", href: "tools/pareto" }, { label: "Process map", href: "tools/process_map" }, { label: "SPC & capability", href: "tools/spc" }],
  analyze: [{ label: "5 Whys", href: "five-whys" }, { label: "Ishikawa", href: "ishikawa" }, { label: "Trend & correlation", href: "tools/trend" }, { label: "Good vs. defective", href: "tools/comparative" }, { label: "FMEA", href: "fmea" }, { label: "Cause register", href: "causes" }],
  improve: [{ label: "CAPA register", href: "capa" }],
  control: [{ label: "Control plan", href: "control-plan" }, { label: "SPC charts", href: "tools/spc" }],
};

export function DmaicWorkspace({ invId, initial, readOnly, canApprove, kpis, causes }: { invId: string; initial: Dmaic | null; readOnly: boolean; canApprove: boolean; kpis: KpiValue[]; causes: Cause[] }) {
  const [data, setData] = useState<Dmaic>(initial ?? { phases: {}, sipoc: { suppliers: "", inputs: "", process: "", outputs: "", customers: "" }, countermeasures: [] });
  const [phase, setPhase] = useState<DmaicPhase>("define");
  const [dirty, setDirty] = useState(false);
  const { exec, pending, feedback } = useAction();
  const update = (d: Dmaic) => { setData(d); setDirty(true); };
  const ph = data.phases[phase] ?? { fields: {}, gate_approved: false, notes: "" };
  const setField = (k: string, v: string) => update({ ...data, phases: { ...data.phases, [phase]: { ...ph, fields: { ...ph.fields, [k]: v } } } });
  const st = dmaicPhaseStatus(data, phase);
  const allComplete = DMAIC_PHASES.every((p) => dmaicPhaseStatus(data, p).status !== "not_started" && dmaicPhaseStatus(data, p).missing.length === 0);

  return (
    <div className="space-y-4">
      {feedback}
      <div className="grid grid-cols-5 gap-2" role="tablist" aria-label="DMAIC phases">
        {DMAIC_PHASES.map((p) => {
          const s = dmaicPhaseStatus(data, p);
          return (
            <button key={p} role="tab" aria-selected={phase === p} onClick={() => setPhase(p)} className={cn("card p-2 text-left", phase === p && "border-brand-500 ring-2 ring-brand-500/20")}>
              <p className="text-sm font-semibold">{titleCase(p)}</p>
              <div className="mt-1 h-1.5 rounded bg-slate-100"><div className="h-1.5 rounded bg-brand-600" style={{ width: `${s.progress}%` }} /></div>
              <StatusBadge value={s.status} className="mt-1" />
            </button>
          );
        })}
      </div>
      <Card
        title={`${titleCase(phase)} — required deliverables`}
        description="A phase is complete when every required deliverable is documented; the gate is then approved by an RCA Manager."
        actions={!readOnly && <Button size="sm" disabled={!dirty || pending} onClick={() => exec(() => saveAnalysisAction(invId, "dmaic", data, allComplete ? "complete" : "in_progress"), { success: "DMAIC saved", onOk: () => setDirty(false) })}><Save className="h-4 w-4" /> Save</Button>}
      >
        {phase === "measure" && kpis.length > 0 && (
          <Alert kind="info" className="mb-3" title="Baseline from intake KPIs">
            {kpis.map((k) => `${k.label}: baseline ${k.baseline ?? "?"}, actual ${k.actual ?? "?"}, target ${k.target ?? "?"} ${k.unit}`).join(" · ")}
          </Alert>
        )}
        {phase === "analyze" && (
          <div className="mb-3 rounded-md bg-slate-50 p-2 text-sm">
            <p className="mb-1 font-medium">Cause register status</p>
            {causes.length ? causes.map((c) => <p key={c.id} className="flex items-center gap-2 text-xs"><StatusBadge value={c.status} /> {c.description}</p>) : <p className="text-xs text-slate-500">No causes yet.</p>}
          </div>
        )}
        <div className="space-y-3">
          {DMAIC_DELIVERABLES[phase].map((del) => (
            <div key={del.key}>
              <label className="label" htmlFor={`dm-${del.key}`}>{del.label} {del.required && <span className="text-red-600">*</span>}</label>
              <textarea id={`dm-${del.key}`} className="input" rows={2} disabled={readOnly} placeholder={del.help} value={ph.fields[del.key] ?? ""} onChange={(e) => setField(del.key, e.target.value)} />
            </div>
          ))}
        </div>
        {phase === "define" && (
          <div className="mt-4">
            <p className="label">SIPOC</p>
            <div className="grid gap-2 md:grid-cols-5">
              {(["suppliers", "inputs", "process", "outputs", "customers"] as const).map((k) => (
                <div key={k}>
                  <p className="mb-1 text-center text-xs font-bold uppercase text-brand-700">{k[0].toUpperCase()}<span className="font-normal normal-case text-slate-600">{k.slice(1)}</span></p>
                  <textarea aria-label={`SIPOC ${k}`} className="input text-xs" rows={4} disabled={readOnly} value={data.sipoc[k]} onChange={(e) => update({ ...data, sipoc: { ...data.sipoc, [k]: e.target.value } })} />
                </div>
              ))}
            </div>
          </div>
        )}
        {phase === "improve" && (
          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="label">Countermeasure evaluation (1 = low, 5 = high)</p>
              {!readOnly && <Button size="sm" variant="secondary" onClick={() => update({ ...data, countermeasures: [...data.countermeasures, { id: newId(), name: "", cost: 3, benefit: 3, risk: 3, feasibility: 3, trial_result: "", selected: false }] })}><Plus className="h-3.5 w-3.5" /> Countermeasure</Button>}
            </div>
            <div className="overflow-x-auto">
              <table className="table-base min-w-[760px] text-xs">
                <thead><tr><th>Countermeasure</th><th>Cost</th><th>Benefit</th><th>Risk</th><th>Feasibility</th><th title="2×benefit + feasibility − cost − risk">Score</th><th>Trial / experiment result</th><th>Selected</th><th /></tr></thead>
                <tbody>
                  {[...data.countermeasures].sort((a, b) => countermeasureScore(b) - countermeasureScore(a)).map((c) => {
                    const set = (patch: Partial<typeof c>) => update({ ...data, countermeasures: data.countermeasures.map((x) => (x.id === c.id ? { ...x, ...patch } : x)) });
                    return (
                      <tr key={c.id}>
                        <td><input aria-label="Countermeasure" className="input py-1 text-xs" value={c.name} disabled={readOnly} onChange={(e) => set({ name: e.target.value })} /></td>
                        {(["cost", "benefit", "risk", "feasibility"] as const).map((k) => (
                          <td key={k}><select aria-label={k} className="input w-14 py-1 text-xs" value={c[k]} disabled={readOnly} onChange={(e) => set({ [k]: Number(e.target.value) })}>{[1, 2, 3, 4, 5].map((n) => <option key={n}>{n}</option>)}</select></td>
                        ))}
                        <td className="font-semibold">{countermeasureScore(c)}</td>
                        <td><input aria-label="Trial result" className="input py-1 text-xs" value={c.trial_result} disabled={readOnly} onChange={(e) => set({ trial_result: e.target.value })} /></td>
                        <td><input aria-label="Selected" type="checkbox" checked={c.selected} disabled={readOnly} onChange={(e) => set({ selected: e.target.checked })} /></td>
                        <td>{!readOnly && <button aria-label="Remove" onClick={() => update({ ...data, countermeasures: data.countermeasures.filter((x) => x.id !== c.id) })}><Trash2 className="h-3.5 w-3.5 text-slate-400" /></button>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
          <div className="text-sm">
            {st.missing.length ? <span className="text-amber-700">Completion criteria not met: {st.missing.join("; ")}</span> : <span className="flex items-center gap-1 text-emerald-700"><CheckCircle2 className="h-4 w-4" /> All required deliverables documented</span>}
          </div>
          <div className="flex items-center gap-2">
            {ph.gate_approved ? <Badge color="green">Gate approved</Badge> : canApprove && !readOnly && (
              <Button size="sm" variant="success" disabled={st.missing.length > 0 || pending} onClick={() => {
                const next = { ...data, phases: { ...data.phases, [phase]: { ...ph, gate_approved: true } } };
                setData(next);
                exec(async () => {
                  const r = await saveAnalysisAction(invId, "dmaic", next);
                  if (!r.ok) return r;
                  return signApprovalAction(invId, { record_type: "dmaic_phase", record_id: phase, decision: "approved", comment: `${titleCase(phase)} gate approved` });
                }, { success: "Phase gate approved", onOk: () => setDirty(false) });
              }}>Approve gate</Button>
            )}
          </div>
        </div>
      </Card>
      <Card title="Tools for this phase">
        <div className="flex flex-wrap gap-2">
          {PHASE_TOOLS[phase].map((t) => <Link key={t.href} href={`/investigations/${invId}/${t.href}`} className="rounded-full border border-slate-300 px-3 py-1 text-sm hover:bg-slate-50">{t.label}</Link>)}
        </div>
      </Card>
    </div>
  );
}
