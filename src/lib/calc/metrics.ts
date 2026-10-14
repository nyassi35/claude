import type { CostInputs } from "@/lib/types";

export interface MetricResult {
  key: string;
  label: string;
  unit: string;
  formula: string;
  assumptions: string[];
  value: number | null;
  missing: string[]; // input fields that are required but absent
  invalid?: string; // why the inputs are unsuitable
  estimate: boolean;
}

const has = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function metric(
  key: string,
  label: string,
  unit: string,
  formula: string,
  inputs: CostInputs,
  required: (keyof CostInputs)[],
  compute: (i: { [K in keyof CostInputs]-?: number }) => number | { invalid: string },
  assumptions: string[] = [],
  estimate = false,
): MetricResult {
  const missing = required.filter((k) => !has(inputs[k]));
  const base = { key, label, unit, formula, assumptions, missing, estimate };
  if (missing.length) return { ...base, value: null };
  const negative = required.filter((k) => (inputs[k] as number) < 0);
  if (negative.length) return { ...base, value: null, invalid: `Negative values are not valid: ${negative.join(", ")}` };
  const r = compute(inputs as { [K in keyof CostInputs]-?: number });
  if (typeof r === "object") return { ...base, value: null, invalid: r.invalid };
  return { ...base, value: Number.isFinite(r) ? r : null, invalid: Number.isFinite(r) ? undefined : "Result is undefined (division by zero)." };
}

