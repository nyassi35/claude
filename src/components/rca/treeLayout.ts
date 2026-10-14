/** Simple tidy-tree layout: leaves are spaced evenly; parents centre over their children. */
export function layoutTree<T extends { id: string; parentId: string | null }>(nodes: T[], opts: { dx?: number; dy?: number; horizontal?: boolean } = {}) {
  const dx = opts.dx ?? 240;
  const dy = opts.dy ?? 120;
  const ids = new Set(nodes.map((n) => n.id));
  const children = new Map<string | null, T[]>();
  for (const n of nodes) {
    const p = n.parentId && ids.has(n.parentId) ? n.parentId : null;
    children.set(p, [...(children.get(p) ?? []), n]);
  }
  const pos = new Map<string, { x: number; y: number }>();
  let leaf = 0;
  const visit = (n: T, depth: number, seen: Set<string>): number => {
    if (seen.has(n.id)) return 0;
    seen.add(n.id);
    const kids = children.get(n.id) ?? [];
    let x: number;
    if (!kids.length) x = leaf++ * dx;
    else {
      const xs = kids.map((k) => visit(k, depth + 1, seen));
      x = (Math.min(...xs) + Math.max(...xs)) / 2;
    }
    pos.set(n.id, opts.horizontal ? { x: depth * dx, y: x * (dy / dx) } : { x, y: depth * dy });
    return x;
  };
  const seen = new Set<string>();
  for (const r of children.get(null) ?? []) visit(r, 1, seen);
  return pos;
}
