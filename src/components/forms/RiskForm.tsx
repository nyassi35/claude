"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveRiskAction, saveWizardStepAction } from "@/app/actions";
import { Alert, Badge, Button, Field } from "@/components/ui";
import { computeMetrics, riskSummary } from "@/lib/calc/metrics";
import { RISK_DIMENSIONS, type CostInputs, type Investigation, type RiskAssessment, type RiskDimension } from "@/lib/types";
import { fmtNum, titleCase } from "@/lib/utils";
import { useAction } from "./useAction";

const RISK_LABELS: Record<RiskDimension, string> = {
  product_quality: "Product quality",
  process_reliability: "Process reliability",
  equipment: "Equipment & operations",
  safety: "Worker safety",
  environmental: "Environmental",
  regulatory: "Regulatory & compliance",
  customer: "Customer impact",
  delivery: "Production & delivery",
  financial: "Financial",
};
const SCALE = ["", "1 Negligible", "2 Minor", "3 Moderate", "4 Major", "5 Severe"];

const COST_FIELDS: { key: keyof CostInputs; label: string; unit: string }[] = [
  { key: "units_produced", label: "Units produced", unit: "units" },
  { key: "units_defective", label: "Units defective", unit: "units" },
  { key: "first_pass_good", label: "Good first time", unit: "units" },
  { key: "units_scrapped", label: "Units / kg scrapped", unit: "units" },
  { key: "unit_cost", label: "Cost per unit", unit: "currency" },
  { key: "units_reworked", label: "Units reworked", unit: "units" },
  { key: "rework_cost_per_unit", label: "Rework cost per unit", unit: "currency" },
  { key: "downtime_hours", label: "Downtime", unit: "h" },
  { key: "downtime_cost_per_hour", label: "Downtime cost per hour", unit: "currency/h" },
  { key: "planned_time_h", label: "Planned production time", unit: "h" },
  { key: "run_time_h", label: "Run time", unit: "h" },
  { key: "ideal_cycle_time_s", label: "Ideal cycle time", unit: "s/unit" },
  { key: "total_count", label: "Total count (OEE)", unit: "units" },
  { key: "good_count", label: "Good count (OEE)", unit: "units" },
  { key: "external_failure_cost", label: "External failure cost (claims, returns)", unit: "currency" },
  { key: "appraisal_cost", label: "Appraisal cost (inspection, testing)", unit: "currency" },
  { key: "prevention_cost", label: "Prevention cost", unit: "currency" },
  { key: "expected_reduction_pct", label: "Expected reduction after actions", unit: "%" },
];

