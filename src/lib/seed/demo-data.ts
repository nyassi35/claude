// Demonstration data for three industries. Used to seed DEMO MODE and, via scripts/seed-supabase.ts,
// a Supabase project. No root cause is hard-coded as fact: the biochar and automotive scenarios
// contain hypotheses and partial evidence; the chemical scenario shows a fully worked, approved case.
import { randomUUID } from "node:crypto";
import { DEFAULT_ORG_SETTINGS } from "@/lib/types";
import { emptyStore, type DemoStore } from "@/lib/db/demo-store-shape";

export const DEMO_ORG_ID = "00000000-0000-4000-8000-000000000001";
export const OTHER_ORG_ID = "00000000-0000-4000-8000-000000000002";

export const DEMO_USERS = [
  { id: "10000000-0000-4000-8000-000000000001", email: "admin@northwind.example", full_name: "Alex Admin", role: "admin", org: DEMO_ORG_ID },
  { id: "10000000-0000-4000-8000-000000000002", email: "manager@northwind.example", full_name: "Morgan Manager", role: "rca_manager", org: DEMO_ORG_ID },
  { id: "10000000-0000-4000-8000-000000000003", email: "engineer@northwind.example", full_name: "Erin Engineer", role: "engineer", org: DEMO_ORG_ID },
  { id: "10000000-0000-4000-8000-000000000004", email: "operator@northwind.example", full_name: "Olu Operator", role: "operator", org: DEMO_ORG_ID },
  { id: "10000000-0000-4000-8000-000000000005", email: "reviewer@northwind.example", full_name: "Riley Reviewer", role: "reviewer", org: DEMO_ORG_ID },
  { id: "10000000-0000-4000-8000-000000000006", email: "viewer@northwind.example", full_name: "Vic Viewer", role: "viewer", org: DEMO_ORG_ID },
  { id: "10000000-0000-4000-8000-000000000007", email: "qa@contoso.example", full_name: "Casey Contoso", role: "admin", org: OTHER_ORG_ID },
] as const;

const U = Object.fromEntries(DEMO_USERS.map((u) => [u.role === "admin" && u.org === OTHER_ORG_ID ? "other" : u.role, u.id])) as Record<string, string>;

const daysAgo = (d: number, h = 8) => {
  const t = new Date();
  t.setUTCHours(h, 0, 0, 0);
  t.setUTCDate(t.getUTCDate() - d);
  return t.toISOString();
};
const dateOnly = (d: number) => daysAgo(-d).slice(0, 10);

