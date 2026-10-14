import { can } from "@/lib/auth/permissions";
import { ForbiddenError, ValidationError } from "@/lib/db/types";
import { METHOD_SCHEMAS } from "@/lib/rca/methods";
import type { Approval, Cause, ControlPlanItem, Evidence, FmeaItem, Investigation, Measurement, RcaAnalysis, TimelineEvent } from "@/lib/types";
import { approvalSchema, causeSchema, controlPlanSchema, evidenceSchema, fmeaSchema, measurementRowSchema, timelineSchema, zodIssues } from "@/lib/validation";
import { parse, requirePermission, type Ctx } from "./context";

async function openInvestigation(ctx: Ctx, id: string) {
  const inv = await ctx.db.require<Investigation>("investigations", id);
  if (inv.status === "closed" || inv.status === "cancelled") throw new ValidationError("This investigation is closed. Reopen it to make changes.");
  return inv;
}

// ------------------------------------------------------------------ Evidence
export const ALLOWED_UPLOAD_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
  "text/csv",
  "text/plain",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export async function addEvidence(ctx: Ctx, investigationId: string, input: unknown, file?: { name: string; type: string; data: ArrayBuffer } | null) {
  requirePermission(ctx, "evidence.add");
  await openInvestigation(ctx, investigationId);
  const d = parse(evidenceSchema, input);
  // Only analysts may mark evidence as verified on creation.
  if (d.is_verified && !can(ctx.role, "evidence.manage")) d.is_verified = false;
  let file_path: string | null = null;
  let file_name: string | null = null;
  if (file && file.data.byteLength > 0) {
    if (file.data.byteLength > MAX_UPLOAD_BYTES) throw new ValidationError("File is larger than 25 MB.");
    if (!ALLOWED_UPLOAD_TYPES.includes(file.type)) throw new ValidationError(`File type ${file.type || "unknown"} is not allowed.`);
    file_name = file.name.replace(/[^\w.\- ]+/g, "_").slice(0, 120);
    file_path = `${ctx.orgId}/${investigationId}/${crypto.randomUUID()}-${file_name}`;
    await ctx.driver.uploadFile(file_path, file.data, file.type);
  }
  return ctx.db.insert<Evidence>("evidence", { ...d, investigation_id: investigationId, created_by: ctx.user.id, file_path, file_name });
}

export async function updateEvidence(ctx: Ctx, id: string, input: unknown) {
  const ev = await ctx.db.require<Evidence>("evidence", id);
  if (!can(ctx.role, "evidence.manage") && ev.created_by !== ctx.user.id) throw new ForbiddenError();
  await openInvestigation(ctx, ev.investigation_id);
  const d = parse(evidenceSchema.partial(), input);
  if (d.is_verified !== undefined && !can(ctx.role, "evidence.manage")) delete d.is_verified;
  return ctx.db.update<Evidence>("evidence", id, d);
}

export async function deleteEvidence(ctx: Ctx, id: string) {
  requirePermission(ctx, "evidence.manage");
  const ev = await ctx.db.require<Evidence>("evidence", id);
  await openInvestigation(ctx, ev.investigation_id);
  await ctx.db.remove("evidence", id);
}

// ------------------------------------------------------------------ Timeline
export async function addTimeline(ctx: Ctx, investigationId: string, input: unknown) {
  requirePermission(ctx, "evidence.add");
  await openInvestigation(ctx, investigationId);
  const d = parse(timelineSchema, input);
  if (d.is_verified && !can(ctx.role, "evidence.manage")) d.is_verified = false;
  return ctx.db.insert<TimelineEvent>("timeline_events", { ...d, investigation_id: investigationId });
}
export async function deleteTimeline(ctx: Ctx, id: string) {
  requirePermission(ctx, "evidence.manage");
  const t = await ctx.db.require<TimelineEvent>("timeline_events", id);
  await openInvestigation(ctx, t.investigation_id);
  await ctx.db.remove("timeline_events", id);
}

// ------------------------------------------------------------------ Measurements
export interface ImportResult {
  inserted: number;
  errors: { row: number; issues: string[] }[];
}

