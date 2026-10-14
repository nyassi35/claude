import "server-only";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Driver, Filter, ListOptions, OrgTable } from "./types";
import { ORG_TABLES } from "./types";

/**
 * File-backed store used in DEMO MODE (no Supabase configured). It mirrors the Postgres schema's
 * defaults, generated columns and numbering so the same service layer runs on both backends.
 * Not intended for production use.
 */
export { emptyStore, type DemoStore, type DemoUser } from "./demo-store-shape";
import { emptyStore, STORE_VERSION, type DemoStore } from "./demo-store-shape";

const storePath = () => process.env.DEMO_STORE_PATH || path.join(process.cwd(), ".data", "demo-store.json");
const uploadDir = () => path.join(path.dirname(storePath()), "uploads");

const g = globalThis as unknown as { __rcDemoStore?: DemoStore };

export function loadStore(seed?: () => DemoStore): DemoStore {
  if (g.__rcDemoStore) return g.__rcDemoStore;
  const p = storePath();
  if (fs.existsSync(p)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(p, "utf8")) as DemoStore;
      if (parsed.version === STORE_VERSION) {
        for (const t of ORG_TABLES) parsed.tables[t] ??= [];
        g.__rcDemoStore = parsed;
        return parsed;
      }
    } catch {
      /* fall through to reseed */
    }
  }
  const s = seed ? seed() : emptyStore();
  g.__rcDemoStore = s;
  persist(s);
  return s;
}

export function setStore(s: DemoStore) {
  g.__rcDemoStore = s;
  persist(s);
}

function persist(s: DemoStore) {
  if (process.env.DEMO_STORE_PATH === ":memory:") return;
  const p = storePath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(s));
  fs.renameSync(tmp, p);
}

const now = () => new Date().toISOString();

function matches(row: Record<string, unknown>, filter: Filter) {
  return Object.entries(filter).every(([k, v]) => {
    if (Array.isArray(v)) return v.includes(row[k] as string);
    if (v === null) return row[k] === null || row[k] === undefined;
    return row[k] === v;
  });
}

function applyDefaults(store: DemoStore, table: OrgTable, row: Record<string, unknown>) {
  const ts = now();
  const out: Record<string, unknown> = { id: randomUUID(), created_at: ts, ...row };
  if (["investigations", "causes", "rca_analyses", "fmea_items", "capa_actions"].includes(table)) out.updated_at = ts;
  if (table === "investigations") {
    const org = store.organizations.find((o) => o.id === out.org_id);
    if (!org) throw new Error("Unknown organization");
    if (!out.number) {
      org.investigation_seq += 1;
      out.number = `RCA-${new Date().getFullYear()}-${String(org.investigation_seq).padStart(4, "0")}`;
    }
    out.status ??= "draft";
    out.severity ??= "medium";
    out.priority ??= "medium";
    out.wizard_step ??= 1;
    out.problem ??= {};
    out.process ??= {};
    out.answers ??= {};
    out.kpis ??= [];
    out.risk ??= { ratings: {} };
    out.selected_methods ??= [];
    out.closed_at ??= null;
  }
  if (table === "causes") {
    out.evidence_ids ??= [];
    out.status ??= "hypothesis";
    out.cause_type ??= "possible_cause";
    out.confidence ??= "low";
    out.ai_suggested ??= false;
  }
  if (table === "capa_actions") {
    out.evidence_ids ??= [];
    out.status ??= "open";
  }
  if (table === "evidence") out.is_verified ??= false;
  if (table === "timeline_events") out.is_verified ??= false;
  if (table === "rca_analyses") out.status ??= "in_progress";
  return computeGenerated(table, out);
}

function computeGenerated(table: OrgTable, row: Record<string, unknown>) {
  if (table === "fmea_items") {
    const n = (k: string) => (typeof row[k] === "number" ? (row[k] as number) : null);
    const s = n("severity"), o = n("occurrence"), d = n("detection");
    row.rpn = s && o && d ? s * o * d : null;
    const rs = n("revised_severity"), ro = n("revised_occurrence"), rd = n("revised_detection");
    row.revised_rpn = rs && ro && rd ? rs * ro * rd : null;
  }
  return row;
}