export function RiskForm({ inv, mode, currency, readOnly }: { inv: Investigation; mode: "wizard" | "page"; currency: string; readOnly?: boolean }) {
  const router = useRouter();
  const [risk, setRisk] = useState<RiskAssessment>({ notes: {}, cost_inputs: {}, ...inv.risk, ratings: inv.risk?.ratings ?? {} });
  const { exec, pending, feedback } = useAction();
  const summary = riskSummary(risk.ratings);
  const metrics = computeMetrics(risk.cost_inputs ?? {}, currency);
  const save = () =>
    exec(() => (mode === "wizard" ? saveWizardStepAction(inv.id, 5, risk) : saveRiskAction(inv.id, risk)), {
      success: "Risk assessment saved",
      onOk: () => mode === "wizard" && router.push(`/investigations/${inv.id}`),
    });
  return (
    <div className="space-y-5">
      {feedback}
      <Alert kind="info">
        Rate each dimension 1–5 based on the actual or credible potential consequence. Ratings of 4–5 for safety, environment, product quality or regulatory compliance trigger escalation.
        The software never replaces emergency procedures or authorised safety and quality decisions.
      </Alert>
      <div className="grid gap-3 md:grid-cols-3">
        {RISK_DIMENSIONS.map((d) => (
          <div key={d} className="rounded-md border border-slate-200 p-3">
            <label className="mb-1 block text-sm font-medium" htmlFor={`risk-${d}`}>{RISK_LABELS[d]}</label>
            <select id={`risk-${d}`} className="input" value={risk.ratings[d] ?? ""} disabled={readOnly} onChange={(e) => {
              const ratings = { ...risk.ratings };
              if (e.target.value) ratings[d] = Number(e.target.value); else delete ratings[d];
              setRisk({ ...risk, ratings });
            }}>
              <option value="">Not assessed</option>
              {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{SCALE[n]}</option>)}
            </select>
            <input aria-label={`${RISK_LABELS[d]} note`} className="input mt-1.5 text-xs" placeholder="Basis for rating" value={risk.notes?.[d] ?? ""} disabled={readOnly} onChange={(e) => setRisk({ ...risk, notes: { ...risk.notes, [d]: e.target.value } })} />
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3 rounded-md bg-slate-50 p-3 text-sm">
        <span>Overall risk level: <Badge color={summary.level === "critical" || summary.level === "high" ? "red" : summary.level === "medium" ? "amber" : "slate"}>{titleCase(summary.level)}</Badge></span>
        <span className="text-slate-500">({summary.rated}/9 dimensions rated; overall = highest rating)</span>
        {summary.escalate.length > 0 && <Badge color="red">Escalation: {summary.escalate.map(titleCase).join(", ")}</Badge>}
      </div>
      {summary.escalate.length > 0 && (
        <div className="space-y-2 rounded-md border border-red-200 bg-red-50 p-3">
          <label className="flex items-center gap-2 text-sm font-medium text-red-900">
            <input type="checkbox" checked={!!risk.escalated} disabled={readOnly} onChange={(e) => setRisk({ ...risk, escalated: e.target.checked })} />
            Escalated to the responsible authority (safety / quality / environment manager)
          </label>
          <input aria-label="Escalation note" className="input" placeholder="Who was notified, when, reference" value={risk.escalation_note ?? ""} disabled={readOnly} onChange={(e) => setRisk({ ...risk, escalation_note: e.target.value })} />
        </div>
      )}
      <div>
        <h3 className="mb-2 text-sm font-semibold">Impact data (optional — metrics are calculated only when their inputs are present)</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {COST_FIELDS.map((f) => (
            <Field key={f.key} label={`${f.label} (${f.unit === "currency" ? currency : f.unit.replace("currency", currency)})`} htmlFor={`cost-${f.key}`}>
              <input id={`cost-${f.key}`} type="number" step="any" className="input" disabled={readOnly} value={risk.cost_inputs?.[f.key] ?? ""} onChange={(e) => setRisk({ ...risk, cost_inputs: { ...risk.cost_inputs, [f.key]: e.target.value === "" ? null : Number(e.target.value) } })} />
            </Field>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="table-base min-w-[700px]">
          <thead><tr><th>Metric</th><th>Value</th><th>Formula</th><th>Assumptions / status</th></tr></thead>
          <tbody>
            {metrics.map((m) => (
              <tr key={m.key}>
                <td className="font-medium">{m.label}{m.estimate && <Badge color="amber" className="ml-1">estimate</Badge>}</td>
                <td className="whitespace-nowrap font-semibold tabular-nums">{m.value !== null ? `${fmtNum(m.value)} ${m.unit}` : "—"}</td>
                <td className="font-mono text-xs text-slate-600">{m.formula}</td>
                <td className="text-xs">
                  {m.invalid && <p className="text-red-700">{m.invalid}</p>}
                  {m.value === null && !m.invalid && m.missing.length > 0 && <p className="text-slate-500">Not calculated — missing: {m.missing.join(", ")}</p>}
                  {m.value !== null && m.missing.length > 0 && <p className="text-amber-700">Partial — missing: {m.missing.join(", ")}</p>}
                  {m.assumptions.map((a) => <p key={a} className="text-slate-500">{a}</p>)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!readOnly && (
        <div className="flex justify-end">
          <Button onClick={save} disabled={pending}>{pending ? "Saving…" : mode === "wizard" ? "Save & finish intake" : "Save risk assessment"}</Button>
        </div>
      )}
    </div>
  );
}
