import { z } from "zod";
import {
  CAPA_STATUSES,
  CAPA_TYPES,
  CAUSE_STATUSES,
  CAUSE_TYPES,
  CONFIDENCE,
  EVIDENCE_KINDS,
  INVESTIGATION_STATUSES,
  PRIORITIES,
  RISK_DIMENSIONS,
  ROLES,
  SEVERITIES,
  SIX_M,
} from "@/lib/types";

const optText = (max = 4000) =>
  z
    .string()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v && v.trim() ? v.trim() : null));
const optNum = z
  .union([z.number(), z.string()])
  .optional()
  .nullable()
  .transform((v, ctx) => {
    if (v === null || v === undefined || v === "") return null;
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Must be a number" });
      return z.NEVER;
    }
    return n;
  });
const optDate = z
  .string()
  .optional()
  .nullable()
  .transform((v, ctx) => {
    if (!v) return null;
    if (Number.isNaN(Date.parse(v))) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid date" });
      return z.NEVER;
    }
    return v;
  });
const uuid = z.string().uuid();
const optUuid = z
  .string()
  .optional()
  .nullable()
  .transform((v) => (v ? v : null))
  .pipe(z.string().uuid().nullable());

export const contextSchema = z.object({
  title: z.string().trim().min(3, "Title must be at least 3 characters").max(200),
  category_key: z.string().min(2).max(40),
  severity: z.enum(SEVERITIES),
  priority: z.enum(PRIORITIES),
  plant_id: optUuid,
  line_id: optUuid,
  department: optText(120),
  process_name: optText(200),
  product: optText(200),
  batch_number: optText(200),
  asset_id: optText(120),
  occurred_at: optDate,
  shift: optText(60),
  owner_id: optUuid,
  due_date: optDate,
});
export type ContextInput = z.input<typeof contextSchema>;

const kpiSchema = z.object({
  key: z.string().max(40),
  label: z.string().max(80),
  unit: z.string().max(30),
  baseline: optNum,
  actual: optNum,
  target: optNum,
});

export const problemSchema = z.object({
  problem: z.object({
    problem_type: optText(60),
    what_happened: optText(),
    expected: optText(),
    actual: optText(),
    started: optText(200),
    where_observed: optText(300),
    frequency: optText(200),
    affected: optText(1000),
    impact: optText(1000),
    previous_occurrence: z.enum(["yes", "no", "unknown"]).optional().nullable(),
    previous_details: optText(),
  }),
  kpis: z.array(kpiSchema).max(20),
});

const paramSchema = z.object({
  name: z.string().trim().min(1).max(80),
  unit: z.string().max(30).default(""),
  target: optNum,
  lsl: optNum,
  usl: optNum,
  actual: optNum,
});

export const processSchema = z.object({
  process: z.object({
    flow: optText(),
    sop: optText(),
    raw_materials: optText(),
    machine_settings: optText(),
    maintenance_history: optText(),
    training: optText(),
    environment: optText(),
    recent_changes: optText(),
    parameters: z
      .array(paramSchema)
      .max(50)
      .superRefine((ps, ctx) => {
        ps.forEach((p, i) => {
          if (p.lsl !== null && p.usl !== null && p.lsl > p.usl) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [i, "lsl"], message: `${p.name}: LSL is greater than USL` });
        });
      })
      .default([]),
  }),
});

export const answersSchema = z.object({ answers: z.record(z.string().regex(/^[a-z][a-z0-9_]*$/), z.unknown()) });

export const riskSchema = z.object({
  ratings: z.record(z.enum(RISK_DIMENSIONS), z.number().int().min(1).max(5)).default({}),
  notes: z.record(z.enum(RISK_DIMENSIONS), z.string().max(1000)).optional(),
  escalated: z.boolean().optional(),
  escalation_note: optText(2000),
  cost_inputs: z.record(z.string(), optNum).optional(),
});

export const statusChangeSchema = z.object({ status: z.enum(INVESTIGATION_STATUSES), reason: optText(2000) });

export const evidenceSchema = z.object({
  title: z.string().trim().min(2).max(200),
  kind: z.enum(EVIDENCE_KINDS),
  description: optText(),
  source: optText(300),
  collected_by: optText(120),
  collected_at: optDate,
  is_verified: z.boolean().default(false),
});

export const timelineSchema = z.object({
  occurred_at: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Invalid date/time"),
  description: z.string().trim().min(2).max(1000),
  source: optText(300),
  is_verified: z.boolean().default(false),
});

