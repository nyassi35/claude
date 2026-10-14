"use server";
// Server actions: thin wrappers that authenticate, call the service layer and revalidate.
// Every action re-derives the session server-side; nothing from the client is trusted for identity,
// organization or role.
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ACTIVE_ORG_COOKIE, getSession, requireSession } from "@/lib/auth/session";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/db/types";
import { runAssistant } from "@/lib/ai/llm";
import * as inv from "@/lib/services/investigations";
import * as rec from "@/lib/services/records";
import * as capa from "@/lib/services/capa";
import * as admin from "@/lib/services/admin";
import type { Ctx } from "@/lib/services/context";
import type { Role } from "@/lib/types";

export type ActionResult<T = unknown> = { ok: true; data?: T } | { ok: false; error: string; issues?: string[] };

async function run<T>(fn: (ctx: Ctx) => Promise<T>, revalidate?: string | string[]): Promise<ActionResult<T>> {
  try {
    const session = await requireSession();
    const data = await fn(session);
    for (const p of ([] as string[]).concat(revalidate ?? [])) revalidatePath(p, "layout");
    return { ok: true, data: JSON.parse(JSON.stringify(data ?? null)) };
  } catch (e) {
    if (e && typeof e === "object" && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_REDIRECT")) throw e;
    if (e instanceof ValidationError) return { ok: false, error: e.message, issues: e.issues };
    if (e instanceof ForbiddenError || e instanceof NotFoundError) return { ok: false, error: e.message };
    console.error("[action]", e);
    return { ok: false, error: "Something went wrong while saving. Please try again." };
  }
}

const invPath = (id: string) => `/investigations/${id}`;

// ---------------------------------------------------------------- organization switch
export async function switchOrgAction(orgId: string) {
  const s = await requireSession();
  if (!s.memberships.some((m) => m.org_id === orgId)) return { ok: false, error: "Not a member of that organization" };
  (await cookies()).set(ACTIVE_ORG_COOKIE, orgId, { httpOnly: true, sameSite: "lax", path: "/", secure: process.env.NODE_ENV === "production" });
  revalidatePath("/", "layout");
  return { ok: true };
}

// ---------------------------------------------------------------- investigations
export async function createInvestigationAction(input: unknown) {
  const r = await run((ctx) => inv.createInvestigation(ctx, input), "/investigations");
  if (r.ok) redirect(`/investigations/${(r.data as { id: string }).id}/intake?step=2`);
  return r;
}
export const saveWizardStepAction = async (id: string, step: number, input: unknown) => run((ctx) => inv.saveWizardStep(ctx, id, step, input), invPath(id));
export const saveRiskAction = async (id: string, input: unknown) => run((ctx) => inv.saveRisk(ctx, id, input), invPath(id));
export const setMethodsAction = async (id: string, methods: string[]) => run((ctx) => inv.setSelectedMethods(ctx, id, methods), invPath(id));
export const changeStatusAction = async (id: string, input: unknown) => run((ctx) => inv.changeStatus(ctx, id, input), [invPath(id), "/dashboard"]);
export const assignOwnerAction = async (id: string, ownerId: string) => run((ctx) => inv.assignOwner(ctx, id, ownerId), invPath(id));
export async function deleteInvestigationAction(id: string) {
  const r = await run((ctx) => inv.deleteInvestigation(ctx, id), "/investigations");
  if (r.ok) redirect("/investigations");
  return r;
}

// ---------------------------------------------------------------- evidence & data
export async function addEvidenceAction(id: string, form: FormData) {
  return run(async (ctx) => {
    const file = form.get("file");
    const f = file instanceof File && file.size > 0 ? { name: file.name, type: file.type, data: await file.arrayBuffer() } : null;
    return rec.addEvidence(
      ctx,
      id,
      {
        title: form.get("title"),
        kind: form.get("kind"),
        description: form.get("description"),
        source: form.get("source"),
        collected_by: form.get("collected_by"),
        collected_at: form.get("collected_at") || null,
        is_verified: form.get("is_verified") === "on",
      },
      f,
    );
  }, invPath(id));
}
export const updateEvidenceAction = async (invId: string, evId: string, input: unknown) => run((ctx) => rec.updateEvidence(ctx, evId, input), invPath(invId));
export const deleteEvidenceAction = async (invId: string, evId: string) => run((ctx) => rec.deleteEvidence(ctx, evId), invPath(invId));
export const addTimelineAction = async (id: string, input: unknown) => run((ctx) => rec.addTimeline(ctx, id, input), invPath(id));
export const deleteTimelineAction = async (invId: string, tId: string) => run((ctx) => rec.deleteTimeline(ctx, tId), invPath(invId));
export const importMeasurementsAction = async (id: string, rows: Record<string, unknown>[]) => run((ctx) => rec.importMeasurements(ctx, id, rows), invPath(id));
export const deleteMeasurementsAction = async (id: string, parameter?: string) => run((ctx) => rec.deleteMeasurements(ctx, id, parameter), invPath(id));

// ---------------------------------------------------------------- causes & analyses
export const createCauseAction = async (id: string, input: unknown) => run((ctx) => rec.createCause(ctx, id, input), invPath(id));
export const updateCauseAction = async (invId: string, causeId: string, input: unknown) => run((ctx) => rec.updateCause(ctx, causeId, input), invPath(invId));
export const deleteCauseAction = async (invId: string, causeId: string) => run((ctx) => rec.deleteCause(ctx, causeId), invPath(invId));
export const saveAnalysisAction = async (id: string, method: string, data: unknown, status?: "in_progress" | "complete") =>
  run((ctx) => rec.saveAnalysis(ctx, id, method, data, status), invPath(id));
export const upsertFmeaAction = async (id: string, rowId: string | null, input: unknown) => run((ctx) => rec.upsertFmea(ctx, id, rowId, input), invPath(id));
export const deleteFmeaAction = async (invId: string, rowId: string) => run((ctx) => rec.deleteFmea(ctx, rowId), invPath(invId));
export const upsertControlPlanAction = async (id: string, rowId: string | null, input: unknown) => run((ctx) => rec.upsertControlPlan(ctx, id, rowId, input), invPath(id));
export const deleteControlPlanAction = async (invId: string, rowId: string) => run((ctx) => rec.deleteControlPlan(ctx, rowId), invPath(invId));
export const signApprovalAction = async (id: string, input: unknown) => run((ctx) => rec.signApproval(ctx, id, input), invPath(id));

// ---------------------------------------------------------------- CAPA
export const createCapaAction = async (id: string, input: unknown) => run((ctx) => capa.createCapa(ctx, id, input), [invPath(id), "/capa"]);
export const updateCapaAction = async (invId: string, actionId: string, input: unknown) => run((ctx) => capa.updateCapa(ctx, actionId, input), [invPath(invId), "/capa"]);
export const deleteCapaAction = async (invId: string, actionId: string) => run((ctx) => capa.deleteCapa(ctx, actionId), [invPath(invId), "/capa"]);

// ---------------------------------------------------------------- AI assistant
export async function runAssistantAction(id: string) {
  return run(async (ctx) => {
    if (ctx.role === "viewer") throw new ForbiddenError("Viewers cannot run the assistant.");
    const bundle = await inv.getBundle(ctx, id);
    const template = await inv.templateFor(ctx, bundle.investigation.category_key);
    return runAssistant(bundle, template);
  });
}

// ---------------------------------------------------------------- admin
export const updateOrgSettingsAction = async (input: unknown) => run((ctx) => admin.updateOrgSettings(ctx, input), "/settings");
export const addMemberAction = async (input: unknown) => run((ctx) => admin.addMember(ctx, input), "/settings");
export const changeRoleAction = async (membershipId: string, role: Role) => run((ctx) => admin.changeRole(ctx, membershipId, role), "/settings");
export const removeMemberAction = async (membershipId: string) => run((ctx) => admin.removeMember(ctx, membershipId), "/settings");
export const saveTemplateAction = async (key: string, config: unknown) => run((ctx) => admin.saveTemplateOverride(ctx, key, config), "/settings/templates");
export const resetTemplateAction = async (key: string) => run((ctx) => admin.resetTemplateOverride(ctx, key), "/settings/templates");
export const addPlantAction = async (name: string, location?: string) => run((ctx) => admin.addPlant(ctx, name, location), "/settings");
export const addLineAction = async (plantId: string, name: string) => run((ctx) => admin.addLine(ctx, plantId, name), "/settings");

export async function sessionInfoAction() {
  const s = await getSession();
  return s ? { role: s.role, orgId: s.orgId, userId: s.user.id } : null;
}

export async function importMeasurementsFileAction(id: string, form: FormData) {
  return run(async (ctx) => {
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) throw new ValidationError("Choose a CSV or XLSX file.");
    if (file.size > 10 * 1024 * 1024) throw new ValidationError("Import files are limited to 10 MB.");
    const { parseTabular } = await import("@/lib/import/parse");
    let rows: Record<string, unknown>[];
    try {
      rows = await parseTabular(file.name, await file.arrayBuffer());
    } catch (e) {
      throw new ValidationError((e as Error).message);
    }
    if (!rows.length) throw new ValidationError("The file contains no data rows.");
    return rec.importMeasurements(ctx, id, rows);
  }, invPath(id));
}
