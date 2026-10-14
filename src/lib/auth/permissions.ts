import type { Role } from "@/lib/types";

export const PERMISSIONS = {
  "investigation.create": ["admin", "rca_manager", "engineer", "operator"],
  "investigation.edit": ["admin", "rca_manager", "engineer"],
  "investigation.edit_own_draft": ["admin", "rca_manager", "engineer", "operator"],
  "investigation.assign": ["admin", "rca_manager"],
  "investigation.close": ["admin", "rca_manager"],
  "investigation.delete": ["admin", "rca_manager"],
  "evidence.add": ["admin", "rca_manager", "engineer", "operator"],
  "evidence.manage": ["admin", "rca_manager", "engineer"],
  "analysis.edit": ["admin", "rca_manager", "engineer"],
  "cause.confirm": ["admin", "rca_manager", "reviewer"],
  "capa.manage": ["admin", "rca_manager", "engineer"],
  "capa.update_assigned": ["admin", "rca_manager", "engineer", "operator"],
  "capa.approve_closure": ["admin", "rca_manager", "reviewer"],
  "approval.sign": ["admin", "rca_manager", "reviewer"],
  "ai.use": ["admin", "rca_manager", "engineer", "operator", "reviewer"],
  "report.export": ["admin", "rca_manager", "engineer", "operator", "reviewer", "viewer"],
  "audit.view": ["admin", "rca_manager"],
  "settings.manage": ["admin"],
  "templates.manage": ["admin"],
  "users.manage": ["admin"],
  "plants.manage": ["admin", "rca_manager"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: Role | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}

/** Can this user edit the investigation record itself? Analysts always; reporters only their own drafts. */
export function canEditInvestigation(role: Role, userId: string, inv: { created_by: string | null; status: string }) {
  if (can(role, "investigation.edit")) return true;
  return can(role, "investigation.edit_own_draft") && inv.created_by === userId && inv.status === "draft";
}

/** Operators may update only progress fields on actions assigned to them. */
export const OPERATOR_CAPA_FIELDS = ["status", "status_reason", "actual_result", "evidence_ids"] as const;
export const OPERATOR_CAPA_STATUSES = ["assigned", "in_progress", "pending_verification"] as const;

export function canUpdateCapa(role: Role, userId: string, action: { assignee_id: string | null }, patch: Record<string, unknown>): { ok: boolean; reason?: string } {
  if (can(role, "capa.manage")) return { ok: true };
  if (role === "reviewer" || role === "rca_manager" || role === "admin") return { ok: true };
  if (!can(role, "capa.update_assigned")) return { ok: false, reason: "Your role cannot update actions." };
  if (action.assignee_id !== userId) return { ok: false, reason: "This action is not assigned to you." };
  const illegal = Object.keys(patch).filter((k) => !(OPERATOR_CAPA_FIELDS as readonly string[]).includes(k));
  if (illegal.length) return { ok: false, reason: `Operators can only update progress fields (not ${illegal.join(", ")}).` };
  if (patch.status && !(OPERATOR_CAPA_STATUSES as readonly string[]).includes(patch.status as string))
    return { ok: false, reason: "Operators can set status to Assigned, In Progress or Pending Verification only." };
  return { ok: true };
}