export function buildDemoStore(): DemoStore {
  const s = emptyStore();
  const created = daysAgo(120);
  s.organizations.push(
    { id: DEMO_ORG_ID, name: "Northwind Process Industries", settings: { ...DEFAULT_ORG_SETTINGS }, investigation_seq: 0, created_at: created },
    { id: OTHER_ORG_ID, name: "Contoso Foods", settings: { ...DEFAULT_ORG_SETTINGS }, investigation_seq: 0, created_at: created },
  );
  for (const u of DEMO_USERS) {
    s.users.push({ id: u.id, email: u.email, full_name: u.full_name });
    s.tables.memberships.push({ id: randomUUID(), org_id: u.org, user_id: u.id, role: u.role, created_at: created });
  }

  const add = (table: keyof DemoStore["tables"], row: Record<string, unknown>) => {
    const r: Record<string, unknown> = { id: randomUUID(), created_at: daysAgo(30), ...row };
    if (["investigations", "causes", "rca_analyses", "fmea_items", "capa_actions"].includes(table)) r.updated_at ??= r.created_at;
    if (table === "fmea_items") {
      r.rpn = (r.severity as number) * (r.occurrence as number) * (r.detection as number);
      r.revised_rpn = r.revised_severity ? (r.revised_severity as number) * (r.revised_occurrence as number) * (r.revised_detection as number) : null;
    }
    s.tables[table].push(r);
    return r;
  };
  const nextNumber = (orgId: string) => {
    const o = s.organizations.find((x) => x.id === orgId)!;
    o.investigation_seq += 1;
    return `RCA-${new Date().getFullYear()}-${String(o.investigation_seq).padStart(4, "0")}`;
  };

  // Plants / lines
  const plantBio = add("plants", { org_id: DEMO_ORG_ID, name: "Riverside Carbon Plant", location: "Riverside" });
  const plantAuto = add("plants", { org_id: DEMO_ORG_ID, name: "Eastgate Components", location: "Eastgate" });
  const plantChem = add("plants", { org_id: DEMO_ORG_ID, name: "Harbour Chemicals", location: "Harbour" });
  const lineBio = add("production_lines", { org_id: DEMO_ORG_ID, plant_id: plantBio.id, name: "Pyrolysis Line 1" });
  const lineAuto = add("production_lines", { org_id: DEMO_ORG_ID, plant_id: plantAuto.id, name: "Body-in-White Line B" });
  const lineChem = add("production_lines", { org_id: DEMO_ORG_ID, plant_id: plantChem.id, name: "Reactor Train R-200" });
  add("production_lines", { org_id: DEMO_ORG_ID, plant_id: plantAuto.id, name: "Assembly Line C" });

  const baseInv = {
    org_id: DEMO_ORG_ID,
    wizard_step: 5,
    answers: {},
    selected_methods: [],
    closed_at: null,
    due_date: null,
  };

  // =====================================================================================
  // Scenario 1 — Biochar throughput below target
  // =====================================================================================
  const bio = add("investigations", {
    ...baseInv,
    number: nextNumber(DEMO_ORG_ID),
    title: "Biochar output below 2,000 kg/week target",
    category_key: "biochar",
    status: "awaiting_evidence",
    severity: "high",
    priority: "high",
    plant_id: plantBio.id,
    line_id: lineBio.id,
    department: "Production",
    process_name: "Slow pyrolysis of woody biomass",
    product: "Biochar 0–5 mm",
    batch_number: "Weeks 31–40",
    asset_id: "PYR-01",
    occurred_at: daysAgo(49),
    shift: "All shifts",
    owner_id: U.engineer,
    created_by: U.engineer,
    due_date: dateOnly(21),
    created_at: daysAgo(35),
    problem: {
      problem_type: "low_output",
      what_happened: "Weekly saleable biochar output has fallen below the 2,000 kg/week target for seven consecutive weeks. Suspected factors include feedstock moisture, particle-size distribution, inconsistent feed rate, equipment performance and sieving settings.",
      expected: "≥ 2,000 kg saleable biochar per week (dry basis)",
      actual: "1,600–1,890 kg/week over the last seven weeks (mean ≈ 1,700 kg/week)",
      started: "Week 34",
      where_observed: "Bagging station weighbridge, Pyrolysis Line 1",
      frequency: "Every week since week 34",
      affected: "All product from PYR-01; no other line produces biochar",
      impact: "≈ 300 kg/week shortfall; delayed carbon-removal credit deliveries",
      previous_occurrence: "unknown",
    },
    process: {
      flow: "Feedstock receipt → open-yard storage → drum dryer → hammer mill → screw feeder → pyrolysis reactor (550 °C) → water quench → trommel sieve (5 mm) → bagging",
      sop: "SOP-PYR-004 rev C: reactor 550 ± 20 °C, feed 180 kg/h, dryer exit moisture ≤ 15 %",
      raw_materials: "Forestry residues from two suppliers (A: chipped softwood, B: mixed hardwood with bark)",
      machine_settings: "Feeder screw 42 rpm; trommel mesh 5 mm since week 33 (previously 6 mm)",
      maintenance_history: "Feeder screw flights rebuilt week 29; dryer burner serviced week 30",
      training: "Two new shift operators started week 33",
      environment: "Wet autumn weather from week 33; feedstock stored outdoors uncovered",
      recent_changes: "Trommel mesh changed from 6 mm to 5 mm in week 33; supplier B share increased from 30 % to 60 % in week 34",
      parameters: [
        { name: "Feedstock moisture", unit: "%", target: 15, usl: 18, actual: 26 },
        { name: "Feed rate", unit: "kg/h", target: 180, actual: 165 },
        { name: "Reactor temperature", unit: "°C", target: 550, lsl: 530, usl: 570, actual: 546 },
        { name: "Particle size D50", unit: "mm", target: 15, actual: null },
      ],
    },
    answers: {
      bc_weekly_mass: "See imported measurements: input and output mass per week, weeks 31–40.",
      bc_feed_moisture_measured: "Handheld meter",
      bc_psd: "No",
      bc_feed_rate_log: "Setpoint only",
      bc_sieve_settings: "5 mm trommel mesh since week 33 (was 6 mm)",
      bc_downtime: "Weeks 31–40: 2,1,3,2,4,3,2,5,3,4 h — mostly feeder blockages",
      bc_storage: "Outdoor uncovered",
      bc_bridging: "Occasionally",
    },
    kpis: [
      { key: "throughput", label: "Throughput / output", unit: "kg/week", baseline: 2040, target: 2000, actual: 1700 },
      { key: "yield", label: "Yield", unit: "%", baseline: 26, target: 26, actual: 23 },
      { key: "downtime", label: "Downtime", unit: "h", baseline: 2, target: 2, actual: 3.4 },
    ],
    risk: {
      ratings: { product_quality: 2, process_reliability: 3, equipment: 2, safety: 2, environmental: 1, regulatory: 1, customer: 3, delivery: 4, financial: 3 },
      cost_inputs: { downtime_hours: 34, downtime_cost_per_hour: 120, units_scrapped: 900, unit_cost: 0.45, expected_reduction_pct: 70 },
    },
    selected_methods: ["five_whys", "ishikawa", "fmea", "pareto", "dmaic"],
  });
  const weeks = [31, 32, 33, 34, 35, 36, 37, 38, 39, 40];
  const output = [2050, 2010, 1980, 1890, 1760, 1700, 1650, 1620, 1690, 1600];
  const input = [7820, 7750, 7790, 7900, 7860, 7810, 7880, 7840, 7900, 7870];
  const moisture = [14, 15, 16, 19, 23, 25, 27, 28, 26, 29];
  const reject = [6.1, 6.4, 8.9, 9.2, 9.6, 9.1, 9.8, 9.5, 9.3, 9.9];
  const downtime = [2, 1, 3, 2, 4, 3, 2, 5, 3, 4];
  weeks.forEach((w, k) => {
    const batch = `W${w}`;
    const grp = k < 3 ? "on_target" : "below_target";
    const at = daysAgo(70 - k * 7);
    for (const [param, unit, val, extra] of [
      ["Weekly output", "kg", output[k], { target: 2000, lsl: 2000 }],
      ["Weekly input (wet)", "kg", input[k], {}],
      ["Feedstock moisture", "%", moisture[k], { target: 15, usl: 18 }],
      ["Sieve reject fraction", "%", reject[k], {}],
      ["Downtime", "h", downtime[k], {}],
    ] as const)
      add("measurements", { org_id: DEMO_ORG_ID, investigation_id: bio.id, parameter: param, value: val, unit, batch, group_label: grp, measured_at: at, lsl: null, usl: null, target: null, source: "Weekly production report", ...extra });
  });
  const evBio1 = add("evidence", { org_id: DEMO_ORG_ID, investigation_id: bio.id, title: "Weekly production reports W31–W40", kind: "record", description: "Input/output weighbridge totals per week.", source: "ERP production report", collected_by: "Erin Engineer", collected_at: daysAgo(30), is_verified: true, created_by: U.engineer, file_path: null, file_name: null });
  add("evidence", { org_id: DEMO_ORG_ID, investigation_id: bio.id, title: "Feedstock moisture readings (handheld meter)", kind: "measurement", description: "Handheld meter readings on arrival. Method not validated against oven-dry reference.", source: "Shift log", collected_by: "Olu Operator", collected_at: daysAgo(28), is_verified: false, created_by: U.operator, file_path: null, file_name: null });
  add("evidence", { org_id: DEMO_ORG_ID, investigation_id: bio.id, title: "Trommel mesh change record (6 → 5 mm)", kind: "document", description: "Maintenance work order WO-8812, week 33.", source: "CMMS", collected_by: "Erin Engineer", collected_at: daysAgo(27), is_verified: true, created_by: U.engineer, file_path: null, file_name: null });
  add("timeline_events", { org_id: DEMO_ORG_ID, investigation_id: bio.id, occurred_at: daysAgo(63), description: "Trommel mesh changed from 6 mm to 5 mm (WO-8812)", source: "CMMS", is_verified: true });
  add("timeline_events", { org_id: DEMO_ORG_ID, investigation_id: bio.id, occurred_at: daysAgo(56), description: "Supplier B share raised to 60 % of feedstock", source: "Purchasing", is_verified: true });
  add("timeline_events", { org_id: DEMO_ORG_ID, investigation_id: bio.id, occurred_at: daysAgo(55), description: "Output first below target (1,890 kg)", source: "Production report", is_verified: true });
  add("timeline_events", { org_id: DEMO_ORG_ID, investigation_id: bio.id, occurred_at: daysAgo(50), description: "Operators report wetter feedstock after heavy rain", source: "Shift log", is_verified: false });
  add("causes", { org_id: DEMO_ORG_ID, investigation_id: bio.id, description: "High feedstock moisture reduces dry-basis output and dryer capacity", category: "material", cause_type: "possible_cause", status: "under_investigation", evidence_for: "Handheld moisture readings rose from 14 % to 29 % as output fell (strong negative association in weekly data).", evidence_against: "Moisture method not validated; association could be confounded by the supplier change in the same period.", evidence_ids: [evBio1.id], confidence: "medium", confidence_rationale: "Statistical association only; method uncertainty.", verification_test: "Oven-dry moisture on 10 retained lots; mass-balance on dry basis per week; dryer exit moisture survey.", verification_result: null, source_method: "ishikawa", ai_suggested: false, owner: "Erin Engineer", approved_by: null, approved_at: null });
  add("causes", { org_id: DEMO_ORG_ID, investigation_id: bio.id, description: "Smaller trommel mesh (5 mm) increases the rejected fines/oversize fraction", category: "method", cause_type: "possible_cause", status: "hypothesis", evidence_for: "Reject fraction stepped from ~6 % to ~9 % in week 33, coinciding with the mesh change.", evidence_against: "Not yet assessed; rejected material not weighed separately before week 33.", evidence_ids: [], confidence: "low", confidence_rationale: "Timing coincidence only.", verification_test: "Run one week at 6 mm mesh and weigh rejects per shift (controlled trial).", verification_result: null, source_method: "change_analysis", ai_suggested: false, owner: "Erin Engineer", approved_by: null, approved_at: null });
  add("causes", { org_id: DEMO_ORG_ID, investigation_id: bio.id, description: "Inconsistent feed rate due to screw-feeder bridging", category: "machine", cause_type: "possible_cause", status: "hypothesis", evidence_for: "Operators report occasional bridging; downtime mostly feeder blockages.", evidence_against: "Feed rate is not logged (setpoint only), so actual variation is unknown.", evidence_ids: [], confidence: "low", confidence_rationale: "No feed-rate data.", verification_test: "Install temporary load-cell logging on the feeder for 2 weeks.", verification_result: null, source_method: "five_whys", ai_suggested: false, owner: "Maintenance", approved_by: null, approved_at: null });
  add("rca_analyses", {
    org_id: DEMO_ORG_ID,
    investigation_id: bio.id,
    method: "five_whys",
    status: "in_progress",
    updated_by: U.engineer,
    data: {
      problem: "Saleable biochar output is ~1,700 kg/week vs. 2,000 kg/week target since week 34.",
      nodes: [
        { id: "w1", parentId: null, text: "Less dry feedstock reaches the reactor per week", evidence: "Wet input mass is unchanged (~7,850 kg) while output fell.", evidenceStatus: "supported", level: "direct", isRootCause: false },
        { id: "w2", parentId: "w1", text: "Feedstock arrives wetter, so more of the input mass is water", evidence: "Handheld moisture readings 14 % → 29 %.", evidenceStatus: "assumption", level: "intermediate", isRootCause: false },
        { id: "w3", parentId: "w2", text: "Feedstock is stored outdoors uncovered during wet weather", evidence: "Site observation; no measured link yet.", evidenceStatus: "assumption", level: "intermediate", isRootCause: false },
        { id: "w4", parentId: "w3", text: "No storage standard or incoming moisture specification exists for feedstock", evidence: "SOP-PYR-004 has no feedstock storage requirement.", evidenceStatus: "supported", level: "systemic", isRootCause: false },
        { id: "w5", parentId: "w1", text: "More output is rejected at the sieve", evidence: "Reject fraction ~6 % → ~9 % from week 33.", evidenceStatus: "supported", level: "direct", isRootCause: false },
        { id: "w6", parentId: "w5", text: "Trommel mesh reduced from 6 mm to 5 mm without change assessment", evidence: "WO-8812", evidenceStatus: "supported", level: "intermediate", isRootCause: false },
      ],
    },
  });
  add("rca_analyses", {
    org_id: DEMO_ORG_ID,
    investigation_id: bio.id,
    method: "ishikawa",
    status: "in_progress",
    updated_by: U.engineer,
    data: {
      effect: "Biochar output below 2,000 kg/week",
      categories: [
        { key: "manpower", label: "Manpower / People" },
        { key: "machine", label: "Machine" },
        { key: "method", label: "Method" },
        { key: "material", label: "Material" },
        { key: "measurement", label: "Measurement" },
        { key: "environment", label: "Mother Nature / Environment" },
      ],
      causes: [
        { id: "f1", category: "material", parentId: null, text: "Feedstock moisture", evidence: "Handheld readings rising", evidenceSource: "Shift log", status: "under_investigation", priority: 5, relatedIds: ["f6"], owner: "Erin", suggested: false },
        { id: "f2", category: "material", parentId: null, text: "Particle-size distribution (supplier B, bark)", evidence: "", evidenceSource: "", status: "hypothesis", priority: 3, relatedIds: [], owner: "", suggested: false },
        { id: "f3", category: "machine", parentId: null, text: "Feeder screw bridging", evidence: "Operator reports", evidenceSource: "Interview", status: "hypothesis", priority: 3, relatedIds: [], owner: "Maintenance", suggested: false },
        { id: "f4", category: "method", parentId: null, text: "Trommel mesh 5 mm", evidence: "Reject fraction step change week 33", evidenceSource: "Production report", status: "under_investigation", priority: 4, relatedIds: [], owner: "Erin", suggested: false },
        { id: "f5", category: "measurement", parentId: null, text: "Moisture meter not validated", evidence: "", evidenceSource: "", status: "hypothesis", priority: 4, relatedIds: ["f1"], owner: "QA", suggested: false },
        { id: "f6", category: "environment", parentId: null, text: "Wet weather + outdoor storage", evidence: "Rain records W33–W40", evidenceSource: "Weather service", status: "hypothesis", priority: 4, relatedIds: ["f1"], owner: "", suggested: false },
        { id: "f7", category: "manpower", parentId: null, text: "New operators since week 33", evidence: "", evidenceSource: "", status: "hypothesis", priority: 2, relatedIds: [], owner: "", suggested: false },
      ],
    },
  });
  add("rca_analyses", {
    org_id: DEMO_ORG_ID,
    investigation_id: bio.id,
    method: "pareto",
    status: "in_progress",
    updated_by: U.engineer,
    data: {
      metric: "Estimated output shortfall by loss category (weeks 34–40)",
      unit: "kg",
      period: "Weeks 34–40",
      items: [
        { label: "Moisture-related dry-mass loss (estimate)", value: 1150 },
        { label: "Sieve rejects above week-31–32 level", value: 560 },
        { label: "Downtime (feeder blockages)", value: 390 },
        { label: "Reduced feed rate (unmeasured, estimate)", value: 120 },
      ],
    },
  });
  add("rca_analyses", {
    org_id: DEMO_ORG_ID,
    investigation_id: bio.id,
    method: "dmaic",
    status: "in_progress",
    updated_by: U.engineer,
    data: {
      phases: {
        define: {
          fields: {
            problem_statement: "Saleable output averaged 1,700 kg/week in weeks 34–40 vs. 2,000 kg/week target (–15 %).",
            business_case: "≈ 300 kg/week shortfall delays carbon-removal credit deliveries and revenue.",
            scope: "In: feedstock storage → bagging on PYR-01. Out: sales, logistics.",
            goals: "≥ 2,000 kg/week saleable output for 6 consecutive weeks; sieve rejects ≤ 6.5 %.",
            stakeholders: "Production manager, maintenance lead, QA, purchasing",
          },
          gate_approved: false,
          notes: "",
        },
        measure: {
          fields: {
            baseline: "Weeks 31–33 mean 2,013 kg/week; weeks 34–40 mean 1,701 kg/week (production reports).",
            data_plan: "Weekly input/output (weighbridge), oven-dry moisture per lot, reject mass per shift, feeder load-cell log.",
          },
          gate_approved: false,
          notes: "MSA for handheld moisture meter outstanding.",
        },
      },
      sipoc: { suppliers: "Feedstock suppliers A and B", inputs: "Wet woody biomass, energy", process: "Dry → mill → feed → pyrolyse → quench → sieve → bag", outputs: "Biochar 0–5 mm, rejects, syngas", customers: "Soil-amendment buyers, carbon-credit registry" },
      countermeasures: [],
    },
  });
  for (const [k, row] of [
    { process_step: "Feedstock storage", function_requirement: "Keep feedstock moisture ≤ 18 %", failure_mode: "Feedstock absorbs rain", effects: "Lower dry-basis output; higher dryer load", causes: "Uncovered outdoor storage", prevention_controls: "None", detection_controls: "Handheld meter on arrival (unvalidated)", severity: 6, occurrence: 7, detection: 6, recommended_actions: "Covered storage; oven-dry moisture check per lot", action_owner: "Production manager" },
    { process_step: "Feeding", function_requirement: "Deliver 180 kg/h steadily", failure_mode: "Screw feeder bridging", effects: "Feed interruptions, downtime", causes: "Long / wet particles; worn flights", prevention_controls: "Flights rebuilt W29", detection_controls: "Operator observation", severity: 5, occurrence: 5, detection: 7, recommended_actions: "Log feeder load; agitator in hopper", action_owner: "Maintenance lead" },
    { process_step: "Sieving", function_requirement: "Separate 0–5 mm product", failure_mode: "Excessive reject fraction", effects: "Saleable output loss", causes: "Mesh size reduced", prevention_controls: "None (no change control)", detection_controls: "Weekly report", severity: 5, occurrence: 6, detection: 5, recommended_actions: "Trial 6 mm mesh; change-control for sieve settings", action_owner: "Process engineer" },
    { process_step: "Pyrolysis", function_requirement: "Reactor 550 ± 20 °C", failure_mode: "Temperature below setpoint", effects: "Lower carbon content, possible quality failure", causes: "Wet feed absorbing energy", prevention_controls: "Temperature control loop", detection_controls: "Continuous TC with alarm", severity: 8, occurrence: 3, detection: 2, recommended_actions: "", action_owner: "" },
  ].entries())
    add("fmea_items", { org_id: DEMO_ORG_ID, investigation_id: bio.id, sort_order: k, due_date: null, revised_severity: null, revised_occurrence: null, revised_detection: null, ...row });
  add("capa_actions", { org_id: DEMO_ORG_ID, investigation_id: bio.id, cause_id: null, action_type: "containment", description: "Measure every incoming feedstock lot with the oven-dry method and record against weekly output", expected_impact: "Provides valid moisture data to test the moisture hypothesis", assignee_id: U.operator, responsible_name: "Olu Operator", department: "Production", priority: "high", due_date: dateOnly(7), estimated_cost: 400, resources: "Lab oven, balance", status: "in_progress", status_reason: null, verification_method: "Data available for ≥ 2 weeks", acceptance_criteria: "100 % of lots measured", actual_result: null, effectiveness_review_date: null, evidence_ids: [], closure_approved_by: null, closure_approved_at: null, parent_action_id: null, created_by: U.engineer });
  add("capa_actions", { org_id: DEMO_ORG_ID, investigation_id: bio.id, cause_id: null, action_type: "containment", description: "Log screw-feeder load cell for two weeks to quantify feed-rate variation", expected_impact: "Evidence for/against the feed-rate hypothesis", assignee_id: null, responsible_name: "Maintenance lead", department: "Maintenance", priority: "medium", due_date: dateOnly(-3), estimated_cost: 900, resources: "Data logger", status: "assigned", status_reason: null, verification_method: "Logger data reviewed", acceptance_criteria: "14 days of 1-min data", actual_result: null, effectiveness_review_date: null, evidence_ids: [], closure_approved_by: null, closure_approved_at: null, parent_action_id: null, created_by: U.engineer });

  // =====================================================================================
  // Scenario 2 — Automotive: repeated downtime at a weld station
  // =====================================================================================
  const auto = add("investigations", {
    ...baseInv,
    number: nextNumber(DEMO_ORG_ID),
    title: "Repeated stoppages at robotic weld station OP40",
    category_key: "automotive",
    status: "in_analysis",
    severity: "medium",
    priority: "high",
    plant_id: plantAuto.id,
    line_id: lineAuto.id,
    department: "Maintenance",
    process_name: "Resistance spot welding — rear floor sub-assembly",
    product: "Rear floor panel RF-220",
    batch_number: null,
    asset_id: "OP40-R2",
    occurred_at: daysAgo(20, 6),
    shift: "B",
    owner_id: U.manager,
    created_by: U.operator,
    due_date: dateOnly(10),
    created_at: daysAgo(18),
    problem: {
      problem_type: "downtime",
      what_happened: "OP40 robot cell stops repeatedly; 85 stoppages in 3 weeks, mostly weld faults and part-presence sensor faults.",
      expected: "≤ 10 stoppages/week, OEE ≥ 85 %",
      actual: "≈ 28 stoppages/week, OEE 71 %",
      started: "About 3 weeks ago",
      where_observed: "Body-in-White Line B, OP40",
      frequency: "Several times per shift",
      affected: "OP40 only; OP30/OP50 unaffected",
      impact: "≈ 14 h downtime in 3 weeks; overtime on Saturdays",
      previous_occurrence: "yes",
      previous_details: "Similar sensor faults in spring; sensor replaced.",
    },
    process: {
      flow: "Load → clamp → weld (42 spots) → tip dress every 200 welds → unload",
      maintenance_history: "Tip dresser cutter replaced 5 weeks ago; part-presence sensor replaced in spring",
      recent_changes: "New electrode cap supplier introduced 4 weeks ago",
      parameters: [
        { name: "Weld current", unit: "kA", target: 9.5, lsl: 9, usl: 10, actual: 9.4 },
        { name: "Cycle time", unit: "s", target: 58, usl: 60, actual: 63 },
      ],
    },
    answers: { auto_station: "OP40", auto_ctq: "Significant", auto_tool_change: "Cutter 5 weeks ago", dt_count: 85, dt_mttr: 10, dt_pattern: ["Same component", "After maintenance"], dt_lubrication: "Records incomplete", dt_vibration: "No data available" },
    kpis: [
      { key: "downtime", label: "Downtime", unit: "h", baseline: 3, target: 3, actual: 14 },
      { key: "oee", label: "OEE", unit: "%", baseline: 86, target: 85, actual: 71 },
    ],
    risk: { ratings: { product_quality: 3, process_reliability: 4, equipment: 3, safety: 2, delivery: 3, financial: 3 }, cost_inputs: { downtime_hours: 14, downtime_cost_per_hour: 1800, ideal_cycle_time_s: 58, planned_time_h: 336, run_time_h: 322, total_count: 18500, good_count: 18320 } },
    selected_methods: ["pareto", "five_whys", "ishikawa", "fmea"],
  });
  add("rca_analyses", {
    org_id: DEMO_ORG_ID,
    investigation_id: auto.id,
    method: "pareto",
    status: "complete",
    updated_by: U.engineer,
    data: { metric: "Stoppages by failure code", unit: "count", period: "Last 3 weeks", items: [
      { label: "Weld fault – poor tip dress", value: 38 },
      { label: "Part presence sensor", value: 22 },
      { label: "Clamp not closed", value: 15 },
      { label: "Robot collision", value: 4 },
      { label: "Other", value: 6 },
    ] },
  });
  const evAuto = add("evidence", { org_id: DEMO_ORG_ID, investigation_id: auto.id, title: "Photo: loose bracket on part-presence sensor S4", kind: "photo", description: "Bracket screw found loose; sensor angle shifted ~5°.", source: "Maintenance inspection", collected_by: "Olu Operator", collected_at: daysAgo(10), is_verified: true, created_by: U.operator, file_path: null, file_name: null });
  add("evidence", { org_id: DEMO_ORG_ID, investigation_id: auto.id, title: "PLC alarm export OP40 (3 weeks)", kind: "log", description: "85 stoppages by alarm code.", source: "PLC", collected_by: "Erin Engineer", collected_at: daysAgo(12), is_verified: true, created_by: U.engineer, file_path: null, file_name: null });
  add("causes", { org_id: DEMO_ORG_ID, investigation_id: auto.id, description: "Part-presence sensor S4 bracket loosens from vibration, misaligning the sensor", category: "machine", cause_type: "root_cause", status: "supported", evidence_for: "Loose bracket found; sensor faults stopped for 2 shifts after re-tightening.", evidence_against: "Only 2 shifts of observation; faults recurred once.", evidence_ids: [evAuto.id], confidence: "medium", confidence_rationale: "Physical evidence plus short on/off test.", verification_test: "Fit locking bracket and monitor sensor faults for 2 weeks.", verification_result: null, source_method: "five_whys", ai_suggested: false, owner: "Maintenance", approved_by: null, approved_at: null });
  add("causes", { org_id: DEMO_ORG_ID, investigation_id: auto.id, description: "New electrode caps wear faster, so tip dressing every 200 welds is insufficient", category: "material", cause_type: "possible_cause", status: "under_investigation", evidence_for: "Weld faults began after cap supplier change.", evidence_against: "Tip-dresser cutter also changed in the same period.", evidence_ids: [], confidence: "low", confidence_rationale: "Two simultaneous changes.", verification_test: "Measure cap face diameter at 0/100/200 welds for both cap suppliers.", verification_result: null, source_method: "change_analysis", ai_suggested: false, owner: "Erin Engineer", approved_by: null, approved_at: null });
  for (let d = 0; d < 21; d++) {
    add("measurements", { org_id: DEMO_ORG_ID, investigation_id: auto.id, parameter: "Stoppage minutes per day", value: [28, 35, 41, 22, 47, 39, 51, 33, 44, 38, 29, 56, 42, 37, 48, 40, 31, 45, 52, 36, 43][d], unit: "min", batch: `D${d + 1}`, group_label: null, measured_at: daysAgo(21 - d), lsl: null, usl: null, target: 25, source: "PLC" });
    add("measurements", { org_id: DEMO_ORG_ID, investigation_id: auto.id, parameter: "Welds between dress", value: 200, unit: "count", batch: `D${d + 1}`, group_label: null, measured_at: daysAgo(21 - d), lsl: null, usl: null, target: null, source: "Robot controller" });
  }
  add("fmea_items", { org_id: DEMO_ORG_ID, investigation_id: auto.id, sort_order: 0, process_step: "Part presence check", function_requirement: "Confirm part seated before clamp", failure_mode: "False 'part missing' signal", effects: "Cell stop, downtime", causes: "Sensor misalignment from loose bracket", prevention_controls: "None", detection_controls: "Alarm", severity: 4, occurrence: 8, detection: 2, recommended_actions: "Locking bracket; add to PM checklist", action_owner: "Maintenance lead", due_date: dateOnly(5), revised_severity: 4, revised_occurrence: 3, revised_detection: 2 });
  add("fmea_items", { org_id: DEMO_ORG_ID, investigation_id: auto.id, sort_order: 1, process_step: "Spot welding", function_requirement: "Weld nugget ≥ 5 mm", failure_mode: "Undersize nugget", effects: "Weak joint — potential safety impact in crash", causes: "Cap wear beyond dress interval", prevention_controls: "Tip dress every 200 welds", detection_controls: "Weld controller current monitoring; destructive test per shift", severity: 9, occurrence: 4, detection: 4, recommended_actions: "Validate dress interval for new caps", action_owner: "Erin Engineer", due_date: dateOnly(10), revised_severity: null, revised_occurrence: null, revised_detection: null });
  add("capa_actions", { org_id: DEMO_ORG_ID, investigation_id: auto.id, cause_id: null, action_type: "containment", description: "Check sensor S4 bracket torque at start of each shift", expected_impact: "Prevent sensor stops while permanent fix is designed", assignee_id: U.operator, responsible_name: "Olu Operator", department: "Production", priority: "high", due_date: dateOnly(-5), estimated_cost: 0, resources: "", status: "in_progress", status_reason: null, verification_method: "Shift checklist", acceptance_criteria: "Checklist signed every shift", actual_result: null, effectiveness_review_date: null, evidence_ids: [], closure_approved_by: null, closure_approved_at: null, parent_action_id: null, created_by: U.engineer });

  // =====================================================================================
  // Scenario 3 — Chemical: out-of-spec assay (fully worked example)
  // =====================================================================================
  const chem = add("investigations", {
    ...baseInv,
    number: nextNumber(DEMO_ORG_ID),
    title: "Assay out of specification in batches of intermediate CX-12",
    category_key: "chemical",
    status: "capa_in_progress",
    severity: "high",
    priority: "urgent",
    plant_id: plantChem.id,
    line_id: lineChem.id,
    department: "Quality",
    process_name: "Esterification in reactor R-201",
    product: "Intermediate CX-12",
    batch_number: "B-2291, B-2294, B-2297",
    asset_id: "R-201",
    occurred_at: daysAgo(60),
    shift: "A/C",
    owner_id: U.engineer,
    created_by: U.engineer,
    due_date: dateOnly(14),
    created_at: daysAgo(58),
    problem: {
      problem_type: "quality_oos",
      what_happened: "Three of twelve batches showed assay 96.1–96.8 % vs. specification ≥ 97.5 %.",
      expected: "Assay ≥ 97.5 % (spec 97.5–100 %)",
      actual: "96.1 %, 96.8 %, 96.4 % in B-2291/B-2294/B-2297",
      started: "Batch B-2291",
      where_observed: "QC release testing",
      frequency: "3 of 12 batches",
      affected: "R-201 only; R-202 batches all in specification",
      impact: "3 batches (≈ 18 t) reworked; 6 days delay",
      previous_occurrence: "no",
    },
    process: {
      flow: "Charge acid + alcohol → heat to 118 °C → hold 6 h → strip → cool → sample",
      sop: "BMR CX-12 rev 7: hold at 118 ± 2 °C for 6 h",
      maintenance_history: "R-201 TIC-201 temperature transmitter last calibrated 14 months ago (interval 12 months)",
      recent_changes: "None reported",
      parameters: [{ name: "Reactor temperature", unit: "°C", target: 118, lsl: 116, usl: 120, actual: 114.5 }],
    },
    answers: { chem_batch_record: "Yes", chem_control_mode: "Automatic", chem_temp_trend: "Yes", chem_instrument_cal: "Overdue", q_retest: "Yes – confirmed", q_measurement_method: "HPLC assay per QC-112, duplicate injections", q_good_vs_bad: "Yes" },
    kpis: [
      { key: "defect_rate", label: "Defect rate", unit: "%", baseline: 0, target: 0, actual: 25 },
      { key: "yield", label: "Yield", unit: "%", baseline: 94, target: 94, actual: 91 },
    ],
    risk: { ratings: { product_quality: 4, customer: 3, financial: 3, regulatory: 2, safety: 1 }, cost_inputs: { units_produced: 12, units_defective: 3, units_reworked: 3, rework_cost_per_unit: 4200, external_failure_cost: 0, expected_reduction_pct: 90 } },
    selected_methods: ["five_whys", "ishikawa", "comparative", "spc", "fmea"],
  });
  const temps = [118.2, 117.9, 118.4, 114.6, 118.1, 117.8, 114.9, 118.3, 118.0, 114.4, 117.7, 118.2];
  const assay = [98.4, 98.1, 98.6, 96.1, 98.3, 98.0, 96.8, 98.5, 98.2, 96.4, 97.9, 98.3];
  temps.forEach((tv, k) => {
    const bad = assay[k] < 97.5;
    const batch = `B-${2288 + k}`;
    add("measurements", { org_id: DEMO_ORG_ID, investigation_id: chem.id, parameter: "Hold temperature (independent probe)", value: tv, unit: "°C", batch, group_label: bad ? "OOS" : "in_spec", measured_at: daysAgo(70 - k * 3), lsl: 116, usl: 120, target: 118, source: "Portable reference probe log" });
    add("measurements", { org_id: DEMO_ORG_ID, investigation_id: chem.id, parameter: "Assay", value: assay[k], unit: "%", batch, group_label: bad ? "OOS" : "in_spec", measured_at: daysAgo(70 - k * 3), lsl: 97.5, usl: 100, target: null, source: "QC LIMS" });
  });
  const evChem1 = add("evidence", { org_id: DEMO_ORG_ID, investigation_id: chem.id, title: "Calibration check of TIC-201: reads +3.4 °C high at 118 °C", kind: "test_result", description: "As-found calibration vs. reference PRT on " + daysAgo(40).slice(0, 10), source: "Instrument workshop report IC-5521", collected_by: "Instrument tech", collected_at: daysAgo(40), is_verified: true, created_by: U.engineer, file_path: null, file_name: null });
  const evChem2 = add("evidence", { org_id: DEMO_ORG_ID, investigation_id: chem.id, title: "Lab trial: 6 h hold at 114.5 °C reproduces assay 96.3 %", kind: "test_result", description: "Bench reactor replicate of plant conditions.", source: "R&D lab notebook LN-332", collected_by: "R&D", collected_at: daysAgo(35), is_verified: true, created_by: U.engineer, file_path: null, file_name: null });
  add("evidence", { org_id: DEMO_ORG_ID, investigation_id: chem.id, title: "HPLC system suitability and re-test results", kind: "test_result", description: "Re-tests confirm original OOS results; system suitability passed.", source: "QC LIMS", collected_by: "QC", collected_at: daysAgo(55), is_verified: true, created_by: U.engineer, file_path: null, file_name: null });
  const rootChem = add("causes", { org_id: DEMO_ORG_ID, investigation_id: chem.id, description: "TIC-201 temperature transmitter drifted (+3.4 °C), so the actual hold temperature was ~114.5 °C and the reaction did not reach full conversion", category: "measurement", cause_type: "root_cause", status: "confirmed", evidence_for: "As-found calibration +3.4 °C; independent probe shows ~114.5 °C on all three OOS batches and 118 °C on in-spec batches; lab trial at 114.5 °C reproduces the low assay.", evidence_against: "None found; R-202 (different transmitter) unaffected, consistent with the cause.", evidence_ids: [evChem1.id, evChem2.id], confidence: "high", confidence_rationale: "Mechanism reproduced experimentally and consistent with Is/Is Not.", verification_test: "Lab replication + calibration as-found check", verification_result: "Reproduced (assay 96.3 %)", source_method: "five_whys", ai_suggested: false, owner: "Erin Engineer", approved_by: U.reviewer, approved_at: daysAgo(30) });
  const sysChem = add("causes", { org_id: DEMO_ORG_ID, investigation_id: chem.id, description: "Calibration management system did not escalate the overdue TIC-201 calibration", category: "method", cause_type: "systemic_cause", status: "confirmed", evidence_for: "CMMS shows calibration overdue by 2 months with no escalation rule configured.", evidence_against: "", evidence_ids: [], confidence: "high", confidence_rationale: "Direct record review.", verification_test: "CMMS configuration review", verification_result: "No escalation configured", source_method: "five_whys", ai_suggested: false, owner: "Maintenance planning", approved_by: U.reviewer, approved_at: daysAgo(30) });
  add("approvals", { org_id: DEMO_ORG_ID, investigation_id: chem.id, record_type: "cause", record_id: rootChem.id, decision: "approved", comment: "Evidence chain is complete and reproduced in the lab.", approver_id: U.reviewer, approver_name: "Riley Reviewer", created_at: daysAgo(30) });
  add("approvals", { org_id: DEMO_ORG_ID, investigation_id: chem.id, record_type: "cause", record_id: sysChem.id, decision: "approved", comment: "", approver_id: U.reviewer, approver_name: "Riley Reviewer", created_at: daysAgo(30) });
  add("rca_analyses", {
    org_id: DEMO_ORG_ID,
    investigation_id: chem.id,
    method: "five_whys",
    status: "complete",
    updated_by: U.engineer,
    data: {
      problem: "3 of 12 CX-12 batches from R-201 had assay < 97.5 %.",
      nodes: [
        { id: "a", parentId: null, text: "Esterification did not reach full conversion", evidence: "Residual acid elevated in OOS batches", evidenceStatus: "supported", level: "direct", isRootCause: false },
        { id: "b", parentId: "a", text: "Actual hold temperature was ~114.5 °C instead of 118 °C", evidence: "Independent probe log", evidenceStatus: "supported", level: "intermediate", isRootCause: false },
        { id: "c", parentId: "b", text: "TIC-201 transmitter read 3.4 °C high", evidence: "Calibration report IC-5521", evidenceStatus: "supported", level: "intermediate", isRootCause: false },
        { id: "d", parentId: "c", text: "Calibration was 2 months overdue", evidence: "CMMS record", evidenceStatus: "supported", level: "intermediate", isRootCause: false },
        { id: "e", parentId: "d", text: "CMMS has no escalation for overdue critical-instrument calibration", evidence: "CMMS configuration review", evidenceStatus: "supported", level: "systemic", isRootCause: true },
      ],
    },
  });
  add("rca_analyses", {
    org_id: DEMO_ORG_ID,
    investigation_id: chem.id,
    method: "is_is_not",
    status: "complete",
    updated_by: U.engineer,
    data: {
      rows: [
        { dimension: "What", question: "What object / product / defect is affected?", is: "CX-12 from R-201", is_not: "CX-12 from R-202", distinction: "Different reactor and instrumentation", change: "TIC-201 calibration overdue" },
        { dimension: "What", question: "What is the defect or deviation exactly?", is: "Low assay, high residual acid", is_not: "Impurities, colour", distinction: "Incomplete conversion signature", change: "" },
        { dimension: "When", question: "When was it first observed / when does it occur?", is: "From B-2291, intermittent", is_not: "Before B-2291", distinction: "", change: "" },
        { dimension: "Extent", question: "How many / how much / what trend?", is: "3 of 12 batches", is_not: "All batches", distinction: "Batches with low probe temperature", change: "" },
      ],
      notes: "",
    },
  });
  add("rca_analyses", { org_id: DEMO_ORG_ID, investigation_id: chem.id, method: "comparative", status: "complete", updated_by: U.engineer, data: { parameter: "Hold temperature (independent probe)", groupA: "OOS", groupB: "in_spec" } });
  add("rca_analyses", { org_id: DEMO_ORG_ID, investigation_id: chem.id, method: "spc", status: "complete", updated_by: U.engineer, data: { parameter: "Assay" } });
  add("fmea_items", { org_id: DEMO_ORG_ID, investigation_id: chem.id, sort_order: 0, process_step: "Reaction hold", function_requirement: "118 ± 2 °C for 6 h", failure_mode: "Hold temperature low", effects: "Assay OOS; rework", causes: "Transmitter drift", prevention_controls: "12-month calibration", detection_controls: "QC release assay", severity: 7, occurrence: 4, detection: 6, recommended_actions: "Dual temperature measurement with deviation alarm; CMMS escalation", action_owner: "Instrument lead", due_date: dateOnly(-10), revised_severity: 7, revised_occurrence: 2, revised_detection: 2 });
  const capaC1 = add("capa_actions", { org_id: DEMO_ORG_ID, investigation_id: chem.id, cause_id: rootChem.id, action_type: "corrective", description: "Recalibrate TIC-201 and install a second independent temperature element with a 1.5 °C deviation alarm", expected_impact: "Hold temperature controlled to ±1 °C of true value", assignee_id: U.engineer, responsible_name: "Erin Engineer", department: "Instrumentation", priority: "urgent", due_date: dateOnly(-25), estimated_cost: 6800, resources: "Instrument tech, RTD, DCS change", status: "effective", status_reason: null, verification_method: "Assay results of next 10 batches", acceptance_criteria: "10 consecutive batches ≥ 97.5 % assay", actual_result: "10/10 batches 97.9–98.6 %", effectiveness_review_date: dateOnly(-2), evidence_ids: [], closure_approved_by: null, closure_approved_at: null, parent_action_id: null, created_by: U.engineer });
  void capaC1;
  add("capa_actions", { org_id: DEMO_ORG_ID, investigation_id: chem.id, cause_id: sysChem.id, action_type: "preventive", description: "Configure CMMS escalation for overdue calibration of critical instruments (to area manager at +7 days, plant manager at +30 days)", expected_impact: "No critical instrument overdue > 7 days", assignee_id: U.manager, responsible_name: "Morgan Manager", department: "Maintenance planning", priority: "high", due_date: dateOnly(5), estimated_cost: 1500, resources: "CMMS administrator", status: "in_progress", status_reason: null, verification_method: "Monthly overdue-calibration report", acceptance_criteria: "0 critical instruments overdue > 7 days for 3 months", actual_result: null, effectiveness_review_date: dateOnly(95), evidence_ids: [], closure_approved_by: null, closure_approved_at: null, parent_action_id: null, created_by: U.engineer });
  add("capa_actions", { org_id: DEMO_ORG_ID, investigation_id: chem.id, cause_id: sysChem.id, action_type: "preventive", description: "Review calibration status of all critical instruments on reactor trains R-100 to R-300 (horizontal deployment)", expected_impact: "Identify similar latent drifts", assignee_id: U.engineer, responsible_name: "Erin Engineer", department: "Instrumentation", priority: "medium", due_date: dateOnly(-1), estimated_cost: 2400, resources: "", status: "open", status_reason: null, verification_method: "Review report", acceptance_criteria: "All critical instruments in date", actual_result: null, effectiveness_review_date: null, evidence_ids: [], closure_approved_by: null, closure_approved_at: null, parent_action_id: null, created_by: U.engineer });
  add("control_plan_items", { org_id: DEMO_ORG_ID, investigation_id: chem.id, process_step: "Reaction hold", characteristic: "Hold temperature", specification: "118 ± 2 °C", control_method: "Dual RTD with deviation alarm; DCS interlock on hold timer", measurement_method: "RTD TIC-201A/B", sample_size: "Continuous", frequency: "Continuous; calibration every 6 months", control_limits: "Alarm at |A−B| > 1.5 °C", reaction_plan: "Stop hold timer, notify shift lead, verify with portable probe", owner: "Shift lead", review_date: dateOnly(90) });
  add("control_plan_items", { org_id: DEMO_ORG_ID, investigation_id: chem.id, process_step: "QC release", characteristic: "Assay", specification: "97.5–100 %", control_method: "I-MR chart of assay per batch", measurement_method: "HPLC QC-112", sample_size: "1 per batch", frequency: "Every batch", control_limits: "From last 25 batches", reaction_plan: "Open deviation if beyond control limits even when in specification", owner: "QC supervisor", review_date: dateOnly(90) });
  add("timeline_events", { org_id: DEMO_ORG_ID, investigation_id: chem.id, occurred_at: daysAgo(62), description: "B-2291 assay 96.1 % at QC release", source: "LIMS", is_verified: true });
  add("timeline_events", { org_id: DEMO_ORG_ID, investigation_id: chem.id, occurred_at: daysAgo(40), description: "TIC-201 as-found calibration +3.4 °C", source: "IC-5521", is_verified: true });
  add("timeline_events", { org_id: DEMO_ORG_ID, investigation_id: chem.id, occurred_at: daysAgo(35), description: "Lab trial reproduces low assay at 114.5 °C", source: "LN-332", is_verified: true });
  add("rca_analyses", { org_id: DEMO_ORG_ID, investigation_id: chem.id, method: "lessons_learned", status: "in_progress", updated_by: U.engineer, data: { rows: [{ lesson: "Instruments controlling critical quality parameters need calibration escalation, not just a schedule.", applies_to: "All reactor trains", shared: "Yes" }], notes: "" } });

  // A closed historical investigation (for trends)
  add("investigations", {
    ...baseInv,
    number: nextNumber(DEMO_ORG_ID),
    title: "Label mix-up on Assembly Line C carton station",
    category_key: "packaging",
    status: "closed",
    severity: "medium",
    priority: "medium",
    plant_id: plantAuto.id,
    line_id: null,
    department: "Production",
    process_name: "Cartoning",
    product: "Service kit SK-14",
    batch_number: "L-7781",
    asset_id: "CART-02",
    occurred_at: daysAgo(100),
    shift: "A",
    owner_id: U.manager,
    created_by: U.engineer,
    created_at: daysAgo(98),
    closed_at: daysAgo(70),
    problem: { problem_type: "pack_defect", what_happened: "Wrong label applied to 240 cartons after changeover.", expected: "Correct label", actual: "Previous product label", previous_occurrence: "no" },
    process: {},
    kpis: [{ key: "complaints", label: "Customer complaints", unit: "count", baseline: 0, target: 0, actual: 1 }],
    risk: { ratings: { customer: 3, product_quality: 3 } },
  });

  // Data belonging to another organization — must never be visible to Northwind users.
  add("investigations", {
    ...baseInv,
    org_id: OTHER_ORG_ID,
    number: nextNumber(OTHER_ORG_ID),
    title: "CONFIDENTIAL Contoso — seal failures on pouch line",
    category_key: "food_beverage",
    status: "open",
    severity: "high",
    priority: "high",
    plant_id: null,
    line_id: null,
    department: "QA",
    process_name: "Pouch sealing",
    product: "Soup pouch",
    batch_number: null,
    asset_id: null,
    occurred_at: daysAgo(5),
    shift: null,
    owner_id: U.other,
    created_by: U.other,
    problem: { problem_type: "seal_integrity", what_happened: "Seal leaks on pouches" },
    process: {},
    kpis: [],
    risk: { ratings: {} },
  });
  return s;
}
