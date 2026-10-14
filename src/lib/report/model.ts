// Builds a renderer-independent RCA report model from an investigation bundle. The same model is
// rendered to HTML (report page), PDF (jsPDF) and XLSX (ExcelJS) so all outputs stay consistent.
import type { InvestigationBundle } from "@/lib/ai/engine";
import { problemTypesFor } from "@/lib/categories/engine";
import type { CategoryTemplate } from "@/lib/categories/types";
import { actionPriority, classifyFmeaRisk } from "@/lib/calc/fmea";
import { computeMetrics, riskSummary } from "@/lib/calc/metrics";
import { pareto } from "@/lib/calc/pareto";
import { capability, imrChart } from "@/lib/calc/spc";
import { welchTTest } from "@/lib/calc/stats";
import { isOverdue } from "@/lib/capa-rules";
import { DMAIC_DELIVERABLES, DMAIC_PHASES, methodName } from "@/lib/rca/catalog";
import { ceMatrixTotals, dmaicPhaseStatus, ftaProbability, reviewFiveWhys, type Dmaic, type FiveWhys, type FtaNode, type Ishikawa } from "@/lib/rca/methods";
import type { Approval, ControlPlanItem, OrgSettings } from "@/lib/types";

export type Block =
  | { t: "p"; text: string }
  | { t: "note"; text: string }
  | { t: "kv"; rows: [string, string][] }
  | { t: "list"; items: string[] }
  | { t: "table"; head: string[]; rows: string[][]; caption?: string };

export interface ReportSection {
  key: string;
  title: string;
  blocks: Block[];
}

export const REPORT_SECTIONS: { key: string; title: string; method?: boolean }[] = [
  { key: "executive_summary", title: "Executive summary" },
  { key: "incident", title: "Incident description" },
  { key: "problem", title: "Problem statement and scope" },
  { key: "context", title: "Production context" },
  { key: "timeline", title: "Timeline of events" },
  { key: "performance", title: "Baseline and actual performance" },
  { key: "evidence", title: "Data sources and evidence" },
  { key: "risk", title: "Risk assessment" },
  { key: "methods", title: "Methods used" },
  { key: "five_whys", title: "5 Whys analysis", method: true },
  { key: "ishikawa", title: "Ishikawa diagram", method: true },
  { key: "fmea", title: "FMEA / PFMEA", method: true },
  { key: "dmaic", title: "DMAIC findings", method: true },
  { key: "other_tools", title: "Supporting analyses (Pareto, Is/Is Not, data tools, …)", method: true },
  { key: "causes", title: "Candidate and confirmed root causes" },
  { key: "contributing", title: "Contributing factors" },
  { key: "verification", title: "Verification tests and results" },
  { key: "capa", title: "Corrective and preventive actions" },
  { key: "owners", title: "Action owners and deadlines" },
  { key: "benefits", title: "Expected and measured benefits" },
  { key: "control_plan", title: "Control plan" },
  { key: "effectiveness", title: "Effectiveness verification" },
  { key: "residual_risk", title: "Residual risks" },
  { key: "approvals", title: "Approvals and sign-off" },
  { key: "lessons", title: "Lessons learned" },
];

const t = (s: unknown) => (s === null || s === undefined || s === "" ? "—" : String(s));
const d = (iso?: string | null, time = false) => (iso ? (time ? iso.slice(0, 16).replace("T", " ") : iso.slice(0, 10)) : "—");
const tc = (s: string) => s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const n = (v: number | null | undefined, dg = 2) => (typeof v === "number" && Number.isFinite(v) ? (Math.round(v * 10 ** dg) / 10 ** dg).toString() : "—");

export interface ReportInput extends InvestigationBundle {
  controlPlan: ControlPlanItem[];
  approvals: Approval[];
  template: CategoryTemplate;
  orgName: string;
  settings: OrgSettings;
  memberName: (id: string | null | undefined) => string;
  plantName?: string | null;
  lineName?: string | null;
}