/** Validates each row independently; valid rows are imported, invalid rows reported. */
export async function importMeasurements(ctx: Ctx, investigationId: string, rows: Record<string, unknown>[]): Promise<ImportResult> {
  requirePermission(ctx, "evidence.add");
  await openInvestigation(ctx, investigationId);
  if (rows.length > 5000) throw new ValidationError("Import is limited to 5,000 rows at a time.");
  const errors: ImportResult["errors"] = [];
  let inserted = 0;
  for (const [i, raw] of rows.entries()) {
    const normalized = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k.trim().toLowerCase().replace(/\s+/g, "_"), typeof v === "string" ? v.trim() : v]));
    const r = measurementRowSchema.safeParse(normalized);
    if (!r.success) {
      errors.push({ row: i + 2, issues: zodIssues(r.error) });
      continue;
    }
    await ctx.db.insert<Measurement>("measurements", { ...r.data, investigation_id: investigationId });
    inserted++;
  }
  return { inserted, errors };
}

export async function deleteMeasurements(ctx: Ctx, investigationId: string, parameter?: string) {
  requirePermission(ctx, "evidence.manage");
  await openInvestigation(ctx, investigationId);
  const list = await ctx.db.list<Measurement>("measurements", { investigation_id: investigationId, ...(parameter ? { parameter } : {}) });
  for (const m of list.rows) await ctx.db.remove("measurements", m.id);
  return list.rows.length;
}

// ------------------------------------------------------------------ Causes
async function validateEvidenceIds(ctx: Ctx, investigationId: string, ids: string[]) {
  for (const id of ids) {
    const ev = await ctx.db.get<Evidence>("evidence", id);
    if (!ev || ev.investigation_id !== investigationId) throw new ValidationError("Linked evidence must belong to this investigation.");
  }
}

function checkCauseRules(c: { status: string; evidence_for: string | null; evidence_ids: string[]; evidence_against: string | null; ai_suggested?: boolean }) {
  const issues: string[] = [];
  if (c.status === "confirmed" && !c.evidence_for && !c.evidence_ids.length) issues.push("A cause can only be confirmed with documented supporting evidence.");
  if (c.status === "supported" && !c.evidence_for && !c.evidence_ids.length) issues.push("'Supported' requires at least one piece of supporting evidence.");
  if (c.status === "rejected" && !c.evidence_against) issues.push("Record the evidence against this cause before rejecting it.");
  if (issues.length) throw new ValidationError("The cause status is not consistent with the evidence.", issues);
}

export async function createCause(ctx: Ctx, investigationId: string, input: unknown) {
  requirePermission(ctx, "analysis.edit");
  await openInvestigation(ctx, investigationId);
  const d = parse(causeSchema, input);
  if (d.status === "confirmed") throw new ValidationError("Create the cause first, then confirm it through the approval step.");
  checkCauseRules(d);
  await validateEvidenceIds(ctx, investigationId, d.evidence_ids);
  return ctx.db.insert<Cause>("causes", { ...d, investigation_id: investigationId, approved_by: null, approved_at: null });
}

export async function updateCause(ctx: Ctx, id: string, input: unknown) {
  const cause = await ctx.db.require<Cause>("causes", id);
  await openInvestigation(ctx, cause.investigation_id);
  const d = parse(causeSchema.partial(), input);
  const confirming = d.status === "confirmed" && cause.status !== "confirmed";
  const touchesContent = Object.keys(d).some((k) => k !== "status");
  if (confirming) {
    if (!can(ctx.role, "cause.confirm")) throw new ForbiddenError("Confirming a root cause requires approval by an RCA Manager, Reviewer or Administrator.");
  } else if (!can(ctx.role, "analysis.edit") && !(can(ctx.role, "cause.confirm") && !touchesContent)) {
    throw new ForbiddenError();
  }
  const merged = { ...cause, ...d };
  checkCauseRules(merged);
  if (d.evidence_ids) await validateEvidenceIds(ctx, cause.investigation_id, d.evidence_ids);
  const patch: Record<string, unknown> = { ...d };
  if (confirming) {
    patch.approved_by = ctx.user.id;
    patch.approved_at = new Date().toISOString();
  } else if (d.status && d.status !== "confirmed" && cause.status === "confirmed") {
    patch.approved_by = null;
    patch.approved_at = null;
  }
  const updated = await ctx.db.update<Cause>("causes", id, patch);
  if (confirming)
    await ctx.db.insert<Approval>("approvals", { investigation_id: cause.investigation_id, record_type: "cause", record_id: id, decision: "approved", comment: "Root cause confirmed", approver_id: ctx.user.id, approver_name: ctx.user.name });
  return updated;
}

