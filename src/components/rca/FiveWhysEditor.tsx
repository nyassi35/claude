"use client";
import { useMemo, useState } from "react";
import { Background, Controls, ReactFlow, type Edge, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ArrowUpRight, Plus, Save, Trash2 } from "lucide-react";
import { createCauseAction, saveAnalysisAction } from "@/app/actions";
import { Alert, Badge, Button, Card } from "@/components/ui";
import { useAction } from "@/components/forms/useAction";
import { reviewFiveWhys, type FiveWhys, type WhyNode } from "@/lib/rca/methods";
import { newId } from "@/lib/utils";
import { layoutTree } from "./treeLayout";

const STATUS_STYLE = { supported: "#1baf7a", assumption: "#eda100", refuted: "#e34948" } as const;

export function FiveWhysEditor({ invId, initial, readOnly, defaultProblem }: { invId: string; initial: FiveWhys | null; readOnly: boolean; defaultProblem: string }) {
  const [data, setData] = useState<FiveWhys>(initial ?? { problem: defaultProblem, nodes: [] });
  const [dirty, setDirty] = useState(false);
  const { exec, pending, feedback } = useAction();
  const review = useMemo(() => reviewFiveWhys(data), [data]);

  const update = (next: FiveWhys) => { setData(next); setDirty(true); };
  const setNode = (id: string, patch: Partial<WhyNode>) => update({ ...data, nodes: data.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) });
  const addChild = (parentId: string | null) =>
    update({ ...data, nodes: [...data.nodes, { id: newId(), parentId, text: "", evidence: "", evidenceStatus: "assumption", level: parentId ? "intermediate" : "direct", isRootCause: false }] });
  const remove = (id: string) => {
    const drop = new Set([id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const n of data.nodes) if (n.parentId && drop.has(n.parentId) && !drop.has(n.id)) { drop.add(n.id); grew = true; }
    }
    update({ ...data, nodes: data.nodes.filter((n) => !drop.has(n.id)) });
  };

  const depth = (n: WhyNode): number => (n.parentId ? 1 + depth(data.nodes.find((x) => x.id === n.parentId) ?? { ...n, parentId: null }) : 1);
  const ordered: WhyNode[] = [];
  const walk = (pid: string | null) => data.nodes.filter((n) => n.parentId === pid).forEach((n) => { ordered.push(n); walk(n.id); });
  walk(null);

  const pos = layoutTree(data.nodes, { dx: 230, dy: 110 });
  const flowNodes: Node[] = [
    { id: "problem", position: { x: ((Math.max(0, ...[...pos.values()].map((p) => p.x)) || 0) / 2), y: 0 }, data: { label: data.problem || "Problem statement" }, style: { background: "#0f172a", color: "white", width: 210, fontSize: 12, borderRadius: 6 } },
    ...data.nodes.map((n) => ({
      id: n.id,
      position: pos.get(n.id) ?? { x: 0, y: 0 },
      data: { label: `${n.isRootCause ? "◆ ROOT: " : ""}${n.text || "(empty)"}` },
      style: { width: 210, fontSize: 11, borderRadius: 6, border: `2px solid ${STATUS_STYLE[n.evidenceStatus]}`, background: n.isRootCause ? "#eef6ff" : "white", borderStyle: n.evidenceStatus === "assumption" ? "dashed" : "solid" },
    })),
  ];
  const flowEdges: Edge[] = data.nodes.map((n) => ({ id: `e-${n.id}`, source: n.parentId ?? "problem", target: n.id, label: "why?", labelStyle: { fontSize: 10, fill: "#52514e" } }));

  async function promote(n: WhyNode) {
    const path: WhyNode[] = [];
    let cur: WhyNode | undefined = n;
    while (cur) { path.unshift(cur); cur = data.nodes.find((x) => x.id === cur!.parentId); }
    const allSupported = path.every((p) => p.evidenceStatus === "supported");
    exec(() => createCauseAction(invId, {
      description: n.text,
      cause_type: n.level === "systemic" ? "systemic_cause" : n.level === "direct" ? "possible_cause" : "root_cause",
      status: allSupported ? "supported" : "hypothesis",
      evidence_for: path.filter((p) => p.evidence).map((p) => `${p.text}: ${p.evidence}`).join(" | ") || null,
      evidence_against: null,
      confidence: allSupported ? "medium" : "low",
      confidence_rationale: allSupported ? "Every link in the 5 Whys chain has recorded evidence." : `${path.filter((p) => p.evidenceStatus !== "supported").length} link(s) in the chain are unsupported assumptions.`,
      source_method: "five_whys",
    }), { success: "Added to the cause register" });
  }

  return (
    <div className="space-y-4">
      {feedback}
      <Card
        title="5 Whys analysis"
        description="Ask why repeatedly, branch where several causes act together, and attach evidence to every answer. Stop at a defensible, actionable systemic cause — not necessarily at five."
        actions={!readOnly && (
          <>
            <Button size="sm" variant="secondary" onClick={() => addChild(null)}><Plus className="h-4 w-4" /> First-level why</Button>
            <Button size="sm" disabled={!dirty || pending} onClick={() => exec(() => saveAnalysisAction(invId, "five_whys", data, review.warnings.length ? "in_progress" : "complete"), { success: "5 Whys saved", onOk: () => setDirty(false) })}><Save className="h-4 w-4" /> Save</Button>
          </>
        )}
      >
        <label className="label" htmlFor="fw-problem">Problem statement</label>
        <textarea id="fw-problem" className="input mb-4" rows={2} value={data.problem} disabled={readOnly} onChange={(e) => update({ ...data, problem: e.target.value })} />
        {ordered.length === 0 && <p className="text-sm text-slate-500">No answers yet. Start with “Why did this problem occur?”</p>}
        <ul className="space-y-2">
          {ordered.map((n) => (
            <li key={n.id} style={{ marginLeft: (depth(n) - 1) * 20 }} className="rounded-md border border-slate-200 bg-white p-2" data-testid="why-node">
              <div className="flex flex-wrap items-start gap-2">
                <span className="mt-2 text-xs font-semibold text-slate-500">Why {depth(n)}</span>
                <div className="min-w-[220px] flex-1 space-y-1.5">
                  <input aria-label={`Why ${depth(n)} answer`} className="input" placeholder="Because…" value={n.text} disabled={readOnly} onChange={(e) => setNode(n.id, { text: e.target.value })} />
                  <input aria-label="Evidence" className="input text-xs" placeholder="Evidence for this answer (record, measurement, observation)" value={n.evidence} disabled={readOnly} onChange={(e) => setNode(n.id, { evidence: e.target.value })} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <select aria-label="Evidence status" className="input py-1 text-xs" value={n.evidenceStatus} disabled={readOnly} onChange={(e) => setNode(n.id, { evidenceStatus: e.target.value as WhyNode["evidenceStatus"] })}>
                    <option value="assumption">Unsupported assumption</option>
                    <option value="supported">Supported by evidence</option>
                    <option value="refuted">Refuted</option>
                  </select>
                  <select aria-label="Cause level" className="input py-1 text-xs" value={n.level} disabled={readOnly} onChange={(e) => setNode(n.id, { level: e.target.value as WhyNode["level"] })}>
                    <option value="direct">Direct cause</option>
                    <option value="intermediate">Intermediate</option>
                    <option value="systemic">Systemic cause</option>
                  </select>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={n.isRootCause} disabled={readOnly} onChange={(e) => setNode(n.id, { isRootCause: e.target.checked })} /> Root cause (branch concluded)</label>
                  {!readOnly && (
                    <div className="flex gap-1">
                      <Button size="sm" variant="secondary" onClick={() => addChild(n.id)}>+ Why?</Button>
                      {n.isRootCause && n.text && <Button size="sm" variant="ghost" title="Add to cause register" onClick={() => promote(n)}><ArrowUpRight className="h-3.5 w-3.5" /> Register</Button>}
                      <Button size="sm" variant="ghost" aria-label="Delete answer and its branch" onClick={() => remove(n.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
        {dirty && <p className="mt-2 text-xs text-amber-700">Unsaved changes</p>}
      </Card>

      {review.warnings.length > 0 && (
        <Alert kind="warning" title="Review findings">
          <ul>{review.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
        </Alert>
      )}

      <Card title="Causal tree" description="Solid green = supported by evidence · dashed amber = unsupported assumption · red = refuted · ◆ = concluded root cause">
        <div className="h-[460px] rounded-md border border-slate-200" role="img" aria-label="5 Whys causal tree diagram">
          <ReactFlow nodes={flowNodes} edges={flowEdges} fitView nodesDraggable={false} nodesConnectable={false} proOptions={{ hideAttribution: true }}>
            <Background gap={16} color="#e5e7eb" />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
        {review.branches.length > 0 && (
          <div className="mt-3 overflow-x-auto">
            <table className="table-base">
              <thead><tr><th>Branch (summary)</th><th>Depth</th><th>Unsupported links</th><th>Concluded</th></tr></thead>
              <tbody>
                {review.branches.map((b) => (
                  <tr key={b.leafId}>
                    <td className="text-xs">{b.path.map((p) => p.text || "…").join(" → ")}</td>
                    <td>{b.depth}</td>
                    <td>{b.unsupported ? <Badge color="amber">{b.unsupported}</Badge> : <Badge color="green">0</Badge>}</td>
                    <td>{b.concluded ? <Badge color="blue">Yes</Badge> : <Badge>No</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
