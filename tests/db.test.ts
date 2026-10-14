// Database policy tests: run the real migrations on PostgreSQL (with a stub of Supabase's auth
// schema) and exercise RLS, triggers and constraints as different users.
// Run with: npm run test:db   (skipped automatically when TEST_DATABASE_URL is not set)
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

const U = {
  adminA: "a0000000-0000-4000-8000-000000000001",
  engA: "a0000000-0000-4000-8000-000000000002",
  opA: "a0000000-0000-4000-8000-000000000003",
  revA: "a0000000-0000-4000-8000-000000000004",
  viewA: "a0000000-0000-4000-8000-000000000005",
  adminB: "b0000000-0000-4000-8000-000000000001",
};

d("Row Level Security and database rules", () => {
  let pool: pg.Pool;
  let orgA: string;
  let orgB: string;
  let invA: string;
  let invB: string;

  /** Runs fn inside a transaction as the given authenticated user (or anon) and rolls back unless commit. */
  async function as<T>(uid: string | null, fn: (c: pg.PoolClient) => Promise<T>, commit = false): Promise<T> {
    const c = await pool.connect();
    try {
      await c.query("begin");
      await c.query(`set local role ${uid ? "authenticated" : "anon"}`);
      await c.query("select set_config('request.jwt.claim.sub', $1, true)", [uid ?? ""]);
      const r = await fn(c);
      await c.query(commit ? "commit" : "rollback");
      return r;
    } catch (e) {
      await c.query("rollback");
      throw e;
    } finally {
      c.release();
    }
  }

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: url, max: 4 });
    for (const [k, id] of Object.entries(U)) await pool.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3) on conflict do nothing", [id, `${k}@test.example`, { full_name: k }]);
    orgA = (await as(U.adminA, (c) => c.query("select public.create_organization('Org A') as id"), true)).rows[0].id;
    orgB = (await as(U.adminB, (c) => c.query("select public.create_organization('Org B') as id"), true)).rows[0].id;
    const roles: [string, string][] = [[U.engA, "engineer"], [U.opA, "operator"], [U.revA, "reviewer"], [U.viewA, "viewer"]];
    for (const [uid, role] of roles) await as(U.adminA, (c) => c.query("select public.add_member_by_email($1, $2, $3)", [orgA, `${Object.entries(U).find(([, v]) => v === uid)![0]}@test.example`, role]), true);
    invA = (await as(U.engA, (c) => c.query("insert into investigations (org_id, title, category_key) values ($1, 'Org A problem', 'general') returning id, number", [orgA]), true)).rows[0].id;
    invB = (await as(U.adminB, (c) => c.query("insert into investigations (org_id, title, category_key) values ($1, 'Org B secret', 'general') returning id", [orgB]), true)).rows[0].id;
  });
  afterAll(async () => pool?.end());

  it("creates org with caller as admin and numbers investigations per org", async () => {
    const r = await pool.query("select number from investigations where id = $1", [invA]);
    expect(r.rows[0].number).toMatch(/^RCA-\d{4}-0001$/);
    const m = await pool.query("select role from memberships where org_id = $1 and user_id = $2", [orgA, U.adminA]);
    expect(m.rows[0].role).toBe("admin");
  });

  it("isolates organizations: no cross-org reads or writes", async () => {
    const seen = await as(U.engA, (c) => c.query("select id from investigations"));
    expect(seen.rows.map((r) => r.id)).toEqual([invA]);
    const direct = await as(U.engA, (c) => c.query("select * from investigations where id = $1", [invB]));
    expect(direct.rowCount).toBe(0);
    const upd = await as(U.engA, (c) => c.query("update investigations set title = 'hacked' where id = $1", [invB]));
    expect(upd.rowCount).toBe(0);
    await expect(as(U.engA, (c) => c.query("insert into investigations (org_id, title, category_key) values ($1, 'inject', 'general')", [orgB]))).rejects.toThrow(/row-level security/);
    await expect(as(U.engA, (c) => c.query("insert into evidence (org_id, investigation_id, title) values ($1, $2, 'x')", [orgA, invB]))).rejects.toThrow(/org_id mismatch/);
    const orgs = await as(U.engA, (c) => c.query("select name from organizations"));
    expect(orgs.rows.map((r) => r.name)).toEqual(["Org A"]);
  });

  it("anonymous users see nothing", async () => {
    await expect(as(null, (c) => c.query("select * from investigations"))).rejects.toThrow(/permission denied/);
  });

  it("role gates: viewer read-only, operator reports, only analysts analyse", async () => {
    await expect(as(U.viewA, (c) => c.query("insert into investigations (org_id, title, category_key) values ($1, 'viewer', 'general')", [orgA]))).rejects.toThrow(/row-level security/);
    const opInv = await as(U.opA, (c) => c.query("insert into investigations (org_id, title, category_key) values ($1, 'Operator report', 'general') returning id", [orgA]));
    expect(opInv.rowCount).toBe(1);
    await expect(as(U.opA, (c) => c.query("insert into rca_analyses (org_id, investigation_id, method) values ($1, $2, 'pareto')", [orgA, invA]))).rejects.toThrow(/row-level security/);
    await expect(as(U.opA, (c) => c.query("insert into causes (org_id, investigation_id, description) values ($1, $2, 'x')", [orgA, invA]))).rejects.toThrow(/row-level security/);
    const ev = await as(U.opA, (c) => c.query("insert into evidence (org_id, investigation_id, title) values ($1, $2, 'Photo of damage') returning id", [orgA, invA]));
    expect(ev.rowCount).toBe(1);
    const upd = await as(U.opA, (c) => c.query("update investigations set title = 'Operator edit' where id = $1", [invA]));
    expect(upd.rowCount).toBe(0);
    const adminOnly = await as(U.engA, (c) => c.query("update organizations set name = 'Renamed' where id = $1", [orgA]));
    expect(adminOnly.rowCount).toBe(0);
  });

  it("root causes are confirmed only by approvers and only with evidence", async () => {
    const cause = (await as(U.engA, (c) => c.query("insert into causes (org_id, investigation_id, description, evidence_for) values ($1, $2, 'Drifted sensor', 'Calibration report') returning id", [orgA, invA]), true)).rows[0].id;
    await expect(as(U.engA, (c) => c.query("update causes set status = 'confirmed' where id = $1", [cause]))).rejects.toThrow(/Only an RCA Manager, Reviewer or Administrator/);
    const ok = await as(U.revA, (c) => c.query("update causes set status = 'confirmed' where id = $1 returning approved_by", [cause]));
    expect(ok.rows[0].approved_by).toBe(U.revA);
    const noEv = (await as(U.engA, (c) => c.query("insert into causes (org_id, investigation_id, description) values ($1, $2, 'No evidence') returning id", [orgA, invA]), true)).rows[0].id;
    await expect(as(U.revA, (c) => c.query("update causes set status = 'confirmed' where id = $1", [noEv]))).rejects.toThrow(/confirmed_requires_evidence/);
    await expect(as(U.engA, (c) => c.query("update causes set status = 'rejected' where id = $1", [noEv]))).rejects.toThrow(/rejected_requires_reason/);
  });

  it("CAPA closure needs approval, ineffective needs a reason, operators limited to progress fields", async () => {
    const a = (await as(U.engA, (c) => c.query("insert into capa_actions (org_id, investigation_id, description, action_type, assignee_id, actual_result) values ($1, $2, 'Recalibrate', 'containment', $3, 'done') returning id", [orgA, invA, U.opA]), true)).rows[0].id;
    await expect(as(U.engA, (c) => c.query("update capa_actions set status = 'ineffective' where id = $1", [a]))).rejects.toThrow(/ineffective_requires_reason/);
    await expect(as(U.engA, (c) => c.query("update capa_actions set status = 'closed' where id = $1", [a]))).rejects.toThrow(/closed_requires_approval/);
    await expect(as(U.engA, (c) => c.query("update capa_actions set status = 'closed', closure_approved_by = $2 where id = $1", [a, U.engA]))).rejects.toThrow(/Closure approval/);
    const closed = await as(U.revA, (c) => c.query("update capa_actions set status = 'closed', closure_approved_by = $2 where id = $1 returning closure_approved_at", [a, U.revA]));
    expect(closed.rows[0].closure_approved_at).not.toBeNull();
    const prog = await as(U.opA, (c) => c.query("update capa_actions set status = 'in_progress', actual_result = 'half done' where id = $1", [a]));
    expect(prog.rowCount).toBe(1);
    await expect(as(U.opA, (c) => c.query("update capa_actions set description = 'changed' where id = $1", [a]))).rejects.toThrow(/Operators can only update/);
  });

  it("FMEA RPN is generated and ratings are range-checked", async () => {
    const r = await as(U.engA, (c) => c.query("insert into fmea_items (org_id, investigation_id, process_step, failure_mode, severity, occurrence, detection) values ($1, $2, 'Step', 'Mode', 7, 4, 6) returning rpn", [orgA, invA]));
    expect(r.rows[0].rpn).toBe(168);
    await expect(as(U.engA, (c) => c.query("insert into fmea_items (org_id, investigation_id, process_step, failure_mode, severity, occurrence, detection) values ($1, $2, 'S', 'M', 11, 4, 6)", [orgA, invA]))).rejects.toThrow(/check constraint/);
  });

  it("audit trail records changes, is append-only and visible only to managers", async () => {
    await as(U.engA, (c) => c.query("update investigations set severity = 'high' where id = $1", [invA]), true);
    const ev = await pool.query("select actor_id, details from audit_events where record_id = $1 and action = 'update' order by id desc limit 1", [invA]);
    expect(ev.rows[0].actor_id).toBe(U.engA);
    expect(ev.rows[0].details.severity).toEqual({ from: "medium", to: "high" });
    const asEng = await as(U.engA, (c) => c.query("select * from audit_events"));
    expect(asEng.rowCount).toBe(0);
    const asAdmin = await as(U.adminA, (c) => c.query("select * from audit_events"));
    expect(asAdmin.rowCount).toBeGreaterThan(0);
    expect(asAdmin.rows.every((r) => r.org_id === orgA)).toBe(true);
    await expect(as(U.adminA, (c) => c.query("delete from audit_events"))).rejects.toThrow(/permission denied/);
  });

  it("org_id cannot be changed after creation and approvals are signed as self", async () => {
    await expect(as(U.adminA, (c) => c.query("update investigations set org_id = $2 where id = $1", [invA, orgB]))).rejects.toThrow();
    await expect(as(U.revA, (c) => c.query("insert into approvals (org_id, investigation_id, record_type, record_id, decision, approver_id) values ($1, $2, 'report', $4, 'approved', $3)", [orgA, invA, U.adminA, invA]))).rejects.toThrow(/row-level security/);
    await expect(as(U.engA, (c) => c.query("insert into approvals (org_id, investigation_id, record_type, record_id, decision) values ($1, $2, 'report', $3, 'approved')", [orgA, invA, invA]))).rejects.toThrow(/row-level security/);
  });

  it("storage: evidence files are confined to the org folder", async () => {
    const ok = await as(U.opA, (c) => c.query("insert into storage.objects (bucket_id, name) values ('evidence', $1)", [`${orgA}/${invA}/photo.jpg`]));
    expect(ok.rowCount).toBe(1);
    await expect(as(U.opA, (c) => c.query("insert into storage.objects (bucket_id, name) values ('evidence', $1)", [`${orgB}/${invB}/x.jpg`]))).rejects.toThrow(/row-level security/);
    await expect(as(U.engA, (c) => c.query("insert into evidence (org_id, investigation_id, title, file_path) values ($1, $2, 'x', $3)", [orgA, invA, `${orgB}/x.pdf`]))).rejects.toThrow(/file_path_in_org/);
  });
});