export function computeMetrics(i: CostInputs, currency = "EUR"): MetricResult[] {
  const results: MetricResult[] = [
    metric("defect_pct", "Defect percentage", "%", "units_defective / units_produced × 100", i, ["units_defective", "units_produced"], (x) =>
      x.units_produced === 0 ? { invalid: "units_produced is 0" } : x.units_defective > x.units_produced ? { invalid: "Defective units exceed units produced" } : (x.units_defective / x.units_produced) * 100,
    ),
    metric("fpy", "First-pass yield", "%", "first_pass_good / units_produced × 100", i, ["first_pass_good", "units_produced"], (x) =>
      x.units_produced === 0 ? { invalid: "units_produced is 0" } : x.first_pass_good > x.units_produced ? { invalid: "First-pass good units exceed units produced" } : (x.first_pass_good / x.units_produced) * 100,
    ),
    metric("scrap_cost", "Scrap cost", currency, "units_scrapped × unit_cost", i, ["units_scrapped", "unit_cost"], (x) => x.units_scrapped * x.unit_cost, [
      "unit_cost is the full material + conversion cost per unit at the point of scrap.",
    ]),
    metric("rework_cost", "Rework cost", currency, "units_reworked × rework_cost_per_unit", i, ["units_reworked", "rework_cost_per_unit"], (x) => x.units_reworked * x.rework_cost_per_unit),
    metric("downtime_cost", "Downtime cost", currency, "downtime_hours × downtime_cost_per_hour", i, ["downtime_hours", "downtime_cost_per_hour"], (x) => x.downtime_hours * x.downtime_cost_per_hour, [
      "downtime_cost_per_hour includes lost contribution margin and idle labour; it is an organisational estimate.",
    ], true),
    metric(
      "lost_production",
      "Lost production (from downtime)",
      "units",
      "downtime_hours × 3600 / ideal_cycle_time_s",
      i,
      ["downtime_hours", "ideal_cycle_time_s"],
      (x) => (x.ideal_cycle_time_s === 0 ? { invalid: "ideal_cycle_time_s is 0" } : (x.downtime_hours * 3600) / x.ideal_cycle_time_s),
      ["Assumes the line would have run at ideal cycle time during the downtime."],
      true,
    ),
  ];

  // OEE = Availability × Performance × Quality
  results.push(
    metric(
      "oee",
      "Overall Equipment Effectiveness (OEE)",
      "%",
      "A × P × Q, where A = run_time / planned_time, P = (ideal_cycle_time × total_count) / run_time, Q = good_count / total_count",
      i,
      ["planned_time_h", "run_time_h", "ideal_cycle_time_s", "total_count", "good_count"],
      (x) => {
        if (x.planned_time_h <= 0 || x.run_time_h <= 0 || x.total_count <= 0) return { invalid: "Planned time, run time and total count must be > 0" };
        if (x.run_time_h > x.planned_time_h) return { invalid: "Run time cannot exceed planned production time" };
        if (x.good_count > x.total_count) return { invalid: "Good count cannot exceed total count" };
        const A = x.run_time_h / x.planned_time_h;
        const P = (x.ideal_cycle_time_s * x.total_count) / (x.run_time_h * 3600);
        if (P > 1.05) return { invalid: `Performance computes to ${(P * 100).toFixed(0)}% (>100%): check ideal cycle time or counts` };
        const Q = x.good_count / x.total_count;
        return Math.min(P, 1) * A * Q * 100;
      },
      ["Planned production time excludes planned stops (breaks, planned maintenance)."],
    ),
  );

  const scrap = results.find((r) => r.key === "scrap_cost")!;
  const rework = results.find((r) => r.key === "rework_cost")!;
  const downtime = results.find((r) => r.key === "downtime_cost")!;
  const internal = [scrap, rework, downtime].filter((r) => r.value !== null);
  const copqParts = [
    ...internal.map((r) => r.value as number),
    ...(has(i.external_failure_cost) ? [i.external_failure_cost] : []),
    ...(has(i.appraisal_cost) ? [i.appraisal_cost] : []),
    ...(has(i.prevention_cost) ? [i.prevention_cost] : []),
  ];
  const copq: MetricResult = {
    key: "copq",
    label: "Cost of Poor Quality (COPQ)",
    unit: currency,
    formula: "internal failure (scrap + rework + downtime) + external failure + appraisal + prevention",
    assumptions: ["Only the components with data are included; missing components are listed and the total is a lower bound."],
    missing: [
      ...(scrap.value === null ? ["scrap cost"] : []),
      ...(rework.value === null ? ["rework cost"] : []),
      ...(downtime.value === null ? ["downtime cost"] : []),
      ...(!has(i.external_failure_cost) ? ["external_failure_cost"] : []),
    ],
    value: copqParts.length ? copqParts.reduce((a, b) => a + b, 0) : null,
    estimate: true,
  };
  results.push(copq);

  results.push({
    key: "savings",
    label: "Estimated annualisable savings after corrective actions",
    unit: currency,
    formula: "COPQ (period) × expected_reduction_pct / 100",
    assumptions: ["The expected reduction is a planning estimate; verify with measured post-implementation data."],
    missing: [...(copq.value === null ? ["COPQ"] : []), ...(!has(i.expected_reduction_pct) ? ["expected_reduction_pct"] : [])],
    value: copq.value !== null && has(i.expected_reduction_pct) ? (copq.value * i.expected_reduction_pct) / 100 : null,
    invalid: has(i.expected_reduction_pct) && (i.expected_reduction_pct < 0 || i.expected_reduction_pct > 100) ? "expected_reduction_pct must be 0–100" : undefined,
    estimate: true,
  });
  const sav = results[results.length - 1];
  if (sav.invalid) sav.value = null;
  return results;
}

/** Overall risk score from 1–5 dimension ratings, plus escalation triggers. */
export function riskSummary(ratings: Partial<Record<string, number>>) {
  const vals = Object.values(ratings).filter((v): v is number => typeof v === "number" && v >= 1 && v <= 5);
  const max = vals.length ? Math.max(...vals) : 0;
  const escalate: string[] = [];
  for (const dim of ["safety", "environmental", "product_quality", "regulatory"]) {
    if ((ratings[dim] ?? 0) >= 4) escalate.push(dim);
  }
  const level = max >= 5 ? "critical" : max >= 4 ? "high" : max >= 3 ? "medium" : max >= 1 ? "low" : "not assessed";
  return { level, max, rated: vals.length, escalate };
}