export function buildReport(r: ReportInput, selected?: string[]): { title: string; subtitle: string; generatedAt: string; sections: ReportSection[] } {
  const i = r.investigation;
  const p = i.problem ?? {};
  const want = (k: string) => !selected || selected.includes(k);
  const analysis = <T,>(m: string) => r.analyses.find((a) => a.method === m)?.data as T | undefined;
  const confirmed = r.causes.filter((c) => c.status === "confirmed");
  const risk = riskSummary(i.risk?.ratings ?? {});
  const metrics = computeMetrics(i.risk?.cost_inputs ?? {}, r.settings.currency);
  const sections: ReportSection[] = [];
  const push = (key: string, blocks: Block[]) => {
    if (!want(key)) return;
    const title = REPORT_SECTIONS.find((s) => s.key === key)!.title;
    sections.push({ key, title, blocks: blocks.length ? blocks : [{ t: "note", text: "No information recorded." }] });
  };

  // 1 Executive summary
  push("executive_summary", [
    { t: "p", text: `${i.title} (${i.number}) — ${r.template.name}. Status: ${tc(i.status)}; severity ${i.severity}; priority ${i.priority}.` },
    { t: "p", text: p.what_happened ? `Problem: ${p.what_happened}` : "Problem description not yet recorded." },
    {
      t: "p",
      text: confirmed.length
        ? `Confirmed root cause(s): ${confirmed.map((c) => c.description).join("; ")}.`
        : `No root cause has been confirmed yet. ${r.causes.filter((c) => !["rejected"].includes(c.status)).length} candidate cause(s) are under evaluation; findings below are hypotheses unless marked confirmed.`,
    },
    { t: "p", text: `${r.capa.length} action(s): ${r.capa.filter((a) => ["effective", "closed"].includes(a.status)).length} effective/closed, ${r.capa.filter((a) => isOverdue(a)).length} overdue.` },
  ]);
  // 2 Incident
  push("incident", [
    { t: "kv", rows: [["What happened", t(p.what_happened)], ["Where observed", t(p.where_observed)], ["When it started", t(p.started)], ["Frequency", t(p.frequency)], ["Problem type", problemTypesFor(r.template).find((x) => x.key === p.problem_type)?.label ?? "—"], ["Occurred at", d(i.occurred_at, true)]] },
  ]);
  // 3 Problem statement & scope
  push("problem", [
    { t: "kv", rows: [["Expected", t(p.expected)], ["Actual", t(p.actual)], ["Affected products / batches / machines", t(p.affected)], ["Measurable impact", t(p.impact)], ["Previously occurred", t(p.previous_occurrence)], ["Previous occurrence details", t(p.previous_details)]] },
    ...(analysis<Dmaic>("dmaic")?.phases?.define?.fields?.scope ? [{ t: "kv" as const, rows: [["Scope", analysis<Dmaic>("dmaic")!.phases.define!.fields.scope] as [string, string]] }] : []),
  ]);
  // 4 Production context
  push("context", [
    {
      t: "kv",
      rows: [
        ["Organization", r.orgName], ["Category", r.template.name], ["Plant", t(r.plantName)], ["Line", t(r.lineName)], ["Department", t(i.department)], ["Process", t(i.process_name)],
        ["Product", t(i.product)], ["Batch / lot", t(i.batch_number)], ["Asset", t(i.asset_id)], ["Shift", t(i.shift)], ["Owner", r.memberName(i.owner_id)], ["Due date", d(i.due_date)],
      ],
    },
    { t: "kv", rows: [["Process flow", t(i.process?.flow)], ["SOP / targets", t(i.process?.sop)], ["Raw materials", t(i.process?.raw_materials)], ["Maintenance history", t(i.process?.maintenance_history)], ["Training / shifts", t(i.process?.training)], ["Environment", t(i.process?.environment)], ["Recent changes", t(i.process?.recent_changes)]] },
    ...(i.process?.parameters?.length ? [{ t: "table" as const, head: ["Parameter", "Unit", "Target", "LSL", "USL", "Actual"], rows: i.process.parameters.map((x) => [x.name, x.unit, n(x.target), n(x.lsl), n(x.usl), n(x.actual)]) }] : []),
  ]);
  // 5 Timeline
  push("timeline", r.timeline.length ? [{ t: "table", head: ["Date/time", "Event", "Source", "Verified"], rows: r.timeline.map((e) => [d(e.occurred_at, true), e.description, t(e.source), e.is_verified ? "Yes" : "No"]) }] : []);
  // 6 Performance
  push("performance", i.kpis.length ? [{ t: "table", head: ["KPI", "Unit", "Baseline", "Target", "Actual"], rows: i.kpis.map((k) => [k.label, k.unit, n(k.baseline), n(k.target), n(k.actual)]) }] : []);
  // 7 Evidence
  const params = [...new Set(r.measurements.map((m) => m.parameter))];
  push("evidence", [
    ...(r.evidence.length ? [{ t: "table" as const, head: ["Evidence", "Kind", "Source", "Collected", "Verified"], rows: r.evidence.map((e) => [e.title, tc(e.kind), t(e.source), `${t(e.collected_by)} ${d(e.collected_at)}`, e.is_verified ? "Yes" : "No — treat as assumption"]) }] : []),
    ...(params.length ? [{ t: "table" as const, caption: "Measurement data sets", head: ["Parameter", "n", "Unit", "Groups", "Source"], rows: params.map((pp) => { const ms = r.measurements.filter((m) => m.parameter === pp); return [pp, String(ms.length), t(ms[0]?.unit), [...new Set(ms.map((m) => m.group_label).filter(Boolean))].join(", ") || "—", t(ms[0]?.source)]; }) }] : []),
  ]);
  // 8 Risk
  push("risk", [
    { t: "p", text: `Overall risk level: ${tc(risk.level)} (highest rating ${risk.max || "—"}/5 across ${risk.rated} assessed dimension(s)).${risk.escalate.length ? ` Escalation triggered for: ${risk.escalate.map(tc).join(", ")}${i.risk?.escalated ? ` — escalated (${t(i.risk?.escalation_note)})` : " — NOT yet recorded as escalated"}.` : ""}` },
    { t: "table", head: ["Dimension", "Rating (1–5)", "Basis"], rows: Object.entries(i.risk?.ratings ?? {}).map(([k, v]) => [tc(k), String(v), t(i.risk?.notes?.[k as keyof typeof i.risk.notes])]) },
    { t: "table", caption: "Impact metrics (calculated only when inputs are available; estimates are labelled)", head: ["Metric", "Value", "Formula", "Notes"], rows: metrics.map((m) => [m.label + (m.estimate ? " (estimate)" : ""), m.value !== null ? `${n(m.value)} ${m.unit}` : "not calculated", m.formula, m.invalid ?? (m.missing.length ? `Missing: ${m.missing.join(", ")}` : m.assumptions.join(" "))]) },
  ]);
  // 9 Methods used
  const used = [...new Set([...r.analyses.map((a) => a.method), ...(r.fmea.length ? ["fmea"] : []), ...(r.capa.length ? ["capa"] : [])])];
  push("methods", [{ t: "list", items: used.length ? used.map((m) => `${methodName(m)}${r.analyses.find((a) => a.method === m) ? ` — ${tc(r.analyses.find((a) => a.method === m)!.status)}` : ""}`) : ["No structured methods recorded yet."] }]);
  // 10 5 Whys
  const fw = analysis<FiveWhys>("five_whys");
  if (fw) {
    const rv = reviewFiveWhys(fw);
    push("five_whys", [
      { t: "p", text: `Problem: ${fw.problem}` },
      ...rv.branches.map((b, k) => ({ t: "list" as const, items: [`Branch ${k + 1}${b.concluded ? " (concluded)" : " (open)"}:`, ...b.path.map((pp, j) => `Why ${j + 1}: ${pp.text} [${pp.evidenceStatus}${pp.evidence ? ` — ${pp.evidence}` : ""}; ${pp.level}]${pp.isRootCause ? " ◆ ROOT CAUSE" : ""}`)] })),
      ...(rv.warnings.length ? [{ t: "note" as const, text: `Review: ${rv.warnings.join(" ")}` }] : []),
    ]);
  } else push("five_whys", []);
  // 11 Ishikawa
  const fb = analysis<Ishikawa>("ishikawa");
  push("ishikawa", fb ? [
    { t: "p", text: `Effect: ${fb.effect}` },
    { t: "table", head: ["Category", "Cause", "Status", "Priority", "Evidence (source)", "Owner"], rows: fb.causes.map((c) => [fb.categories.find((x) => x.key === c.category)?.label ?? c.category, `${c.parentId ? "↳ " : ""}${c.text}${c.suggested ? " (suggested)" : ""}`, tc(c.status), String(c.priority), `${t(c.evidence)}${c.evidenceSource ? ` (${c.evidenceSource})` : ""}`, t(c.owner)]) },
  ] : []);
  // 12 FMEA
  push("fmea", r.fmea.length ? [
    { t: "table", head: ["Step", "Failure mode", "Effects", "Causes", "Controls (P / D)", "S", "O", "D", "RPN", "AP", "Action / owner", "Revised RPN"], rows: r.fmea.map((x) => [x.process_step, x.failure_mode, t(x.effects), t(x.causes), `${t(x.prevention_controls)} / ${t(x.detection_controls)}`, String(x.severity), String(x.occurrence), String(x.detection), `${x.rpn}${classifyFmeaRisk(x, r.settings).highRisk ? " ⚠" : ""}`, actionPriority(x.severity, x.occurrence, x.detection), `${t(x.recommended_actions)} / ${t(x.action_owner)}`, x.revised_rpn ? String(x.revised_rpn) : "—"]) },
    { t: "note", text: `⚠ = high risk (RPN ≥ ${r.settings.rpn_threshold}, severity ≥ ${r.settings.severity_escalation}${r.settings.use_action_priority ? ", or AP = H" : ""}). AP is an AIAG-VDA-style lookup, separate from RPN.` },
  ] : []);
  // 13 DMAIC
  const dm = analysis<Dmaic>("dmaic");
  push("dmaic", dm ? DMAIC_PHASES.flatMap((ph): Block[] => {
    const st = dmaicPhaseStatus(dm, ph);
    const f = dm.phases?.[ph]?.fields ?? {};
    return [{ t: "kv" as const, rows: [[`${tc(ph)} phase`, `${tc(st.status)} (${st.progress}% of required deliverables)`] as [string, string], ...DMAIC_DELIVERABLES[ph].filter((x) => f[x.key]).map((x) => [x.label, f[x.key]] as [string, string])] }];
  }).concat(dm.countermeasures.length ? [{ t: "table" as const, head: ["Countermeasure", "Cost", "Benefit", "Risk", "Feasibility", "Trial result", "Selected"], rows: dm.countermeasures.map((c) => [c.name, String(c.cost), String(c.benefit), String(c.risk), String(c.feasibility), t(c.trial_result), c.selected ? "Yes" : "No"]) }] : []) : []);
  // 14 Other tools
  const other: Block[] = [];
  const pa = analysis<{ metric: string; unit: string; items: { label: string; value: number }[] }>("pareto");
  if (pa?.items?.length) {
    const res = pareto(pa.items);
    other.push({ t: "table", caption: `Pareto — ${pa.metric}`, head: ["Category", `Value (${pa.unit})`, "Share %", "Cumulative %", "Vital few"], rows: res.rows.map((x) => [x.label, n(x.value), n(x.share, 1), n(x.cumulative, 1), x.vital ? "Yes" : ""]) });
  }
  for (const m of ["is_is_not", "change_analysis", "barrier", "ecfa", "process_map", "human_factors"]) {
    const a = analysis<{ rows: Record<string, unknown>[]; notes?: string }>(m);
    if (a?.rows?.length) {
      const cols = Object.keys(a.rows.reduce((acc, row) => ({ ...acc, ...row }), {}));
      other.push({ t: "table", caption: methodName(m), head: cols.map(tc), rows: a.rows.map((row) => cols.map((c) => t(row[c]))) });
      if (a.notes) other.push({ t: "note", text: a.notes });
    }
  }
  const ft = analysis<{ nodes: FtaNode[] }>("fault_tree");
  if (ft?.nodes?.length) {
    const top = ft.nodes.find((x) => !x.parentId)!;
    const prob = ftaProbability(ft.nodes, top.id);
    other.push({ t: "list", items: [`Fault tree — top event: ${top.label}; estimated probability ${prob === null ? "not calculable" : prob.toPrecision(3)} (independence assumed)`, ...ft.nodes.filter((x) => x.parentId).map((x) => `${ft.nodes.find((y) => y.id === x.parentId)?.label} ← ${x.label}${x.probability !== null ? ` (P=${x.probability})` : ""}`)] });
  }
  const ce = analysis<Parameters<typeof ceMatrixTotals>[0]>("ce_matrix");
  if (ce?.inputs?.length) other.push({ t: "table", caption: "Cause-and-effect matrix ranking", head: ["Input", "Total score"], rows: ceMatrixTotals(ce).map((x) => [x.name, String(x.total)]) });
  const bt = analysis<{ hazard: string; top_event: string; threats: { name: string; barriers: string }[]; consequences: { name: string; barriers: string }[] }>("bowtie");
  if (bt?.top_event) other.push({ t: "list", items: [`Bow-tie — hazard: ${bt.hazard}; top event: ${bt.top_event}`, ...bt.threats.map((x) => `Threat: ${x.name} — preventive barriers: ${x.barriers || "none"}`), ...bt.consequences.map((x) => `Consequence: ${x.name} — mitigative barriers: ${x.barriers || "none"}`)] });
  const cmp = analysis<{ parameter: string; groupA: string; groupB: string }>("comparative");
  if (cmp?.parameter) {
    const v = (g: string) => r.measurements.filter((m) => m.parameter === cmp.parameter && m.group_label === g).map((m) => m.value);
    const tt = welchTTest(v(cmp.groupA), v(cmp.groupB));
    other.push({ t: "p", text: tt.ok ? `Comparative analysis — ${cmp.parameter}: ${cmp.groupA} mean ${n(tt.a.mean, 3)} (n=${tt.a.n}) vs. ${cmp.groupB} mean ${n(tt.b.mean, 3)} (n=${tt.b.n}); Welch t=${n(tt.t, 3)}, p=${n(tt.p, 4)}. A difference identifies a lead, not proof of causation.` : `Comparative analysis — ${cmp.parameter}: ${tt.reason}` });
  }
  const spc = analysis<{ parameter: string }>("spc");
  if (spc?.parameter) {
    const ms = r.measurements.filter((m) => m.parameter === spc.parameter).sort((a, b) => (a.measured_at ?? "").localeCompare(b.measured_at ?? ""));
    const ch = imrChart(ms.map((m) => m.value));
    const cap = capability(ms.map((m) => m.value), ms.find((m) => m.lsl !== null)?.lsl, ms.find((m) => m.usl !== null)?.usl);
    other.push({ t: "p", text: ch.ok ? `SPC (I-MR) — ${spc.parameter}: CL ${n(ch.individuals!.center, 3)}, UCL ${n(ch.individuals!.ucl, 3)}, LCL ${n(ch.individuals!.lcl, 3)}; ${ch.violations.length} rule violation(s). Capability: ${cap.ok ? `Cp ${n(cap.cp)}, Cpk ${n(cap.cpk)}, Pp ${n(cap.pp)}, Ppk ${n(cap.ppk)}${cap.warnings.length ? ` — ${cap.warnings.join(" ")}` : ""}` : `not calculated (${cap.reason})`}` : `SPC — ${spc.parameter}: ${ch.reason}` });
  }
  push("other_tools", other);
  // 15 Causes
  push("causes", r.causes.length ? [
    { t: "table", head: ["Cause", "Type", "Category", "Status", "Confidence", "Evidence for", "Evidence against / uncertainty"], rows: r.causes.map((c) => [`${c.description}${c.ai_suggested ? " (AI-suggested)" : ""}`, tc(c.cause_type), c.category ? tc(c.category) : "—", tc(c.status), `${c.confidence}${c.confidence_rationale ? ` — ${c.confidence_rationale}` : ""}`, t(c.evidence_for), t(c.evidence_against)]) },
    { t: "note", text: "Only causes with status Confirmed are verified root causes; all others are hypotheses or rejected." },
  ] : []);
  // 16 Contributing
  const contrib = r.causes.filter((c) => ["contributing_factor", "systemic_cause"].includes(c.cause_type));
  push("contributing", contrib.length ? [{ t: "list", items: contrib.map((c) => `${c.description} — ${tc(c.cause_type)}, ${tc(c.status)}`) }] : []);
  // 17 Verification
  const ver = r.causes.filter((c) => c.verification_test);
  push("verification", ver.length ? [{ t: "table", head: ["Cause", "Verification test", "Result", "Status"], rows: ver.map((c) => [c.description, t(c.verification_test), t(c.verification_result), tc(c.status)]) }] : []);
  // 18 CAPA
  push("capa", r.capa.length ? [{ t: "table", head: ["Action", "Type", "Linked cause", "Expected impact", "Priority", "Status", "Verification / acceptance"], rows: r.capa.map((a) => [a.description, tc(a.action_type), t(r.causes.find((c) => c.id === a.cause_id)?.description), t(a.expected_impact), a.priority, tc(a.status) + (a.status_reason ? ` (${a.status_reason})` : ""), `${t(a.verification_method)} / ${t(a.acceptance_criteria)}`]) }] : []);
  // 19 Owners
  push("owners", r.capa.length ? [{ t: "table", head: ["Action", "Responsible", "Department", "Due", "Overdue", "Est. cost"], rows: r.capa.map((a) => [a.description, a.responsible_name || r.memberName(a.assignee_id), t(a.department), d(a.due_date), isOverdue(a) ? "YES" : "", a.estimated_cost !== null ? `${n(a.estimated_cost)} ${r.settings.currency}` : "—"]) }] : []);
  // 20 Benefits
  const sav = metrics.find((m) => m.key === "savings");
  push("benefits", [
    { t: "table", head: ["KPI", "Baseline", "Target", "Actual"], rows: i.kpis.map((k) => [`${k.label} (${k.unit})`, n(k.baseline), n(k.target), n(k.actual)]) },
    { t: "p", text: sav?.value !== null && sav?.value !== undefined ? `Estimated savings: ${n(sav.value)} ${r.settings.currency} (${sav.formula}; estimate).` : "Savings not estimated (inputs missing)." },
    ...r.capa.filter((a) => a.actual_result).map((a) => ({ t: "p" as const, text: `Measured: ${a.description} → ${a.actual_result}` })),
  ]);
  // 21 Control plan
  push("control_plan", r.controlPlan.length ? [{ t: "table", head: ["Step", "Characteristic", "Spec", "Control method", "Frequency", "Control limits", "Reaction plan", "Owner"], rows: r.controlPlan.map((c) => [c.process_step, c.characteristic, t(c.specification), t(c.control_method), t(c.frequency), t(c.control_limits), t(c.reaction_plan), t(c.owner)]) }] : []);
  // 22 Effectiveness
  const verified = r.capa.filter((a) => ["effective", "ineffective", "closed"].includes(a.status));
  push("effectiveness", verified.length ? [{ t: "table", head: ["Action", "Acceptance criteria", "Actual result", "Outcome", "Review date"], rows: verified.map((a) => [a.description, t(a.acceptance_criteria), t(a.actual_result), tc(a.status), d(a.effectiveness_review_date)]) }] : [{ t: "note", text: "No actions have completed effectiveness verification yet." }]);
  // 23 Residual risks
  const residual = r.fmea.filter((x) => (x.revised_rpn ?? x.rpn) >= r.settings.rpn_threshold || (x.revised_severity ?? x.severity) >= r.settings.severity_escalation);
  push("residual_risk", [
    ...(residual.length ? [{ t: "table" as const, head: ["Failure mode", "Current / revised RPN", "Severity"], rows: residual.map((x) => [x.failure_mode, `${x.rpn} / ${x.revised_rpn ?? "not re-rated"}`, String(x.revised_severity ?? x.severity)]) }] : [{ t: "p" as const, text: "No FMEA items remain above the escalation thresholds." }]),
    ...r.causes.filter((c) => ["hypothesis", "under_investigation"].includes(c.status)).map((c) => ({ t: "p" as const, text: `Unresolved hypothesis: ${c.description}` })),
  ]);
  // 24 Approvals
  push("approvals", r.approvals.length ? [{ t: "table", head: ["Record", "Decision", "Approver", "Date", "Comment"], rows: r.approvals.map((a) => [tc(a.record_type), tc(a.decision), t(a.approver_name), d(a.created_at, true), t(a.comment)]) }] : [{ t: "note", text: "No sign-offs recorded." }]);
  // 25 Lessons
  const ll = analysis<{ rows: Record<string, unknown>[]; notes?: string }>("lessons_learned");
  push("lessons", ll?.rows?.length ? [{ t: "list", items: ll.rows.map((x) => `${t(x.lesson)}${x.applies_to ? ` — applies to: ${x.applies_to}` : ""}`) }] : []);

  return {
    title: `Root Cause Analysis Report — ${i.number}`,
    subtitle: `${i.title} · ${r.orgName}`,
    generatedAt: new Date().toISOString(),
    sections,
  };
}
