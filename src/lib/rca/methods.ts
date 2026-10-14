// Data shapes + analysis functions for each RCA method stored in rca_analyses.data.
import { z } from "zod";
import { CAUSE_STATUSES, SIX_M, SIX_M_LABELS } from "@/lib/types";
import { DMAIC_DELIVERABLES, DMAIC_PHASES, type DmaicPhase } from "./catalog";

const id = z.string().min(1).max(64);
const text = (max = 2000) => z.string().max(max).default("");

// ---------------------------------------------------------------- 5 Whys
export const whyNodeSchema = z.object({
  id,
  parentId: z.string().nullable(),
  text: z.string().min(1, "Answer cannot be empty").max(1000),
  evidence: text(),
  evidenceStatus: z.enum(["supported", "assumption", "refuted"]).default("assumption"),
  level: z.enum(["direct", "intermediate", "systemic"]).default("intermediate"),
  isRootCause: z.boolean().default(false),
});
export const fiveWhysSchema = z.object({
  problem: text(1000),
  nodes: z.array(whyNodeSchema).max(200).default([]),
});
export type WhyNode = z.infer<typeof whyNodeSchema>;
export type FiveWhys = z.infer<typeof fiveWhysSchema>;

export interface FiveWhysReview {
  branches: { leafId: string; depth: number; path: WhyNode[]; concluded: boolean; unsupported: number }[];
  warnings: string[];
  rootCauses: WhyNode[];
}

/** Checks a 5 Whys tree for unsupported links, unfinished branches and premature root causes. */
export function reviewFiveWhys(data: FiveWhys): FiveWhysReview {
  const warnings: string[] = [];
  const byId = new Map(data.nodes.map((n) => [n.id, n]));
  const children = new Map<string | null, WhyNode[]>();
  for (const n of data.nodes) {
    if (n.parentId && !byId.has(n.parentId)) warnings.push(`"${n.text.slice(0, 50)}" refers to a missing parent and is ignored.`);
    const list = children.get(n.parentId) ?? [];
    list.push(n);
    children.set(n.parentId, list);
  }
  if (!data.problem.trim()) warnings.push("Define the problem statement before asking why.");
  const leaves = data.nodes.filter((n) => !(children.get(n.id)?.length) && (n.parentId === null || byId.has(n.parentId)));
  const branches = leaves.map((leaf) => {
    const path: WhyNode[] = [];
    let cur: WhyNode | undefined = leaf;
    const seen = new Set<string>();
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      path.unshift(cur);
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    const unsupported = path.filter((p) => p.evidenceStatus === "assumption").length;
    return { leafId: leaf.id, depth: path.length, path, concluded: leaf.isRootCause, unsupported };
  });
  for (const b of branches) {
    const leaf = b.path[b.path.length - 1];
    if (!b.concluded) warnings.push(`Branch ending "${leaf.text.slice(0, 60)}" has no root cause yet — continue asking why or mark it as concluded.`);
    if (b.concluded && b.unsupported > 0)
      warnings.push(`Root cause "${leaf.text.slice(0, 60)}" rests on ${b.unsupported} unsupported assumption(s); gather evidence before treating it as established.`);
    if (b.concluded && leaf.level === "direct")
      warnings.push(`"${leaf.text.slice(0, 60)}" is marked as a direct cause; consider asking why the system allowed it (systemic cause).`);
    if (b.path.some((p) => p.evidenceStatus === "refuted"))
      warnings.push(`Branch ending "${leaf.text.slice(0, 60)}" contains a refuted answer; the chain below it is not valid.`);
  }
  return { branches, warnings, rootCauses: data.nodes.filter((n) => n.isRootCause) };
}

