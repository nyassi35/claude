import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ForbiddenError, ValidationError, type Driver, type Filter, type ListOptions, type OrgTable } from "./types";

function mapError(error: { code?: string; message: string; details?: string | null }): Error {
  if (error.code === "42501") return new ForbiddenError(error.message.includes("row-level security") ? undefined : error.message);
  if (error.code === "23514" || error.code === "23502" || error.code === "22P02" || error.code === "23505")
    return new ValidationError(`The database rejected the change: ${error.message}`);
  return new Error(error.message);
}

/** Removes characters that have meaning in PostgREST filter syntax. */
const sanitizeTerm = (s: string) => s.replace(/[,()*%\\:"']/g, " ").trim().slice(0, 100);

export function createSupabaseDriver(sb: SupabaseClient): Driver {
  return {
    async list<T>(table: OrgTable, filter: Filter, opts: ListOptions = {}) {
      let q = sb.from(table).select("*", { count: "exact" });
      for (const [k, v] of Object.entries(filter)) {
        if (Array.isArray(v)) q = q.in(k, v);
        else if (v === null) q = q.is(k, null);
        else q = q.eq(k, v);
      }
      if (opts.search?.term) {
        const term = sanitizeTerm(opts.search.term);
        if (term) q = q.or(opts.search.columns.map((c) => `${c}.ilike.%${term}%`).join(","));
      }
      for (const r of opts.ranges ?? []) {
        if (r.gte !== undefined) q = q.gte(r.column, r.gte);
        if (r.lte !== undefined) q = q.lte(r.column, r.lte);
      }
      if (opts.order) q = q.order(opts.order.column, { ascending: opts.order.ascending ?? true, nullsFirst: false });
      if (opts.limit !== undefined) q = q.range(opts.offset ?? 0, (opts.offset ?? 0) + opts.limit - 1);
      const { data, error, count } = await q;
      if (error) throw mapError(error);
      return { rows: (data ?? []) as T[], count: count ?? data?.length ?? 0 };
    },
    async get<T>(table: OrgTable, id: string) {
      const { data, error } = await sb.from(table).select("*").eq("id", id).maybeSingle();
      if (error) {
        if (error.code === "22P02") return null; // malformed uuid
        throw mapError(error);
      }
      return (data as T) ?? null;
    },
    async insert<T>(table: OrgTable, row: Record<string, unknown>) {
      const { data, error } = await sb.from(table).insert(row).select("*").single();
      if (error) throw mapError(error);
      return data as T;
    },
    async update<T>(table: OrgTable, id: string, patch: Record<string, unknown>) {
      const { rpn: _r, revised_rpn: _rr, ...clean } = patch;
      void _r;
      void _rr;
      const { data, error } = await sb.from(table).update(clean).eq("id", id).select("*").maybeSingle();
      if (error) throw mapError(error);
      if (!data) throw new ForbiddenError();
      return data as T;
    },
    async remove(table: OrgTable, id: string) {
      const { error, count } = await sb.from(table).delete({ count: "exact" }).eq("id", id);
      if (error) throw mapError(error);
      if (count === 0) throw new ForbiddenError();
    },
    async audit() {
      /* audited by database triggers */
    },
    async profiles(ids) {
      if (!ids.length) return [];
      const { data, error } = await sb.from("profiles").select("id,email,full_name").in("id", ids);
      if (error) throw mapError(error);
      return data ?? [];
    },
    async getOrganization(id) {
      const { data, error } = await sb.from("organizations").select("id,name,settings").eq("id", id).maybeSingle();
      if (error) throw mapError(error);
      return data;
    },
    async updateOrganization(id, patch) {
      const { error } = await sb.from("organizations").update(patch).eq("id", id);
      if (error) throw mapError(error);
    },
    async uploadFile(path, data, contentType) {
      const { error } = await sb.storage.from("evidence").upload(path, data, { contentType, upsert: false });
      if (error) throw new Error(error.message);
    },
    async downloadFile(path) {
      const { data, error } = await sb.storage.from("evidence").download(path);
      if (error || !data) return null;
      return { data: await data.arrayBuffer(), contentType: data.type || "application/octet-stream" };
    },
    async addMemberByEmail(orgId, email, role) {
      const { error } = await sb.rpc("add_member_by_email", { p_org: orgId, p_email: email, p_role: role });
      if (error) throw mapError(error);
    },
  };
}
