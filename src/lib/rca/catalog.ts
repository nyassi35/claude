// Method catalogue: what each RCA tool is for, what it needs, how it works and what it produces.
// Used by the Methods guide page, the recommendation engine and the report.

export interface MethodInfo {
  key: string;
  name: string;
  group: "core" | "analysis" | "data" | "safety" | "closure";
  whenUseful: string;
  inputs: string;
  how: string;
  output: string;
}

export const METHOD_CATALOG: MethodInfo[] = [
  {
    key: "five_whys",
    name: "5 Whys",
    group: "core",
    whenUseful: "Single, well-defined problems where the causal chain can be traced and checked with evidence. Quick first pass on most investigations.",
    inputs: "A clear problem statement; process knowledge; evidence for each answer.",
    how: "Repeatedly ask why the previous condition occurred, branching where several causes act together, and attach evidence to every answer. Stop at an actionable, defensible systemic cause — not at exactly five.",
    output: "Causal tree from symptom to direct and systemic causes, with unsupported assumptions flagged.",
  },
  {
    key: "ishikawa",
    name: "Ishikawa / Fishbone",
    group: "core",
    whenUseful: "Brainstorming the full range of potential causes before narrowing down, especially in cross-functional teams.",
    inputs: "Effect (problem statement); team knowledge; category template (6M or custom).",
    how: "List potential causes under each category, add sub-causes, then attach evidence and verification status to each so hypotheses can be prioritised and tested.",
    output: "Structured cause map with verification status, priorities and owners.",
  },
  {
    key: "fmea",
    name: "FMEA / PFMEA",
    group: "core",
    whenUseful: "Process-level risk review: assessing how each process step can fail, and prioritising prevention and detection improvements. Also to check whether a failure was foreseen.",
    inputs: "Process steps, functions/requirements, failure modes, effects, causes, current controls, S/O/D ratings.",
    how: "Rate Severity, Occurrence and Detection 1–10; RPN = S×O×D. High-severity items are escalated regardless of RPN. Optional AIAG-VDA-style Action Priority is calculated separately.",
    output: "Prioritised failure-mode register with recommended actions and revised ratings.",
  },
  {
    key: "dmaic",
    name: "DMAIC",
    group: "core",
    whenUseful: "Chronic, data-rich performance problems (yield, throughput, variation) that justify a structured improvement project.",
    inputs: "Charter, baseline data, measurement system information, process map, candidate causes, solution options.",
    how: "Define → Measure → Analyze → Improve → Control, each with required deliverables and completion criteria.",
    output: "Verified improvement with baseline vs. improved performance and a sustaining control plan.",
  },
  {
    key: "pareto",
    name: "Pareto analysis",
    group: "data",
    whenUseful: "Many defect types, failure codes or loss categories — to focus effort on the vital few.",
    inputs: "Counts, durations or costs per category over a defined period.",
    how: "Sort categories descending and plot cumulative percentage; the categories up to ~80% are the vital few.",
    output: "Ranked categories and the vital few to investigate first.",
  },
  {
    key: "fault_tree",
    name: "Fault Tree Analysis (FTA)",
    group: "safety",
    whenUseful: "Complex failures with combinations of events, safety-related events, or equipment with redundancy.",
    inputs: "Top (undesired) event; intermediate and basic events; AND/OR logic; optionally event probabilities.",
    how: "Decompose the top event with logic gates down to basic events. With probabilities and an independence assumption, the top-event probability is estimated.",
    output: "Logic tree, minimal cut-set insight and (optional) estimated top-event probability.",
  },
  {
    key: "process_map",
    name: "Process mapping",
    group: "analysis",
    whenUseful: "When the actual process flow is unclear or differs from the SOP; to locate where a defect originates.",
    inputs: "Process steps, owners, inputs/outputs, observed issues.",
    how: "Walk the process and document each step as performed; mark value-adding steps, inspections and where problems are observed.",
    output: "As-is process map with problem locations.",
  },
  {
    key: "ce_matrix",
    name: "Cause-and-effect matrix",
    group: "analysis",
    whenUseful: "Prioritising many process inputs (X) against several customer outputs (Y).",
    inputs: "Outputs with importance weights; inputs scored 0/1/3/9 for relationship strength.",
    how: "Total score per input = Σ(weight × relationship score). Highest totals are investigated first.",
    output: "Ranked list of process inputs.",
  },
  {
    key: "barrier",
    name: "Barrier analysis",
    group: "safety",
    whenUseful: "Events where controls should have prevented the outcome — safety, quality escapes, contamination.",
    inputs: "Hazard / target; barriers (physical, administrative, detection) that should have been in place.",
    how: "For each barrier determine whether it existed, worked, failed or was bypassed, and why.",
    output: "Failed or missing barriers that become corrective-action targets.",
  },
  {
    key: "change_analysis",
    name: "Change analysis",
    group: "analysis",
    whenUseful: "A process that previously worked has started failing.",
    inputs: "Description of the problem-free situation vs. the problem situation.",
    how: "Compare factor by factor (people, materials, settings, software, suppliers...) and assess whether each difference could explain the effect.",
    output: "List of relevant changes to test as hypotheses.",
  },
  {
    key: "ecfa",
    name: "Event & causal-factor analysis",
    group: "safety",
    whenUseful: "Incidents with a sequence of events over time, especially involving human actions.",
    inputs: "Timeline of events and conditions from logs, interviews and records.",
    how: "Build a chronological chain of events and conditions; mark causal factors that, if removed, would have prevented or mitigated the outcome.",
    output: "Event chain with identified causal factors.",
  },
  {
    key: "bowtie",
    name: "Bow-tie analysis",
    group: "safety",
    whenUseful: "Significant safety, environmental or operational risk scenarios.",
    inputs: "Hazard, top event, threats, consequences, preventive and mitigative barriers.",
    how: "Map threats → top event → consequences with barriers on each path, then evaluate barrier adequacy.",
    output: "Visual risk scenario with barrier gaps.",
  },
  {
    key: "trend",
    name: "Trend & correlation analysis",
    group: "data",
    whenUseful: "Process data are available and a relationship between a parameter and the defect is suspected.",
    inputs: "Paired measurements (e.g. per batch) of a process parameter and an outcome.",
    how: "Plot over time and against each other; compute Pearson r, R² and p-value. Correlation is a lead, not proof.",
    output: "Strength and significance of relationships, trend/drift detection.",
  },
  {
    key: "spc",
    name: "Statistical process control",
    group: "data",
    whenUseful: "Judging whether variation is common-cause or special-cause, and monitoring after improvement.",
    inputs: "Time-ordered measurements (≥20 recommended), specification limits for capability.",
    how: "I-MR or X̄-R control limits from data, Western Electric rules; capability (Cp/Cpk/Pp/Ppk) only when stable and data suitable.",
    output: "Control chart, out-of-control signals, capability where valid.",
  },
  {
    key: "is_is_not",
    name: "Is / Is Not analysis",
    group: "analysis",
    whenUseful: "Early in an investigation to sharpen the problem definition and eliminate unlikely causes.",
    inputs: "Observations of what/where/when/how much the problem is and is not.",
    how: "For each dimension contrast IS vs. IS NOT, note distinctions and related changes. Any candidate cause must explain both columns.",
    output: "Precise problem boundary and distinctions that guide hypothesis testing.",
  },
  {
    key: "comparative",
    name: "Good vs. defective batch comparison",
    group: "data",
    whenUseful: "Both affected and unaffected batches/units exist with recorded parameters.",
    inputs: "Measurements labelled by group (e.g. affected / unaffected).",
    how: "Compare distributions per parameter (means, spread) and test differences with Welch's t-test where assumptions hold.",
    output: "Parameters that differ between groups — candidate causes to verify.",
  },
  {
    key: "human_factors",
    name: "Human factors & systemic causes",
    group: "analysis",
    whenUseful: "Whenever a human action is part of the causal chain — to find why the system allowed or encouraged it rather than blaming individuals.",
    inputs: "Interview notes, procedures, training records, workload and organisational information.",
    how: "Classify findings into unsafe acts, preconditions, supervision and organisational influences; identify system-level contributors.",
    output: "Systemic causes and organisational actions.",
  },
  {
    key: "capa",
    name: "CAPA management",
    group: "closure",
    whenUseful: "Every investigation with a confirmed or strongly supported cause.",
    inputs: "Confirmed causes, actions, owners, due dates, acceptance criteria.",
    how: "Plan corrective and preventive actions linked to causes, verify implementation, then check effectiveness against acceptance criteria.",
    output: "Tracked action register with verified effectiveness.",
  },
  {
    key: "lessons_learned",
    name: "Lessons learned & recurrence review",
    group: "closure",
    whenUseful: "At closure, and when a problem recurs.",
    inputs: "Investigation findings, effectiveness results, similar past investigations.",
    how: "Capture transferable lessons and check whether similar processes elsewhere are exposed.",
    output: "Lessons register and horizontal deployment actions.",
  },
];

