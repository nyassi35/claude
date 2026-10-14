import { describe, expect, it } from "vitest";
import { correlation, mean, median, stdev, tTwoSidedP, welchTTest } from "@/lib/calc/stats";
import { actionPriority, classifyFmeaRisk, rpn } from "@/lib/calc/fmea";
import { pareto } from "@/lib/calc/pareto";
import { capability, imrChart, westernElectricRules, xbarRChart } from "@/lib/calc/spc";
import { computeMetrics, riskSummary } from "@/lib/calc/metrics";
import { DEFAULT_ORG_SETTINGS } from "@/lib/types";

describe("statistics", () => {
  it("computes descriptive statistics", () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5);
    expect(median([5, 1, 3])).toBe(3);
    expect(stdev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.138, 3);
  });
  it("t distribution p-values match reference tables", () => {
    expect(tTwoSidedP(2.228, 10)).toBeCloseTo(0.05, 3);
    expect(tTwoSidedP(0, 5)).toBeCloseTo(1, 6);
    expect(tTwoSidedP(12.706, 1)).toBeCloseTo(0.05, 3);
  });
  it("Welch t-test detects a clear difference and refuses tiny samples", () => {
    const r = welchTTest([10, 11, 10.5, 10.2, 10.8], [12, 12.4, 12.1, 12.6, 12.3]);
    expect(r.ok).toBe(true);
    expect(r.p!).toBeLessThan(0.001);
    expect(welchTTest([1], [2, 3]).ok).toBe(false);
    expect(welchTTest([1, 1], [1, 1]).ok).toBe(false);
  });
  it("correlation: perfect, none, and invalid inputs", () => {
    const r = correlation([1, 2, 3, 4, 5], [2, 4, 6, 8, 10]);
    expect(r.r).toBeCloseTo(1, 10);
    expect(r.slope).toBeCloseTo(2);
    expect(r.strength).toBe("strong");
    expect(correlation([1, 2], [1, 2]).ok).toBe(false);
    expect(correlation([1, 1, 1], [1, 2, 3]).ok).toBe(false);
    expect(r.caveat).toMatch(/causation/);
  });
});

describe("FMEA", () => {
  it("RPN = S × O × D", () => expect(rpn(7, 4, 6)).toBe(168));
  it("Action Priority follows severity-first logic, independent of RPN", () => {
    expect(actionPriority(10, 2, 2)).toBe("L"); // S9-10, O2-3, D2-4
    expect(actionPriority(10, 2, 7)).toBe("H");
    expect(actionPriority(9, 4, 1)).toBe("M");
    expect(actionPriority(5, 8, 8)).toBe("H");
    expect(actionPriority(3, 9, 9)).toBe("M");
    expect(actionPriority(1, 10, 10)).toBe("L");
    // Same RPN (120), different priorities → RPN is not equivalent to AP
    expect(rpn(10, 4, 3)).toBe(rpn(4, 5, 6));
    expect(actionPriority(10, 4, 3)).toBe("H");
    expect(actionPriority(4, 5, 6)).toBe("L");
    expect(() => actionPriority(0, 5, 5)).toThrow();
    expect(() => actionPriority(5, 11, 5)).toThrow();
  });
  it("escalates high severity even when RPN is low", () => {
    const f = classifyFmeaRisk({ severity: 10, occurrence: 2, detection: 2 }, { ...DEFAULT_ORG_SETTINGS, use_action_priority: false });
    expect(rpn(10, 2, 2)).toBe(40);
    expect(f.highRisk).toBe(true);
    expect(f.reasons[0]).toMatch(/Severity 10/);
    expect(classifyFmeaRisk({ severity: 3, occurrence: 3, detection: 3 }, DEFAULT_ORG_SETTINGS).highRisk).toBe(false);
    expect(classifyFmeaRisk({ severity: 5, occurrence: 5, detection: 5 }, DEFAULT_ORG_SETTINGS).reasons[0]).toMatch(/RPN 125/);
  });
});

describe("Pareto", () => {
  it("sorts, merges duplicates, computes cumulative share and the vital few", () => {
    const r = pareto([{ label: "B", value: 20 }, { label: "A", value: 50 }, { label: "C", value: 10 }, { label: "A", value: 10 }, { label: "D", value: 10 }]);
    expect(r.rows.map((x) => x.label)).toEqual(["A", "B", "C", "D"]);
    expect(r.total).toBe(100);
    expect(r.rows[0].share).toBe(60);
    expect(r.rows[1].cumulative).toBe(80);
    expect(r.rows.filter((x) => x.vital).map((x) => x.label)).toEqual(["A", "B"]);
  });
  it("rejects negative and non-numeric values", () => {
    const r = pareto([{ label: "A", value: -1 }, { label: "B", value: NaN }, { label: "C", value: 3 }]);
    expect(r.errors).toHaveLength(2);
    expect(r.rows).toHaveLength(1);
  });
  it("handles all-zero data without dividing by zero", () => {
    const r = pareto([{ label: "A", value: 0 }]);
    expect(r.rows[0].share).toBe(0);
    expect(r.rows[0].vital).toBe(false);
  });
});

