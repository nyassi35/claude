// Rule-based investigation assistant. It is deterministic, never invents data, and works
// without any LLM. The LLM layer (llm.ts) builds on this output and is validated against it.
import type { CategoryTemplate } from "@/lib/categories/types";
import { missingRequired, problemTypesFor, visibleQuestions } from "@/lib/categories/engine";
import { correlation, finite, welchTTest } from "@/lib/calc/stats";
import { pareto } from "@/lib/calc/pareto";
import type { CapaAction, Cause, Evidence, FmeaItem, Investigation, Measurement, RcaAnalysis, SixM, TimelineEvent } from "@/lib/types";
import { methodName } from "@/lib/rca/catalog";

export interface InvestigationBundle {
  investigation: Investigation;
  evidence: Evidence[];
  measurements: Measurement[];
  causes: Cause[];
  analyses: RcaAnalysis[];
  fmea: FmeaItem[];
  capa: CapaAction[];
  timeline: TimelineEvent[];
}

export interface Hypothesis {
  description: string;
  category: SixM | null;
  rationale: string;
  evidence_for: string;
  evidence_against: string;
  confidence: "low" | "medium" | "high";
  confidence_explanation: string;
  verification_test: string;
  status: "hypothesis" | "under_investigation" | "supported";
}

export interface MissingItem {
  area: string;
  item: string;
  why: string;
}

export interface MethodRecommendation {
  method: string;
  name: string;
  reason: string;
  priority: "recommended" | "optional";
}

export interface DataFinding {
  kind: "correlation" | "comparison" | "trend" | "pareto";
  title: string;
  detail: string;
  strength: "weak" | "moderate" | "strong" | "none";
  caveat: string;
}

export interface AssistantOutput {
  engine: "rules" | "llm";
  generated_at: string;
  summary: string;
  facts: string[];
  assumptions: string[];
  missing_information: MissingItem[];
  follow_up_questions: string[];
  recommended_methods: MethodRecommendation[];
  data_findings: DataFinding[];
  hypotheses: Hypothesis[];
  suggested_tests: string[];
  proposed_actions: { cause: string; action: string; type: "containment" | "corrective" | "preventive"; verification: string }[];
  reasoning_notes: string[];
  warnings: string[];
}

const has = (s?: string | null) => !!s && s.trim().length > 0;
const fmt = (n: number, d = 2) => (Number.isFinite(n) ? n.toFixed(d) : "–");

// ---------------------------------------------------------------------------
export function summarize(b: InvestigationBundle, t: CategoryTemplate): string {
  const i = b.investigation;
  const p = i.problem ?? {};
  const pType = problemTypesFor(t).find((x) => x.key === p.problem_type)?.label;
  const parts = [
    `${i.number} — ${i.title} (${t.name}${i.process_name ? `, ${i.process_name}` : ""}).`,
    pType ? `Problem type: ${pType}.` : "",
    has(p.what_happened) ? `Reported: ${p.what_happened}` : "No description of what happened has been entered yet.",
    has(p.expected) && has(p.actual) ? `Expected: ${p.expected}; actual: ${p.actual}.` : "",
    has(p.impact) ? `Impact: ${p.impact}.` : "",
    `Severity ${i.severity}, priority ${i.priority}, status ${i.status.replace(/_/g, " ")}.`,
    `${b.evidence.length} evidence item(s), ${b.measurements.length} measurement(s), ${b.causes.length} cause record(s) (${b.causes.filter((c) => c.status === "confirmed").length} confirmed), ${b.capa.length} action(s).`,
  ];
  return parts.filter(Boolean).join(" ");
}

