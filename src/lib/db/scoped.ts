import { NotFoundError, type Driver, type Filter, type ListOptions, type OrgTable } from "./types";

/**
 * Wraps a driver so every operation is confined to one organization. Even if a caller passes
 * an id belonging to another organization (e.g. by editing a URL), the record is reported as
 * not found and never returned or modified. In Supabase mode RLS enforces the same rule in the DB.
 */
export function scopedDb(driver: Driver, orgId: string) {
  const assertOwned = async <T extends { org_id?: string }>(table: OrgTable, id: string): Promise<T> => {
    const row = await driver.get<T>(table, id);
    if (!row || row.org_id !== orgId) throw new NotFoundError();
    return row;
  };
  return {
    orgId,
    list: <T>(table: OrgTable, filter: Filter = {}, opts?: ListOptions) => driver.list<T>(table, { ...filter, org_id: orgId }, opts),
    get: async <T extends { org_id?: string }>(table: OrgTable, id: string): Promise<T | null> => {
      const row = await driver.get<T>(table, id);
      return row && row.org_id === orgId ? row : null;
    },
    require: <T extends { org_id?: string }>(table: OrgTable, id: string) => assertOwned<T>(table, id),
    insert: <T>(table: OrgTable, row: Record<string, unknown>) => {
      const { id: _ignored, org_id: _org, ...rest } = row;
      void _ignored;
      void _org;
      return driver.insert<T>(table, { ...rest, org_id: orgId });
    },
    update: async <T>(table: OrgTable, id: string, patch: Record<string, unknown>) => {
      await assertOwned(table, id);
      const { id: _i, org_id: _o, created_at: _c, ...rest } = patch;
      void _i;
      void _o;
      void _c;
      return driver.update<T>(table, id, rest);
    },
    remove: async (table: OrgTable, id: string) => {
      await assertOwned(table, id);
      await driver.remove(table, id);
    },
    driver,
  };
}

export type ScopedDb = ReturnType<typeof scopedDb>;
