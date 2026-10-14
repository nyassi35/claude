import { mean, stdev } from "./stats";

export interface ControlLimits {
  center: number;
  ucl: number;
  lcl: number;
  sigma: number;
}

export interface RuleViolation {
  index: number;
  rule: string;
}

export interface IMRChart {
  ok: boolean;
  reason?: string;
  values: number[];
  movingRanges: (number | null)[];
  individuals?: ControlLimits;
  mr?: { center: number; ucl: number; lcl: number };
  violations: RuleViolation[];
  note: string;
}

const NOTE =
  "Control limits describe the voice of the process (calculated from data). They are not specification limits, which describe the voice of the customer.";

/** Individuals & Moving Range chart (n = 1 subgroups) with Western Electric rules. */
export function imrChart(values: number[]): IMRChart {
  if (values.length < 8) {
    return { ok: false, reason: "At least 8 observations are needed for an I-MR chart (20–25 recommended).", values, movingRanges: [], violations: [], note: NOTE };
  }
  const mrs = values.slice(1).map((v, i) => Math.abs(v - values[i]));
  const mrBar = mean(mrs);
  const center = mean(values);
  const sigma = mrBar / 1.128;
  const individuals = { center, ucl: center + 3 * sigma, lcl: center - 3 * sigma, sigma };
  return {
    ok: true,
    values,
    movingRanges: [null, ...mrs],
    individuals,
    mr: { center: mrBar, ucl: 3.267 * mrBar, lcl: 0 },
    violations: westernElectricRules(values, individuals),
    note: NOTE,
  };
}

const XBAR_R: Record<number, { A2: number; D3: number; D4: number; d2: number }> = {
  2: { A2: 1.88, D3: 0, D4: 3.267, d2: 1.128 },
  3: { A2: 1.023, D3: 0, D4: 2.574, d2: 1.693 },
  4: { A2: 0.729, D3: 0, D4: 2.282, d2: 2.059 },
  5: { A2: 0.577, D3: 0, D4: 2.114, d2: 2.326 },
  6: { A2: 0.483, D3: 0, D4: 2.004, d2: 2.534 },
  7: { A2: 0.419, D3: 0.076, D4: 1.924, d2: 2.704 },
  8: { A2: 0.373, D3: 0.136, D4: 1.864, d2: 2.847 },
  9: { A2: 0.337, D3: 0.184, D4: 1.816, d2: 2.97 },
  10: { A2: 0.308, D3: 0.223, D4: 1.777, d2: 3.078 },
};

/** X̄-R chart for equal-size subgroups of 2–10. */
export function xbarRChart(subgroups: number[][]) {
  const n = subgroups[0]?.length ?? 0;
  if (subgroups.length < 5 || !XBAR_R[n] || subgroups.some((s) => s.length !== n)) {
    return { ok: false as const, reason: "Need ≥5 subgroups of equal size between 2 and 10." };
  }
  const c = XBAR_R[n];
  const means = subgroups.map(mean);
  const ranges = subgroups.map((s) => Math.max(...s) - Math.min(...s));
  const xbb = mean(means);
  const rBar = mean(ranges);
  const sigma = rBar / c.d2;
  const xbar = { center: xbb, ucl: xbb + c.A2 * rBar, lcl: xbb - c.A2 * rBar, sigma: (c.A2 * rBar) / 3 };
  return {
    ok: true as const,
    means,
    ranges,
    xbar,
    r: { center: rBar, ucl: c.D4 * rBar, lcl: c.D3 * rBar },
    processSigma: sigma,
    violations: westernElectricRules(means, xbar),
    note: NOTE,
  };
}

/** Western Electric rules 1–4 plus a 6-point trend rule. */
export function westernElectricRules(values: number[], lim: ControlLimits): RuleViolation[] {
  const out: RuleViolation[] = [];
  const { center, sigma } = lim;
  const z = values.map((v) => (sigma > 0 ? (v - center) / sigma : 0));
  z.forEach((zi, i) => {
    if (Math.abs(zi) > 3) out.push({ index: i, rule: "Rule 1: point beyond 3σ" });
    if (i >= 2) {
      const w = z.slice(i - 2, i + 1);
      for (const s of [1, -1]) if (w.filter((x) => x * s > 2).length >= 2 && zi * s > 2) out.push({ index: i, rule: "Rule 2: 2 of 3 beyond 2σ on one side" });
    }
    if (i >= 4) {
      const w = z.slice(i - 4, i + 1);
      for (const s of [1, -1]) if (w.filter((x) => x * s > 1).length >= 4 && zi * s > 1) out.push({ index: i, rule: "Rule 3: 4 of 5 beyond 1σ on one side" });
    }
    if (i >= 7) {
      const w = z.slice(i - 7, i + 1);
      if (w.every((x) => x > 0) || w.every((x) => x < 0)) out.push({ index: i, rule: "Rule 4: 8 consecutive points on one side of centre" });
    }
    if (i >= 5) {
      const w = values.slice(i - 5, i + 1);
      const inc = w.every((x, k) => k === 0 || x > w[k - 1]);
      const dec = w.every((x, k) => k === 0 || x < w[k - 1]);
      if (inc || dec) out.push({ index: i, rule: "Trend: 6 consecutive increasing or decreasing points" });
    }
  });
  return out;
}

