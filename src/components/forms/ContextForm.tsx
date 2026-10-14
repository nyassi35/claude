"use client";
import { useState } from "react";
import { createInvestigationAction, saveWizardStepAction } from "@/app/actions";
import { Button, Field } from "@/components/ui";
import { PRIORITIES, SEVERITIES, type Investigation, type Plant, type ProductionLine } from "@/lib/types";
import { titleCase } from "@/lib/utils";
import { useAction } from "./useAction";
import { useRouter } from "next/navigation";

const toLocalInput = (iso?: string | null) => (iso ? new Date(iso).toISOString().slice(0, 16) : "");

export function ContextForm(props: {
  categoryKey: string;
  categoryName: string;
  plants: Plant[];
  lines: ProductionLine[];
  members: { user_id: string; name: string }[];
  canAssign: boolean;
  currentUserId: string;
  investigation?: Investigation;
}) {
  const inv = props.investigation;
  const router = useRouter();
  const [plant, setPlant] = useState(inv?.plant_id ?? "");
  const { exec, pending, feedback } = useAction();
  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const data: Record<string, unknown> = Object.fromEntries(fd.entries());
    data.category_key = props.categoryKey;
    if (data.occurred_at) data.occurred_at = new Date(String(data.occurred_at)).toISOString();
    if (inv) exec(() => saveWizardStepAction(inv.id, 1, data), { onOk: () => router.push(`/investigations/${inv.id}/intake?step=2`) });
    else exec(() => createInvestigationAction(data));
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      {feedback}
      <p className="text-sm text-slate-600">Category: <span className="font-medium text-slate-900">{props.categoryName}</span></p>
      <Field label="Investigation title *" htmlFor="title">
        <input id="title" name="title" className="input" required minLength={3} maxLength={200} defaultValue={inv?.title} placeholder="e.g. Biochar output below weekly target" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Plant" htmlFor="plant_id">
          <select id="plant_id" name="plant_id" className="input" value={plant} onChange={(e) => setPlant(e.target.value)}>
            <option value="">—</option>
            {props.plants.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="Production line" htmlFor="line_id">
          <select id="line_id" name="line_id" className="input" defaultValue={inv?.line_id ?? ""}>
            <option value="">—</option>
            {props.lines.filter((l) => !plant || l.plant_id === plant).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </Field>
        <Field label="Department" htmlFor="department"><input id="department" name="department" className="input" defaultValue={inv?.department ?? ""} /></Field>
        <Field label="Process / operation" htmlFor="process_name"><input id="process_name" name="process_name" className="input" defaultValue={inv?.process_name ?? ""} /></Field>
        <Field label="Product" htmlFor="product"><input id="product" name="product" className="input" defaultValue={inv?.product ?? ""} /></Field>
        <Field label="Batch / lot number" htmlFor="batch_number"><input id="batch_number" name="batch_number" className="input" defaultValue={inv?.batch_number ?? ""} /></Field>
        <Field label="Equipment / asset ID" htmlFor="asset_id"><input id="asset_id" name="asset_id" className="input" defaultValue={inv?.asset_id ?? ""} /></Field>
        <Field label="Date & time of occurrence" htmlFor="occurred_at"><input id="occurred_at" type="datetime-local" name="occurred_at" className="input" defaultValue={toLocalInput(inv?.occurred_at)} /></Field>
        <Field label="Shift" htmlFor="shift"><input id="shift" name="shift" className="input" defaultValue={inv?.shift ?? ""} /></Field>
        <Field label="Severity *" htmlFor="severity">
          <select id="severity" name="severity" className="input" defaultValue={inv?.severity ?? "medium"}>
            {SEVERITIES.map((x) => <option key={x} value={x}>{titleCase(x)}</option>)}
          </select>
        </Field>
        <Field label="Priority *" htmlFor="priority">
          <select id="priority" name="priority" className="input" defaultValue={inv?.priority ?? "medium"}>
            {PRIORITIES.map((x) => <option key={x} value={x}>{titleCase(x)}</option>)}
          </select>
        </Field>
        <Field label="Investigation owner" htmlFor="owner_id" hint={props.canAssign ? undefined : "Only RCA managers can assign other owners"}>
          <select id="owner_id" name="owner_id" className="input" defaultValue={inv?.owner_id ?? props.currentUserId} disabled={!props.canAssign}>
            {props.members.map((m) => <option key={m.user_id} value={m.user_id}>{m.name}</option>)}
          </select>
          {!props.canAssign && <input type="hidden" name="owner_id" value={inv?.owner_id ?? props.currentUserId} />}
        </Field>
        <Field label="Target completion date" htmlFor="due_date"><input id="due_date" type="date" name="due_date" className="input" defaultValue={inv?.due_date ?? ""} /></Field>
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : inv ? "Save & continue" : "Create & continue"}</Button>
      </div>
    </form>
  );
}
