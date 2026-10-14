import { classifyFmeaRisk } from "@/lib/calc/fmea";
import { pareto } from "@/lib/calc/pareto";
import type { CapaAction, Cause, FmeaItem, Investigation, Measurement, RcaAnalysis } from "@/lib/types";
import { isOverdue, today } from "./capa";
import type { Ctx } from "./context";

export interface DashboardFilters {
  category?: string;
  plant?: string;
  line?: string;
  product?: string;
  from?: string;
  to?: string;
}

const OPEN = ["draft", "open", "in_analysis", "awaiting_evidence", "root_cause_confirmed", "capa_in_progress", "verification"];

/** Org-wide aggregates. Loads the org's records and aggregates in memory — adequate for
 *  thousands of investigations; move to SQL views for larger datasets. */
export async function dashboardData(ctx: Ctx, f: DashboardFilters) {
  const filter: Record<string, string> = {};
  if (f.category) filter.category_key = f.category;
  if (f.plant) filter.plant_id = f.plant;
  if (f.line) filter.line_id = f.line;
  const ranges = f.from || f.to ? [{ column: "created_at", gte: f.from || undefined, lte: f.to ? `${f.to}T23:59:59` : undefined }] : [];
  let invs = (await ctx.db.list<Investigation>("investigations", filter, { ranges })).rows;
  if (f.product) invs = invs.filter((i) => (i.product ?? "").toLowerCase().includes(f.product!.toLowerCase()));
  const ids = invs.map((i) => i.id);
  const inIds = ids.length ? { investigation_id: ids } : null;
  const [causes, capa, fmea, analyses, measurements] = inIds
    ? await Promise.all([
        ctx.db.list<Cause>("causes", inIds),
        ctx.db.list<CapaAction>("capa_actions", inIds),
        ctx.db.list<FmeaItem>("fmea_items", inIds),
        ctx.db.list<RcaAnalysis>("rca_analyses", { ...inIds, method: "pareto" }),
        ctx.db.list<Measurement>("measurements", { ...inIds, parameter: ["Downtime", "Stoppage minutes per day"] }),
      ]).then((r) => r.map((x) => x.rows))
    : [[], [], [], [], []];

  const now = today();
  const open = invs.filter((i) => OPEN.includes(i.status));
  const overdueInv = open.filter((i) => i.due_date && i.due_date < now);
  const confirmed = (causes as Cause[]).filter((c) => c.status === "confirmed");
  const awaiting = invs.filter((i) => i.status === "awaiting_evidence");
  const highRisk = (fmea as FmeaItem[]).filter((r) => classifyFmeaRisk(r, ctx.settings).highRisk);
  const actions = capa as CapaAction[];
  const done = actions.filter((a) => ["effective", "closed"].includes(a.status));
  const verified = actions.filter((a) => ["effective", "ineffective", "closed"].includes(a.status));
  const effective = actions.filter((a) => a.status === "effective" || (a.status === "closed" && a.actual_result));

  // Recurring problems: same category + problem type appearing ≥2 times, or flagged previous occurrence
  const groups = new Map<string, Investigation[]>();
  for (const i of invs) {
    const k = `${i.category_key}|${i.problem?.problem_type ?? "unspecified"}`;
    groups.set(k, [...(groups.get(k) ?? []), i]);
  }
  const recurring = [...groups.entries()]
    .filter(([, list]) => list.length > 1 || list.some((x) => x.problem?.previous_occurrence === "yes"))
    .map(([k, list]) => ({ key: k, category: k.split("|")[0], problemType: k.split("|")[1], count: list.length, investigations: list.map((x) => ({ id: x.id, number: x.number, title: x.title })) }));

  // Trends by month from KPI actuals (downtime / scrap) and measurements
  const byMonth = new Map<string, { month: string; downtime: number; scrap: number; opened: number; closed: number }>();
  const bucket = (iso: string) => {
    const m = iso.slice(0, 7);
    if (!byMonth.has(m)) byMonth.set(m, { month: m, downtime: 0, scrap: 0, opened: 0, closed: 0 });
    return byMonth.get(m)!;
  };
  for (const i of invs) {
    bucket(i.created_at).opened++;
    if (i.closed_at) bucket(i.closed_at).closed++;
    for (const k of i.kpis ?? []) {
      if (k.key === "downtime" && typeof k.actual === "number") bucket(i.occurred_at ?? i.created_at).downtime += k.actual;
      if (k.key === "scrap" && typeof k.actual === "number") bucket(i.occurred_at ?? i.created_at).scrap += k.actual;
    }
  }
  for (const m of measurements as Measurement[]) {
    if (!m.measured_at) continue;
    const hours = m.unit === "min" ? m.value / 60 : m.value;
    bucket(m.measured_at).downtime += hours;
  }
  const trends = [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month)).map((t) => ({ ...t, downtime: Math.round(t.downtime * 10) / 10 }));

  // Defect / failure Pareto across investigations (from Pareto analyses)
  const paretoItems = (analyses as RcaAnalysis[]).flatMap((a) => ((a.data as { items?: { label: string; value: number }[] }).items ?? []));
  const defectPareto = pareto(paretoItems).rows.slice(0, 10);

  const categoryDist = ["manpower", "machine", "method", "material", "measurement", "environment"].map((c) => ({
    category: c,
    confirmed: confirmed.filter((x) => x.category === c).length,
    candidate: (causes as Cause[]).filter((x) => x.category === c && x.status !== "confirmed" && x.status !== "rejected").length,
  }));

  const statusDist = OPEN.concat(["closed", "cancelled"]).map((s) => ({ status: s, count: invs.filter((i) => i.status === s).length })).filter((x) => x.count);

  return {
    kpis: {
      total: invs.length,
      open: open.length,
      overdue: overdueInv.length,
      confirmedCauses: confirmed.length,
      awaitingEvidence: awaiting.length,
      highRiskFailureModes: highRisk.length,
      capaTotal: actions.length,
      capaOverdue: actions.filter((a) => isOverdue(a, now)).length,
      capaCompletionRate: actions.length ? Math.round((done.length / actions.length) * 100) : null,
      capaEffectivenessRate: verified.length ? Math.round((effective.length / verified.length) * 100) : null,
    },
    recurring,
    trends,
    defectPareto,
    categoryDist,
    statusDist,
    highRisk: highRisk
      .sort((a, b) => b.rpn - a.rpn)
      .slice(0, 8)
      .map((r) => ({ ...r, number: invs.find((i) => i.id === r.investigation_id)?.number, reasons: classifyFmeaRisk(r, ctx.settings).reasons })),
    overdueActions: actions.filter((a) => isOverdue(a, now)).slice(0, 8).map((a) => ({ ...a, number: invs.find((i) => i.id === a.investigation_id)?.number })),
    recent: [...invs].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 6),
  };
}