// ---------------------------------------------------------------- Ishikawa
export const fishCauseSchema = z.object({
  id,
  category: z.string().min(1).max(60),
  parentId: z.string().nullable().default(null),
  text: z.string().min(1).max(500),
  evidence: text(),
  evidenceSource: text(300),
  status: z.enum(CAUSE_STATUSES).default("hypothesis"),
  priority: z.number().int().min(1).max(5).default(3),
  relatedIds: z.array(z.string()).default([]),
  owner: text(120),
  suggested: z.boolean().default(false),
});
export const ishikawaSchema = z.object({
  effect: text(500),
  categories: z
    .array(z.object({ key: z.string().min(1).max(60), label: z.string().min(1).max(60) }))
    .min(3)
    .max(10)
    .default(SIX_M.map((k) => ({ key: k, label: SIX_M_LABELS[k] }))),
  causes: z.array(fishCauseSchema).max(300).default([]),
});
export type FishCause = z.infer<typeof fishCauseSchema>;
export type Ishikawa = z.infer<typeof ishikawaSchema>;

export function reviewIshikawa(d: Ishikawa) {
  const warnings: string[] = [];
  if (!d.effect.trim()) warnings.push("State the effect (problem) at the head of the fishbone.");
  const cats = new Set(d.categories.map((c) => c.key));
  const empty = d.categories.filter((c) => !d.causes.some((x) => x.category === c.key));
  if (empty.length && d.causes.length) warnings.push(`No causes considered yet for: ${empty.map((e) => e.label).join(", ")}.`);
  for (const c of d.causes) {
    if (!cats.has(c.category)) warnings.push(`"${c.text}" is in an unknown category.`);
    if (["supported", "confirmed"].includes(c.status) && !c.evidence.trim()) warnings.push(`"${c.text}" is marked ${c.status} without evidence.`);
    if (c.suggested && c.status === "confirmed") warnings.push(`"${c.text}" was a suggestion; confirm it through the Causes register with documented evidence.`);
  }
  const byStatus = Object.fromEntries(CAUSE_STATUSES.map((s) => [s, d.causes.filter((c) => c.status === s).length]));
  return { warnings, byStatus };
}

// ---------------------------------------------------------------- Pareto
export const paretoSchema = z.object({
  metric: text(120),
  unit: text(30),
  period: text(120),
  items: z.array(z.object({ label: z.string().max(120), value: z.number() })).max(100).default([]),
});

// ---------------------------------------------------------------- Fault tree
export const ftaNodeSchema = z.object({
  id,
  parentId: z.string().nullable(),
  label: z.string().min(1).max(300),
  kind: z.enum(["event", "basic", "undeveloped"]).default("event"),
  gate: z.enum(["AND", "OR"]).nullable().default("OR"),
  probability: z.number().min(0).max(1).nullable().default(null),
});
export const faultTreeSchema = z.object({ nodes: z.array(ftaNodeSchema).max(200).default([]) });
export type FtaNode = z.infer<typeof ftaNodeSchema>;

/** Top-event probability assuming independent basic events. Returns null if any basic
 *  event under the node lacks a probability. */
export function ftaProbability(nodes: FtaNode[], nodeId: string, seen = new Set<string>()): number | null {
  const node = nodes.find((n) => n.id === nodeId);
  if (!node || seen.has(nodeId)) return null;
  seen.add(nodeId);
  const kids = nodes.filter((n) => n.parentId === nodeId);
  if (!kids.length) return node.probability ?? null;
  const ps = kids.map((k) => ftaProbability(nodes, k.id, seen));
  if (ps.some((p) => p === null)) return null;
  const vals = ps as number[];
  return node.gate === "AND" ? vals.reduce((a, b) => a * b, 1) : 1 - vals.reduce((a, b) => a * (1 - b), 1);
}

// ---------------------------------------------------------------- C&E matrix
export const ceMatrixSchema = z.object({
  outputs: z.array(z.object({ name: z.string().max(120), weight: z.number().min(1).max(10) })).max(12).default([]),
  inputs: z.array(z.object({ name: z.string().max(120), scores: z.array(z.number()) })).max(60).default([]),
});
export function ceMatrixTotals(d: z.infer<typeof ceMatrixSchema>) {
  return d.inputs
    .map((inp) => ({ name: inp.name, total: d.outputs.reduce((sum, out, i) => sum + out.weight * ([0, 1, 3, 9].includes(inp.scores[i] ?? 0) ? inp.scores[i] ?? 0 : 0), 0) }))
    .sort((a, b) => b.total - a.total);
}

