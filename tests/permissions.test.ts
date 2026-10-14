import { describe, expect, it } from "vitest";
import { can, canEditInvestigation, canUpdateCapa, PERMISSIONS } from "@/lib/auth/permissions";
import { ROLES } from "@/lib/types";

describe("role-based access control", () => {
  it("matches the role matrix", () => {
    expect(can("admin", "users.manage")).toBe(true);
    expect(can("rca_manager", "users.manage")).toBe(false);
    expect(can("rca_manager", "investigation.close")).toBe(true);
    expect(can("engineer", "investigation.close")).toBe(false);
    expect(can("engineer", "analysis.edit")).toBe(true);
    expect(can("engineer", "cause.confirm")).toBe(false);
    expect(can("reviewer", "cause.confirm")).toBe(true);
    expect(can("reviewer", "analysis.edit")).toBe(false);
    expect(can("operator", "investigation.create")).toBe(true);
    expect(can("operator", "analysis.edit")).toBe(false);
    expect(can("viewer", "report.export")).toBe(true);
    expect(can(null, "report.export")).toBe(false);
  });
  it("viewers have no write permissions", () => {
    const writes = Object.keys(PERMISSIONS).filter((p) => p !== "report.export");
    for (const p of writes) expect(can("viewer", p as keyof typeof PERMISSIONS), p).toBe(false);
  });
  it("only admins manage settings, users and templates", () => {
    for (const r of ROLES) for (const p of ["settings.manage", "users.manage", "templates.manage"] as const) expect(can(r, p)).toBe(r === "admin");
  });
  it("operators may edit only their own drafts", () => {
    expect(canEditInvestigation("operator", "u1", { created_by: "u1", status: "draft" })).toBe(true);
    expect(canEditInvestigation("operator", "u1", { created_by: "u1", status: "open" })).toBe(false);
    expect(canEditInvestigation("operator", "u1", { created_by: "u2", status: "draft" })).toBe(false);
    expect(canEditInvestigation("engineer", "u1", { created_by: "u2", status: "open" })).toBe(true);
  });
  it("operators update only progress fields on their own CAPA actions", () => {
    expect(canUpdateCapa("operator", "u1", { assignee_id: "u1" }, { status: "in_progress", actual_result: "x" }).ok).toBe(true);
    expect(canUpdateCapa("operator", "u1", { assignee_id: "u2" }, { status: "in_progress" }).ok).toBe(false);
    expect(canUpdateCapa("operator", "u1", { assignee_id: "u1" }, { due_date: "2030-01-01" }).ok).toBe(false);
    expect(canUpdateCapa("operator", "u1", { assignee_id: "u1" }, { status: "closed" }).ok).toBe(false);
    expect(canUpdateCapa("viewer", "u1", { assignee_id: "u1" }, { status: "in_progress" }).ok).toBe(false);
  });
});