export function factsAndAssumptions(b: InvestigationBundle) {
  const facts: string[] = [];
  const assumptions: string[] = [];
  for (const e of b.evidence) (e.is_verified ? facts : assumptions).push(`${e.is_verified ? "" : "Unverified: "}${e.title}${e.source ? ` (source: ${e.source})` : ""}`);
  for (const k of b.investigation.kpis ?? []) {
    if (typeof k.actual === "number") facts.push(`${k.label}: actual ${k.actual} ${k.unit}${typeof k.target === "number" ? ` vs. target ${k.target} ${k.unit}` : ""}${typeof k.baseline === "number" ? ` (baseline ${k.baseline})` : ""}.`);
  }
  for (const t of b.timeline) (t.is_verified ? facts : assumptions).push(`${t.is_verified ? "" : "Unverified timeline entry: "}${t.occurred_at.slice(0, 16).replace("T", " ")} — ${t.description}`);
  for (const c of b.causes.filter((c) => c.status === "hypothesis" || c.status === "under_investigation")) assumptions.push(`Hypothesis (not yet supported): ${c.description}`);
  return { facts, assumptions };
}

// ---------------------------------------------------------------------------
export function missingInformation(b: InvestigationBundle, t: CategoryTemplate): MissingItem[] {
  const i = b.investigation;
  const p = i.problem ?? {};
  const out: MissingItem[] = [];
  const need = (cond: boolean, area: string, item: string, why: string) => cond && out.push({ area, item, why });
  need(!has(p.what_happened), "Problem definition", "What happened", "A precise problem statement is the basis of every method.");
  need(!has(p.expected), "Problem definition", "What should have happened (target / specification)", "The gap between expected and actual defines the problem.");
  need(!has(p.actual), "Problem definition", "Actual measured result", "Quantifies the gap.");
  need(!has(p.started), "Problem definition", "When the problem started", "Onset timing enables change analysis.");
  need(!has(p.affected), "Problem definition", "Affected products / batches / machines", "Needed to compare affected vs. unaffected.");
  need(!p.previous_occurrence, "Problem definition", "Whether the problem occurred before", "Recurrence changes the investigation depth and CAPA review.");
  need(!i.occurred_at, "Context", "Date/time of occurrence", "Anchors the timeline.");
  const kpis = i.kpis ?? [];
  need(!kpis.some((k) => typeof k.actual === "number"), "KPIs", "At least one measured KPI (actual value)", "Impact must be measurable to verify effectiveness later.");
  need(kpis.some((k) => typeof k.actual === "number" && typeof k.target !== "number" && typeof k.baseline !== "number"), "KPIs", "Target or baseline for the KPIs", "An actual value alone does not show the gap.");
  const params = i.process?.parameters ?? [];
  need(!params.length, "Process", "Target settings and actual operating parameters", "Deviations from target settings are primary leads.");
  need(params.some((x) => typeof x.actual !== "number"), "Process", "Actual values for listed parameters", "Several parameters have targets but no recorded actual value.");
  need(!has(i.process?.recent_changes), "Process", "Recent changes (materials, people, methods, machines, software)", "Change is a frequent trigger of new problems.");
  need(!has(i.process?.maintenance_history), "Process", "Maintenance history for the equipment involved", "Equipment condition is a common contributor.");
  for (const qn of missingRequired(t, i)) out.push({ area: "Category questions", item: qn.label, why: "Marked as required for this production category." });
  const unanswered = visibleQuestions(t, i, "followup").filter((qn) => i.answers?.[qn.id] === undefined || i.answers?.[qn.id] === "");
  for (const qn of unanswered.slice(0, 6)) out.push({ area: "Follow-up", item: qn.label, why: qn.rationale ?? "Triggered by the problem type and earlier answers." });
  need(b.evidence.length === 0, "Evidence", "Any recorded evidence (records, measurements, photos, logs)", "Causes cannot be supported without evidence.");
  need(b.evidence.length > 0 && !b.evidence.some((e) => e.is_verified), "Evidence", "Verification of evidence items", "None of the evidence has been verified yet.");
  need(b.measurements.length === 0, "Data", "Measurement data (import CSV/XLSX)", "Enables trend, comparative and SPC analysis.");
  const groups = new Set(b.measurements.map((m) => m.group_label).filter(Boolean));
  need(b.measurements.length > 0 && groups.size < 2, "Data", "Measurements labelled for affected and unaffected groups", "Good-vs-bad comparison needs at least two groups.");
  for (const c of b.causes.filter((c) => c.status === "supported" && !has(c.verification_test)))
    out.push({ area: "Verification", item: `Verification test for "${c.description}"`, why: "A supported cause needs a test to confirm or reject it." });
  return out;
}

