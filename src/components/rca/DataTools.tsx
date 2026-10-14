"use client";
import { useMemo, useState } from "react";
import { Save } from "lucide-react";
import { saveAnalysisAction } from "@/app/actions";
import { Alert, Badge, Button, Card, EmptyState } from "@/components/ui";
import { useAction } from "@/components/forms/useAction";
import { ControlChart, SimpleLineChart, XYScatter } from "@/components/charts";
import { capability, imrChart } from "@/lib/calc/spc";
import { correlation, linearTrend, summary, welchTTest } from "@/lib/calc/stats";
import type { Measurement } from "@/lib/types";
import { fmtNum } from "@/lib/utils";

const byTime = (a: Measurement, b: Measurement) => (a.measured_at ?? a.created_at).localeCompare(b.measured_at ?? b.created_at);
const keyOf = (m: Measurement) => m.batch ?? m.measured_at ?? m.id;

function NoData() {
  return <EmptyState title="No measurement data">Import measurements under Evidence & data (CSV / XLSX) to use this tool.</EmptyState>;
}

function SaveSelection({ invId, method, data, readOnly }: { invId: string; method: string; data: unknown; readOnly: boolean }) {
  const { exec, pending, feedback } = useAction();
  if (readOnly) return null;
  return (
    <span className="inline-flex items-center gap-2">
      <Button size="sm" variant="secondary" disabled={pending} onClick={() => exec(() => saveAnalysisAction(invId, method, data, "complete"), { success: "Saved to report" })}><Save className="h-3.5 w-3.5" /> Save to report</Button>
      {feedback}
    </span>
  );
}

