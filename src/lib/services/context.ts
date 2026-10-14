import { z } from "zod";
import { can, type Permission } from "@/lib/auth/permissions";
import type { ScopedDb } from "@/lib/db/scoped";
import type { Driver } from "@/lib/db/types";
import { ForbiddenError, ValidationError } from "@/lib/db/types";
import type { OrgSettings, Role } from "@/lib/types";
import { zodIssues } from "@/lib/validation";

/** Everything a service needs; a subset of Session so tests can build one directly. */
export interface Ctx {
  user: { id: string; email: string; name: string };
  role: Role;
  orgId: string;
  settings: OrgSettings;
  db: ScopedDb;
  driver: Driver;
}

export function requirePermission(ctx: Ctx, p: Permission, msg?: string) {
  if (!can(ctx.role, p)) throw new ForbiddenError(msg);
}

export function parse<S extends z.ZodTypeAny>(schema: S, input: unknown): z.output<S> {
  const r = schema.safeParse(input);
  if (!r.success) throw new ValidationError("Please correct the highlighted fields.", zodIssues(r.error));
  return r.data;
}
