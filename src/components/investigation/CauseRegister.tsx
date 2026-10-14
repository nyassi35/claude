"use client";
import { useState } from "react";
import { Bot, CheckCircle2, Pencil, Plus, Trash2 } from "lucide-react";
import { createCauseAction, deleteCauseAction, updateCauseAction } from "@/app/actions";
import { Alert, Badge, Button, Card, EmptyState, Field, StatusBadge } from "@/components/ui";
import { useAction } from "@/components/forms/useAction";
import { CAUSE_STATUSES, CAUSE_TYPES, CONFIDENCE, SIX_M, SIX_M_LABELS, type Cause } from "@/lib/types";
import { fmtDate, titleCase } from "@/lib/utils";

type Draft = Partial<Cause>;
const EMPTY: Draft = { description: "", category: null, cause_type: "possible_cause", status: "hypothesis", confidence: "low", evidence_ids: [] };

function CauseForm({ initial, evidence, onSubmit, onCancel, pending, allowConfirm }: { initial: Draft; evidence: { id: string; title: string; verified: boolean }[]; onSubmit: (d: Draft) => void; onCancel: () => void; pending: boolean; allowConfirm: boolean }) {
  const [d, setD] = useState<Draft>(initial);
  const set = (k: keyof Cause, v: unknown) => setD({ ...d, [k]: v });
  const statuses = CAUSE_STATUSES.filter((s) => s !== "confirmed" || allowConfirm || initial.status === "confirmed");
  return (
    <form className="grid gap-3 rounded-md border border-brand-200 bg-brand-50/40 p-3 md:grid-cols-3" onSubmit={(e) => { e.preventDefault(); onSubmit(d); }}>
      <Field label="Cause description *" htmlFor="c-desc" className="md:col-span-3"><textarea id="c-desc" className="input" rows={2} required minLength={3} value={d.description ?? ""} onChange={(e) => set("description", e.target.value)} /></Field>
      <Field label="Category (6M)" htmlFor="c-cat"><select id="c-cat" className="input" value={d.category ?? ""} onChange={(e) => set("category", e.target.value || null)}><option value="">—</option>{SIX_M.map((m) => <option key={m} value={m}>{SIX_M_LABELS[m]}</option>)}</select></Field>
      <Field label="Type" htmlFor="c-type" hint="Symptom → possible cause → contributing / root / systemic"><select id="c-type" className="input" value={d.cause_type} onChange={(e) => set("cause_type", e.target.value)}>{CAUSE_TYPES.map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}</select></Field>
      <Field label="Status" htmlFor="c-status" hint={!allowConfirm ? "Confirmation requires an approver role" : "Confirm only with adequate evidence"}><select id="c-status" className="input" value={d.status} onChange={(e) => set("status", e.target.value)}>{statuses.map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}</select></Field>
      <Field label="Evidence supporting it" htmlFor="c-for"><textarea id="c-for" className="input" rows={2} value={d.evidence_for ?? ""} onChange={(e) => set("evidence_for", e.target.value)} /></Field>
      <Field label="Evidence against / remaining uncertainty" htmlFor="c-against"><textarea id="c-against" className="input" rows={2} value={d.evidence_against ?? ""} onChange={(e) => set("evidence_against", e.target.value)} /></Field>
      <Field label="Linked evidence records" htmlFor="c-ev">
        <select id="c-ev" multiple className="input h-20" value={d.evidence_ids ?? []} onChange={(e) => set("evidence_ids", Array.from(e.target.selectedOptions).map((o) => o.value))}>
          {evidence.map((e) => <option key={e.id} value={e.id}>{e.verified ? "✓ " : "? "}{e.title}</option>)}
        </select>
      </Field>
      <Field label="Confidence" htmlFor="c-conf"><select id="c-conf" className="input" value={d.confidence} onChange={(e) => set("confidence", e.target.value)}>{CONFIDENCE.map((c) => <option key={c} value={c}>{titleCase(c)}</option>)}</select></Field>
      <Field label="Confidence explanation" htmlFor="c-confr" className="md:col-span-2"><input id="c-confr" className="input" value={d.confidence_rationale ?? ""} onChange={(e) => set("confidence_rationale", e.target.value)} placeholder="What evidence the confidence is based on" /></Field>
      <Field label="Verification test" htmlFor="c-test" className="md:col-span-2"><input id="c-test" className="input" value={d.verification_test ?? ""} onChange={(e) => set("verification_test", e.target.value)} placeholder="How will this cause be confirmed or rejected?" /></Field>
      <Field label="Owner" htmlFor="c-owner"><input id="c-owner" className="input" value={d.owner ?? ""} onChange={(e) => set("owner", e.target.value)} /></Field>
      <Field label="Verification result" htmlFor="c-res" className="md:col-span-3"><input id="c-res" className="input" value={d.verification_result ?? ""} onChange={(e) => set("verification_result", e.target.value)} /></Field>
      <div className="flex justify-end gap-2 md:col-span-3">
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={pending}>Save cause</Button>
      </div>
    </form>
  );
}