// ---------------------------------------------------------------------------
export function recommendMethods(b: InvestigationBundle): MethodRecommendation[] {
  const i = b.investigation;
  const pType = i.problem?.problem_type ?? "";
  const recs: MethodRecommendation[] = [];
  const add = (method: string, reason: string, priority: MethodRecommendation["priority"] = "recommended") => {
    if (!recs.some((r) => r.method === method)) recs.push({ method, name: methodName(method), reason, priority });
  };
  add("is_is_not", "Sharpens the problem boundary before generating causes.", b.causes.length ? "optional" : "recommended");
  add("five_whys", "Traces the causal chain with evidence for each step.");
  add("ishikawa", "Ensures all cause categories (6M) are considered before narrowing down.");
  const serious = ["high", "critical"].includes(i.severity);
  const safety = ["safety_event", "environmental_event", "trip", "integrity"].includes(pType);
  if (serious || safety || (i.risk?.ratings?.safety ?? 0) >= 4) {
    add("barrier", "Serious or safety-relevant event: identify which controls failed or were missing.");
    add("ecfa", "Reconstruct the event sequence and causal factors.");
  }
  if (safety) {
    add("bowtie", "Map threats, consequences and barriers for this risk scenario.");
    add("fault_tree", "Analyse combinations of failures leading to the top event.", "optional");
  }
  if (["downtime", "quality_oos", "customer_complaint", "pack_defect", "solder_defect", "moulding_defect"].includes(pType) || b.measurements.length > 10)
    add("pareto", "Several failure categories / codes — focus on the vital few.");
  if (["throughput", "low_output", "yield_loss", "efficiency_loss", "dimensional"].includes(pType) || b.measurements.length >= 20)
    add("dmaic", "Chronic, measurable performance gap suited to a structured improvement project.");
  if (b.measurements.length >= 8) {
    add("trend", "Measurement data are available to test parameter relationships.");
    add("spc", "Check whether variation is special-cause and monitor after improvement.");
  }
  if (new Set(b.measurements.map((m) => m.group_label).filter(Boolean)).size >= 2) add("comparative", "Affected and unaffected groups are available for comparison.");
  if (i.problem?.previous_occurrence === "yes") add("lessons_learned", "Recurring problem: review why previous actions did not prevent recurrence.");
  if (i.process?.recent_changes) add("change_analysis", "Recent changes were reported; compare before vs. after.");
  add("fmea", "Check whether the failure mode was foreseen and re-rate risk after actions.", serious ? "recommended" : "optional");
  if (b.evidence.some((e) => e.kind === "interview") || /operator|human|training|procedure/i.test(i.problem?.what_happened ?? ""))
    add("human_factors", "Human actions are involved — look for systemic causes rather than blame.");
  add("capa", "Required once a cause is supported or confirmed.", b.causes.some((c) => ["supported", "confirmed"].includes(c.status)) ? "recommended" : "optional");
  return recs;
}

// ---------------------------------------------------------------------------
/** Pairs measurements of two parameters by batch (or timestamp) for correlation. */
export function pairByKey(ms: Measurement[], x: string, y: string) {
  const key = (m: Measurement) => m.batch ?? m.measured_at ?? "";
  const xs = new Map<string, number>();
  for (const m of ms) if (m.parameter === x && key(m)) xs.set(key(m), m.value);
  const pairs: { key: string; x: number; y: number }[] = [];
  for (const m of ms) if (m.parameter === y && key(m) && xs.has(key(m))) pairs.push({ key: key(m), x: xs.get(key(m))!, y: m.value });
  return pairs;
}