// ------------------------------------------------------------------ Trend & correlation
export function TrendTool({ invId, measurements, initial, readOnly }: { invId: string; measurements: Measurement[]; initial: { x: string; y: string } | null; readOnly: boolean }) {
  const params = [...new Set(measurements.map((m) => m.parameter))];
  const [x, setX] = useState(initial?.x || params[0] || "");
  const [y, setY] = useState(initial?.y || params[1] || params[0] || "");
  const pairs = useMemo(() => {
    const xs = new Map(measurements.filter((m) => m.parameter === x).map((m) => [keyOf(m), m.value]));
    return measurements.filter((m) => m.parameter === y && xs.has(keyOf(m))).map((m) => ({ key: keyOf(m), x: xs.get(keyOf(m))!, y: m.value }));
  }, [measurements, x, y]);
  if (!params.length) return <NoData />;
  const r = correlation(pairs.map((p) => p.x), pairs.map((p) => p.y));
  const seriesY = measurements.filter((m) => m.parameter === y).sort(byTime);
  const trend = linearTrend(seriesY.map((m) => m.value));
  return (
    <div className="space-y-4">
      <Card title="Select parameters" actions={<SaveSelection invId={invId} method="trend" data={{ x, y }} readOnly={readOnly} />}>
        <div className="flex flex-wrap gap-3">
          <label className="text-sm">X (process parameter) <select className="input mt-1 w-64" value={x} onChange={(e) => setX(e.target.value)}>{params.map((p) => <option key={p}>{p}</option>)}</select></label>
          <label className="text-sm">Y (outcome) <select className="input mt-1 w-64" value={y} onChange={(e) => setY(e.target.value)}>{params.map((p) => <option key={p}>{p}</option>)}</select></label>
        </div>
        <p className="mt-2 text-xs text-slate-500">Values are paired by batch (or timestamp when no batch is given). {pairs.length} pair(s) found.</p>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={`${y} vs. ${x}`}>
          {r.ok ? (
            <>
              <XYScatter points={pairs} xLabel={x} yLabel={y} fit={r.ok ? { slope: r.slope!, intercept: r.intercept! } : null} />
              <p className="mt-2 text-sm">Pearson r = <b>{fmtNum(r.r!, 3)}</b> ({r.strength}), R² = {fmtNum(r.r2!, 3)}, p = {fmtNum(r.p!, 4)}, n = {r.n}. Fit: {y} ≈ {fmtNum(r.intercept!, 3)} + {fmtNum(r.slope!, 4)} × {x}</p>
            </>
          ) : <Alert kind="warning">{r.reason}</Alert>}
          <Alert kind="info" className="mt-2">{r.caveat}</Alert>
        </Card>
        <Card title={`${y} over time`}>
          <SimpleLineChart data={seriesY.map((m) => ({ t: m.batch ?? m.measured_at?.slice(0, 10) ?? "", value: m.value }))} x="t" lines={[{ key: "value", name: y }]} />
          {trend.ok && <p className="mt-2 text-sm">Linear trend: slope {fmtNum(trend.slope!, 4)} per observation, r = {fmtNum(trend.r!, 3)}, p = {fmtNum(trend.p!, 4)} {trend.p! < 0.05 ? <Badge color="amber">significant drift</Badge> : <Badge>no significant drift</Badge>}</p>}
        </Card>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ SPC & capability
export function SpcTool({ invId, measurements, initial, readOnly }: { invId: string; measurements: Measurement[]; initial: { parameter: string } | null; readOnly: boolean }) {
  const params = [...new Set(measurements.map((m) => m.parameter))];
  const [param, setParam] = useState(initial?.parameter || params[0] || "");
  const series = measurements.filter((m) => m.parameter === param).sort(byTime);
  const lsl0 = series.find((m) => m.lsl !== null)?.lsl ?? null;
  const usl0 = series.find((m) => m.usl !== null)?.usl ?? null;
  const [lsl, setLsl] = useState<string>("");
  const [usl, setUsl] = useState<string>("");
  if (!params.length) return <NoData />;
  const values = series.map((m) => m.value);
  const chart = imrChart(values);
  const L = lsl !== "" ? Number(lsl) : lsl0;
  const U = usl !== "" ? Number(usl) : usl0;
  const cap = capability(values, L, U);
  const signals = new Set(chart.violations.map((v) => v.index));
  return (
    <div className="space-y-4">
      <Card title="Parameter" actions={<SaveSelection invId={invId} method="spc" data={{ parameter: param }} readOnly={readOnly} />}>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">Parameter <select className="input mt-1 w-64" value={param} onChange={(e) => { setParam(e.target.value); setLsl(""); setUsl(""); }}>{params.map((p) => <option key={p}>{p}</option>)}</select></label>
          <label className="text-sm">LSL <input type="number" step="any" className="input mt-1 w-28" placeholder={lsl0 === null ? "none" : String(lsl0)} value={lsl} onChange={(e) => setLsl(e.target.value)} /></label>
          <label className="text-sm">USL <input type="number" step="any" className="input mt-1 w-28" placeholder={usl0 === null ? "none" : String(usl0)} value={usl} onChange={(e) => setUsl(e.target.value)} /></label>
        </div>
      </Card>
      <Card title={`Individuals (I-MR) chart — ${param}`} description={chart.note}>
        {chart.ok ? (
          <>
            <ControlChart points={series.map((m, i) => ({ label: m.batch ?? String(i + 1), value: m.value, signal: signals.has(i) }))} center={chart.individuals!.center} ucl={chart.individuals!.ucl} lcl={chart.individuals!.lcl} lsl={L} usl={U} unit={series[0]?.unit ?? undefined} />
            <p className="mt-2 text-sm">MR̄ = {fmtNum(chart.mr!.center, 4)}, σ̂ (within) = {fmtNum(chart.individuals!.sigma, 4)}. MR chart UCL = {fmtNum(chart.mr!.ucl, 4)}.</p>
            {chart.violations.length ? (
              <Alert kind="warning" title={`${chart.violations.length} out-of-control signal(s)`}>
                <ul>{chart.violations.slice(0, 12).map((v, i) => <li key={i}>Point {v.index + 1} ({series[v.index]?.batch ?? ""}): {v.rule}</li>)}</ul>
              </Alert>
            ) : <Alert kind="success">No special-cause signals detected by the Western Electric rules.</Alert>}
          </>
        ) : <Alert kind="warning">{chart.reason}</Alert>}
      </Card>
      <Card title="Process capability" description="Calculated only when the data and assumptions are suitable.">
        {cap.ok ? (
          <div className="space-y-2 text-sm">
            <div className="flex flex-wrap gap-3">
              {(["cp", "cpk", "pp", "ppk"] as const).map((k) => (
                <div key={k} className="rounded-md border border-slate-200 px-3 py-2"><p className="text-xs uppercase text-slate-500">{k}</p><p className="text-lg font-semibold">{cap[k] === null || cap[k] === undefined || !Number.isFinite(cap[k] as number) ? "n/a" : fmtNum(cap[k] as number, 2)}</p></div>
              ))}
            </div>
            <p>n = {cap.n}, mean = {fmtNum(cap.mean!, 4)}, σ within = {fmtNum(cap.sigmaWithin!, 4)}, σ overall = {fmtNum(cap.sigmaOverall!, 4)}</p>
            {cap.warnings.map((w) => <Alert key={w} kind="warning">{w}</Alert>)}
          </div>
        ) : <Alert kind="info">Not calculated: {cap.reason}</Alert>}
        <ul className="mt-2 font-mono text-xs text-slate-500">{cap.formulas.map((f) => <li key={f}>{f}</li>)}</ul>
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------ Good vs. defective comparison
export function ComparativeTool({ invId, measurements, initial, readOnly }: { invId: string; measurements: Measurement[]; initial: { parameter: string; groupA: string; groupB: string } | null; readOnly: boolean }) {
  const params = [...new Set(measurements.map((m) => m.parameter))];
  const groups = [...new Set(measurements.map((m) => m.group_label).filter((g): g is string => !!g))];
  const [param, setParam] = useState(initial?.parameter || params[0] || "");
  const [ga, setGa] = useState(initial?.groupA || groups[0] || "");
  const [gb, setGb] = useState(initial?.groupB || groups[1] || "");
  if (!params.length) return <NoData />;
  if (groups.length < 2) return <Alert kind="info" title="Two groups needed">Label measurements with a group (e.g. “affected” / “unaffected”, “OOS” / “in_spec”) in the group_label column to compare them.</Alert>;
  const vals = (g: string, p = param) => measurements.filter((m) => m.parameter === p && m.group_label === g).map((m) => m.value);
  const t = welchTTest(vals(ga), vals(gb));
  const all = params.map((p) => ({ p, a: summary(vals(ga, p)), b: summary(vals(gb, p)), t: welchTTest(vals(ga, p), vals(gb, p)) }));
  return (
    <div className="space-y-4">
      <Card title="Comparison" actions={<SaveSelection invId={invId} method="comparative" data={{ parameter: param, groupA: ga, groupB: gb }} readOnly={readOnly} />}>
        <div className="flex flex-wrap gap-3">
          <label className="text-sm">Parameter <select className="input mt-1 w-64" value={param} onChange={(e) => setParam(e.target.value)}>{params.map((p) => <option key={p}>{p}</option>)}</select></label>
          <label className="text-sm">Group A <select className="input mt-1 w-44" value={ga} onChange={(e) => setGa(e.target.value)}>{groups.map((g) => <option key={g}>{g}</option>)}</select></label>
          <label className="text-sm">Group B <select className="input mt-1 w-44" value={gb} onChange={(e) => setGb(e.target.value)}>{groups.map((g) => <option key={g}>{g}</option>)}</select></label>
        </div>
        {t.ok ? (
          <div className="mt-3 text-sm">
            <p>{ga}: mean {fmtNum(t.a.mean, 3)} (sd {fmtNum(t.a.sd, 3)}, n {t.a.n}) · {gb}: mean {fmtNum(t.b.mean, 3)} (sd {fmtNum(t.b.sd, 3)}, n {t.b.n})</p>
            <p className="mt-1">Welch t = {fmtNum(t.t!, 3)}, df = {fmtNum(t.df!, 1)}, two-sided p = <b>{fmtNum(t.p!, 4)}</b> {t.p! < 0.05 ? <Badge color="amber">difference unlikely to be chance</Badge> : <Badge>no significant difference</Badge>}</p>
          </div>
        ) : <Alert kind="warning" className="mt-3">{t.reason}</Alert>}
        <Alert kind="info" className="mt-3" title="Assumptions">
          <ul>{t.assumptions.map((a) => <li key={a}>{a}</li>)}<li>A significant difference identifies a lead to verify — it does not prove causation.</li></ul>
        </Alert>
      </Card>
      <Card title="All parameters">
        <div className="overflow-x-auto">
          <table className="table-base text-xs">
            <thead><tr><th>Parameter</th><th>{ga} mean (n)</th><th>{gb} mean (n)</th><th>Difference</th><th>p (Welch)</th></tr></thead>
            <tbody>
              {all.map((r) => (
                <tr key={r.p} className={r.t.ok && r.t.p! < 0.05 ? "bg-amber-50" : undefined}>
                  <td className="font-medium">{r.p}</td>
                  <td>{fmtNum(r.a.mean, 3)} ({r.a.n})</td>
                  <td>{fmtNum(r.b.mean, 3)} ({r.b.n})</td>
                  <td>{r.t.ok ? fmtNum(r.t.meanDiff!, 3) : "—"}</td>
                  <td>{r.t.ok ? fmtNum(r.t.p!, 4) : <span className="text-slate-400">{r.t.reason}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
