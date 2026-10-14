import { can, canUpdateCapa } from "@/lib/auth/permissions";
import { ForbiddenError, ValidationError } from "@/lib/db/types";
import type { CapaAction, CapaStatus, Cause, Investigation } from "@/lib/types";
import { capaSchema, capaUpdateSchema } from "@/lib/validation";
import { CAPA_TRANSITIONS, isOverdue, today } from "@/lib/capa-rules";
import { parse, requirePermission, type Ctx } from "./context";

export { CAPA_TRANSITIONS, isOverdue, today };

export async function createCapa(ctx: Ctx, investigationId: string, input: unknown) {
  requirePermission(ctx, "capa.manage");
  const inv = await ctx.db.require<Investigation>("investigations", investigationId);
  if (inv.status === "closed" || inv.status === "cancelled") throw new ValidationError("This investigation is closed.");
  const d = parse(capaSchema, input);
  if (d.cause_id) {
    const cause = await ctx.db.get<Cause>("causes", d.cause_id);
    if (!cause || cause.investigation_id !== investigationId) throw new ValidationError("Linked cause must belong to this investigation.");
    if (d.action_type !== "containment" && !["supported", "confirmed"].includes(cause.status))
      throw new ValidationError("Corrective and preventive actions must address a supported or confirmed cause. Use a containment action while the cause is still a hypothesis.");
  } else if (d.action_type !== "containment") {
    throw new ValidationError("Corrective and preventive actions must be linked to a cause.");
  }
  if (d.assignee_id) {
    const m = await ctx.db.list("memberships", { user_id: d.assignee_id });
    if (!m.rows.length) throw new ValidationError("Assignee must be a member of this organization.");
  }
  const action = await ctx.db.insert<CapaAction>("capa_actions", {
    ...d,
    investigation_id: investigationId,
    status: d.assignee_id ? "assigned" : "open",
    created_by: ctx.user.id,
    evidence_ids: [],
  });
  if (["root_cause_confirmed", "open", "in_analysis", "awaiting_evidence"].includes(inv.status) && d.action_type !== "containment")
    await ctx.db.update("investigations", investigationId, { status: "capa_in_progress" });
  return action;
}

export async function updateCapa(ctx: Ctx, id: string, input: unknown) {
  const action = await ctx.db.require<CapaAction>("capa_actions", id);
  const raw = (input ?? {}) as Record<string, unknown>;
  const perm = canUpdateCapa(ctx.role, ctx.user.id, action, raw);
  if (!perm.ok) throw new ForbiddenError(perm.reason);
  const d = parse(capaUpdateSchema, raw);
  // Only keep keys the caller actually sent (partial update).
  const patch: Record<string, unknown> = Object.fromEntries(Object.entries(d).filter(([k]) => k in raw));
  const issues: string[] = [];
  const next = (patch.status as CapaStatus | undefined) ?? action.status;

  if (patch.status && patch.status !== action.status) {
    if (!CAPA_TRANSITIONS[action.status].includes(next)) issues.push(`Cannot move an action from "${action.status}" to "${next}".`);
    const merged = { ...action, ...patch };
    if (next === "ineffective" && !merged.status_reason) issues.push("Document why the action was ineffective.");
    if (next === "effective" && !merged.actual_result) issues.push("Record the actual result measured against the acceptance criteria.");
    if (next === "effective" && !merged.acceptance_criteria) issues.push("Define acceptance criteria before declaring an action effective.");
    if (next === "pending_verification" && !merged.verification_method) issues.push("Define the verification method before requesting verification.");
    if (next === "closed") {
      if (!can(ctx.role, "capa.approve_closure")) throw new ForbiddenError("Closure must be approved by an RCA Manager, Reviewer or Administrator.");
      patch.closure_approved_by = ctx.user.id;
      patch.closure_approved_at = new Date().toISOString();
    }
  }
  // Overdue actions need a documented reason before any further progress update.
  if (isOverdue(action) && !(patch.status_reason ?? action.status_reason) && !patch.due_date && ctx.role !== "viewer")
    issues.push("This action is overdue: record a reason (or agree a new due date) with this update.");
  if (patch.cause_id && patch.cause_id !== action.cause_id) {
    const cause = await ctx.db.get<Cause>("causes", patch.cause_id as string);
    if (!cause || cause.investigation_id !== action.investigation_id) issues.push("Linked cause must belong to the same investigation.");
  }
  if (issues.length) throw new ValidationError("The action could not be updated.", issues);

  const updated = await ctx.db.update<CapaAction>("capa_actions", id, patch);

  // Failed effectiveness check → reopen the investigation and start a new corrective cycle.
  if (patch.status === "ineffective" && action.status !== "ineffective") {
    await ctx.db.insert<CapaAction>("capa_actions", {
      investigation_id: action.investigation_id,
      cause_id: action.cause_id,
      action_type: action.action_type,
      description: `Re-work of ineffective action: ${action.description}`.slice(0, 2000),
      expected_impact: action.expected_impact,
      responsible_name: action.responsible_name,
      department: action.department,
      priority: "high",
      status: "open",
      verification_method: action.verification_method,
      acceptance_criteria: action.acceptance_criteria,
      parent_action_id: action.id,
      created_by: ctx.user.id,
      evidence_ids: [],
    });
    const inv = await ctx.db.require<Investigation>("investigations", action.investigation_id);
    if (inv.status !== "in_analysis") {
      await ctx.db.update("investigations", action.investigation_id, { status: "in_analysis", closed_at: null });
      await ctx.db.insert("timeline_events", {
        investigation_id: action.investigation_id,
        occurred_at: new Date().toISOString(),
        description: `Investigation reopened: action "${action.description.slice(0, 80)}" was ineffective (${patch.status_reason ?? action.status_reason}).`,
        source: `System (${ctx.user.name})`,
        is_verified: true,
      });
    }
  }
  return updated;
}

export async function deleteCapa(ctx: Ctx, id: string) {
  if (!["admin", "rca_manager"].includes(ctx.role)) throw new ForbiddenError("Only RCA managers can delete actions.");
  await ctx.db.remove("capa_actions", id);
}

export async function listCapa(ctx: Ctx, filter: { status?: string; mine?: boolean; overdue?: boolean } = {}) {
  const f: Record<string, string> = {};
  if (filter.status) f.status = filter.status;
  if (filter.mine) f.assignee_id = ctx.user.id;
  const rows = (await ctx.db.list<CapaAction>("capa_actions", f, { order: { column: "due_date" } })).rows;
  return filter.overdue ? rows.filter((r) => isOverdue(r)) : rows;
}
