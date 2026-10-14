import type { OrgTable } from "./types";
import { ORG_TABLES } from "./types";

export interface DemoUser {
  id: string;
  email: string;
  full_name: string;
}
export interface DemoStore {
  version: number;
  organizations: { id: string; name: string; settings: Record<string, unknown>; investigation_seq: number; created_at: string }[];
  users: DemoUser[];
  tables: Record<OrgTable, Record<string, unknown>[]>;
}

export const STORE_VERSION = 1;

export function emptyStore(): DemoStore {
  return { version: STORE_VERSION, organizations: [], users: [], tables: Object.fromEntries(ORG_TABLES.map((t) => [t, []])) as unknown as DemoStore["tables"] };
}

