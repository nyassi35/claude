import type { KpiDef, ProblemTypeDef, Question } from "./types";

export const KPI_DEFS: KpiDef[] = [
  { key: "defect_rate", label: "Defect rate", unit: "%", higherIsBetter: false },
  { key: "scrap", label: "Scrap", unit: "kg", higherIsBetter: false },
  { key: "rework", label: "Rework", unit: "units", higherIsBetter: false },
  { key: "downtime", label: "Downtime", unit: "h", higherIsBetter: false },
  { key: "throughput", label: "Throughput / output", unit: "kg/week", higherIsBetter: true },
  { key: "yield", label: "Yield", unit: "%", higherIsBetter: true },
  { key: "cycle_time", label: "Cycle time", unit: "s", higherIsBetter: false },
  { key: "energy", label: "Energy consumption", unit: "kWh/unit", higherIsBetter: false },
  { key: "material_loss", label: "Material loss", unit: "kg", higherIsBetter: false },
  { key: "complaints", label: "Customer complaints", unit: "count", higherIsBetter: false },
  { key: "oee", label: "OEE", unit: "%", higherIsBetter: true },
  { key: "first_pass_yield", label: "First-pass yield", unit: "%", higherIsBetter: true },
  { key: "effluent_compliance", label: "Effluent samples in compliance", unit: "%", higherIsBetter: true },
  { key: "emissions", label: "Emissions", unit: "mg/Nm³", higherIsBetter: false },
  { key: "availability", label: "Equipment availability", unit: "%", higherIsBetter: true },
];

export const kpiDef = (key: string) => KPI_DEFS.find((k) => k.key === key);

/** Problem types shared by every category; categories add their own on top. */
export const COMMON_PROBLEM_TYPES: ProblemTypeDef[] = [
  { key: "quality_oos", label: "Out-of-specification product / quality defect" },
  { key: "downtime", label: "Equipment stoppage / repeated downtime" },
  { key: "throughput", label: "Throughput or output below target" },
  { key: "yield_loss", label: "Yield loss / material loss" },
  { key: "contamination", label: "Contamination / foreign matter" },
  { key: "safety_event", label: "Safety incident or near miss" },
  { key: "environmental_event", label: "Environmental release / emission exceedance" },
  { key: "customer_complaint", label: "Customer complaint / field failure" },
  { key: "other", label: "Other" },
];

const pt = (key: string) => ({ field: "problem.problem_type", op: "eq" as const, value: key });

