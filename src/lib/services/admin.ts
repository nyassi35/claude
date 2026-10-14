import { templateOverrideSchema } from "@/lib/categories/engine";
import { ForbiddenError, ValidationError } from "@/lib/db/types";
import type { AuditEvent, CategoryTemplateOverride, Membership, Plant, ProductionLine, Role } from "@/lib/types";
import { memberSchema, orgSettingsSchema } from "@/lib/validation";
import { parse, requirePermission, type Ctx } from "./context";

export async function updateOrgSettings(ctx: Ctx, input: unknown) {
  requirePermission(ctx, "settings.manage");
  const { name, ...settings } = parse(orgSettingsSchema, input);
  await ctx.driver.updateOrganization(ctx.orgId, { name, settings: { ...ctx.settings, ...settings } });
  await ctx.driver.audit({ org_id: ctx.orgId, actor_id: ctx.user.id, action: "update", table_name: "organizations", record_id: ctx.orgId, investigation_id: null, details: { settings } });
}

export async function listMembers(ctx: Ctx) {
  const rows = (await ctx.db.list<Membership>("memberships", {}, { order: { column: "created_at" } })).rows;
  const profiles = await ctx.driver.profiles(rows.map((r) => r.user_id));
  return rows.map((r) => ({ ...r, profile: profiles.find((p) => p.id === r.user_id) }));
}

export async function addMember(ctx: Ctx, input: unknown) {
  requirePermission(ctx, "users.manage");
  const d = parse(memberSchema, input);
  try {
    await ctx.driver.addMemberByEmail(ctx.orgId, d.email, d.role);
  } catch (e) {
    throw new ValidationError((e as Error).message);
  }
}

export async function changeRole(ctx: Ctx, membershipId: string, role: Role) {
  requirePermission(ctx, "users.manage");
  const m = await ctx.db.require<Membership>("memberships", membershipId);
  if (m.user_id === ctx.user.id && role !== "admin") throw new ValidationError("You cannot remove your own administrator role.");
  parse(memberSchema.shape.role, role);
  return ctx.db.update<Membership>("memberships", membershipId, { role });
}

export async function removeMember(ctx: Ctx, membershipId: string) {
  requirePermission(ctx, "users.manage");
  const m = await ctx.db.require<Membership>("memberships", membershipId);
  if (m.user_id === ctx.user.id) throw new ValidationError("You cannot remove yourself.");
  await ctx.db.remove("memberships", membershipId);
}

export async function saveTemplateOverride(ctx: Ctx, categoryKey: string, config: unknown) {
  requirePermission(ctx, "templates.manage");
  const parsed = parse(templateOverrideSchema, config);
  const ids = new Set<string>();
  for (const q of parsed.extraQuestions ?? []) {
    if (ids.has(q.id)) throw new ValidationError(`Duplicate question id "${q.id}"`);
    ids.add(q.id);
    if ((q.type === "select" || q.type === "multiselect") && !q.options?.length) throw new ValidationError(`Question "${q.id}" needs options.`);
  }
  const existing = (await ctx.db.list<CategoryTemplateOverride>("category_templates", { category_key: categoryKey })).rows[0];
  if (existing) return ctx.db.update("category_templates", existing.id, { config: parsed, updated_at: new Date().toISOString() });
  return ctx.db.insert("category_templates", { category_key: categoryKey, config: parsed, updated_at: new Date().toISOString() });
}

export async function resetTemplateOverride(ctx: Ctx, categoryKey: string) {
  requirePermission(ctx, "templates.manage");
  const existing = (await ctx.db.list<CategoryTemplateOverride>("category_templates", { category_key: categoryKey })).rows[0];
  if (existing) await ctx.db.remove("category_templates", existing.id);
}

export async function listPlants(ctx: Ctx) {
  const [plants, lines] = await Promise.all([
    ctx.db.list<Plant>("plants", {}, { order: { column: "name" } }),
    ctx.db.list<ProductionLine>("production_lines", {}, { order: { column: "name" } }),
  ]);
  return { plants: plants.rows, lines: lines.rows };
}

export async function addPlant(ctx: Ctx, name: string, location?: string) {
  requirePermission(ctx, "plants.manage");
  if (!name || name.trim().length < 2) throw new ValidationError("Plant name is required.");
  return ctx.db.insert<Plant>("plants", { name: name.trim().slice(0, 120), location: location?.trim() || null });
}

export async function addLine(ctx: Ctx, plantId: string, name: string) {
  requirePermission(ctx, "plants.manage");
  await ctx.db.require<Plant>("plants", plantId);
  if (!name || name.trim().length < 2) throw new ValidationError("Line name is required.");
  return ctx.db.insert<ProductionLine>("production_lines", { plant_id: plantId, name: name.trim().slice(0, 120) });
}

export async function listAudit(ctx: Ctx, opts: { investigationId?: string; page?: number } = {}) {
  if (!["admin", "rca_manager"].includes(ctx.role)) throw new ForbiddenError("Only administrators and RCA managers can view the audit trail.");
  const page = Math.max(1, opts.page ?? 1);
  return ctx.db.list<AuditEvent>("audit_events", opts.investigationId ? { investigation_id: opts.investigationId } : {}, {
    order: { column: "created_at", ascending: false },
    limit: 50,
    offset: (page - 1) * 50,
  });
}