export function dataFindings(b: InvestigationBundle): DataFinding[] {
  const out: DataFinding[] = [];
  const params = [...new Set(b.measurements.map((m) => m.parameter))];
  // Correlations between every pair of parameters with ≥5 paired points
  for (let a = 0; a < params.length; a++) {
    for (let c = a + 1; c < params.length; c++) {
      const pairs = pairByKey(b.measurements, params[a], params[c]);
      if (pairs.length < 5) continue;
      const r = correlation(
        pairs.map((p) => p.x),
        pairs.map((p) => p.y),
      );
      if (!r.ok || r.strength === "negligible" || r.strength === "weak") continue;
      out.push({
        kind: "correlation",
        title: `${params[a]} vs. ${params[c]}`,
        detail: `Pearson r = ${fmt(r.r!)} (R² = ${fmt(r.r2!)}, p = ${fmt(r.p!, 3)}, n = ${r.n}).`,
        strength: r.strength === "strong" ? "strong" : "moderate",
        caveat: r.caveat,
      });
    }
  }
  // Group comparisons
  const groups = [...new Set(b.measurements.map((m) => m.group_label).filter((g): g is string => !!g))];
  if (groups.length >= 2) {
    const [g1, g2] = groups;
    for (const p of params) {
      const a = finite(b.measurements.filter((m) => m.parameter === p && m.group_label === g1).map((m) => m.value));
      const c = finite(b.measurements.filter((m) => m.parameter === p && m.group_label === g2).map((m) => m.value));
      if (a.length < 3 || c.length < 3) continue;
      const t = welchTTest(a, c);
      if (!t.ok) continue;
      out.push({
        kind: "comparison",
        title: `${p}: ${g1} vs. ${g2}`,
        detail: `Mean ${fmt(t.a.mean)} vs. ${fmt(t.b.mean)} (difference ${fmt(t.meanDiff!)}), Welch t = ${fmt(t.t!)}, p = ${fmt(t.p!, 3)}.`,
        strength: t.p! < 0.01 ? "strong" : t.p! < 0.05 ? "moderate" : "none",
        caveat: "A difference between groups identifies a lead; confirm the mechanism and rule out confounding factors.",
      });
    }
  }
  // Pareto from the pareto analysis if present
  const pa = b.analyses.find((x) => x.method === "pareto")?.data as { items?: { label: string; value: number }[]; metric?: string } | undefined;
  if (pa?.items?.length) {
    const res = pareto(pa.items);
    const vital = res.rows.filter((r) => r.vital);
    if (vital.length)
      out.push({
        kind: "pareto",
        title: `Pareto: ${pa.metric || "categories"}`,
        detail: `Vital few: ${vital.map((v) => `${v.label} (${fmt(v.share, 0)}%)`).join(", ")} account for ${fmt(vital[vital.length - 1].cumulative, 0)}% of the total.`,
        strength: "moderate",
        caveat: "Pareto ranks by frequency or cost; it does not explain causes.",
      });
  }
  return out;
}

// ---------------------------------------------------------------------------
const CATEGORY_TESTS: Record<SixM, string> = {
  machine: "Inspect the equipment and compare maintenance / condition-monitoring records for affected vs. unaffected periods.",
  method: "Compare the procedure as written vs. as performed (observation, records); run a controlled trial with the correct settings.",
  material: "Test retained samples from affected and unaffected lots; review supplier certificates and incoming QC.",
  measurement: "Re-measure retained samples with a reference method; check calibration and run a Gauge R&R.",
  manpower: "Review training records and interview the people involved (no-blame); observe the task.",
  environment: "Overlay environmental data (temperature, humidity, weather) on the occurrence timeline.",
};

function guessCategory(text: string): SixM | null {
  const t = text.toLowerCase();
  if (/moisture|feedstock|raw material|lot|supplier|resin|ingredient|particle|composition|fuel/.test(t)) return "material";
  if (/sensor|measur|calibr|gauge|analy[sz]er|sampling|scale/.test(t)) return "measurement";
  if (/wear|bearing|pump|feeder|screw|reactor|seal|motor|equipment|machine|tool|fixture|sieve|screen|robot|valve/.test(t)) return "machine";
  if (/procedure|setting|setpoint|sop|schedule|program|profile|sequence|method|changeover/.test(t)) return "method";
  if (/operator|training|shift|staff|handover|human/.test(t)) return "manpower";
  if (/ambient|humidity|weather|rain|temperature of the room|dust|environment|storage/.test(t)) return "environment";
  return null;
}

