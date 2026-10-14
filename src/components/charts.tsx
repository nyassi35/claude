"use client";
// Chart components (Recharts). Palette: validated categorical slots 1–3 (blue, orange, aqua);
// one value axis per chart; tooltips on every chart; text in ink colors, never series colors.
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";

export const SERIES = ["#2a78d6", "#eb6834", "#1baf7a"];
const INK = "#52514e";
const GRID = "#e5e7eb";
const CRITICAL = "#d03b3b";
const axis = { tick: { fill: INK, fontSize: 11 }, stroke: GRID, tickLine: false };
const tooltipStyle = { contentStyle: { fontSize: 12, borderRadius: 6, borderColor: GRID }, labelStyle: { color: "#0b0b0b", fontWeight: 600 } };

/** Pareto on a single percentage axis: bar = share of total, line = cumulative share. */
export function ParetoChart({ rows, unit, height = 280 }: { rows: { label: string; value: number; share: number; cumulative: number; vital: boolean }[]; unit?: string; height?: number }) {
  if (!rows.length) return <p className="text-sm text-slate-500">No data to chart.</p>;
  const data = rows.map((r) => ({ ...r, share: +r.share.toFixed(1), cumulative: +r.cumulative.toFixed(1) }));
  return (
    <div style={{ height }} role="img" aria-label="Pareto chart of categories by share and cumulative share">
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="label" {...axis} interval={0} angle={-25} textAnchor="end" height={70} tickFormatter={(v: string) => (v.length > 22 ? v.slice(0, 21) + "…" : v)} />
          <YAxis {...axis} domain={[0, 100]} unit="%" width={44} />
          <Tooltip {...tooltipStyle} formatter={(v, n, p) => (n === "Share" ? [`${v}% (${(p as { payload?: { value: number } }).payload?.value} ${unit ?? ""})`, n] : [`${v}%`, n])} />
          <Legend wrapperStyle={{ fontSize: 12, color: INK }} verticalAlign="top" height={24} />
          <ReferenceLine y={80} stroke={INK} strokeDasharray="4 4" label={{ value: "80%", fill: INK, fontSize: 11, position: "right" }} />
          <Bar dataKey="share" name="Share" radius={[4, 4, 0, 0]} maxBarSize={48}>
            {data.map((d) => (
              <Cell key={d.label} fill={SERIES[0]} fillOpacity={d.vital ? 1 : 0.45} />
            ))}
          </Bar>
          <Line dataKey="cumulative" name="Cumulative" stroke={SERIES[1]} strokeWidth={2} dot={{ r: 4 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SimpleLineChart({ data, x, lines, height = 240, unit, refLines = [] }: { data: Record<string, unknown>[]; x: string; lines: { key: string; name: string }[]; height?: number; unit?: string; refLines?: { y: number; label: string; critical?: boolean }[] }) {
  if (!data.length) return <p className="text-sm text-slate-500">No data to chart.</p>;
  return (
    <div style={{ height }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 10, right: 40, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey={x} {...axis} />
          <YAxis {...axis} unit={unit} width={52} domain={["auto", "auto"]} />
          <Tooltip {...tooltipStyle} />
          {lines.length > 1 && <Legend wrapperStyle={{ fontSize: 12, color: INK }} verticalAlign="top" height={24} />}
          {refLines.map((r) => (
            <ReferenceLine key={r.label} y={r.y} stroke={r.critical ? CRITICAL : INK} strokeDasharray="4 4" label={{ value: r.label, fill: INK, fontSize: 10, position: "right" }} />
          ))}
          {lines.map((l, i) => (
            <Line key={l.key} dataKey={l.key} name={l.name} stroke={SERIES[i % 3]} strokeWidth={2} dot={{ r: 3 }} connectNulls />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Control chart: individuals with UCL/CL/LCL (control limits) and optional spec limits, out-of-control points in red. */
export function ControlChart({ points, center, ucl, lcl, lsl, usl, height = 260, unit }: { points: { label: string; value: number; signal: boolean }[]; center: number; ucl: number; lcl: number; lsl?: number | null; usl?: number | null; height?: number; unit?: string }) {
  const values = points.map((p) => p.value).concat([ucl, lcl], lsl ?? [], usl ?? []);
  const pad = (Math.max(...values) - Math.min(...values)) * 0.08 || 1;
  return (
    <div style={{ height }}>
      <ResponsiveContainer>
        <LineChart data={points} margin={{ top: 10, right: 60, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="label" {...axis} />
          <YAxis {...axis} width={56} unit={unit} domain={[Math.min(...values) - pad, Math.max(...values) + pad]} tickFormatter={(v: number) => v.toFixed(1)} />
          <Tooltip {...tooltipStyle} formatter={(v) => [Number(v).toFixed(3), "Value"]} />
          <ReferenceLine y={ucl} stroke={SERIES[1]} strokeDasharray="5 3" label={{ value: `UCL ${ucl.toFixed(2)}`, fill: INK, fontSize: 10, position: "right" }} />
          <ReferenceLine y={center} stroke={INK} label={{ value: `CL ${center.toFixed(2)}`, fill: INK, fontSize: 10, position: "right" }} />
          <ReferenceLine y={lcl} stroke={SERIES[1]} strokeDasharray="5 3" label={{ value: `LCL ${lcl.toFixed(2)}`, fill: INK, fontSize: 10, position: "right" }} />
          {typeof usl === "number" && <ReferenceLine y={usl} stroke={CRITICAL} strokeDasharray="2 2" label={{ value: `USL ${usl}`, fill: INK, fontSize: 10, position: "right" }} />}
          {typeof lsl === "number" && <ReferenceLine y={lsl} stroke={CRITICAL} strokeDasharray="2 2" label={{ value: `LSL ${lsl}`, fill: INK, fontSize: 10, position: "right" }} />}
          <Line
            dataKey="value"
            stroke={SERIES[0]}
            strokeWidth={2}
            dot={(p: { cx?: number; cy?: number; payload?: { signal: boolean }; index?: number }) => (
              <circle key={p.index} cx={p.cx} cy={p.cy} r={p.payload?.signal ? 5 : 3} fill={p.payload?.signal ? CRITICAL : SERIES[0]} stroke="#fff" strokeWidth={1.5} />
            )}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function XYScatter({ points, xLabel, yLabel, fit, height = 260 }: { points: { x: number; y: number; key: string }[]; xLabel: string; yLabel: string; fit?: { slope: number; intercept: number } | null; height?: number }) {
  const xs = points.map((p) => p.x);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const line = fit ? [{ x: minX, y: fit.intercept + fit.slope * minX }, { x: maxX, y: fit.intercept + fit.slope * maxX }] : [];
  return (
    <div style={{ height }}>
      <ResponsiveContainer>
        <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
          <CartesianGrid stroke={GRID} />
          <XAxis type="number" dataKey="x" name={xLabel} {...axis} domain={["auto", "auto"]} label={{ value: xLabel, position: "insideBottom", offset: -10, fill: INK, fontSize: 11 }} />
          <YAxis type="number" dataKey="y" name={yLabel} {...axis} domain={["auto", "auto"]} width={60} label={{ value: yLabel, angle: -90, position: "insideLeft", fill: INK, fontSize: 11 }} />
          <ZAxis range={[60, 60]} />
          <Tooltip {...tooltipStyle} cursor={{ strokeDasharray: "3 3" }} />
          <Scatter data={points} fill={SERIES[0]} name="Observations" />
          {fit && <Scatter data={line} line={{ stroke: SERIES[1], strokeWidth: 2 }} shape={() => <g />} name="Least-squares fit" legendType="none" />}
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

export function HBarChart({ data, height = 240, valueLabel = "Count" }: { data: { label: string; value: number }[]; height?: number; valueLabel?: string }) {
  if (!data.some((d) => d.value)) return <p className="text-sm text-slate-500">No data yet.</p>;
  return (
    <div style={{ height }}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 24, bottom: 0, left: 10 }}>
          <CartesianGrid horizontal={false} stroke={GRID} />
          <XAxis type="number" {...axis} allowDecimals={false} />
          <YAxis type="category" dataKey="label" {...axis} width={130} />
          <Tooltip {...tooltipStyle} formatter={(v) => [String(v), valueLabel]} />
          <Bar dataKey="value" fill={SERIES[0]} radius={[0, 4, 4, 0]} maxBarSize={20} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function StackedCategoryChart({ data, height = 240 }: { data: { label: string; confirmed: number; candidate: number }[]; height?: number }) {
  if (!data.some((d) => d.confirmed || d.candidate)) return <p className="text-sm text-slate-500">No causes recorded yet.</p>;
  return (
    <div style={{ height }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="label" {...axis} />
          <YAxis {...axis} allowDecimals={false} width={32} />
          <Tooltip {...tooltipStyle} />
          <Legend wrapperStyle={{ fontSize: 12, color: INK }} verticalAlign="top" height={24} />
          <Bar dataKey="confirmed" name="Confirmed" stackId="a" fill={SERIES[0]} stroke="#fff" strokeWidth={2} maxBarSize={44} />
          <Bar dataKey="candidate" name="Open candidates" stackId="a" fill={SERIES[2]} stroke="#fff" strokeWidth={2} radius={[4, 4, 0, 0]} maxBarSize={44} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