export const methodName = (key: string) => METHOD_CATALOG.find((m) => m.key === key)?.name ?? key;

export const DMAIC_PHASES = ["define", "measure", "analyze", "improve", "control"] as const;
export type DmaicPhase = (typeof DMAIC_PHASES)[number];

export const DMAIC_DELIVERABLES: Record<DmaicPhase, { key: string; label: string; required: boolean; help?: string }[]> = {
  define: [
    { key: "problem_statement", label: "Problem statement", required: true },
    { key: "business_case", label: "Business case", required: true },
    { key: "customer_impact", label: "Customer impact", required: false },
    { key: "scope", label: "Project scope (in / out)", required: true },
    { key: "goals", label: "Goals and measurable success criteria", required: true, help: "e.g. raise weekly output from 1,620 kg to ≥ 2,000 kg for 6 consecutive weeks" },
    { key: "stakeholders", label: "Stakeholders / team", required: false },
    { key: "charter", label: "Project charter summary / sponsor sign-off", required: false },
  ],
  measure: [
    { key: "baseline", label: "Baseline performance (with period and data source)", required: true },
    { key: "data_plan", label: "Data collection plan", required: true },
    { key: "msa", label: "Measurement system & data quality assessment", required: true },
    { key: "process_map_ref", label: "Process map reference", required: false },
    { key: "pareto_ref", label: "Check sheets / Pareto findings", required: false },
    { key: "capability", label: "Baseline capability (where appropriate)", required: false },
  ],
  analyze: [
    { key: "candidate_causes", label: "Candidate causes considered", required: true },
    { key: "analysis_summary", label: "Analysis performed (stratification, correlation, hypothesis tests)", required: true },
    { key: "verified_causes", label: "Verified root causes and evidence", required: true },
  ],
  improve: [
    { key: "solutions", label: "Countermeasures generated and evaluated", required: true },
    { key: "trial", label: "Trial / experiment design and results", required: true },
    { key: "selected", label: "Selected solution and approval", required: true },
  ],
  control: [
    { key: "control_plan_ref", label: "Control plan", required: true },
    { key: "sop_updates", label: "SOP updates", required: true },
    { key: "monitoring", label: "Monitoring frequency, SPC and control vs. specification limits", required: true },
    { key: "reaction_plan", label: "Reaction plan for out-of-control conditions", required: true },
    { key: "ownership", label: "Ownership, review dates and effectiveness checks", required: true },
  ],
};