/** Candidate hypotheses derived from the category template, the reported problem, answers and data.
 *  Confidence reflects documented evidence only; nothing is ever returned as confirmed. */
export function generateHypotheses(b: InvestigationBundle, t: CategoryTemplate, findings: DataFinding[]): Hypothesis[] {
  const i = b.investigation;
  const text = [i.problem?.what_happened, i.problem?.actual, i.problem?.impact, i.process?.recent_changes, JSON.stringify(i.answers ?? {})].join(" ").toLowerCase();
  const existing = new Set(b.causes.map((c) => c.description.toLowerCase()));
  const candidates: { desc: string; cat: SixM | null; why: string }[] = [];
  for (const [cat, hints] of Object.entries(t.fishboneHints) as [SixM, string[]][]) {
    for (const h of hints) candidates.push({ desc: h, cat, why: `Common ${cat} cause in ${t.name}.` });
  }
  for (const fm of t.failureModes) candidates.push({ desc: fm, cat: guessCategory(fm), why: `Known failure mode for ${t.name}.` });
  if (has(i.process?.recent_changes)) candidates.unshift({ desc: `Recent change: ${i.process!.recent_changes!.slice(0, 120)}`, cat: guessCategory(i.process!.recent_changes!), why: "A change was reported around the onset of the problem." });

  // Words shared by many candidates (e.g. "feedstock" in a biochar template) or generic report words
  // carry no discriminating power, so they are ignored when linking data findings to a hypothesis.
  const STOP = new Set(["weekly", "week", "from", "with", "rate", "output", "input", "changed", "change", "increased", "share", "mass", "data", "below", "target", "recent", "level", "fraction", "time", "process", "quality", "failure", "error"]);
  const tokens = (str: string) => [...new Set(str.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 5 && !STOP.has(w)))];
  const freq = new Map<string, number>();
  for (const c of candidates) for (const w of tokens(c.desc)) freq.set(w, (freq.get(w) ?? 0) + 1);
  const scored = candidates.map((c) => {
    const words = tokens(c.desc).filter((w) => (freq.get(w) ?? 0) <= 2);
    const mentions = words.filter((w) => text.includes(w)).length;
    const dataHits = findings
      .filter((f) => f.strength !== "none" && words.some((w) => f.title.toLowerCase().includes(w)))
      .sort((a, b) => (a.strength === "strong" ? -1 : 0) - (b.strength === "strong" ? -1 : 0))
      .slice(0, 2);
    return { ...c, mentions, dataHits, score: mentions * 2 + dataHits.length * 3 + (c.desc.startsWith("Recent change") ? 3 : 0) };
  });

  return scored
    .filter((c) => !existing.has(c.desc.toLowerCase()))
    .sort((a, b2) => b2.score - a.score)
    .slice(0, 8)
    .map((c) => {
      const evidenceFor = [
        ...(c.mentions ? [`Reported problem description / answers mention related terms.`] : []),
        ...c.dataHits.map((f) => `Related data finding — ${f.title}: ${f.detail}`),
      ];
      const conf: Hypothesis["confidence"] = c.dataHits.some((f) => f.strength === "strong") ? "medium" : "low";
      return {
        description: c.desc,
        category: c.cat,
        rationale: c.why,
        evidence_for: evidenceFor.join(" ") || "No supporting evidence recorded yet.",
        evidence_against: "Not yet assessed.",
        confidence: conf,
        confidence_explanation:
          conf === "medium"
            ? "A statistical association in the recorded data is consistent with this cause, but association alone does not prove causation and no mechanism test has been recorded."
            : "Based only on the category template and problem description; no recorded evidence yet.",
        verification_test: c.cat ? CATEGORY_TESTS[c.cat] : "Define a test that would distinguish this cause from the alternatives (e.g. compare affected vs. unaffected units).",
        status: c.dataHits.length ? "under_investigation" : "hypothesis",
      };
    });
}

