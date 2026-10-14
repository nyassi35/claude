import { can } from "@/lib/auth/permissions";
import type { Session } from "@/lib/auth/session";
import type { CapaCtx } from "@/components/investigation/CapaPanel";

export function capaCtx(s: Session, members: { user_id: string; profile?: { full_name: string | null; email: string } }[]): CapaCtx {
  return {
    role: s.role,
    userId: s.user.id,
    canManage: can(s.role, "capa.manage"),
    canApproveClosure: can(s.role, "capa.approve_closure"),
    canDelete: ["admin", "rca_manager"].includes(s.role),
    members: members.map((m) => ({ user_id: m.user_id, name: m.profile?.full_name || m.profile?.email || m.user_id })),
    currency: s.settings.currency,
  };
}
