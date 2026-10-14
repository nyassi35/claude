import { canEditInvestigation, can } from "@/lib/auth/permissions";
import { pruneHiddenAnswers, resolveTemplate } from "@/lib/categories/engine";
import { BUILTIN_TEMPLATES } from "@/lib/categories/templates";
import type { InvestigationBundle } from "@/lib/ai/engine";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/db/types";
import type {
  Approval,
  CapaAction,
  CategoryTemplateOverride,
  Cause,
  ControlPlanItem,
  Evidence,
  FmeaItem,
  Investigation,
  InvestigationStatus,
  Measurement,
  RcaAnalysis,
  TimelineEvent,
} from "@/lib/types";
import { answersSchema, contextSchema, problemSchema, processSchema, riskSchema, statusChangeSchema } from "@/lib/validation";
import { parse, requirePermission, type Ctx } from "./context";

export interface ListParams {
  q?: string;
  status?: string;
  category?: string;
  severity?: string;
  plant?: string;
  line?: string;
  from?: string;
  to?: string;
  sort?: string;
  dir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

const SORTABLE = new Set(["created_at", "updated_at", "number", "title", "severity", "priority", "status", "occurred_at", "due_date"]);

export async function listInvestigations(ctx: Ctx, p: ListParams) {
  const filter: Record<string, string> = {};
  if (p.status) filter.status = p.status;
  if (p.category) filter.category_key = p.category;
  if (p.severity) filter.severity = p.severity;
  if (p.plant) filter.plant_id = p.plant;
  if (p.line) filter.line_id = p.line;
  const pageSize = Math.min(Math.max(p.pageSize ?? 15, 5), 100);
  const page = Math.max(p.page ?? 1, 1);
  const sort = p.sort && SORTABLE.has(p.sort) ? p.sort : "created_at";
  const ranges = [];
  if (p.from || p.to) ranges.push({ column: "created_at", gte: p.from || undefined, lte: p.to ? `${p.to}T23:59:59` : undefined });
  return ctx.db.list<Investigation>("investigations", filter, {
    search: p.q ? { columns: ["title", "number", "product", "batch_number", "process_name", "asset_id"], term: p.q } : undefined,
    order: { column: sort, ascending: p.dir === "asc" },
    limit: pageSize,
    offset: (page - 1) * pageSize,
    ranges,
  });
}

export async function getInvestigation(ctx: Ctx, id: string) {
  const inv = await ctx.db.get<Investigation>("investigations", id);
  if (!inv) throw new NotFoundError("Investigation");
  return inv;
}

export async function getBundle(ctx: Ctx, id: string): Promise<InvestigationBundle & { controlPlan: ControlPlanItem[]; approvals: Approval[] }> {
  const investigation = await getInvestigation(ctx, id);
  const f = { investigation_id: id };
  const [evidence, measurements, causes, analyses, fmea, capa, timeline, controlPlan, approvals] = await Promise.all([
    ctx.db.list<Evidence>("evidence", f, { order: { column: "created_at" } }),
    ctx.db.list<Measurement>("measurements", f, { order: { column: "measured_at" } }),
    ctx.db.list<Cause>("causes", f, { order: { column: "created_at" } }),
    ctx.db.list<RcaAnalysis>("rca_analyses", f),
    ctx.db.list<FmeaItem>("fmea_items", f, { order: { column: "sort_order" } }),
    ctx.db.list<CapaAction>("capa_actions", f, { order: { column: "created_at" } }),
    ctx.db.list<TimelineEvent>("timeline_events", f, { order: { column: "occurred_at" } }),
    ctx.db.list<ControlPlanItem>("control_plan_items", f, { order: { column: "created_at" } }),
    ctx.db.list<Approval>("approvals", f, { order: { column: "created_at" } }),
  ]);
  return {
    investigation,
    evidence: evidence.rows,
    measurements: measurements.rows,
    causes: causes.rows,
    analyses: analyses.rows,
    fmea: fmea.rows,
    capa: capa.rows,
    timeline: timeline.rows,
    controlPlan: controlPlan.rows,
    approvals: approvals.rows,
  };
}

export async function templateFor(ctx: Ctx, key: string) {
  const overrides = await ctx.db.list<CategoryTemplateOverride>("category_templates", { category_key: key });
  return resolveTemplate(key, overrides.rows);
}

export async function createInvestigation(ctx: Ctx, input: unknown) {
  requirePermission(ctx, "investigation.create");
  const data = parse(contextSchema, input);
  if (!BUILTIN_TEMPLATES.some((t) => t.key === data.category_key)) throw new ValidationError("Unknown production category", ["category_key"]);
  if (data.owner_id && !can(ctx.role, "investigation.assign") && data.owner_id !== ctx.user.id) throw new ForbiddenError("Only RCA managers can assign another owner.");
  await assertRefs(ctx, data.plant_id, data.line_id);
  return ctx.db.insert<Investigation>("investigations", {
    ...data,
    status: "draft",
    wizard_step: 2,
    created_by: ctx.user.id,
    owner_id: data.owner_id ?? ctx.user.id,
    problem: {},
    process: {},
    answers: {},
    kpis: [],
    risk: { ratings: {} },
  });
}

async function assertRefs(ctx: Ctx, plantId: string | null, lineId: string | null) {
  if (plantId && !(await ctx.db.get("plants", plantId))) throw new ValidationError("Plant not found in your organization", ["plant_id"]);
  if (lineId) {
    const line = await ctx.db.get<{ plant_id: string; org_id: string }>("production_lines", lineId);
    if (!line) throw new ValidationError("Production line not found in your organization", ["line_id"]);
    if (plantId && line.plant_id !== plantId) throw new ValidationError("Production line does not belong to the selected plant", ["line_id"]);
  }
}

async function editable(ctx: Ctx, id: string) {
  const inv = await getInvestigation(ctx, id);
  if (!canEditInvestigation(ctx.role, ctx.user.id, inv)) throw new ForbiddenError("You cannot edit this investigation.");
  if (inv.status === "closed" || inv.status === "cancelled") throw new ValidationError("This investigation is closed. Reopen it to make changes.");
  return inv;
}

/** Saves one wizard step. Steps: 1 context, 2 problem, 3 process, 4 follow-up answers, 5 risk. */
export async function saveWizardStep(ctx: Ctx, id: string, step: number, input: unknown) {
  const inv = await editable(ctx, id);
  const patch: Record<string, unknown> = { wizard_step: Math.max(inv.wizard_step, Math.min(step + 1, 5)) };
  if (step === 1) {
    const d: Partial<ReturnType<typeof contextSchema.parse>> = parse(contextSchema, input);
    if (d.owner_id === null) delete d.owner_id; // not supplied → keep the current owner
    if (d.category_key && d.category_key !== inv.category_key) throw new ValidationError("The production category cannot be changed after creation.");
    if (d.owner_id !== undefined && d.owner_id !== inv.owner_id && !can(ctx.role, "investigation.assign")) throw new ForbiddenError("Only RCA managers can reassign the owner.");
    await assertRefs(ctx, d.plant_id ?? null, d.line_id ?? null);
    Object.assign(patch, d);
  } else if (step === 2) {
    Object.assign(patch, parse(problemSchema, input));
  } else if (step === 3) {
    Object.assign(patch, parse(processSchema, input));
  } else if (step === 4) {
    const d = parse(answersSchema, input);
    const t = await templateFor(ctx, inv.category_key);
    // Drop answers to questions hidden by conditional logic so stale data isn't stored.
    patch.answers = pruneHiddenAnswers(t, { problem: inv.problem as Record<string, unknown>, process: inv.process as Record<string, unknown>, answers: d.answers });
  } else if (step === 5) {
    patch.risk = parse(riskSchema, input);
  } else throw new ValidationError("Unknown wizard step");
  if (inv.status === "draft" && step === 5) patch.status = "open";
  return ctx.db.update<Investigation>("investigations", id, patch);
}

export async function saveRisk(ctx: Ctx, id: string, input: unknown) {
  requirePermission(ctx, "analysis.edit");
  await editable(ctx, id);
  return ctx.db.update<Investigation>("investigations", id, { risk: parse(riskSchema, input) });
}

export async function setSelectedMethods(ctx: Ctx, id: string, methods: string[]) {
  requirePermission(ctx, "analysis.edit");
  await editable(ctx, id);
  return ctx.db.update<Investigation>("investigations", id, { selected_methods: [...new Set(methods)].slice(0, 30) });
}

export async function assignOwner(ctx: Ctx, id: string, ownerId: string) {
  requirePermission(ctx, "investigation.assign");
  const members = await ctx.db.list<{ user_id: string }>("memberships", { user_id: ownerId });
  if (!members.rows.length) throw new ValidationError("Owner must be a member of this organization.");
  await getInvestigation(ctx, id);
  return ctx.db.update<Investigation>("investigations", id, { owner_id: ownerId });
}

/** Status transitions with evidence- and approval-based gates. */
export async function changeStatus(ctx: Ctx, id: string, input: unknown) {
  const { status, reason } = parse(statusChangeSchema, input);
  const inv = await getInvestigation(ctx, id);
  const problems: string[] = [];
  const target = status as InvestigationStatus;

  if (inv.status === "closed" && target !== "closed") {
    requirePermission(ctx, "investigation.close", "Only RCA managers can reopen a closed investigation.");
    if (!reason) problems.push("A reason is required to reopen an investigation.");
  } else if (target === "closed" || target === "cancelled") {
    requirePermission(ctx, "investigation.close", "Only RCA managers or administrators can close or cancel investigations.");
  } else if (!can(ctx.role, "investigation.edit")) {
    throw new ForbiddenError();
  }

  const causes = (await ctx.db.list<Cause>("causes", { investigation_id: id })).rows;
  const capa = (await ctx.db.list<CapaAction>("capa_actions", { investigation_id: id })).rows;
  const confirmed = causes.filter((c) => c.status === "confirmed");

  if (target === "root_cause_confirmed" && !confirmed.length) problems.push("At least one cause must be confirmed (with evidence and approval).");
  if (target === "cancelled" && !reason) problems.push("A reason is required to cancel an investigation.");
  if (target === "closed") {
    if (!confirmed.length && !reason) problems.push("No root cause is confirmed. Document why the investigation can be closed without one.");
    const open = capa.filter((a) => !["effective", "closed"].includes(a.status));
    if (open.length) problems.push(`${open.length} CAPA action(s) are not yet effective or closed.`);
    if (confirmed.length && !capa.some((a) => a.action_type !== "containment")) problems.push("Confirmed causes need at least one corrective or preventive action.");
  }
  if (problems.length) throw new ValidationError("This status change is not allowed yet.", problems);

  const patch: Record<string, unknown> = { status: target };
  if (target === "closed") patch.closed_at = new Date().toISOString();
  if (inv.status === "closed" && target !== "closed") patch.closed_at = null;
  const updated = await ctx.db.update<Investigation>("investigations", id, patch);
  if (reason || target === "closed") {
    await ctx.db.insert("timeline_events", {
      investigation_id: id,
      occurred_at: new Date().toISOString(),
      description: `Status changed from ${inv.status.replace(/_/g, " ")} to ${target.replace(/_/g, " ")}${reason ? `: ${reason}` : ""}`,
      source: `System (${ctx.user.name})`,
      is_verified: true,
    });
  }
  if (target === "closed") {
    await ctx.db.insert("approvals", { investigation_id: id, record_type: "investigation", record_id: id, decision: "approved", comment: reason ?? "Closed", approver_id: ctx.user.id, approver_name: ctx.user.name });
  }
  return updated;
}

export async function deleteInvestigation(ctx: Ctx, id: string) {
  requirePermission(ctx, "investigation.delete");
  await ctx.db.remove("investigations", id);
}
