"use client";
import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { deleteControlPlanAction, upsertControlPlanAction } from "@/app/actions";
import { Button, Card, EmptyState } from "@/components/ui";
import { useAction } from "@/components/forms/useAction";
import type { ControlPlanItem } from "@/lib/types";
import { fmtDate } from "@/lib/utils";

const FIELDS: [keyof ControlPlanItem, string, string?][] = [
  ["process_step", "Process step *"],
  ["characteristic", "Characteristic *"],
  ["specification", "Specification / tolerance"],
  ["control_method", "Control method"],
  ["measurement_method", "Measurement method"],
  ["sample_size", "Sample size"],
  ["frequency", "Monitoring frequency"],
  ["control_limits", "Control limits (≠ spec limits)"],
  ["reaction_plan", "Reaction plan (out-of-control)"],
  ["owner", "Owner"],
  ["review_date", "Review date", "date"],
];

export function ControlPlanEditor({ invId, rows, readOnly }: { invId: string; rows: ControlPlanItem[]; readOnly: boolean }) {
  const { exec, pending, feedback } = useAction();
  const [editing, setEditing] = useState<string | null>(null);
  const form = (initial: Partial<ControlPlanItem>, id: string | null) => (
    <form className="grid gap-2 rounded-md border border-brand-200 bg-brand-50/40 p-3 md:grid-cols-4" onSubmit={(e) => {
      e.preventDefault();
      exec(() => upsertControlPlanAction(invId, id, Object.fromEntries(new FormData(e.currentTarget).entries())), { onOk: () => setEditing(null), success: "Control plan saved" });
    }}>
      {FIELDS.map(([k, label, type]) => (
        <div key={k} className={k === "reaction_plan" ? "md:col-span-2" : undefined}>
          <label className="label" htmlFor={`cp-${k}`}>{label}</label>
          <input id={`cp-${k}`} name={k} type={type ?? "text"} className="input" required={label.endsWith("*")} defaultValue={(initial[k] as string) ?? ""} />
        </div>
      ))}
      <div className="flex items-end justify-end gap-2 md:col-span-4">
        <Button type="button" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
        <Button type="submit" disabled={pending}>Save</Button>
      </div>
    </form>
  );
  return (
    <Card title="Control plan" description="How the improved process is sustained: what is monitored, how often, with which limits, and what happens when a signal occurs. Control limits come from process data; specification limits from requirements." actions={!readOnly && editing !== "new" && <Button size="sm" onClick={() => setEditing("new")}><Plus className="h-4 w-4" /> Add characteristic</Button>}>
      {feedback}
      {editing === "new" && <div className="mb-3">{form({}, null)}</div>}
      {rows.length === 0 && editing !== "new" ? <EmptyState title="No control plan items">Add the characteristics to monitor after implementing actions.</EmptyState> : (
        <div className="overflow-x-auto">
          <table className="table-base min-w-[1100px] text-xs">
            <thead><tr>{FIELDS.map(([, l]) => <th key={l}>{l.replace(" *", "")}</th>)}<th /></tr></thead>
            <tbody>
              {rows.map((r) => editing === r.id ? <tr key={r.id}><td colSpan={12}>{form(r, r.id)}</td></tr> : (
                <tr key={r.id}>
                  {FIELDS.map(([k]) => <td key={k}>{k === "review_date" ? fmtDate(r[k] as string) : ((r[k] as string) ?? "—")}</td>)}
                  <td className="whitespace-nowrap">{!readOnly && <><button aria-label="Edit" onClick={() => setEditing(r.id)}><Pencil className="h-3.5 w-3.5 text-slate-500" /></button><button aria-label="Delete" className="ml-2" onClick={() => confirm("Delete?") && exec(() => deleteControlPlanAction(invId, r.id))}><Trash2 className="h-3.5 w-3.5 text-slate-400" /></button></>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
