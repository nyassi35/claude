import { beforeEach, describe, expect, it } from "vitest";
import { as, resetStore } from "./helpers";
import * as inv from "@/lib/services/investigations";
import * as rec from "@/lib/services/records";
import * as capa from "@/lib/services/capa";
import * as admin from "@/lib/services/admin";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/db/types";
import type { AuditEvent, CapaAction, Cause, Investigation } from "@/lib/types";
import { OTHER_ORG_ID } from "@/lib/seed/demo-data";
import { loadStore } from "@/lib/db/demo-driver";

let store: ReturnType<typeof resetStore>;
const byTitle = (t: string) => store.tables.investigations.find((i) => (i.title as string).startsWith(t)) as unknown as Investigation;
beforeEach(() => {
  store = resetStore();
});

describe("organization data isolation", () => {
  it("lists only the caller's organization", async () => {
    const mine = await inv.listInvestigations(as.engineer(), {});
    expect(mine.rows.every((r) => r.org_id !== OTHER_ORG_ID)).toBe(true);
    expect(mine.rows.some((r) => r.title.includes("CONFIDENTIAL"))).toBe(false);
    const theirs = await inv.listInvestigations(as.other(), {});
    expect(theirs.rows).toHaveLength(1);
  });
  it("cannot read, update or delete another org's records by id (URL tampering)", async () => {
    const bio = byTitle("Biochar");
    const other = as.other(); // admin of Contoso
    await expect(inv.getInvestigation(other, bio.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(inv.saveWizardStep(other, bio.id, 2, { problem: {}, kpis: [] })).rejects.toBeInstanceOf(NotFoundError);
    await expect(inv.deleteInvestigation(other, bio.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(rec.addEvidence(other, bio.id, { title: "x evidence", kind: "log" })).rejects.toBeInstanceOf(NotFoundError);
    const cause = store.tables.causes.find((c) => c.investigation_id === bio.id)!;
    await expect(rec.updateCause(other, cause.id as string, { status: "rejected", evidence_against: "x" })).rejects.toBeInstanceOf(NotFoundError);
    expect(await other.db.get("causes", cause.id as string)).toBeNull();
  });
  it("forces org_id on insert even if the caller supplies another", async () => {
    const c = as.engineer();
    const row = await c.db.insert<Investigation>("investigations", { org_id: OTHER_ORG_ID, title: "Spoof attempt", category_key: "general" });
    expect(row.org_id).toBe(c.orgId);
  });
  it("rejects linking evidence or causes from another investigation", async () => {
    const bio = byTitle("Biochar");
    const chemEv = store.tables.evidence.find((e) => e.investigation_id === byTitle("Assay").id)!;
    await expect(rec.createCause(as.engineer(), bio.id, { description: "cross link", evidence_ids: [chemEv.id], evidence_for: "x", status: "supported" })).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("investigation lifecycle", () => {
  it("creates, saves wizard steps (resumable draft) and opens after risk", async () => {
    const op = as.operator();
    const created = await inv.createInvestigation(op, { title: "Pump trips on line 4", category_key: "chemical", severity: "medium", priority: "high" });
    expect(created.status).toBe("draft");
    expect(created.number).toMatch(/^RCA-\d{4}-\d{4}$/);
    await inv.saveWizardStep(op, created.id, 2, { problem: { problem_type: "downtime", what_happened: "Pump P-12 trips", previous_occurrence: "no" }, kpis: [{ key: "downtime", label: "Downtime", unit: "h", actual: 6, target: 1 }] });
    await inv.saveWizardStep(op, created.id, 4, { answers: { dt_count: 3, bc_storage: "irrelevant" } });
    const after = await inv.getInvestigation(op, created.id);
    expect(after.answers).toEqual({ dt_count: 3 }); // hidden/irrelevant answer pruned
    expect(after.wizard_step).toBe(5);
    await inv.saveWizardStep(op, created.id, 5, { ratings: { safety: 2 } });
    expect((await inv.getInvestigation(op, created.id)).status).toBe("open");
    // Operators can no longer edit once it is not a draft
    await expect(inv.saveWizardStep(op, created.id, 2, { problem: {}, kpis: [] })).rejects.toBeInstanceOf(ForbiddenError);
  });
  it("validates invalid and contradictory inputs", async () => {
    const e = as.engineer();
    await expect(inv.createInvestigation(e, { title: "x", category_key: "chemical", severity: "medium", priority: "high" })).rejects.toBeInstanceOf(ValidationError);
    await expect(inv.createInvestigation(e, { title: "Valid title", category_key: "nope", severity: "medium", priority: "high" })).rejects.toBeInstanceOf(ValidationError);
    await expect(inv.createInvestigation(e, { title: "Valid title", category_key: "chemical", severity: "extreme", priority: "high" })).rejects.toBeInstanceOf(ValidationError);
    const bio = byTitle("Biochar");
    await expect(inv.saveWizardStep(e, bio.id, 3, { process: { parameters: [{ name: "T", unit: "C", lsl: 10, usl: 5 }] } })).rejects.toThrow(/correct/);
    await expect(inv.saveWizardStep(e, bio.id, 2, { problem: {}, kpis: [{ key: "k", label: "K", unit: "u", actual: "abc" }] })).rejects.toBeInstanceOf(ValidationError);
    const lineOfOtherPlant = store.tables.production_lines.find((l) => l.name === "Reactor Train R-200")!;
    const plant = store.tables.plants.find((p) => p.name === "Riverside Carbon Plant")!;
    await expect(inv.saveWizardStep(e, bio.id, 1, { title: "Biochar", category_key: "biochar", severity: "high", priority: "high", plant_id: plant.id, line_id: lineOfOtherPlant.id })).rejects.toThrow(/does not belong/);
  });
  it("viewers and operators cannot edit analyses", async () => {
    const bio = byTitle("Biochar");
    await expect(rec.saveAnalysis(as.viewer(), bio.id, "pareto", { items: [] })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(rec.upsertFmea(as.operator(), bio.id, null, { process_step: "x", failure_mode: "y", severity: 1, occurrence: 1, detection: 1 })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(inv.createInvestigation(as.viewer(), { title: "Viewer try", category_key: "general", severity: "low", priority: "low" })).rejects.toBeInstanceOf(ForbiddenError);
  });
  it("gates closure on confirmed causes and effective CAPA", async () => {
    const bio = byTitle("Biochar");
    await expect(inv.changeStatus(as.engineer(), bio.id, { status: "closed" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(inv.changeStatus(as.manager(), bio.id, { status: "closed" })).rejects.toThrow(/not allowed/);
    await expect(inv.changeStatus(as.engineer(), bio.id, { status: "root_cause_confirmed" })).rejects.toBeInstanceOf(ValidationError);
    await expect(inv.changeStatus(as.manager(), bio.id, { status: "cancelled" })).rejects.toBeInstanceOf(ValidationError);
    const closedOk = await inv.changeStatus(as.manager(), byTitle("Label mix-up").id, { status: "in_analysis", reason: "Recurrence reported" });
    expect(closedOk.closed_at).toBeNull();
  });
  it("closed investigations are read-only until reopened", async () => {
    const closed = byTitle("Label mix-up");
    await expect(rec.addEvidence(as.engineer(), closed.id, { title: "Late evidence", kind: "log" })).rejects.toThrow(/closed/);
  });
  it("search, filter, sort and pagination", async () => {
    const e = as.engineer();
    expect((await inv.listInvestigations(e, { q: "biochar" })).rows).toHaveLength(1);
    expect((await inv.listInvestigations(e, { status: "closed" })).rows).toHaveLength(1);
    expect((await inv.listInvestigations(e, { category: "automotive" })).rows[0].title).toMatch(/OP40/);
    const p1 = await inv.listInvestigations(e, { pageSize: 5, page: 1, sort: "title", dir: "asc" });
    expect(p1.count).toBe(4);
    expect(p1.rows.map((r) => r.title)).toEqual([...p1.rows.map((r) => r.title)].sort());
    expect((await inv.listInvestigations(e, { sort: "evil; drop table" })).rows.length).toBe(4);
  });
});

describe("causes and verification", () => {
  it("never allows confirmation without evidence and an approver role", async () => {
    const bio = byTitle("Biochar");
    const e = as.engineer();
    await expect(rec.createCause(e, bio.id, { description: "Created confirmed", status: "confirmed", evidence_for: "x" })).rejects.toThrow(/Create the cause first/);
    const c = await rec.createCause(e, bio.id, { description: "Dryer exit moisture too high" });
    await expect(rec.updateCause(e, c.id, { status: "confirmed" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(rec.updateCause(as.reviewer(), c.id, { status: "confirmed" })).rejects.toThrow(/not consistent/);
    await expect(rec.updateCause(e, c.id, { status: "supported" })).rejects.toBeInstanceOf(ValidationError);
    await rec.updateCause(e, c.id, { status: "supported", evidence_for: "Dryer exit moisture 24 % (survey 3 lots)" });
    const confirmed = await rec.updateCause(as.reviewer(), c.id, { status: "confirmed" });
    expect(confirmed.approved_by).toBe(as.reviewer().user.id);
    expect(store.tables.approvals.some((a) => a.record_id === c.id && a.decision === "approved")).toBe(true);
    // Downgrading clears the approval
    const back = await rec.updateCause(e, c.id, { status: "under_investigation" });
    expect(back.approved_by).toBeNull();
  });
  it("rejection requires contrary evidence; reviewers cannot rewrite cause content", async () => {
    const cause = store.tables.causes.find((c) => c.investigation_id === byTitle("Biochar").id) as unknown as Cause;
    await expect(rec.updateCause(as.engineer(), cause.id, { status: "rejected", evidence_against: null })).rejects.toThrow(/not consistent/);
    await expect(rec.updateCause(as.reviewer(), cause.id, { description: "Rewritten by reviewer" })).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("measurement import", () => {
  it("imports valid rows and reports invalid ones with row numbers", async () => {
    const bio = byTitle("Biochar");
    const r = await rec.importMeasurements(as.operator(), bio.id, [
      { Parameter: "Feed rate", Value: "171,5", Unit: "kg/h", Batch: "W41" },
      { parameter: "Feed rate", value: "abc" },
      { parameter: "", value: 3 },
      { parameter: "Moisture", value: 20, lsl: 30, usl: 10 },
    ]);
    expect(r.inserted).toBe(1);
    expect(r.errors.map((e) => e.row)).toEqual([3, 4, 5]);
    expect(loadStore().tables.measurements.some((m) => m.parameter === "Feed rate" && m.value === 171.5)).toBe(true);
  });
});

describe("CAPA workflow", () => {
  const chem = () => byTitle("Assay");
  const confirmedCause = () => store.tables.causes.find((c) => c.investigation_id === chem().id && c.cause_type === "root_cause") as unknown as Cause;

  it("corrective/preventive actions must address supported or confirmed causes", async () => {
    const bio = byTitle("Biochar");
    const hyp = store.tables.causes.find((c) => c.investigation_id === bio.id && c.status === "hypothesis")!;
    await expect(capa.createCapa(as.engineer(), bio.id, { action_type: "corrective", description: "Fix it now", cause_id: hyp.id })).rejects.toThrow(/supported or confirmed/);
    await expect(capa.createCapa(as.engineer(), bio.id, { action_type: "preventive", description: "Fix it now" })).rejects.toThrow(/linked to a cause/);
    const containment = await capa.createCapa(as.engineer(), bio.id, { action_type: "containment", description: "Cover the feedstock pile" });
    expect(containment.status).toBe("open");
    await expect(capa.createCapa(as.operator(), bio.id, { action_type: "containment", description: "Operator action" })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("enforces transitions, verification evidence and closure approval", async () => {
    const e = as.engineer();
    const a = await capa.createCapa(e, chem().id, { action_type: "corrective", description: "Replace transmitter TT-201", cause_id: confirmedCause().id, due_date: "2099-01-01" });
    await expect(capa.updateCapa(e, a.id, { status: "effective" })).rejects.toThrow(/could not be updated/);
    await capa.updateCapa(e, a.id, { status: "in_progress" });
    await expect(capa.updateCapa(e, a.id, { status: "pending_verification" })).rejects.toThrow(/could not be updated/); // no verification method
    await capa.updateCapa(e, a.id, { verification_method: "Assay of next 10 batches", acceptance_criteria: "10/10 ≥ 97.5 %" });
    await capa.updateCapa(e, a.id, { status: "pending_verification" });
    await expect(capa.updateCapa(e, a.id, { status: "effective" })).rejects.toThrow(/could not be updated/); // no actual result
    await capa.updateCapa(e, a.id, { status: "effective", actual_result: "10/10 in spec" });
    await expect(capa.updateCapa(e, a.id, { status: "closed" })).rejects.toBeInstanceOf(ForbiddenError);
    const closed = await capa.updateCapa(as.reviewer(), a.id, { status: "closed" });
    expect(closed.closure_approved_by).toBe(as.reviewer().user.id);
    await expect(capa.updateCapa(as.manager(), a.id, { status: "open" })).rejects.toThrow(/could not be updated/);
  });

  it("an ineffective action requires a reason, reopens the investigation and starts a new cycle", async () => {
    const e = as.engineer();
    const a = await capa.createCapa(e, chem().id, { action_type: "corrective", description: "Increase hold time", cause_id: confirmedCause().id, verification_method: "Assay", acceptance_criteria: "≥ 97.5 %", due_date: "2099-01-01" });
    await capa.updateCapa(e, a.id, { status: "in_progress" });
    await capa.updateCapa(e, a.id, { status: "pending_verification" });
    await expect(capa.updateCapa(e, a.id, { status: "ineffective" })).rejects.toThrow(/could not be updated/);
    await capa.updateCapa(e, a.id, { status: "ineffective", status_reason: "Two batches still below 97.5 %" });
    const actions = loadStore().tables.capa_actions as unknown as CapaAction[];
    expect(actions.some((x) => x.parent_action_id === a.id && x.status === "open")).toBe(true);
    expect((await inv.getInvestigation(e, chem().id)).status).toBe("in_analysis");
  });

  it("overdue actions need a documented reason", async () => {
    const overdue = store.tables.capa_actions.find((a) => (a.description as string).startsWith("Log screw-feeder")) as unknown as CapaAction;
    expect(capa.isOverdue(overdue)).toBe(true);
    await expect(capa.updateCapa(as.engineer(), overdue.id, { status: "in_progress" })).rejects.toThrow(/could not be updated/);
    const ok = await capa.updateCapa(as.engineer(), overdue.id, { status: "in_progress", status_reason: "Logger delivery delayed by supplier" });
    expect(ok.status).toBe("in_progress");
  });

  it("operators update only their assigned actions and only progress fields", async () => {
    const mine = store.tables.capa_actions.find((a) => a.assignee_id === as.operator().user.id && a.status === "in_progress" && !(a.description as string).startsWith("Check sensor")) as unknown as CapaAction;
    const op = as.operator();
    await expect(capa.updateCapa(op, mine.id, { description: "Changed scope" })).rejects.toBeInstanceOf(ForbiddenError);
    const res = await capa.updateCapa(op, mine.id, { actual_result: "8 lots measured so far" });
    expect(res.actual_result).toMatch(/8 lots/);
    const notMine = store.tables.capa_actions.find((a) => a.assignee_id !== op.user.id)!;
    await expect(capa.updateCapa(op, notMine.id as string, { actual_result: "x" })).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("administration and audit", () => {
  it("only admins change settings and roles; admins cannot demote themselves", async () => {
    await expect(admin.updateOrgSettings(as.manager(), { name: "X Org", rpn_threshold: 100, severity_escalation: 8, use_action_priority: true, currency: "EUR" })).rejects.toBeInstanceOf(ForbiddenError);
    await admin.updateOrgSettings(as.admin(), { name: "Northwind PI", rpn_threshold: 100, severity_escalation: 8, use_action_priority: false, currency: "USD" });
    expect(loadStore().organizations[0].settings).toMatchObject({ rpn_threshold: 100, currency: "USD" });
    const own = store.tables.memberships.find((m) => m.user_id === as.admin().user.id)!;
    await expect(admin.changeRole(as.admin(), own.id as string, "viewer")).rejects.toBeInstanceOf(ValidationError);
    const viewerM = store.tables.memberships.find((m) => m.user_id === as.viewer().user.id)!;
    await expect(admin.changeRole(as.manager(), viewerM.id as string, "admin")).rejects.toBeInstanceOf(ForbiddenError);
    expect((await admin.changeRole(as.admin(), viewerM.id as string, "engineer")).role).toBe("engineer");
    // cannot add a member from another org's user list without the email existing
    await expect(admin.addMember(as.admin(), { email: "nobody@example.com", role: "viewer" })).rejects.toThrow(/No registered user/);
  });
  it("records audit events with actor and changed fields; restricted to managers", async () => {
    const bio = byTitle("Biochar");
    await inv.saveRisk(as.engineer(), bio.id, { ratings: { safety: 3 } });
    const events = loadStore().tables.audit_events as unknown as AuditEvent[];
    const ev = events.filter((x) => x.record_id === bio.id && x.action === "update").pop()!;
    expect(ev.actor_id).toBe(as.engineer().user.id);
    expect(ev.details).toHaveProperty("risk");
    await expect(admin.listAudit(as.engineer())).rejects.toBeInstanceOf(ForbiddenError);
    const page = await admin.listAudit(as.manager());
    expect(page.rows.every((x) => x.org_id === as.manager().orgId)).toBe(true);
  });
  it("template overrides validate question definitions", async () => {
    await expect(admin.saveTemplateOverride(as.admin(), "biochar", { extraQuestions: [{ id: "q_sel", label: "Pick one", type: "select", section: "process" }] })).rejects.toThrow(/needs options/);
    await admin.saveTemplateOverride(as.admin(), "biochar", { processSteps: ["Receive", "Pyrolyse"] });
    expect((await inv.templateFor(as.engineer(), "biochar")).processSteps).toEqual(["Receive", "Pyrolyse"]);
    expect((await inv.templateFor(as.other(), "biochar")).processSteps).not.toEqual(["Receive", "Pyrolyse"]); // other org unaffected
  });
});