// ---------------------------------------------------------------------------
const ACTION_TEMPLATES: Record<SixM, { corrective: string; preventive: string }> = {
  machine: { corrective: "Repair / replace the failed component and restore the equipment to its specified condition.", preventive: "Add the failure mechanism to the PM plan or condition monitoring with a defined trigger." },
  method: { corrective: "Correct the procedure / settings and retrain affected staff on the change.", preventive: "Error-proof the setting (interlock, recipe lock) and add the parameter to the control plan." },
  material: { corrective: "Segregate and disposition affected material; correct incoming specification.", preventive: "Add incoming inspection / supplier control for the critical material characteristic." },
  measurement: { corrective: "Recalibrate / repair the measurement system and re-test affected product.", preventive: "Define calibration interval and MSA requirements for the measurement." },
  manpower: { corrective: "Address the immediate competence gap with targeted training and supervision.", preventive: "Redesign the task to reduce reliance on memory (job aids, poka-yoke) and update the training matrix." },
  environment: { corrective: "Restore environmental conditions to the required range.", preventive: "Monitor the environmental condition with alarms and a reaction plan." },
};

export function proposeActions(b: InvestigationBundle) {
  return b.causes
    .filter((c) => ["supported", "confirmed"].includes(c.status) && ["root_cause", "contributing_factor", "systemic_cause"].includes(c.cause_type))
    .flatMap((c) => {
      const tpl = ACTION_TEMPLATES[c.category ?? guessCategory(c.description) ?? "method"];
      const verification = "Compare the KPI against the acceptance criterion for a defined period after implementation (e.g. 4–6 weeks) using the same measurement method as the baseline.";
      return [
        { cause: c.description, action: tpl.corrective, type: "corrective" as const, verification },
        { cause: c.description, action: tpl.preventive, type: "preventive" as const, verification },
      ];
    });
}

// ---------------------------------------------------------------------------
export function runRuleEngine(b: InvestigationBundle, t: CategoryTemplate): AssistantOutput {
  const findings = dataFindings(b);
  const { facts, assumptions } = factsAndAssumptions(b);
  const missing = missingInformation(b, t);
  const hyps = generateHypotheses(b, t, findings);
  const warnings: string[] = [];
  const confirmedNoEvidence = b.causes.filter((c) => c.status === "confirmed" && !c.evidence_ids?.length && !has(c.evidence_for));
  for (const c of confirmedNoEvidence) warnings.push(`"${c.description}" is confirmed but has no linked evidence.`);
  const contradictions = b.causes.filter((c) => c.status === "confirmed" && has(c.evidence_against) && c.evidence_against!.length > 20);
  for (const c of contradictions) warnings.push(`"${c.description}" is confirmed although contrary evidence is recorded — review.`);
  const kpis = b.investigation.kpis ?? [];
  for (const k of kpis) if (typeof k.actual === "number" && k.actual < 0) warnings.push(`KPI "${k.label}" has a negative actual value.`);
  if ((b.investigation.risk?.ratings?.safety ?? 0) >= 4)
    warnings.push("High safety risk: follow site emergency and escalation procedures. This tool does not replace authorised safety decisions.");

  return {
    engine: "rules",
    generated_at: new Date().toISOString(),
    summary: summarize(b, t),
    facts,
    assumptions,
    missing_information: missing,
    follow_up_questions: missing.filter((m) => m.area === "Follow-up" || m.area === "Problem definition").map((m) => m.item),
    recommended_methods: recommendMethods(b),
    data_findings: findings,
    hypotheses: hyps,
    suggested_tests: hyps.slice(0, 5).map((h) => `${h.description}: ${h.verification_test}`),
    proposed_actions: proposeActions(b),
    reasoning_notes: [
      "1. Observed problem established from the problem definition and KPIs.",
      `2. ${facts.length} fact(s) separated from ${assumptions.length} assumption(s)/unverified item(s).`,
      `3. Evidence reviewed: ${b.evidence.length} item(s), ${b.measurements.length} measurement(s).`,
      `4. ${hyps.length} plausible hypotheses generated from the ${t.name} template, the problem description and data findings.`,
      "5. Each hypothesis has a verification test; none is confirmed by the assistant — confirmation requires evidence and human approval.",
      `6. Actions proposed only for causes already supported or confirmed (${proposeActions(b).length / 2 || 0}).`,
    ],
    warnings,
  };
}
