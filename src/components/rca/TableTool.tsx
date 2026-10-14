"use client";
import { useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import { saveAnalysisAction } from "@/app/actions";
import { Button, Card } from "@/components/ui";
import { useAction } from "@/components/forms/useAction";
import { TABLE_TOOLS } from "@/lib/rca/table-tools";

export function TableTool({ invId, method, initial, readOnly }: { invId: string; method: string; initial: { rows: Record<string, unknown>[]; notes?: string } | null; readOnly: boolean }) {
  const cfg = TABLE_TOOLS[method];
  const [rows, setRows] = useState<Record<string, unknown>[]>(initial?.rows?.length ? initial.rows : (cfg.defaults ?? []));
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [dirty, setDirty] = useState(false);
  const { exec, pending, feedback } = useAction();
  const set = (i: number, k: string, v: string) => { setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r))); setDirty(true); };
  return (
    <Card
      title="Worksheet"
      description={cfg.hint}
      actions={!readOnly && (
        <>
          <Button size="sm" variant="secondary" onClick={() => { setRows([...rows, {}]); setDirty(true); }}><Plus className="h-4 w-4" /> Row</Button>
          <Button size="sm" disabled={!dirty || pending} onClick={() => exec(() => saveAnalysisAction(invId, method, { rows, notes }), { success: "Saved", onOk: () => setDirty(false) })}><Save className="h-4 w-4" /> Save</Button>
        </>
      )}
    >
      {feedback}
      <div className="overflow-x-auto">
        <table className="table-base min-w-[800px] text-xs">
          <thead><tr>{cfg.columns.map((c) => <th key={c.key}>{c.label}</th>)}<th /></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                {cfg.columns.map((c) => (
                  <td key={c.key} className={c.width}>
                    {c.type === "select" ? (
                      <select aria-label={c.label} className="input py-1 text-xs" disabled={readOnly} value={String(r[c.key] ?? "")} onChange={(e) => set(i, c.key, e.target.value)}>
                        <option value="">—</option>
                        {c.options!.map((o) => <option key={o}>{o}</option>)}
                      </select>
                    ) : c.type === "textarea" ? (
                      <textarea aria-label={c.label} className="input py-1 text-xs" rows={2} disabled={readOnly} value={String(r[c.key] ?? "")} onChange={(e) => set(i, c.key, e.target.value)} />
                    ) : (
                      <input aria-label={c.label} className="input py-1 text-xs" disabled={readOnly} value={String(r[c.key] ?? "")} onChange={(e) => set(i, c.key, e.target.value)} />
                    )}
                  </td>
                ))}
                <td>{!readOnly && <button aria-label="Remove row" onClick={() => { setRows(rows.filter((_, j) => j !== i)); setDirty(true); }}><Trash2 className="h-3.5 w-3.5 text-slate-400 hover:text-red-600" /></button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && <p className="py-3 text-sm text-slate-500">No rows yet.</p>}
      <label className="label mt-3" htmlFor="tt-notes">Conclusions / notes</label>
      <textarea id="tt-notes" className="input" rows={3} disabled={readOnly} value={notes} onChange={(e) => { setNotes(e.target.value); setDirty(true); }} />
    </Card>
  );
}
