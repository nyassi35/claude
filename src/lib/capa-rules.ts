import type { CapaAction, CapaStatus } from "@/lib/types";

/** Allowed status transitions. "closed" additionally requires approval by an approver role. */
export const CAPA_TRANSITIONS: Record<CapaStatus, CapaStatus[]> = {
  open: ["assigned", "in_progress"],
  assigned: ["in_progress", "open"],
  in_progress: ["pending_verification", "assigned"],
  pending_verification: ["effective", "ineffective", "in_progress"],
  effective: ["closed", "pending_verification"],
  ineffective: ["in_progress"],
  closed: [],
};

export const today = () => new Date().toISOString().slice(0, 10);

export function isOverdue(a: Pick<CapaAction, "due_date" | "status">, on = today()) {
  return !!a.due_date && a.due_date < on && !["effective", "closed"].includes(a.status);
}
