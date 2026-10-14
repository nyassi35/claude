import { describe, expect, it } from "vitest";
import { BUILTIN_TEMPLATES, applyOverride, evaluateCondition, getBuiltinTemplate, missingRequired, pruneHiddenAnswers, resolveTemplate, templateOverrideSchema, visibleQuestions } from "@/lib/categories/engine";

const ids = (qs: { id: string }[]) => qs.map((q) => q.id);

describe("production categories", () => {
  it("provides all 16 categories with category-specific content", () => {
    expect(BUILTIN_TEMPLATES).toHaveLength(16);
    for (const t of BUILTIN_TEMPLATES.filter((x) => !["custom", "general"].includes(x.key))) {
      expect(t.parameters.length, t.key).toBeGreaterThan(2);
      expect(t.failureModes.length, t.key).toBeGreaterThan(2);
      expect(t.hazards.length, t.key).toBeGreaterThan(0);
      expect(t.processSteps.length, t.key).toBeGreaterThan(2);
    }
    expect(new Set(BUILTIN_TEMPLATES.map((t) => t.key)).size).toBe(16);
    expect(getBuiltinTemplate("nonexistent").key).toBe("general");
  });
});

describe("conditional question logic", () => {
  it("evaluates operators", () => {
    const ctx = { problem: { problem_type: "downtime", what_happened: "Repeated STOPS on line" }, answers: { n: 5, list: ["a"] } };
    expect(evaluateCondition({ field: "problem.problem_type", op: "eq", value: "downtime" }, ctx)).toBe(true);
    expect(evaluateCondition({ field: "problem.what_happened", op: "matches", value: "stops" }, ctx)).toBe(true);
    expect(evaluateCondition({ field: "problem.what_happened", op: "matches", value: "([" }, ctx)).toBe(false); // invalid regex is safe
    expect(evaluateCondition({ field: "answers.n", op: "gt", value: 3 }, ctx)).toBe(true);
    expect(evaluateCondition({ field: "answers.list", op: "includes", value: "a" }, ctx)).toBe(true);
    expect(evaluateCondition({ field: "answers.missing", op: "neq", value: "x" }, ctx)).toBe(false);
    expect(evaluateCondition({ not: { field: "answers.missing", op: "truthy" } }, ctx)).toBe(true);
    expect(evaluateCondition({ all: [{ field: "answers.n", op: "gte", value: 5 }, { field: "answers.n", op: "lte", value: 5 }] }, ctx)).toBe(true);
  });

  it("asks moisture follow-ups only for biochar high-moisture problems", () => {
    const t = getBuiltinTemplate("biochar");
    const moist = ids(visibleQuestions(t, { problem: { problem_type: "high_moisture" }, answers: {} }));
    expect(moist).toEqual(expect.arrayContaining(["bc_storage", "bc_dryer", "bc_moisture_sampling", "bc_quench"]));
    expect(moist).not.toContain("dt_failure_codes");
    const down = ids(visibleQuestions(t, { problem: { problem_type: "downtime" }, answers: { bc_feed_moisture_measured: "Oven-dry method" } }));
    expect(down).toEqual(expect.arrayContaining(["dt_failure_codes", "dt_pattern", "dt_lubrication", "bc_bridging"]));
    expect(down).not.toContain("bc_moisture_sampling");
    expect(down).not.toContain("bc_storage");
  });

  it("chains follow-ups on earlier answers", () => {
    const t = getBuiltinTemplate("automotive");
    const base = { problem: { problem_type: "downtime" }, answers: {} as Record<string, unknown> };
    expect(ids(visibleQuestions(t, base))).not.toContain("dt_wear");
    base.answers.dt_lubrication = "Records incomplete";
    expect(ids(visibleQuestions(t, base))).toContain("dt_wear");
  });

  it("prunes answers to hidden questions and reports missing required ones", () => {
    const t = getBuiltinTemplate("biochar");
    const pruned = pruneHiddenAnswers(t, { problem: { problem_type: "downtime" }, answers: { bc_moisture_sampling: "x", dt_count: 4 } });
    expect(pruned).toEqual({ dt_count: 4 });
    expect(ids(missingRequired(t, { problem: {}, answers: {} }))).toContain("bc_weekly_mass");
    expect(missingRequired(t, { problem: {}, answers: { bc_weekly_mass: "data" } })).toHaveLength(0);
  });

  it("recent changes trigger change follow-up", () => {
    const t = getBuiltinTemplate("general");
    expect(ids(visibleQuestions(t, { process: { recent_changes: "New supplier" }, answers: {} }))).toContain("chg_details");
    expect(ids(visibleQuestions(t, { process: { recent_changes: "" }, answers: {} }))).not.toContain("chg_details");
  });
});

describe("admin template overrides", () => {
  it("validates and applies overrides", () => {
    const cfg = { processSteps: ["A", "B"], hiddenQuestionIds: ["bc_psd"], extraQuestions: [{ id: "custom_q", label: "Kiln ID?", type: "text", section: "process" }] };
    const parsed = templateOverrideSchema.parse(cfg);
    const t = applyOverride(getBuiltinTemplate("biochar"), parsed);
    expect(t.processSteps).toEqual(["A", "B"]);
    expect(ids(t.questions)).not.toContain("bc_psd");
    expect(ids(t.questions)).toContain("custom_q");
    expect(resolveTemplate("biochar", [{ category_key: "biochar", config: cfg }]).processSteps).toEqual(["A", "B"]);
  });
  it("rejects malicious or malformed configs and falls back to the built-in template", () => {
    expect(templateOverrideSchema.safeParse({ extraQuestions: [{ id: "Bad Id", label: "x", type: "text", section: "process" }] }).success).toBe(false);
    expect(templateOverrideSchema.safeParse({ extraQuestions: [{ id: "ok_id", label: "Question", type: "text", section: "process", showIf: { field: "__proto__.x", op: "eq" } }] }).success).toBe(false);
    expect(resolveTemplate("biochar", [{ category_key: "biochar", config: { processSteps: "not-an-array" } }]).processSteps).toEqual(getBuiltinTemplate("biochar").processSteps);
  });
});