export interface CapabilityResult {
  ok: boolean;
  reason?: string;
  n: number;
  cp?: number | null;
  cpk?: number | null;
  pp?: number | null;
  ppk?: number | null;
  sigmaWithin?: number;
  sigmaOverall?: number;
  mean?: number;
  warnings: string[];
  formulas: string[];
}

/** Process capability. Refuses to calculate when data or assumptions are unsuitable. */
export function capability(values: number[], lsl?: number | null, usl?: number | null): CapabilityResult {
  const formulas = [
    "Cp = (USL − LSL) / 6σ_within",
    "Cpk = min(USL − μ, μ − LSL) / 3σ_within",
    "Pp, Ppk: as above using overall standard deviation σ_overall",
    "σ_within = MR̄ / 1.128 (moving range of consecutive individuals)",
  ];
  const n = values.length;
  const hasL = typeof lsl === "number" && Number.isFinite(lsl);
  const hasU = typeof usl === "number" && Number.isFinite(usl);
  const warnings: string[] = [];
  if (!hasL && !hasU) return { ok: false, reason: "No specification limits supplied; capability cannot be calculated.", n, warnings, formulas };
  if (hasL && hasU && (lsl as number) >= (usl as number)) return { ok: false, reason: "LSL must be lower than USL.", n, warnings, formulas };
  if (n < 20) return { ok: false, reason: `Only ${n} observations; at least 20 (preferably ≥50) are needed for a capability estimate.`, n, warnings, formulas };
  if (n < 50) warnings.push("Fewer than 50 observations: confidence intervals on capability indices are wide.");

  const mu = mean(values);
  const sigmaOverall = stdev(values);
  const mrs = values.slice(1).map((v, i) => Math.abs(v - values[i]));
  const sigmaWithin = mean(mrs) / 1.128;
  if (!(sigmaOverall > 0) || !(sigmaWithin > 0)) return { ok: false, reason: "Data has no variation; capability is undefined.", n, warnings, formulas };

  // Normality heuristic (skewness / excess kurtosis)
  const m2 = values.reduce((a, v) => a + (v - mu) ** 2, 0) / n;
  const m3 = values.reduce((a, v) => a + (v - mu) ** 3, 0) / n;
  const m4 = values.reduce((a, v) => a + (v - mu) ** 4, 0) / n;
  const skew = m3 / m2 ** 1.5;
  const kurt = m4 / m2 ** 2 - 3;
  if (Math.abs(skew) > 1 || Math.abs(kurt) > 2) {
    warnings.push(`Data appears non-normal (skewness ${skew.toFixed(2)}, excess kurtosis ${kurt.toFixed(2)}); normal-based indices may be misleading. Consider a transformation or non-normal capability method.`);
  }

  const chart = imrChart(values);
  const unstable = chart.violations.some((v) => v.rule.startsWith("Rule 1"));
  if (unstable) warnings.push("Process shows points beyond 3σ control limits: it is not in statistical control, so Cp/Cpk (short-term capability) are not reported. Pp/Ppk describe past performance only.");

  const idx = (s: number) => {
    const upper = hasU ? ((usl as number) - mu) / (3 * s) : Infinity;
    const lower = hasL ? (mu - (lsl as number)) / (3 * s) : Infinity;
    return { two: hasL && hasU ? ((usl as number) - (lsl as number)) / (6 * s) : null, k: Math.min(upper, lower) };
  };
  const within = idx(sigmaWithin);
  const overall = idx(sigmaOverall);
  return {
    ok: true,
    n,
    mean: mu,
    sigmaWithin,
    sigmaOverall,
    cp: unstable ? null : within.two,
    cpk: unstable ? null : within.k,
    pp: overall.two,
    ppk: overall.k,
    warnings,
    formulas,
  };
}
