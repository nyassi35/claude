// Core domain types for RootCause AI. Column names mirror the Postgres schema
// (supabase/migrations) so rows can be passed between the DB and UI unchanged.

export const ROLES = ["admin", "rca_manager", "engineer", "operator", "reviewer", "viewer"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Administrator",
  rca_manager: "RCA Manager",
  engineer: "Process / Quality Engineer",
  operator: "Production / Maintenance Operator",
  reviewer: "Reviewer / Approver",
  viewer: "Read-only Viewer",
};

export const INVESTIGATION_STATUSES = [
  "draft",
  "open",
  "in_analysis",
  "awaiting_evidence",
  "root_cause_confirmed",
  "capa_in_progress",
  "verification",
  "closed",
  "cancelled",
] as const;
export type InvestigationStatus = (typeof INVESTIGATION_STATUSES)[number];

export const SEVERITIES = ["low", "medium", "high", "critical"] as const;
export type Severity = (typeof SEVERITIES)[number];
export const PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const CAUSE_STATUSES = ["hypothesis", "under_investigation", "supported", "confirmed", "rejected"] as const;
export type CauseStatus = (typeof CAUSE_STATUSES)[number];

export const CAUSE_TYPES = ["symptom", "possible_cause", "contributing_factor", "root_cause", "systemic_cause"] as const;
export type CauseType = (typeof CAUSE_TYPES)[number];

export const SIX_M = ["manpower", "machine", "method", "material", "measurement", "environment"] as const;
export type SixM = (typeof SIX_M)[number];
export const SIX_M_LABELS: Record<SixM, string> = {
  manpower: "Manpower / People",
  machine: "Machine",
  method: "Method",
  material: "Material",
  measurement: "Measurement",
  environment: "Mother Nature / Environment",
};

export const CONFIDENCE = ["low", "medium", "high"] as const;
export type Confidence = (typeof CONFIDENCE)[number];

export const EVIDENCE_KINDS = [
  "measurement",
  "observation",
  "document",
  "photo",
  "log",
  "interview",
  "test_result",
  "record",
] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

export const CAPA_STATUSES = [
  "open",
  "assigned",
  "in_progress",
  "pending_verification",
  "effective",
  "ineffective",
  "closed",
] as const;
export type CapaStatus = (typeof CAPA_STATUSES)[number];

export const CAPA_TYPES = ["containment", "corrective", "preventive"] as const;
export type CapaType = (typeof CAPA_TYPES)[number];

export const RCA_METHODS = [
  "five_whys",
  "ishikawa",
  "dmaic",
  "pareto",
  "fault_tree",
  "process_map",
  "ce_matrix",
  "barrier",
  "change_analysis",
  "ecfa",
  "bowtie",
  "trend",
  "spc",
  "is_is_not",
  "comparative",
  "human_factors",
  "lessons_learned",
] as const;
export type RcaMethod = (typeof RCA_METHODS)[number] | "fmea" | "capa";

export interface Organization {
  id: string;
  name: string;
  settings: OrgSettings;
  created_at: string;
}

export interface OrgSettings {
  rpn_threshold: number; // RPN at/above which a failure mode is flagged high-risk
  severity_escalation: number; // severity at/above which a failure mode is escalated regardless of RPN
  use_action_priority: boolean;
  currency: string;
  labor_rate_per_hour?: number;
  downtime_cost_per_hour?: number;
}

export const DEFAULT_ORG_SETTINGS: OrgSettings = {
  rpn_threshold: 120,
  severity_escalation: 9,
  use_action_priority: true,
  currency: "EUR",
};

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
}

export interface Membership {
  id: string;
  org_id: string;
  user_id: string;
  role: Role;
  created_at: string;
  profile?: Profile;
}

export interface Plant {
  id: string;
  org_id: string;
  name: string;
  location: string | null;
}

export interface ProductionLine {
  id: string;
  org_id: string;
  plant_id: string;
  name: string;
}

export interface KpiValue {
  key: string;
  label: string;
  unit: string;
  baseline?: number | null;
  actual?: number | null;
  target?: number | null;
}

export interface ProcessParameter {
  name: string;
  unit: string;
  target?: number | null;
  lsl?: number | null;
  usl?: number | null;
  actual?: number | null;
}

export interface ProblemDefinition {
  problem_type?: string;
  what_happened?: string;
  expected?: string;
  actual?: string;
  started?: string;
  where_observed?: string;
  frequency?: string;
  affected?: string;
  impact?: string;
  previous_occurrence?: "yes" | "no" | "unknown";
  previous_details?: string;
}

export interface ProcessInfo {
  flow?: string;
  sop?: string;
  raw_materials?: string;
  machine_settings?: string;
  maintenance_history?: string;
  training?: string;
  environment?: string;
  recent_changes?: string;
  parameters?: ProcessParameter[];
}

export interface RiskAssessment {
  ratings: Partial<Record<RiskDimension, number>>; // 1..5
  notes?: Partial<Record<RiskDimension, string>>;
  escalated?: boolean;
  escalation_note?: string;
  cost_inputs?: CostInputs;
}

export const RISK_DIMENSIONS = [
  "product_quality",
  "process_reliability",
  "equipment",
  "safety",
  "environmental",
  "regulatory",
  "customer",
  "delivery",
  "financial",
] as const;
export type RiskDimension = (typeof RISK_DIMENSIONS)[number];