export function CauseRegister(props: { invId: string; causes: Cause[]; evidence: { id: string; title: string; verified: boolean }[]; canEdit: boolean; canConfirm: boolean; closed: boolean; names: Record<string, string> }) {
  const { exec, pending, feedback } = useAction();
  const [editing, setEditing] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("");
  const editable = !props.closed;
  const rows = props.causes.filter((c) => !filter || c.status === filter);
  const toPayload = (d: Draft) => ({
    description: d.description, category: d.category, cause_type: d.cause_type, status: d.status, evidence_for: d.evidence_for, evidence_against: d.evidence_against,
    evidence_ids: d.evidence_ids ?? [], confidence: d.confidence, confidence_rationale: d.confidence_rationale, verification_test: d.verification_test,
    verification_result: d.verification_result, owner: d.owner,
  });
  const counts = Object.fromEntries(CAUSE_STATUSES.map((s) => [s, props.causes.filter((c) => c.status === s).length]));
  return (
    <Card
      title="Cause register"
      description="Distinguish symptoms, possible causes, contributing factors and verified root causes. A cause is confirmed only with documented evidence and approval by an authorised reviewer."
      actions={props.canEdit && editable && editing !== "new" && <Button size="sm" onClick={() => setEditing("new")}><Plus className="h-4 w-4" /> Add cause</Button>}
    >
      {feedback}
      <div className="mb-3 flex flex-wrap gap-1.5 text-xs">
        <button className={`rounded-full px-2 py-0.5 ${!filter ? "bg-slate-800 text-white" : "bg-slate-100"}`} onClick={() => setFilter("")}>All ({props.causes.length})</button>
        {CAUSE_STATUSES.map((s) => <button key={s} className={`rounded-full px-2 py-0.5 ${filter === s ? "bg-slate-800 text-white" : "bg-slate-100"}`} onClick={() => setFilter(s)}>{titleCase(s)} ({counts[s]})</button>)}
      </div>
      {editing === "new" && (
        <div className="mb-4">
          <CauseForm initial={EMPTY} evidence={props.evidence} pending={pending} allowConfirm={false} onCancel={() => setEditing(null)} onSubmit={(d) => exec(() => createCauseAction(props.invId, toPayload(d)), { onOk: () => setEditing(null), success: "Cause added" })} />
        </div>
      )}
      {rows.length === 0 && editing !== "new" ? (
        <EmptyState title="No causes recorded">Add causes manually, or promote hypotheses from the 5 Whys, Ishikawa or the AI assistant.</EmptyState>
      ) : (
        <ul className="space-y-3">
          {rows.map((c) =>
            editing === c.id ? (
              <li key={c.id}><CauseForm initial={c} evidence={props.evidence} pending={pending} allowConfirm={props.canConfirm} onCancel={() => setEditing(null)} onSubmit={(d) => exec(() => updateCauseAction(props.invId, c.id, toPayload(d)), { onOk: () => setEditing(null), success: "Cause updated" })} /></li>
            ) : (
              <li key={c.id} className="rounded-md border border-slate-200 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-900">{c.description}</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <StatusBadge value={c.status} />
                      <Badge>{titleCase(c.cause_type)}</Badge>
                      {c.category && <Badge color="blue">{SIX_M_LABELS[c.category]}</Badge>}
                      <Badge color={c.confidence === "high" ? "green" : c.confidence === "medium" ? "amber" : "slate"}>Confidence: {c.confidence}</Badge>
                      {c.ai_suggested && <Badge color="purple"><Bot className="h-3 w-3" /> AI-suggested</Badge>}
                      {c.source_method && <Badge>{titleCase(c.source_method)}</Badge>}
                    </div>
                  </div>
                  {editable && (
                    <div className="flex gap-1">
                      {props.canConfirm && c.status !== "confirmed" && c.status !== "rejected" && (
                        <Button size="sm" variant="success" disabled={pending} onClick={() => confirm("Confirm this as a verified cause? Your approval will be recorded.") && exec(() => updateCauseAction(props.invId, c.id, { status: "confirmed" }), { success: "Cause confirmed and approval recorded" })}>
                          <CheckCircle2 className="h-3.5 w-3.5" /> Confirm
                        </Button>
                      )}
                      {props.canEdit && <Button size="sm" variant="ghost" onClick={() => setEditing(c.id)} aria-label="Edit cause"><Pencil className="h-3.5 w-3.5" /></Button>}
                      {props.canEdit && <Button size="sm" variant="ghost" aria-label="Delete cause" onClick={() => confirm("Delete this cause?") && exec(() => deleteCauseAction(props.invId, c.id))}><Trash2 className="h-3.5 w-3.5" /></Button>}
                    </div>
                  )}
                </div>
                <dl className="mt-2 grid gap-2 text-sm md:grid-cols-2">
                  <div><dt className="text-xs font-semibold text-emerald-700">Evidence for</dt><dd>{c.evidence_for || <span className="text-slate-400">None recorded</span>}{c.evidence_ids?.length ? <span className="block text-xs text-slate-500">Linked: {c.evidence_ids.map((id) => props.evidence.find((e) => e.id === id)?.title ?? "removed").join("; ")}</span> : null}</dd></div>
                  <div><dt className="text-xs font-semibold text-red-700">Evidence against / uncertainty</dt><dd>{c.evidence_against || <span className="text-slate-400">Not assessed</span>}</dd></div>
                  <div><dt className="text-xs font-semibold text-slate-600">Confidence explanation</dt><dd>{c.confidence_rationale || "—"}</dd></div>
                  <div><dt className="text-xs font-semibold text-slate-600">Verification test → result</dt><dd>{c.verification_test || "—"}{c.verification_result && <> → <span className="font-medium">{c.verification_result}</span></>}</dd></div>
                </dl>
                {c.status === "confirmed" && c.approved_by && <p className="mt-2 text-xs text-emerald-700">Confirmed by {props.names[c.approved_by] || "approver"} on {fmtDate(c.approved_at, true)}</p>}
                {c.status === "supported" && !props.canConfirm && <Alert kind="info" className="mt-2">Supported — ready for review by an RCA Manager or Reviewer.</Alert>}
              </li>
            ),
          )}
        </ul>
      )}
    </Card>
  );
}