export async function deleteCause(ctx: Ctx, id: string) {
  requirePermission(ctx, "analysis.edit");
  const c = await ctx.db.require<Cause>("causes", id);
  await openInvestigation(ctx, c.investigation_id);
  await ctx.db.remove("causes", id);
}

// ------------------------------------------------------------------ RCA analyses
export async function saveAnalysis(ctx: Ctx, investigationId: string, method: string, data: unknown, status?: RcaAnalysis["status"]) {
  requirePermission(ctx, "analysis.edit");
  await openInvestigation(ctx, investigationId);
  const schema = METHOD_SCHEMAS[method];
  if (!schema) throw new ValidationError(`Unknown method "${method}"`);
  const parsed = parse(schema, data);
  const existing = (await ctx.db.list<RcaAnalysis>("rca_analyses", { investigation_id: investigationId, method })).rows[0];
  const patch = { data: parsed, updated_by: ctx.user.id, ...(status ? { status } : {}) };
  if (existing) return ctx.db.update<RcaAnalysis>("rca_analyses", existing.id, patch);
  return ctx.db.insert<RcaAnalysis>("rca_analyses", { ...patch, investigation_id: investigationId, method, status: status ?? "in_progress" });
}

// ------------------------------------------------------------------ FMEA
export async function upsertFmea(ctx: Ctx, investigationId: string, id: string | null, input: unknown) {
  requirePermission(ctx, "analysis.edit");
  await openInvestigation(ctx, investigationId);
  const d = parse(fmeaSchema, input);
  if (id) {
    const row = await ctx.db.require<FmeaItem>("fmea_items", id);
    if (row.investigation_id !== investigationId) throw new ValidationError("FMEA row does not belong to this investigation.");
    return ctx.db.update<FmeaItem>("fmea_items", id, d);
  }
  return ctx.db.insert<FmeaItem>("fmea_items", { ...d, investigation_id: investigationId });
}
export async function deleteFmea(ctx: Ctx, id: string) {
  requirePermission(ctx, "analysis.edit");
  const row = await ctx.db.require<FmeaItem>("fmea_items", id);
  await openInvestigation(ctx, row.investigation_id);
  await ctx.db.remove("fmea_items", id);
}

// ------------------------------------------------------------------ Control plan
export async function upsertControlPlan(ctx: Ctx, investigationId: string, id: string | null, input: unknown) {
  requirePermission(ctx, "analysis.edit");
  await openInvestigation(ctx, investigationId);
  const d = parse(controlPlanSchema, input);
  if (id) return ctx.db.update<ControlPlanItem>("control_plan_items", id, d);
  return ctx.db.insert<ControlPlanItem>("control_plan_items", { ...d, investigation_id: investigationId });
}
export async function deleteControlPlan(ctx: Ctx, id: string) {
  requirePermission(ctx, "analysis.edit");
  await ctx.db.remove("control_plan_items", id);
}

// ------------------------------------------------------------------ Approvals / sign-off
export async function signApproval(ctx: Ctx, investigationId: string, input: unknown) {
  requirePermission(ctx, "approval.sign", "Only RCA Managers, Reviewers and Administrators can sign approvals.");
  await ctx.db.require<Investigation>("investigations", investigationId);
  const d = parse(approvalSchema, input);
  return ctx.db.insert<Approval>("approvals", { ...d, investigation_id: investigationId, approver_id: ctx.user.id, approver_name: ctx.user.name });
}