export interface CostInputs {
  units_produced?: number | null;
  units_defective?: number | null;
  units_scrapped?: number | null;
  units_reworked?: number | null;
  first_pass_good?: number | null;
  unit_cost?: number | null;
  rework_cost_per_unit?: number | null;
  downtime_hours?: number | null;
  downtime_cost_per_hour?: number | null;
  planned_time_h?: number | null;
  run_time_h?: number | null;
  ideal_cycle_time_s?: number | null;
  total_count?: number | null;
  good_count?: number | null;
  external_failure_cost?: number | null;
  appraisal_cost?: number | null;
  prevention_cost?: number | null;
  expected_reduction_pct?: number | null;
}

export interface Investigation {
  id: string;
  org_id: string;
  number: string;
  title: string;
  category_key: string;
  status: InvestigationStatus;
  severity: Severity;
  priority: Priority;
  plant_id: string | null;
  line_id: string | null;
  department: string | null;
  process_name: string | null;
  product: string | null;
  batch_number: string | null;
  asset_id: string | null;
  occurred_at: string | null;
  shift: string | null;
  owner_id: string | null;
  created_by: string | null;
  due_date: string | null;
  wizard_step: number;
  problem: ProblemDefinition;
  process: ProcessInfo;
  answers: Record<string, unknown>;
  kpis: KpiValue[];
  risk: RiskAssessment;
  selected_methods: string[];
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TimelineEvent {
  id: string;
  org_id: string;
  investigation_id: string;
  occurred_at: string;
  description: string;
  source: string | null;
  is_verified: boolean;
  created_at: string;
}

export interface Evidence {
  id: string;
  org_id: string;
  investigation_id: string;
  title: string;
  kind: EvidenceKind;
  description: string | null;
  source: string | null;
  collected_by: string | null;
  collected_at: string | null;
  file_path: string | null;
  file_name: string | null;
  is_verified: boolean;
  created_by: string | null;
  created_at: string;
}

export interface Measurement {
  id: string;
  org_id: string;
  investigation_id: string;
  parameter: string;
  value: number;
  unit: string | null;
  batch: string | null;
  group_label: string | null; // e.g. "affected" / "unaffected" / "good" / "defective"
  measured_at: string | null;
  lsl: number | null;
  usl: number | null;
  target: number | null;
  source: string | null;
  created_at: string;
}

export interface Cause {
  id: string;
  org_id: string;
  investigation_id: string;
  description: string;
  category: SixM | null;
  cause_type: CauseType;
  status: CauseStatus;
  evidence_for: string | null;
  evidence_against: string | null;
  evidence_ids: string[];
  confidence: Confidence;
  confidence_rationale: string | null;
  verification_test: string | null;
  verification_result: string | null;
  source_method: string | null;
  ai_suggested: boolean;
  owner: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface RcaAnalysis<T = unknown> {
  id: string;
  org_id: string;
  investigation_id: string;
  method: string;
  data: T;
  status: "not_started" | "in_progress" | "complete";
  updated_by: string | null;
  updated_at: string;
  created_at: string;
}

export interface FmeaItem {
  id: string;
  org_id: string;
  investigation_id: string;
  process_step: string;
  function_requirement: string | null;
  failure_mode: string;
  effects: string | null;
  causes: string | null;
  prevention_controls: string | null;
  detection_controls: string | null;
  severity: number;
  occurrence: number;
  detection: number;
  rpn: number;
  recommended_actions: string | null;
  action_owner: string | null;
  due_date: string | null;
  revised_severity: number | null;
  revised_occurrence: number | null;
  revised_detection: number | null;
  revised_rpn: number | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface CapaAction {
  id: string;
  org_id: string;
  investigation_id: string;
  cause_id: string | null;
  action_type: CapaType;
  description: string;
  expected_impact: string | null;
  assignee_id: string | null;
  responsible_name: string | null;
  department: string | null;
  priority: Priority;
  due_date: string | null;
  estimated_cost: number | null;
  resources: string | null;
  status: CapaStatus;
  status_reason: string | null;
  verification_method: string | null;
  acceptance_criteria: string | null;
  actual_result: string | null;
  effectiveness_review_date: string | null;
  evidence_ids: string[];
  closure_approved_by: string | null;
  closure_approved_at: string | null;
  parent_action_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ControlPlanItem {
  id: string;
  org_id: string;
  investigation_id: string;
  process_step: string;
  characteristic: string;
  specification: string | null;
  control_method: string | null;
  measurement_method: string | null;
  sample_size: string | null;
  frequency: string | null;
  control_limits: string | null;
  reaction_plan: string | null;
  owner: string | null;
  review_date: string | null;
  created_at: string;
}

export interface Approval {
  id: string;
  org_id: string;
  investigation_id: string;
  record_type: "investigation" | "cause" | "capa" | "report" | "dmaic_phase";
  record_id: string;
  decision: "approved" | "rejected" | "changes_requested";
  comment: string | null;
  approver_id: string;
  approver_name: string | null;
  created_at: string;
}

export interface AuditEvent {
  id: string;
  org_id: string;
  actor_id: string | null;
  action: string;
  table_name: string;
  record_id: string | null;
  investigation_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

export interface CategoryTemplateOverride {
  id: string;
  org_id: string;
  category_key: string;
  config: Record<string, unknown>;
  updated_at: string;
}
