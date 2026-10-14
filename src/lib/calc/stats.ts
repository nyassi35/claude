// Small, dependency-free statistics toolkit used by trend, comparative and SPC analyses.

export const finite = (xs: unknown[]): number[] =>
  xs.map((x) => (typeof x === "string" && x.trim() !== "" ? Number(x) : x)).filter((x): x is number => typeof x === "number" && Number.isFinite(x));

export function mean(xs: number[]): number {
  if (!xs.length) return NaN;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function variance(xs: number[]): number {
  if (xs.length < 2) return NaN;
  const m = mean(xs);
  return xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1);
}

export const stdev = (xs: number[]) => Math.sqrt(variance(xs));

export function median(xs: number[]): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function summary(xs: number[]) {
  return {
    n: xs.length,
    mean: mean(xs),
    sd: stdev(xs),
    median: median(xs),
    min: xs.length ? Math.min(...xs) : NaN,
    max: xs.length ? Math.max(...xs) : NaN,
  };
}

// --- special functions -------------------------------------------------------
function logGamma(x: number): number {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x;
  const tmp = x + 5.5 - (x + 0.5) * Math.log(x + 5.5);
  let ser = 1.000000000190015;
  for (const ci of c) ser += ci / ++y;
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}

function betacf(a: number, b: number, x: number): number {
  const MAXIT = 200;
  const EPS = 3e-14;
  const FPMIN = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

/** Regularized incomplete beta function I_x(a, b). */
export function incompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? (bt * betacf(a, b, x)) / a : 1 - (bt * betacf(b, a, 1 - x)) / b;
}

/** Two-sided p-value for Student's t with df degrees of freedom. */
export function tTwoSidedP(t: number, df: number): number {
  if (!Number.isFinite(t) || df <= 0) return NaN;
  return incompleteBeta(df / (df + t * t), df / 2, 0.5);
}

export function normalCdf(z: number): number {
  // Abramowitz–Stegun 7.1.26 approximation of erf
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}

// --- tests -------------------------------------------------------------------
export interface WelchResult {
  ok: boolean;
  reason?: string;
  t?: number;
  df?: number;
  p?: number;
  meanDiff?: number;
  a: ReturnType<typeof summary>;
  b: ReturnType<typeof summary>;
  assumptions: string[];
}

/** Welch's unequal-variance t-test comparing two groups (e.g. affected vs. unaffected batches). */
export function welchTTest(a: number[], b: number[]): WelchResult {
  const sa = summary(a);
  const sb = summary(b);
  const assumptions = [
    "Observations are independent within and between groups.",
    "Each group is approximately normally distributed, or n ≥ 30 per group.",
    "Groups were sampled under comparable measurement conditions.",
  ];
  if (a.length < 2 || b.length < 2) {
    return { ok: false, reason: "Each group needs at least 2 observations (≥5 recommended).", a: sa, b: sb, assumptions };
  }
  const va = variance(a) / a.length;
  const vb = variance(b) / b.length;
  if (va + vb === 0) {
    return { ok: false, reason: "Both groups have zero variance; a t-test is not meaningful.", a: sa, b: sb, assumptions };
  }
  const t = (sa.mean - sb.mean) / Math.sqrt(va + vb);
  const df = (va + vb) ** 2 / (va ** 2 / (a.length - 1) + vb ** 2 / (b.length - 1));
  return { ok: true, t, df, p: tTwoSidedP(t, df), meanDiff: sa.mean - sb.mean, a: sa, b: sb, assumptions };
}

export interface CorrelationResult {
  ok: boolean;
  reason?: string;
  n: number;
  r?: number;
  r2?: number;
  p?: number;
  slope?: number;
  intercept?: number;
  strength?: "negligible" | "weak" | "moderate" | "strong";
  caveat: string;
}

/** Pearson correlation and least-squares line for paired observations. */
export function correlation(xs: number[], ys: number[]): CorrelationResult {
  const caveat = "Correlation does not establish causation; confirm with a controlled trial or mechanism evidence.";
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return { ok: false, reason: "At least 3 paired observations are required (≥10 recommended).", n, caveat };
  const x = xs.slice(0, n);
  const y = ys.slice(0, n);
  const mx = mean(x);
  const my = mean(y);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (x[i] - mx) * (y[i] - my);
    sxx += (x[i] - mx) ** 2;
    syy += (y[i] - my) ** 2;
  }
  if (sxx === 0 || syy === 0) return { ok: false, reason: "One variable is constant; correlation is undefined.", n, caveat };
  const r = sxy / Math.sqrt(sxx * syy);
  const df = n - 2;
  const t = Math.abs(r) >= 1 ? Infinity : r * Math.sqrt(df / (1 - r * r));
  const p = Number.isFinite(t) ? tTwoSidedP(t, df) : 0;
  const abs = Math.abs(r);
  const strength = abs < 0.1 ? "negligible" : abs < 0.4 ? "weak" : abs < 0.7 ? "moderate" : "strong";
  const slope = sxy / sxx;
  return { ok: true, n, r, r2: r * r, p, slope, intercept: my - slope * mx, strength, caveat };
}

/** Simple linear trend of a series against its index (detects drift over time). */
export function linearTrend(ys: number[]) {
  return correlation(
    ys.map((_, i) => i),
    ys,
  );
}
