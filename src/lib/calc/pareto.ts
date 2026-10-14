export interface ParetoInput {
  label: string;
  value: number;
}

export interface ParetoRow extends ParetoInput {
  share: number; // %
  cumulative: number; // %
  vital: boolean; // within the categories that make up ~80% of the total
}

/** Sorts categories descending and computes share and cumulative %. Negative or non-finite
 *  values are rejected (Pareto requires non-negative counts/costs). */
export function pareto(items: ParetoInput[], cutoff = 80): { rows: ParetoRow[]; total: number; errors: string[] } {
  const errors: string[] = [];
  const merged = new Map<string, number>();
  for (const it of items) {
    const label = it.label.trim();
    if (!label) continue;
    if (!Number.isFinite(it.value) || it.value < 0) {
      errors.push(`"${label}" has an invalid value (${it.value}); Pareto values must be non-negative numbers.`);
      continue;
    }
    merged.set(label, (merged.get(label) ?? 0) + it.value);
  }
  const sorted = [...merged.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  const total = sorted.reduce((a, b) => a + b.value, 0);
  let cum = 0;
  let reached = false;
  const rows = sorted.map((r) => {
    const share = total ? (r.value / total) * 100 : 0;
    const vital = !reached;
    cum += share;
    if (cum >= cutoff) reached = true;
    return { ...r, share, cumulative: cum, vital: total > 0 && vital };
  });
  return { rows, total, errors };
}