// ---------------------------------------------------------------- Table-style tools
export const rowsSchema = z.object({ rows: z.array(z.record(z.string(), z.unknown())).max(300).default([]), notes: text(4000) });

export const bowtieSchema = z.object({
  hazard: text(300),
  top_event: text(300),
  threats: z.array(z.object({ name: z.string().max(200), barriers: z.string().max(1000).default("") })).default([]),
  consequences: z.array(z.object({ name: z.string().max(200), barriers: z.string().max(1000).default("") })).default([]),
});

export const IS_IS_NOT_DEFAULT_ROWS = [
  { dimension: "What", question: "What object / product / defect is affected?", is: "", is_not: "", distinction: "", change: "" },
  { dimension: "What", question: "What is the defect or deviation exactly?", is: "", is_not: "", distinction: "", change: "" },
  { dimension: "Where", question: "Where (line, machine, location on part) is it observed?", is: "", is_not: "", distinction: "", change: "" },
  { dimension: "When", question: "When was it first observed / when does it occur?", is: "", is_not: "", distinction: "", change: "" },
  { dimension: "Extent", question: "How many / how much / what trend?", is: "", is_not: "", distinction: "", change: "" },
];

// ---------------------------------------------------------------- DMAIC
export const dmaicSchema = z.object({
  phases: z
    .record(
      z.enum(DMAIC_PHASES),
      z.object({ fields: z.record(z.string(), z.string()).default({}), gate_approved: z.boolean().default(false), notes: text(4000) }),
    )
    .default({}),
  sipoc: z.object({ suppliers: text(), inputs: text(), process: text(), outputs: text(), customers: text() }).default({}),
  countermeasures: z
    .array(
      z.object({
        id,
        name: z.string().max(200),
        cost: z.number().min(1).max(5).default(3),
        benefit: z.number().min(1).max(5).default(3),
        risk: z.number().min(1).max(5).default(3),
        feasibility: z.number().min(1).max(5).default(3),
        trial_result: text(1000),
        selected: z.boolean().default(false),
      }),
    )
    .default([]),
});
export type Dmaic = z.infer<typeof dmaicSchema>;

export function dmaicPhaseStatus(d: Dmaic, phase: DmaicPhase) {
  const fields = d.phases?.[phase]?.fields ?? {};
  const reqs = DMAIC_DELIVERABLES[phase].filter((x) => x.required);
  const done = reqs.filter((r) => (fields[r.key] ?? "").trim().length >= 3);
  const missing = reqs.filter((r) => !done.includes(r)).map((r) => r.label);
  if (phase === "improve" && !d.countermeasures.some((c) => c.selected)) missing.push("At least one selected countermeasure");
  const anyStarted = Object.values(fields).some((v) => v && v.trim());
  const complete = missing.length === 0;
  return {
    status: complete ? (d.phases?.[phase]?.gate_approved ? "approved" : "complete") : anyStarted ? "in_progress" : "not_started",
    missing,
    progress: reqs.length ? Math.round((done.length / reqs.length) * 100) : 100,
  } as const;
}

/** Countermeasure score: benefit and feasibility count up, cost and risk count down. */
export const countermeasureScore = (c: { cost: number; benefit: number; risk: number; feasibility: number }) =>
  c.benefit * 2 + c.feasibility - c.cost - c.risk;

export const METHOD_SCHEMAS: Record<string, z.ZodTypeAny> = {
  five_whys: fiveWhysSchema,
  ishikawa: ishikawaSchema,
  pareto: paretoSchema,
  fault_tree: faultTreeSchema,
  ce_matrix: ceMatrixSchema,
  bowtie: bowtieSchema,
  dmaic: dmaicSchema,
  process_map: rowsSchema,
  barrier: rowsSchema,
  change_analysis: rowsSchema,
  ecfa: rowsSchema,
  is_is_not: rowsSchema,
  human_factors: rowsSchema,
  lessons_learned: rowsSchema,
  comparative: z.object({ parameter: text(120), groupA: text(60), groupB: text(60) }),
  trend: z.object({ x: text(120), y: text(120) }),
  spc: z.object({ parameter: text(120) }),
};
