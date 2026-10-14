export const ORG_TABLES = [
  "plants",
  "production_lines",
  "category_templates",
  "investigations",
  "timeline_events",
  "evidence",
  "measurements",
  "causes",
  "rca_analyses",
  "fmea_items",
  "capa_actions",
  "control_plan_items",
  "approvals",
  "audit_events",
  "memberships",
] as const;
export type OrgTable = (typeof ORG_TABLES)[number];

export type FilterValue = string | number | boolean | null | string[];
export type Filter = Record<string, FilterValue>;

export interface ListOptions {
  order?: { column: string; ascending?: boolean };
  limit?: number;
  offset?: number;
  search?: { columns: string[]; term: string };
  /** range filters, e.g. { column: "created_at", gte: "2026-01-01" } */
  ranges?: { column: string; gte?: string | number; lte?: string | number }[];
}

export interface ListResult<T> {
  rows: T[];
  count: number;
}

/** Storage + row access used by the service layer. Drivers are NOT org-scoped by themselves;
 *  always use scopedDb() which enforces the active organization on every call. */
export interface Driver {
  list<T>(table: OrgTable, filter: Filter, opts?: ListOptions): Promise<ListResult<T>>;
  get<T>(table: OrgTable, id: string): Promise<T | null>;
  insert<T>(table: OrgTable, row: Record<string, unknown>): Promise<T>;
  update<T>(table: OrgTable, id: string, patch: Record<string, unknown>): Promise<T>;
  remove(table: OrgTable, id: string): Promise<void>;
  /** Writes an audit event. The Supabase driver no-ops because DB triggers already audit. */
  audit(event: { org_id: string; actor_id: string | null; action: string; table_name: string; record_id: string | null; investigation_id: string | null; details: Record<string, unknown> }): Promise<void>;
  profiles(ids: string[]): Promise<{ id: string; email: string; full_name: string | null }[]>;
  getOrganization(id: string): Promise<{ id: string; name: string; settings: Record<string, unknown> } | null>;
  updateOrganization(id: string, patch: { name?: string; settings?: Record<string, unknown> }): Promise<void>;
  uploadFile(path: string, data: ArrayBuffer, contentType: string): Promise<void>;
  downloadFile(path: string): Promise<{ data: ArrayBuffer; contentType: string } | null>;
  addMemberByEmail(orgId: string, email: string, role: string): Promise<void>;
}

export class NotFoundError extends Error {
  constructor(what = "Record") {
    super(`${what} not found`);
  }
}
export class ForbiddenError extends Error {
  constructor(msg = "You do not have permission to perform this action") {
    super(msg);
  }
}
export class ValidationError extends Error {
  constructor(
    msg: string,
    public issues: string[] = [],
  ) {
    super(msg);
  }
}