export const measurementRowSchema = z
  .object({
    parameter: z.string().trim().min(1).max(120),
    value: z.union([z.number(), z.string()]).transform((v, ctx) => {
      const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
      if (!Number.isFinite(n)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `"${v}" is not a number` });
        return z.NEVER;
      }
      return n;
    }),
    unit: optText(30),
    batch: optText(120),
    group_label: optText(60),
    measured_at: optDate,
    lsl: optNum,
    usl: optNum,
    target: optNum,
    source: optText(200),
  })
  .refine((m) => m.lsl === null || m.usl === null || m.lsl <= m.usl, { message: "LSL is greater than USL", path: ["lsl"] });

export const causeSchema = z.object({
  description: z.string().trim().min(3).max(1000),
  category: z.enum(SIX_M).nullable().optional(),
  cause_type: z.enum(CAUSE_TYPES).default("possible_cause"),
  status: z.enum(CAUSE_STATUSES).default("hypothesis"),
  evidence_for: optText(),
  evidence_against: optText(),
  evidence_ids: z.array(uuid).max(50).default([]),
  confidence: z.enum(CONFIDENCE).default("low"),
  confidence_rationale: optText(),
  verification_test: optText(),
  verification_result: optText(),
  source_method: optText(40),
  ai_suggested: z.boolean().default(false),
  owner: optText(120),
});

export const fmeaSchema = z
  .object({
    process_step: z.string().trim().min(1).max(200),
    function_requirement: optText(500),
    failure_mode: z.string().trim().min(1).max(500),
    effects: optText(1000),
    causes: optText(1000),
    prevention_controls: optText(1000),
    detection_controls: optText(1000),
    severity: z.coerce.number().int().min(1).max(10),
    occurrence: z.coerce.number().int().min(1).max(10),
    detection: z.coerce.number().int().min(1).max(10),
    recommended_actions: optText(1000),
    action_owner: optText(120),
    due_date: optDate,
    revised_severity: z.coerce.number().int().min(1).max(10).nullable().optional(),
    revised_occurrence: z.coerce.number().int().min(1).max(10).nullable().optional(),
    revised_detection: z.coerce.number().int().min(1).max(10).nullable().optional(),
    sort_order: z.number().int().default(0),
  })
  .refine((r) => [r.revised_severity, r.revised_occurrence, r.revised_detection].every((v) => v == null) || [r.revised_severity, r.revised_occurrence, r.revised_detection].every((v) => v != null), {
    message: "Revised S, O and D must all be given together",
    path: ["revised_severity"],
  });

export const capaSchema = z.object({
  cause_id: optUuid,
  action_type: z.enum(CAPA_TYPES),
  description: z.string().trim().min(5).max(2000),
  expected_impact: optText(1000),
  assignee_id: optUuid,
  responsible_name: optText(120),
  department: optText(120),
  priority: z.enum(PRIORITIES).default("medium"),
  due_date: optDate,
  estimated_cost: optNum.refine((v) => v === null || v >= 0, "Cost cannot be negative"),
  resources: optText(1000),
  verification_method: optText(1000),
  acceptance_criteria: optText(1000),
  effectiveness_review_date: optDate,
});

export const capaUpdateSchema = z
  .object({
    status: z.enum(CAPA_STATUSES).optional(),
    status_reason: optText(2000),
    actual_result: optText(2000),
    evidence_ids: z.array(uuid).max(50).optional(),
  })
  .merge(capaSchema.partial());

export const controlPlanSchema = z.object({
  process_step: z.string().trim().min(1).max(200),
  characteristic: z.string().trim().min(1).max(200),
  specification: optText(300),
  control_method: optText(500),
  measurement_method: optText(300),
  sample_size: optText(60),
  frequency: optText(120),
  control_limits: optText(300),
  reaction_plan: optText(1000),
  owner: optText(120),
  review_date: optDate,
});

export const approvalSchema = z.object({
  record_type: z.enum(["investigation", "cause", "capa", "report", "dmaic_phase"]),
  record_id: z.string().min(1).max(64),
  decision: z.enum(["approved", "rejected", "changes_requested"]),
  comment: optText(2000),
});

export const orgSettingsSchema = z.object({
  name: z.string().trim().min(2).max(120),
  rpn_threshold: z.coerce.number().int().min(1).max(1000),
  severity_escalation: z.coerce.number().int().min(1).max(10),
  use_action_priority: z.boolean(),
  currency: z.string().trim().min(3).max(3),
  downtime_cost_per_hour: optNum,
  labor_rate_per_hour: optNum,
});

export const memberSchema = z.object({ email: z.string().email(), role: z.enum(ROLES) });

export function zodIssues(err: z.ZodError): string[] {
  return err.issues.map((i) => `${i.path.length ? i.path.join(".") + ": " : ""}${i.message}`);
}
