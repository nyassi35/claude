"use client";
import { useMemo, useState } from "react";
import { ArrowUpRight, Lightbulb, Plus, Save, Trash2 } from "lucide-react";
import { createCauseAction, saveAnalysisAction } from "@/app/actions";
import { Alert, Badge, Button, Card, StatusBadge } from "@/components/ui";
import { useAction } from "@/components/forms/useAction";
import { reviewIshikawa, type FishCause, type Ishikawa } from "@/lib/rca/methods";
import { CAUSE_STATUSES, SIX_M, SIX_M_LABELS } from "@/lib/types";
import { newId, titleCase } from "@/lib/utils";

const STATUS_COLOR: Record<string, string> = { hypothesis: "#52514e", under_investigation: "#b07800", supported: "#2a78d6", confirmed: "#0f7a3d", rejected: "#c0392b" };

function Fishbone({ data }: { data: Ishikawa }) {
  const cats = data.categories;
  const top = cats.filter((_, i) => i % 2 === 0);
  const bottom = cats.filter((_, i) => i % 2 === 1);
  const perSide = Math.max(top.length, bottom.length, 1);
  const maxCauses = Math.max(3, ...cats.map((c) => data.causes.filter((x) => x.category === c.key && !x.parentId).length));
  const boneLen = 40 + maxCauses * 22;
  const W = 220 + perSide * 210 + 200;
  const H = boneLen * 2 + 80;
  const spineY = H / 2;
  const headX = W - 200;
  const bone = (c: { key: string; label: string }, idx: number, side: 1 | -1) => {
    const x = 160 + idx * 210 + 150;
    const x0 = x - boneLen * 0.55;
    const y0 = spineY - side * boneLen;
    const causes = data.causes.filter((k) => k.category === c.key && !k.parentId);
    return (
      <g key={c.key}>
        <line x1={x0} y1={y0} x2={x} y2={spineY} stroke="#334155" strokeWidth={2} />
        <text x={x0} y={y0 - side * 10 + (side === -1 ? 10 : 0)} textAnchor="middle" fontSize={12} fontWeight={600} fill="#0f172a">{c.label}</text>
        {causes.map((k, i) => {
          const t = (i + 1) / (maxCauses + 1);
          const cx = x0 + (x - x0) * t;
          const cy = y0 + (spineY - y0) * t;
          const subs = data.causes.filter((s) => s.parentId === k.id);
          return (
            <g key={k.id}>
              <line x1={cx - 70} y1={cy} x2={cx} y2={cy} stroke="#94a3b8" strokeWidth={1} />
              <text x={cx - 72} y={cy - 2} textAnchor="end" fontSize={10} fill={STATUS_COLOR[k.status]} textDecoration={k.status === "rejected" ? "line-through" : undefined}>
                {k.text.length > 28 ? k.text.slice(0, 27) + "…" : k.text}{k.suggested ? " (suggested)" : ""}
              </text>
              {subs.slice(0, 2).map((s, j) => (
                <text key={s.id} x={cx - 72} y={cy + 10 + j * 10} textAnchor="end" fontSize={9} fill="#64748b">↳ {s.text.length > 26 ? s.text.slice(0, 25) + "…" : s.text}</text>
              ))}
            </g>
          );
        })}
      </g>
    );
  };
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} width={Math.max(W, 700)} role="img" aria-label={`Fishbone diagram for: ${data.effect}`} className="max-w-none">
        <line x1={60} y1={spineY} x2={headX} y2={spineY} stroke="#0f172a" strokeWidth={3} />
        <polygon points={`${headX},${spineY - 8} ${headX + 12},${spineY} ${headX},${spineY + 8}`} fill="#0f172a" />
        <rect x={headX + 14} y={spineY - 40} width={180} height={80} rx={6} fill="#0f172a" />
        <foreignObject x={headX + 18} y={spineY - 36} width={172} height={72}>
          <div style={{ color: "white", fontSize: 11, lineHeight: 1.25, overflow: "hidden", height: 72 }}>{data.effect || "Effect / problem"}</div>
        </foreignObject>
        {top.map((c, i) => bone(c, i, 1))}
        {bottom.map((c, i) => bone(c, i, -1))}
      </svg>
      <div className="mt-2 flex flex-wrap gap-3 text-xs">
        {CAUSE_STATUSES.map((s) => <span key={s} className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full" style={{ background: STATUS_COLOR[s] }} /> {titleCase(s)}</span>)}
      </div>
    </div>
  );
}