/** Follow-up questions shared by all categories, triggered by problem type and earlier answers. */
export const COMMON_FOLLOWUPS: Question[] = [
  // Downtime / stoppages
  {
    id: "dt_failure_codes",
    section: "followup",
    type: "textarea",
    label: "Which alarm or failure codes were recorded for the stoppages?",
    help: "Export from the PLC/SCADA/CMMS if available and attach as evidence.",
    rationale: "Repeated stoppages often share a common failure code or sequence.",
    showIf: pt("downtime"),
  },
  {
    id: "dt_count",
    section: "followup",
    type: "number",
    unit: "stoppages",
    label: "How many stoppages occurred in the review period?",
    showIf: pt("downtime"),
  },
  {
    id: "dt_mttr",
    section: "followup",
    type: "number",
    unit: "min",
    label: "Average time to restore (MTTR)",
    showIf: pt("downtime"),
  },
  {
    id: "dt_pattern",
    section: "followup",
    type: "multiselect",
    label: "Do the stoppages share a pattern?",
    options: ["Same shift", "Same product/variant", "After changeover", "After maintenance", "Start-up", "Specific time of day", "Same component", "No pattern identified", "Not yet analysed"],
    rationale: "Stratifying stoppages by shift, product or event points to the mechanism.",
    showIf: pt("downtime"),
  },
  {
    id: "dt_vibration",
    section: "followup",
    type: "select",
    label: "Is vibration or condition-monitoring data available for the affected asset?",
    options: ["Yes – trend shows change", "Yes – no change visible", "No data available"],
    showIf: pt("downtime"),
  },
  {
    id: "dt_lubrication",
    section: "followup",
    type: "select",
    label: "Was lubrication performed to schedule on the affected components?",
    options: ["Yes, verified in records", "Records incomplete", "No", "Unknown"],
    showIf: pt("downtime"),
  },
  {
    id: "dt_wear",
    section: "followup",
    type: "textarea",
    label: "Were worn or damaged components found? Describe the wear pattern.",
    showIf: { field: "answers.dt_lubrication", op: "in", value: ["Records incomplete", "No", "Unknown"] },
    rationale: "Incomplete lubrication records make component wear a candidate mechanism worth inspecting.",
  },
  // Quality / OOS
  {
    id: "q_measurement_method",
    section: "followup",
    type: "textarea",
    label: "How was the out-of-specification result measured (method, instrument, sampling)?",
    rationale: "Before investigating the process, confirm the result is not a measurement or sampling artefact.",
    showIf: { any: [pt("quality_oos"), pt("customer_complaint")] },
  },
  {
    id: "q_retest",
    section: "followup",
    type: "select",
    label: "Was the result confirmed by an independent re-test or re-sample?",
    options: ["Yes – confirmed", "Yes – not confirmed", "Not yet", "Not possible"],
    showIf: { any: [pt("quality_oos"), pt("customer_complaint")] },
  },
  {
    id: "q_msa",
    section: "followup",
    type: "select",
    label: "Is there a current measurement system analysis (Gauge R&R) / calibration for the instrument?",
    options: ["Yes – acceptable", "Yes – marginal", "Overdue", "None", "Unknown"],
    showIf: { field: "answers.q_retest", op: "in", value: ["Yes – not confirmed", "Not yet"] },
    rationale: "An unconfirmed re-test points to measurement-system variation as a hypothesis.",
  },
  {
    id: "q_good_vs_bad",
    section: "followup",
    type: "select",
    label: "Are records available for both affected and unaffected batches for comparison?",
    options: ["Yes", "Partially", "No"],
    showIf: { any: [pt("quality_oos"), pt("yield_loss"), pt("customer_complaint")] },
  },
  // Contamination
  {
    id: "c_type",
    section: "followup",
    type: "select",
    label: "Type of contaminant",
    options: ["Physical / foreign body", "Chemical", "Microbiological", "Cross-product", "Unknown"],
    showIf: pt("contamination"),
  },
  {
    id: "c_source_checked",
    section: "followup",
    type: "multiselect",
    label: "Which potential sources have been checked?",
    options: ["Raw materials", "Equipment wear / gaskets", "Cleaning residues", "Environment / air", "Personnel", "Packaging", "None yet"],
    showIf: pt("contamination"),
  },
  // Throughput
  {
    id: "t_bottleneck",
    section: "followup",
    type: "text",
    label: "Which step is believed to be the bottleneck, and on what evidence?",
    showIf: pt("throughput"),
  },
  {
    id: "t_losses",
    section: "followup",
    type: "multiselect",
    label: "Which loss categories contribute to the shortfall?",
    options: ["Unplanned downtime", "Speed / rate loss", "Quality rejects", "Material input shortage", "Changeovers", "Not yet quantified"],
    showIf: pt("throughput"),
  },
  // Safety / environmental
  {
    id: "s_immediate",
    section: "followup",
    type: "boolean",
    label: "Have immediate safety/containment actions and the site emergency procedure been completed?",
    help: "This software does not replace emergency procedures or authorised safety decisions.",
    showIf: { any: [pt("safety_event"), pt("environmental_event")] },
  },
  {
    id: "s_reportable",
    section: "followup",
    type: "select",
    label: "Has the responsible person assessed whether the event is externally reportable?",
    options: ["Yes – reportable", "Yes – not reportable", "Assessment pending"],
    showIf: { any: [pt("safety_event"), pt("environmental_event")] },
  },
  // Recurrence
  {
    id: "r_previous_capa",
    section: "followup",
    type: "textarea",
    label: "What corrective actions were taken last time, and why might they not have been effective?",
    rationale: "A recurrence suggests the previous root cause or action was incomplete.",
    showIf: { field: "problem.previous_occurrence", op: "eq", value: "yes" },
  },
  // Recent changes
  {
    id: "chg_details",
    section: "followup",
    type: "textarea",
    label: "Describe the recent change(s) in detail: what changed, when, and was a change-control assessment done?",
    rationale: "A change that coincides with the onset of the problem is a strong lead for change analysis.",
    showIf: { field: "process.recent_changes", op: "truthy" },
  },
];