describe("SPC and capability", () => {
  const stable = [10.1, 9.9, 10.0, 10.2, 9.8, 10.1, 10.0, 9.9, 10.2, 10.0, 9.8, 10.1, 10.0, 9.9, 10.1, 10.0, 9.9, 10.2, 10.0, 9.8, 10.1, 9.9, 10.0, 10.1, 9.9];
  it("I-MR limits use MR̄/1.128", () => {
    const c = imrChart(stable);
    expect(c.ok).toBe(true);
    const mrBar = stable.slice(1).reduce((a, v, i) => a + Math.abs(v - stable[i]), 0) / (stable.length - 1);
    expect(c.individuals!.ucl).toBeCloseTo(mean(stable) + 3 * (mrBar / 1.128), 10);
    expect(c.mr!.ucl).toBeCloseTo(3.267 * mrBar, 10);
    expect(c.violations.filter((v) => v.rule.startsWith("Rule 1"))).toHaveLength(0);
  });
  it("detects out-of-control points and runs", () => {
    const withSpike = [...stable.slice(0, 15), 14, ...stable.slice(15)];
    expect(imrChart(withSpike).violations.some((v) => v.rule.startsWith("Rule 1"))).toBe(true);
    const run = westernElectricRules([1, 1, 1, 1, 1, 1, 1, 1], { center: 0, ucl: 3, lcl: -3, sigma: 1 });
    expect(run.some((v) => v.rule.startsWith("Rule 4"))).toBe(true);
    expect(imrChart([1, 2, 3]).ok).toBe(false);
  });
  it("X̄-R chart uses tabulated constants", () => {
    const sg = Array.from({ length: 6 }, (_, i) => [10 + (i % 2) * 0.1, 10.2, 9.9, 10.1, 10]);
    const c = xbarRChart(sg);
    expect(c.ok).toBe(true);
    expect(xbarRChart([[1, 2], [1, 2, 3]]).ok).toBe(false);
  });
  it("capability computes indices only when suitable", () => {
    const c = capability(stable, 9, 11);
    expect(c.ok).toBe(true);
    expect(c.cp!).toBeGreaterThan(1);
    expect(c.cpk!).toBeLessThanOrEqual(c.cp!);
    expect(capability(stable.slice(0, 10), 9, 11).ok).toBe(false); // too few points
    expect(capability(stable).ok).toBe(false); // no spec limits
    expect(capability(stable, 11, 9).ok).toBe(false); // contradictory limits
    const oneSided = capability(stable, null, 11);
    expect(oneSided.cp).toBeNull();
    expect(oneSided.cpk).toBeGreaterThan(0);
  });
  it("withholds Cp/Cpk for an unstable process", () => {
    const unstable = [...stable, 15, 10, 10];
    const c = capability(unstable, 5, 20);
    expect(c.cpk).toBeNull();
    expect(c.ppk).not.toBeNull();
    expect(c.warnings.join(" ")).toMatch(/not in statistical control/);
  });
});

describe("impact metrics", () => {
  it("does not calculate when inputs are missing and lists what is missing", () => {
    const m = computeMetrics({});
    expect(m.every((x) => x.value === null)).toBe(true);
    expect(m.find((x) => x.key === "oee")!.missing).toContain("planned_time_h");
  });
  it("computes OEE = A × P × Q with formula and validates contradictions", () => {
    const m = computeMetrics({ planned_time_h: 8, run_time_h: 7, ideal_cycle_time_s: 60, total_count: 400, good_count: 380 });
    const oee = m.find((x) => x.key === "oee")!;
    expect(oee.value).toBeCloseTo((7 / 8) * ((60 * 400) / (7 * 3600)) * (380 / 400) * 100, 6);
    expect(oee.formula).toMatch(/A × P × Q/);
    const bad = computeMetrics({ planned_time_h: 8, run_time_h: 9, ideal_cycle_time_s: 60, total_count: 400, good_count: 380 }).find((x) => x.key === "oee")!;
    expect(bad.value).toBeNull();
    expect(bad.invalid).toMatch(/cannot exceed/);
    expect(computeMetrics({ units_produced: 10, units_defective: 12 }).find((x) => x.key === "defect_pct")!.invalid).toMatch(/exceed/);
    expect(computeMetrics({ units_scrapped: -5, unit_cost: 2 }).find((x) => x.key === "scrap_cost")!.invalid).toMatch(/Negative/);
  });
  it("COPQ is a labelled lower-bound estimate and savings need a reduction %", () => {
    const m = computeMetrics({ units_scrapped: 100, unit_cost: 2, downtime_hours: 3, downtime_cost_per_hour: 100, expected_reduction_pct: 50 });
    const copq = m.find((x) => x.key === "copq")!;
    expect(copq.value).toBe(500);
    expect(copq.estimate).toBe(true);
    expect(copq.missing).toContain("rework cost");
    expect(m.find((x) => x.key === "savings")!.value).toBe(250);
    expect(computeMetrics({ units_scrapped: 1, unit_cost: 1, expected_reduction_pct: 150 }).find((x) => x.key === "savings")!.value).toBeNull();
  });
  it("risk summary escalates safety/environment/quality/regulatory ratings ≥ 4", () => {
    expect(riskSummary({ safety: 4, financial: 2 })).toMatchObject({ level: "high", escalate: ["safety"] });
    expect(riskSummary({ financial: 5 }).escalate).toEqual([]);
    expect(riskSummary({}).level).toBe("not assessed");
  });
});
