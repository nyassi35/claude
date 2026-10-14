"use client";
import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, Pencil, Plus, Trash2 } from "lucide-react";
import { createCapaAction, deleteCapaAction, updateCapaAction } from "@/app/actions";
import { Alert, Badge, Button, Card, EmptyState, Field, StatusBadge } from "@/components/ui";
import { useAction } from "@/components/forms/useAction";
import { CAPA_TRANSITIONS, isOverdue } from "@/lib/capa-rules";
import { CAPA_TYPES, PRIORITIES, type CapaAction, type CapaStatus, type Cause, type Role } from "@/lib/types";
import { fmtDate, fmtNum, titleCase } from "@/lib/utils";

const OPERATOR_STATUSES: CapaStatus[] = ["assigned", "in_progress", "pending_verification"];

export interface CapaCtx {
  role: Role;
  userId: string;
  canManage: boolean;
  canApproveClosure: boolean;
  canDelete: boolean;
  members: { user_id: string; name: string }[];
  currency: string;
}

export function CapaCard({ a, ctx, causes, invId, number, compact }: { a: CapaAction; ctx: CapaCtx; causes: Pick<Cause, "id" | "description" | "status">[]; invId: string; number?: string; compact?: boolean }) {
  const { exec, pending, feedback } = useAction();
  const [note, setNote] = useState("");
  const [result, setResult] = useState(a.actual_result ?? "");
  const [editing, setEditing] = useState(false);
  const overdue = isOverdue(a);
  const mine = a.assignee_id === ctx.userId;
  const canUpdate = ctx.canManage || ctx.canApproveClosure || (mine && ctx.role === "operator");
  const nextStatuses = CAPA_TRANSITIONS[a.status].filter((s) => {
    if (s === "closed") return ctx.canApproveClosure;
    if (!ctx.canManage && !ctx.canApproveClosure) return OPERATOR_STATUSES.includes(s);
    return true;
  });
  const cause = causes.find((c) => c.id === a.cause_id);
  const move = (status: CapaStatus) => {
    const patch: Record<string, unknown> = { status };
    if (note) patch.status_reason = note;
    if (result !== (a.actual_result ?? "")) patch.actual_result = result;
    exec(() => updateCapaAction(invId, a.id, patch), { success: `Moved to ${titleCase(status)}`, onOk: () => setNote("") });
  };
  if (editing) return <CapaForm invId={invId} causes={causes} ctx={ctx} initial={a} onDone={() => setEditing(false)} />;
  return (
    <div className={`rounded-md border bg-white p-3 text-sm ${overdue ? "border-red-300" : "border-slate-200"}`} data-testid="capa-card">
      {feedback}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {number && <Link href={`/investigations/${invId}/capa`} className="font-mono text-xs text-brand-700 hover:underline">{number}</Link>}
          <p className="font-medium text-slate-900">{a.description}</p>
          <div className="mt-1 flex flex-wrap gap-1">
            <StatusBadge value={a.status} />
            <Badge color={a.action_type === "containment" ? "amber" : a.action_type === "corrective" ? "blue" : "purple"}>{titleCase(a.action_type)}</Badge>
            <StatusBadge value={a.priority} />
            {overdue && <Badge color="red"><AlertTriangle className="h-3 w-3" /> Overdue</Badge>}
            {a.parent_action_id && <Badge>Follow-up cycle</Badge>}
          </div>
        </div>
        <div className="flex gap-1">
          {ctx.canManage && a.status !== "closed" && <button aria-label="Edit action" className="text-slate-500 hover:text-brand-700" onClick={() => setEditing(true)}><Pencil className="h-3.5 w-3.5" /></button>}
          {ctx.canDelete && <button aria-label="Delete action" className="text-slate-400 hover:text-red-600" onClick={() => confirm("Delete this action?") && exec(() => deleteCapaAction(invId, a.id))}><Trash2 className="h-3.5 w-3.5" /></button>}
        </div>
      </div>
      {!compact && (
        <dl className="mt-2 grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
          <div><dt className="inline font-semibold">Root cause: </dt><dd className="inline">{cause ? cause.description : a.action_type === "containment" ? "Containment (no cause required)" : "—"}</dd></div>
          <div><dt className="inline font-semibold">Responsible: </dt><dd className="inline">{a.responsible_name || ctx.members.find((m) => m.user_id === a.assignee_id)?.name || "Unassigned"}{a.department && ` · ${a.department}`}</dd></div>
          <div><dt className="inline font-semibold">Due: </dt><dd className="inline">{fmtDate(a.due_date)}</dd></div>
          <div><dt className="inline font-semibold">Est. cost: </dt><dd className="inline">{a.estimated_cost !== null ? `${fmtNum(a.estimated_cost)} ${ctx.currency}` : "—"}</dd></div>
          <div><dt className="inline font-semibold">Expected impact: </dt><dd className="inline">{a.expected_impact || "—"}</dd></div>
          <div><dt className="inline font-semibold">Resources: </dt><dd className="inline">{a.resources || "—"}</dd></div>
          <div><dt className="inline font-semibold">Verification: </dt><dd className="inline">{a.verification_method || "—"}</dd></div>
          <div><dt className="inline font-semibold">Acceptance criteria: </dt><dd className="inline">{a.acceptance_criteria || "—"}</dd></div>
          <div><dt className="inline font-semibold">Actual result: </dt><dd className="inline">{a.actual_result || "—"}</dd></div>
          <div><dt className="inline font-semibold">Effectiveness review: </dt><dd className="inline">{fmtDate(a.effectiveness_review_date)}</dd></div>
          {a.status_reason && <div className="sm:col-span-2"><dt className="inline font-semibold">Status note: </dt><dd className="inline">{a.status_reason}</dd></div>}
          {a.closure_approved_at && <div className="sm:col-span-2 text-emerald-700">Closure approved {fmtDate(a.closure_approved_at, true)} by {ctx.members.find((m) => m.user_id === a.closure_approved_by)?.name ?? "approver"}</div>}
        </dl>
      )}
      {canUpdate && nextStatuses.length > 0 && (
        <div className="mt-2 space-y-1.5 border-t border-slate-100 pt-2">
          {overdue && <p className="text-xs text-red-700">Overdue — a reason is required with the next update.</p>}
          {(!compact || overdue || a.status === "pending_verification") && (
            <div className="grid gap-1.5 sm:grid-cols-2">
              <input aria-label="Status note / reason" className="input py-1 text-xs" placeholder="Note / reason (required if ineffective or overdue)" value={note} onChange={(e) => setNote(e.target.value)} />
              <input aria-label="Actual result" className="input py-1 text-xs" placeholder="Actual result vs. acceptance criteria" value={result} onChange={(e) => setResult(e.target.value)} />
            </div>
          )}
          <div className="flex flex-wrap gap-1">
            {nextStatuses.map((s) => (
              <Button key={s} size="sm" variant={s === "ineffective" ? "danger" : s === "effective" || s === "closed" ? "success" : "secondary"} disabled={pending} onClick={() => move(s)}>
                → {titleCase(s)}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CapaForm({ invId, causes, ctx, initial, onDone }: { invId: string; causes: Pick<Cause, "id" | "description" | "status">[]; ctx: CapaCtx; initial?: CapaAction; onDone: () => void }) {
  const { exec, pending, feedback } = useAction();
  const [type, setType] = useState<string>(initial?.action_type ?? "corrective");
  const eligible = type === "containment" ? causes : causes.filter((c) => ["supported", "confirmed"].includes(c.status));
  return (
    <form className="grid gap-3 rounded-md border border-brand-200 bg-brand-50/40 p-3 md:grid-cols-3" onSubmit={(e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.currentTarget).entries());
      exec(() => (initial ? updateCapaAction(invId, initial.id, data) : createCapaAction(invId, data)), { onOk: onDone, success: initial ? "Action updated" : "Action created" });
    }}>
      <div className="md:col-span-3">{feedback}</div>
      <Field label="Classification" htmlFor="ca-type"><select id="ca-type" name="action_type" className="input" value={type} onChange={(e) => setType(e.target.value)}>{CAPA_TYPES.map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}</select></Field>
      <Field label={type === "containment" ? "Linked cause (optional)" : "Linked root cause *"} htmlFor="ca-cause" className="md:col-span-2" hint={type !== "containment" && !eligible.length ? "No supported or confirmed causes yet — corrective/preventive actions must address a demonstrated cause." : undefined}>
        <select id="ca-cause" name="cause_id" className="input" defaultValue={initial?.cause_id ?? ""}>
          <option value="">—</option>
          {eligible.map((c) => <option key={c.id} value={c.id}>[{titleCase(c.status)}] {c.description.slice(0, 90)}</option>)}
        </select>
      </Field>
      <Field label="Action description *" htmlFor="ca-desc" className="md:col-span-3"><textarea id="ca-desc" name="description" className="input" rows={2} required minLength={5} defaultValue={initial?.description} /></Field>
      <Field label="Expected impact" htmlFor="ca-imp"><input id="ca-imp" name="expected_impact" className="input" defaultValue={initial?.expected_impact ?? ""} /></Field>
      <Field label="Assignee (user)" htmlFor="ca-asg"><select id="ca-asg" name="assignee_id" className="input" defaultValue={initial?.assignee_id ?? ""}><option value="">—</option>{ctx.members.map((m) => <option key={m.user_id} value={m.user_id}>{m.name}</option>)}</select></Field>
      <Field label="Responsible person (name)" htmlFor="ca-resp"><input id="ca-resp" name="responsible_name" className="input" defaultValue={initial?.responsible_name ?? ""} /></Field>
      <Field label="Department" htmlFor="ca-dep"><input id="ca-dep" name="department" className="input" defaultValue={initial?.department ?? ""} /></Field>
      <Field label="Priority" htmlFor="ca-pri"><select id="ca-pri" name="priority" className="input" defaultValue={initial?.priority ?? "medium"}>{PRIORITIES.map((p) => <option key={p} value={p}>{titleCase(p)}</option>)}</select></Field>
      <Field label="Due date" htmlFor="ca-due"><input id="ca-due" type="date" name="due_date" className="input" defaultValue={initial?.due_date ?? ""} /></Field>
      <Field label={`Estimated cost (${ctx.currency})`} htmlFor="ca-cost"><input id="ca-cost" type="number" min={0} step="any" name="estimated_cost" className="input" defaultValue={initial?.estimated_cost ?? ""} /></Field>
      <Field label="Required resources" htmlFor="ca-res" className="md:col-span-2"><input id="ca-res" name="resources" className="input" defaultValue={initial?.resources ?? ""} /></Field>
      <Field label="Verification method" htmlFor="ca-ver"><input id="ca-ver" name="verification_method" className="input" defaultValue={initial?.verification_method ?? ""} /></Field>
      <Field label="Acceptance criteria (measurable)" htmlFor="ca-acc"><input id="ca-acc" name="acceptance_criteria" className="input" defaultValue={initial?.acceptance_criteria ?? ""} placeholder="e.g. ≥ 2,000 kg/week for 6 weeks" /></Field>
      <Field label="Effectiveness review date" htmlFor="ca-rev"><input id="ca-rev" type="date" name="effectiveness_review_date" className="input" defaultValue={initial?.effectiveness_review_date ?? ""} /></Field>
      <div className="flex justify-end gap-2 md:col-span-3">
        <Button type="button" variant="ghost" onClick={onDone}>Cancel</Button>
        <Button type="submit" disabled={pending}>{initial ? "Save" : "Create action"}</Button>
      </div>
    </form>
  );
}

export function CapaPanel({ invId, actions, causes, ctx, closed }: { invId: string; actions: CapaAction[]; causes: Cause[]; ctx: CapaCtx; closed: boolean }) {
  const [adding, setAdding] = useState(false);
  const counts = { total: actions.length, done: actions.filter((a) => ["effective", "closed"].includes(a.status)).length, overdue: actions.filter((a) => isOverdue(a)).length, ineffective: actions.filter((a) => a.status === "ineffective").length };
  return (
    <div className="space-y-4">
      <Card
        title="Corrective and preventive actions"
        description="Containment protects the customer now; corrective actions remove a demonstrated cause; preventive actions stop recurrence elsewhere. Ineffective actions reopen the investigation and start a new cycle."
        actions={ctx.canManage && !closed && !adding && <Button size="sm" onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> New action</Button>}
      >
        <div className="mb-3 flex flex-wrap gap-2 text-xs">
          <Badge>{counts.total} actions</Badge><Badge color="green">{counts.done} effective/closed</Badge>{counts.overdue > 0 && <Badge color="red">{counts.overdue} overdue</Badge>}{counts.ineffective > 0 && <Badge color="red">{counts.ineffective} ineffective</Badge>}
        </div>
        {adding && <div className="mb-4"><CapaForm invId={invId} causes={causes} ctx={ctx} onDone={() => setAdding(false)} /></div>}
        {actions.length === 0 && !adding ? (
          <EmptyState title="No actions yet">Start with containment while the root cause is being verified; add corrective and preventive actions once a cause is supported or confirmed.</EmptyState>
        ) : (
          <div className="space-y-3">{actions.map((a) => <CapaCard key={a.id} a={a} ctx={ctx} causes={causes} invId={invId} />)}</div>
        )}
      </Card>
      {closed && <Alert kind="info">The investigation is closed; reopen it to add actions.</Alert>}
    </div>
  );
}