export function createDemoDriver(actorId: () => string | null): Driver {
  const store = () => loadStore();
  return {
    async list<T>(table: OrgTable, filter: Filter, opts: ListOptions = {}) {
      let rows = store().tables[table].filter((r) => matches(r, filter));
      if (opts.search?.term) {
        const term = opts.search.term.toLowerCase();
        rows = rows.filter((r) => opts.search!.columns.some((c) => String(r[c] ?? "").toLowerCase().includes(term)));
      }
      for (const rg of opts.ranges ?? []) {
        rows = rows.filter((r) => {
          const v = r[rg.column] as string | number | null;
          if (v === null || v === undefined) return false;
          if (rg.gte !== undefined && v < rg.gte) return false;
          if (rg.lte !== undefined && v > rg.lte) return false;
          return true;
        });
      }
      if (opts.order) {
        const { column, ascending = true } = opts.order;
        rows = [...rows].sort((a, b) => {
          const av = a[column] as string | number | null, bv = b[column] as string | number | null;
          if (av === bv) return 0;
          if (av === null || av === undefined) return 1;
          if (bv === null || bv === undefined) return -1;
          return (av < bv ? -1 : 1) * (ascending ? 1 : -1);
        });
      }
      const count = rows.length;
      const start = opts.offset ?? 0;
      rows = rows.slice(start, opts.limit !== undefined ? start + opts.limit : undefined);
      return { rows: structuredClone(rows) as T[], count };
    },
    async get<T>(table: OrgTable, id: string) {
      const r = store().tables[table].find((x) => x.id === id);
      return r ? (structuredClone(r) as T) : null;
    },
    async insert<T>(table: OrgTable, row: Record<string, unknown>) {
      const s = store();
      const full = applyDefaults(s, table, row);
      s.tables[table].push(full);
      persist(s);
      if (table !== "audit_events") {
        await this.audit({
          org_id: full.org_id as string,
          actor_id: actorId(),
          action: "insert",
          table_name: table,
          record_id: full.id as string,
          investigation_id: (table === "investigations" ? full.id : full.investigation_id) as string | null,
          details: { created: true },
        });
      }
      return structuredClone(full) as T;
    },
    async update<T>(table: OrgTable, id: string, patch: Record<string, unknown>) {
      const s = store();
      const idx = s.tables[table].findIndex((x) => x.id === id);
      if (idx < 0) throw new Error("Record not found");
      const before = s.tables[table][idx];
      const after = computeGenerated(table, { ...before, ...patch, ...(before.updated_at !== undefined ? { updated_at: now() } : {}) });
      s.tables[table][idx] = after;
      persist(s);
      const changed: Record<string, unknown> = {};
      for (const k of Object.keys(patch)) {
        if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) changed[k] = { from: before[k] ?? null, to: after[k] ?? null };
      }
      if (Object.keys(changed).length)
        await this.audit({
          org_id: after.org_id as string,
          actor_id: actorId(),
          action: "update",
          table_name: table,
          record_id: id,
          investigation_id: (table === "investigations" ? id : after.investigation_id) as string | null,
          details: changed,
        });
      return structuredClone(after) as T;
    },
    async remove(table: OrgTable, id: string) {
      const s = store();
      const row = s.tables[table].find((x) => x.id === id);
      s.tables[table] = s.tables[table].filter((x) => x.id !== id);
      if (table === "investigations") {
        for (const t of ORG_TABLES) if (t !== "audit_events" && t !== "memberships") s.tables[t] = s.tables[t].filter((x) => x.investigation_id !== id);
      }
      persist(s);
      if (row)
        await this.audit({
          org_id: row.org_id as string,
          actor_id: actorId(),
          action: "delete",
          table_name: table,
          record_id: id,
          investigation_id: (table === "investigations" ? id : row.investigation_id) as string | null,
          details: { deleted: row },
        });
    },
    async audit(event) {
      const s = store();
      const list = s.tables.audit_events;
      list.push({ id: list.length + 1, created_at: now(), ...event });
      persist(s);
    },
    async profiles(ids) {
      return store()
        .users.filter((u) => ids.includes(u.id))
        .map((u) => ({ id: u.id, email: u.email, full_name: u.full_name }));
    },
    async getOrganization(id) {
      const o = store().organizations.find((x) => x.id === id);
      return o ? { id: o.id, name: o.name, settings: o.settings } : null;
    },
    async updateOrganization(id, patch) {
      const s = store();
      const o = s.organizations.find((x) => x.id === id);
      if (!o) throw new Error("Organization not found");
      if (patch.name) o.name = patch.name;
      if (patch.settings) o.settings = patch.settings;
      persist(s);
    },
    async uploadFile(p, data) {
      const full = path.join(uploadDir(), p);
      if (!full.startsWith(uploadDir())) throw new Error("Invalid path");
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, Buffer.from(data));
    },
    async downloadFile(p) {
      const full = path.join(uploadDir(), p);
      if (!full.startsWith(uploadDir()) || !fs.existsSync(full)) return null;
      const buf = fs.readFileSync(full);
      return { data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, contentType: "application/octet-stream" };
    },
    async addMemberByEmail(orgId, email, role) {
      const s = store();
      const u = s.users.find((x) => x.email.toLowerCase() === email.toLowerCase());
      if (!u) throw new Error("No registered user with that email");
      const existing = s.tables.memberships.find((m) => m.org_id === orgId && m.user_id === u.id);
      if (existing) await this.update("memberships", existing.id as string, { role });
      else await this.insert("memberships", { org_id: orgId, user_id: u.id, role });
    },
  };
}