export function IshikawaEditor({ invId, initial, readOnly, defaultEffect, hints }: { invId: string; initial: Ishikawa | null; readOnly: boolean; defaultEffect: string; hints: Partial<Record<string, string[]>> }) {
  const [data, setData] = useState<Ishikawa>(initial ?? { effect: defaultEffect, categories: SIX_M.map((k) => ({ key: k, label: SIX_M_LABELS[k] })), causes: [] });
  const [dirty, setDirty] = useState(false);
  const [newCat, setNewCat] = useState("");
  const { exec, pending, feedback } = useAction();
  const review = useMemo(() => reviewIshikawa(data), [data]);
  const update = (d: Ishikawa) => { setData(d); setDirty(true); };
  const setCause = (id: string, patch: Partial<FishCause>) => update({ ...data, causes: data.causes.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  const add = (category: string, parentId: string | null = null, text = "", suggested = false) =>
    update({ ...data, causes: [...data.causes, { id: newId(), category, parentId, text, evidence: "", evidenceSource: "", status: "hypothesis", priority: 3, relatedIds: [], owner: "", suggested }] });

  function suggest() {
    const existing = new Set(data.causes.map((c) => c.text.toLowerCase()));
    const additions: FishCause[] = [];
    for (const c of data.categories) for (const h of hints[c.key] ?? []) if (!existing.has(h.toLowerCase())) additions.push({ id: newId(), category: c.key, parentId: null, text: h, evidence: "", evidenceSource: "", status: "hypothesis", priority: 3, relatedIds: [], owner: "", suggested: true });
    update({ ...data, causes: [...data.causes, ...additions] });
  }

  return (
    <div className="space-y-4">
      {feedback}
      <Card
        title="Ishikawa / fishbone diagram"
        description="List potential causes per category. Suggestions come from the category template and are hypotheses only — never facts."
        actions={!readOnly && (
          <>
            <Button size="sm" variant="secondary" onClick={suggest}><Lightbulb className="h-4 w-4" /> Suggest categories & causes</Button>
            <Button size="sm" disabled={!dirty || pending} onClick={() => exec(() => saveAnalysisAction(invId, "ishikawa", data), { success: "Fishbone saved", onOk: () => setDirty(false) })}><Save className="h-4 w-4" /> Save</Button>
          </>
        )}
      >
        <label className="label" htmlFor="effect">Effect (problem)</label>
        <input id="effect" className="input mb-4" value={data.effect} disabled={readOnly} onChange={(e) => update({ ...data, effect: e.target.value })} />
        <Fishbone data={data} />
        {dirty && <p className="mt-2 text-xs text-amber-700">Unsaved changes</p>}
      </Card>
      {review.warnings.length > 0 && <Alert kind="warning" title="Review findings"><ul>{review.warnings.map((w) => <li key={w}>{w}</li>)}</ul></Alert>}
      <div className="grid gap-4 lg:grid-cols-2">
        {data.categories.map((cat) => (
          <Card
            key={cat.key}
            title={
              readOnly ? cat.label : (
                <input aria-label="Category label" className="input py-1 text-sm font-semibold" value={cat.label} onChange={(e) => update({ ...data, categories: data.categories.map((c) => (c.key === cat.key ? { ...c, label: e.target.value } : c)) })} />
              )
            }
            actions={!readOnly && (
              <>
                <Button size="sm" variant="secondary" onClick={() => add(cat.key)}><Plus className="h-3.5 w-3.5" /> Cause</Button>
                {data.categories.length > 3 && <Button size="sm" variant="ghost" aria-label="Remove category" onClick={() => update({ ...data, categories: data.categories.filter((c) => c.key !== cat.key), causes: data.causes.filter((c) => c.category !== cat.key) })}><Trash2 className="h-3.5 w-3.5" /></Button>}
              </>
            )}
          >
            <ul className="space-y-2">
              {data.causes.filter((c) => c.category === cat.key).map((c) => (
                <li key={c.id} className={`rounded-md border p-2 ${c.parentId ? "ml-5 border-dashed" : ""} ${c.suggested ? "border-violet-200 bg-violet-50/40" : "border-slate-200"}`}>
                  <div className="flex items-start gap-2">
                    <input aria-label="Cause" className="input py-1 text-sm" value={c.text} placeholder="Potential cause" disabled={readOnly} onChange={(e) => setCause(c.id, { text: e.target.value })} />
                    <select aria-label="Verification status" className="input w-40 py-1 text-xs" value={c.status} disabled={readOnly} onChange={(e) => setCause(c.id, { status: e.target.value as FishCause["status"], suggested: false })}>
                      {CAUSE_STATUSES.filter((s) => s !== "confirmed" || c.status === "confirmed").map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
                    </select>
                  </div>
                  <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
                    <input aria-label="Supporting evidence" className="input py-1 text-xs" placeholder="Supporting evidence" value={c.evidence} disabled={readOnly} onChange={(e) => setCause(c.id, { evidence: e.target.value })} />
                    <input aria-label="Evidence source" className="input py-1 text-xs" placeholder="Evidence source" value={c.evidenceSource} disabled={readOnly} onChange={(e) => setCause(c.id, { evidenceSource: e.target.value })} />
                    <input aria-label="Owner" className="input py-1 text-xs" placeholder="Investigation owner" value={c.owner} disabled={readOnly} onChange={(e) => setCause(c.id, { owner: e.target.value })} />
                    <div className="flex items-center gap-1 text-xs">
                      <label htmlFor={`prio-${c.id}`}>Priority</label>
                      <select id={`prio-${c.id}`} className="input w-16 py-1 text-xs" value={c.priority} disabled={readOnly} onChange={(e) => setCause(c.id, { priority: Number(e.target.value) })}>{[1, 2, 3, 4, 5].map((n) => <option key={n}>{n}</option>)}</select>
                      <select aria-label="Related causes" className="input py-1 text-xs" value="" disabled={readOnly} onChange={(e) => e.target.value && setCause(c.id, { relatedIds: [...new Set([...c.relatedIds, e.target.value])] })}>
                        <option value="">+ relate to…</option>
                        {data.causes.filter((o) => o.id !== c.id && !c.relatedIds.includes(o.id)).map((o) => <option key={o.id} value={o.id}>{o.text.slice(0, 40)}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    {c.suggested && <Badge color="purple">Suggestion — verify</Badge>}
                    <StatusBadge value={c.status} />
                    {c.relatedIds.map((rid) => {
                      const r = data.causes.find((x) => x.id === rid);
                      return r ? <Badge key={rid} color="blue">↔ {r.text.slice(0, 30)}{!readOnly && <button aria-label="Remove relation" className="ml-1" onClick={() => setCause(c.id, { relatedIds: c.relatedIds.filter((x) => x !== rid) })}>×</button>}</Badge> : null;
                    })}
                    {!readOnly && (
                      <span className="ml-auto flex gap-1">
                        {!c.parentId && <Button size="sm" variant="ghost" onClick={() => add(cat.key, c.id)}>+ Sub-cause</Button>}
                        {c.text && <Button size="sm" variant="ghost" title="Add to cause register" onClick={() => exec(() => createCauseAction(invId, { description: c.text, category: (SIX_M as readonly string[]).includes(c.category) ? c.category : null, status: c.status === "confirmed" ? "supported" : c.status, evidence_for: c.evidence || null, evidence_against: c.status === "rejected" ? "Rejected in fishbone review" : null, source_method: "ishikawa", ai_suggested: false, owner: c.owner || null }), { success: "Added to the cause register" })}><ArrowUpRight className="h-3.5 w-3.5" /> Register</Button>}
                        <Button size="sm" variant="ghost" aria-label="Delete cause" onClick={() => update({ ...data, causes: data.causes.filter((x) => x.id !== c.id && x.parentId !== c.id).map((x) => ({ ...x, relatedIds: x.relatedIds.filter((r) => r !== c.id) })) })}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
      {!readOnly && data.categories.length < 10 && (
        <div className="flex gap-2">
          <input aria-label="New category" className="input w-64" placeholder="Add custom category (e.g. Software)" value={newCat} onChange={(e) => setNewCat(e.target.value)} />
          <Button variant="secondary" disabled={newCat.trim().length < 2} onClick={() => { update({ ...data, categories: [...data.categories, { key: newCat.trim().toLowerCase().replace(/\W+/g, "_").slice(0, 40) + "_" + data.categories.length, label: newCat.trim() }] }); setNewCat(""); }}>Add category</Button>
        </div>
      )}
    </div>
  );
}
