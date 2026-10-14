"use client";
import { useMemo, useState } from "react";
import { Background, Controls, ReactFlow, type Edge, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Plus, Save, Trash2 } from "lucide-react";
import { saveAnalysisAction } from "@/app/actions";
import { Alert, Badge, Button, Card } from "@/components/ui";
import { useAction } from "@/components/forms/useAction";
import { ParetoChart } from "@/components/charts";
import { pareto } from "@/lib/calc/pareto";
import { ceMatrixTotals, ftaProbability, type FtaNode } from "@/lib/rca/methods";
import { fmtNum, newId } from "@/lib/utils";
import { layoutTree } from "./treeLayout";

function useSaver(invId: string, method: string) {
  const a = useAction();
  const [dirty, setDirty] = useState(false);
  const saveBtn = (data: unknown, readOnly: boolean) =>
    !readOnly && (
      <Button size="sm" disabled={!dirty || a.pending} onClick={() => a.exec(() => saveAnalysisAction(invId, method, data), { success: "Saved", onOk: () => setDirty(false) })}>
        <Save className="h-4 w-4" /> Save
      </Button>
    );
  return { ...a, dirty, setDirty, saveBtn };
}

// ------------------------------------------------------------------ Pareto
export function ParetoTool({ invId, initial, readOnly }: { invId: string; initial: { metric: string; unit: string; period: string; items: { label: string; value: number }[] } | null; readOnly: boolean }) {
  const [d, setD] = useState(initial ?? { metric: "", unit: "count", period: "", items: [{ label: "", value: 0 }] });
  const s = useSaver(invId, "pareto");
  const res = useMemo(() => pareto(d.items.filter((i) => i.label.trim())), [d]);
  const upd = (next: typeof d) => { setD(next); s.setDirty(true); };
  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <Card className="lg:col-span-2" title="Categories" actions={s.saveBtn(d, readOnly)}>
        {s.feedback}
        <div className="mb-3 grid grid-cols-2 gap-2">
          <input aria-label="Metric" className="input col-span-2" placeholder="Metric (e.g. Stoppages by failure code)" value={d.metric} disabled={readOnly} onChange={(e) => upd({ ...d, metric: e.target.value })} />
          <input aria-label="Unit" className="input" placeholder="Unit" value={d.unit} disabled={readOnly} onChange={(e) => upd({ ...d, unit: e.target.value })} />
          <input aria-label="Period" className="input" placeholder="Period" value={d.period} disabled={readOnly} onChange={(e) => upd({ ...d, period: e.target.value })} />
        </div>
        {d.items.map((it, i) => (
          <div key={i} className="mb-1.5 flex gap-2">
            <input aria-label="Category" className="input" placeholder="Category" value={it.label} disabled={readOnly} onChange={(e) => upd({ ...d, items: d.items.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
            <input aria-label="Value" type="number" step="any" min={0} className="input w-28" value={Number.isFinite(it.value) ? it.value : ""} disabled={readOnly} onChange={(e) => upd({ ...d, items: d.items.map((x, j) => (j === i ? { ...x, value: e.target.value === "" ? NaN : Number(e.target.value) } : x)) })} />
            {!readOnly && <button aria-label="Remove" onClick={() => upd({ ...d, items: d.items.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4 text-slate-400" /></button>}
          </div>
        ))}
        {!readOnly && <Button size="sm" variant="secondary" onClick={() => upd({ ...d, items: [...d.items, { label: "", value: 0 }] })}><Plus className="h-4 w-4" /> Category</Button>}
        {res.errors.length > 0 && <Alert kind="error" className="mt-2"><ul>{res.errors.map((e) => <li key={e}>{e}</li>)}</ul></Alert>}
      </Card>
      <Card className="lg:col-span-3" title={d.metric || "Pareto chart"} description={`Total ${fmtNum(res.total)} ${d.unit} · darker bars = vital few (up to 80% cumulative)`}>
        <ParetoChart rows={res.rows} unit={d.unit} />
        <table className="table-base mt-3 text-xs">
          <thead><tr><th>Category</th><th>Value</th><th>Share</th><th>Cumulative</th></tr></thead>
          <tbody>{res.rows.map((r) => <tr key={r.label} className={r.vital ? "font-medium" : "text-slate-500"}><td>{r.label} {r.vital && <Badge color="blue">vital few</Badge>}</td><td>{fmtNum(r.value)}</td><td>{fmtNum(r.share, 1)}%</td><td>{fmtNum(r.cumulative, 1)}%</td></tr>)}</tbody>
        </table>
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------ Fault tree
export function FaultTreeTool({ invId, initial, readOnly }: { invId: string; initial: { nodes: FtaNode[] } | null; readOnly: boolean }) {
  const [nodes, setNodes] = useState<FtaNode[]>(initial?.nodes?.length ? initial.nodes : [{ id: "top", parentId: null, label: "Top event", kind: "event", gate: "OR", probability: null }]);
  const s = useSaver(invId, "fault_tree");
  const upd = (n: FtaNode[]) => { setNodes(n); s.setDirty(true); };
  const setNode = (id: string, patch: Partial<FtaNode>) => upd(nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)));
  const top = nodes.find((n) => !n.parentId);
  const p = top ? ftaProbability(nodes, top.id) : null;
  const pos = layoutTree(nodes, { dx: 200, dy: 110 });
  const flowNodes: Node[] = nodes.map((n) => {
    const kids = nodes.some((k) => k.parentId === n.id);
    return {
      id: n.id,
      position: pos.get(n.id) ?? { x: 0, y: 0 },
      data: { label: `${n.label}${kids && n.gate ? `\n[${n.gate}]` : ""}${!kids && n.probability !== null ? `\nP=${n.probability}` : ""}` },
      style: { width: 180, fontSize: 11, whiteSpace: "pre-line", borderRadius: n.kind === "basic" ? 90 : 6, border: n.kind === "undeveloped" ? "2px dashed #94a3b8" : "1.5px solid #334155", background: !n.parentId ? "#0f172a" : "white", color: !n.parentId ? "white" : "#0f172a" },
    };
  });
  const flowEdges: Edge[] = nodes.filter((n) => n.parentId).map((n) => ({ id: `e${n.id}`, source: n.parentId!, target: n.id, type: "step" }));
  return (
    <div className="space-y-4">
      <Card title="Fault tree" actions={s.saveBtn({ nodes }, readOnly)} description="Events with children use their gate (AND / OR). Leaves are basic or undeveloped events; give probabilities to estimate the top event under an independence assumption.">
        {s.feedback}
        <ul className="space-y-1.5">
          {nodes.map((n) => {
            const depth = (() => { let d = 0, c = n; while (c.parentId) { d++; c = nodes.find((x) => x.id === c.parentId) ?? { ...c, parentId: null }; } return d; })();
            const hasKids = nodes.some((k) => k.parentId === n.id);
            return (
              <li key={n.id} style={{ marginLeft: depth * 18 }} className="flex flex-wrap items-center gap-2 rounded border border-slate-200 p-1.5">
                <input aria-label="Event" className="input min-w-[200px] flex-1 py-1 text-xs" value={n.label} disabled={readOnly} onChange={(e) => setNode(n.id, { label: e.target.value })} />
                {hasKids ? (
                  <select aria-label="Gate" className="input w-20 py-1 text-xs" value={n.gate ?? "OR"} disabled={readOnly} onChange={(e) => setNode(n.id, { gate: e.target.value as "AND" | "OR" })}><option>OR</option><option>AND</option></select>
                ) : (
                  <>
                    <select aria-label="Kind" className="input w-32 py-1 text-xs" value={n.kind} disabled={readOnly} onChange={(e) => setNode(n.id, { kind: e.target.value as FtaNode["kind"] })}><option value="event">Event</option><option value="basic">Basic event</option><option value="undeveloped">Undeveloped</option></select>
                    <input aria-label="Probability" type="number" min={0} max={1} step="any" placeholder="P (0–1)" className="input w-24 py-1 text-xs" value={n.probability ?? ""} disabled={readOnly} onChange={(e) => setNode(n.id, { probability: e.target.value === "" ? null : Math.min(1, Math.max(0, Number(e.target.value))) })} />
                  </>
                )}
                {!readOnly && <Button size="sm" variant="ghost" onClick={() => upd([...nodes, { id: newId(), parentId: n.id, label: "", kind: "basic", gate: "OR", probability: null }])}>+ child</Button>}
                {!readOnly && n.parentId && <button aria-label="Remove event" onClick={() => { const drop = new Set([n.id]); let g = true; while (g) { g = false; for (const x of nodes) if (x.parentId && drop.has(x.parentId) && !drop.has(x.id)) { drop.add(x.id); g = true; } } upd(nodes.filter((x) => !drop.has(x.id))); }}><Trash2 className="h-3.5 w-3.5 text-slate-400" /></button>}
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-sm">Estimated top-event probability: <span className="font-semibold">{p === null ? "not calculable (missing basic-event probabilities)" : p.toPrecision(3)}</span> <span className="text-xs text-slate-500">— assumes independent events; common-cause failures are not modelled.</span></p>
      </Card>
      <Card title="Diagram">
        <div className="h-[420px] rounded border border-slate-200" role="img" aria-label="Fault tree diagram">
          <ReactFlow nodes={flowNodes} edges={flowEdges} fitView nodesDraggable={false} nodesConnectable={false} proOptions={{ hideAttribution: true }}><Background gap={16} color="#e5e7eb" /><Controls showInteractive={false} /></ReactFlow>
        </div>
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------ C&E matrix
export function CeMatrixTool({ invId, initial, readOnly }: { invId: string; initial: { outputs: { name: string; weight: number }[]; inputs: { name: string; scores: number[] }[] } | null; readOnly: boolean }) {
  const [d, setD] = useState(initial ?? { outputs: [{ name: "Output 1", weight: 10 }], inputs: [{ name: "", scores: [0] }] });
  const s = useSaver(invId, "ce_matrix");
  const upd = (n: typeof d) => { setD(n); s.setDirty(true); };
  const totals = ceMatrixTotals(d);
  return (
    <Card title="Cause-and-effect matrix" description="Score relationship strength 0 / 1 / 3 / 9. Total = Σ (output weight × score)." actions={s.saveBtn(d, readOnly)}>
      {s.feedback}
      <div className="overflow-x-auto">
        <table className="table-base min-w-[700px] text-xs">
          <thead>
            <tr>
              <th>Process input (X)</th>
              {d.outputs.map((o, j) => (
                <th key={j}>
                  <input aria-label="Output name" className="input py-1 text-xs normal-case" value={o.name} disabled={readOnly} onChange={(e) => upd({ ...d, outputs: d.outputs.map((x, k) => (k === j ? { ...x, name: e.target.value } : x)) })} />
                  <select aria-label="Weight" className="input mt-1 py-1 text-xs" value={o.weight} disabled={readOnly} onChange={(e) => upd({ ...d, outputs: d.outputs.map((x, k) => (k === j ? { ...x, weight: Number(e.target.value) } : x)) })}>{Array.from({ length: 10 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>weight {n}</option>)}</select>
                </th>
              ))}
              <th>{!readOnly && d.outputs.length < 12 && <Button size="sm" variant="ghost" onClick={() => upd({ outputs: [...d.outputs, { name: `Output ${d.outputs.length + 1}`, weight: 5 }], inputs: d.inputs.map((i) => ({ ...i, scores: [...i.scores, 0] })) })}>+ Y</Button>}</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {d.inputs.map((inp, i) => (
              <tr key={i}>
                <td><input aria-label="Input name" className="input py-1 text-xs" value={inp.name} disabled={readOnly} onChange={(e) => upd({ ...d, inputs: d.inputs.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)) })} /></td>
                {d.outputs.map((_, j) => (
                  <td key={j}><select aria-label="Score" className="input py-1 text-xs" value={inp.scores[j] ?? 0} disabled={readOnly} onChange={(e) => upd({ ...d, inputs: d.inputs.map((x, k) => (k === i ? { ...x, scores: d.outputs.map((__, m) => (m === j ? Number(e.target.value) : x.scores[m] ?? 0)) } : x)) })}>{[0, 1, 3, 9].map((n) => <option key={n}>{n}</option>)}</select></td>
                ))}
                <td>{!readOnly && <button aria-label="Remove input" onClick={() => upd({ ...d, inputs: d.inputs.filter((_, k) => k !== i) })}><Trash2 className="h-3.5 w-3.5 text-slate-400" /></button>}</td>
                <td className="font-semibold">{d.outputs.reduce((sum, o, j) => sum + o.weight * (inp.scores[j] ?? 0), 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!readOnly && <Button size="sm" variant="secondary" className="mt-2" onClick={() => upd({ ...d, inputs: [...d.inputs, { name: "", scores: d.outputs.map(() => 0) }] })}><Plus className="h-4 w-4" /> Input</Button>}
      <p className="mt-3 text-sm font-medium">Ranking</p>
      <ol className="list-decimal pl-5 text-sm">{totals.filter((t) => t.name).map((t) => <li key={t.name}>{t.name} — {t.total}</li>)}</ol>
    </Card>
  );
}

// ------------------------------------------------------------------ Bow-tie
export function BowtieTool({ invId, initial, readOnly }: { invId: string; initial: { hazard: string; top_event: string; threats: { name: string; barriers: string }[]; consequences: { name: string; barriers: string }[] } | null; readOnly: boolean }) {
  const [d, setD] = useState(initial ?? { hazard: "", top_event: "", threats: [], consequences: [] });
  const s = useSaver(invId, "bowtie");
  const upd = (n: typeof d) => { setD(n); s.setDirty(true); };
  const side = (key: "threats" | "consequences", title: string, barrierLabel: string) => (
    <div className="space-y-2">
      <p className="text-sm font-semibold">{title}</p>
      {d[key].map((t, i) => (
        <div key={i} className="rounded border border-slate-200 p-2">
          <div className="flex gap-1">
            <input aria-label={title} className="input py-1 text-xs" value={t.name} disabled={readOnly} onChange={(e) => upd({ ...d, [key]: d[key].map((x, k) => (k === i ? { ...x, name: e.target.value } : x)) })} />
            {!readOnly && <button aria-label="Remove" onClick={() => upd({ ...d, [key]: d[key].filter((_, k) => k !== i) })}><Trash2 className="h-3.5 w-3.5 text-slate-400" /></button>}
          </div>
          <textarea aria-label={barrierLabel} className="input mt-1 py-1 text-xs" rows={2} placeholder={`${barrierLabel} (one per line; note gaps)`} value={t.barriers} disabled={readOnly} onChange={(e) => upd({ ...d, [key]: d[key].map((x, k) => (k === i ? { ...x, barriers: e.target.value } : x)) })} />
        </div>
      ))}
      {!readOnly && <Button size="sm" variant="secondary" onClick={() => upd({ ...d, [key]: [...d[key], { name: "", barriers: "" }] })}><Plus className="h-3.5 w-3.5" /> Add</Button>}
    </div>
  );
  return (
    <Card title="Bow-tie analysis" actions={s.saveBtn(d, readOnly)} description="Threats → preventive barriers → top event → mitigative barriers → consequences.">
      {s.feedback}
      <div className="mb-3 grid gap-2 md:grid-cols-2">
        <input aria-label="Hazard" className="input" placeholder="Hazard (e.g. hot pyrolysis gas)" value={d.hazard} disabled={readOnly} onChange={(e) => upd({ ...d, hazard: e.target.value })} />
        <input aria-label="Top event" className="input" placeholder="Top event (loss of control)" value={d.top_event} disabled={readOnly} onChange={(e) => upd({ ...d, top_event: e.target.value })} />
      </div>
      <div className="grid items-center gap-4 md:grid-cols-[1fr_180px_1fr]">
        {side("threats", "Threats", "Preventive barriers")}
        <div className="rounded-full border-4 border-red-500 p-4 text-center text-sm font-semibold">{d.top_event || "Top event"}<p className="text-xs font-normal text-slate-500">{d.hazard}</p></div>
        {side("consequences", "Consequences", "Mitigative barriers")}
      </div>
    </Card>
  );
}
