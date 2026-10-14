import { BUILTIN_TEMPLATES } from "@/lib/categories/templates";
import type { Plant, ProductionLine } from "@/lib/types";

/** GET-form filter bar (works without JavaScript; state lives in the URL). */
export function FilterBar({ params, plants, lines, extra, children }: { params: Record<string, string | undefined>; plants: Plant[]; lines: ProductionLine[]; extra?: boolean; children?: React.ReactNode }) {
  return (
    <form className="card mb-4 flex flex-wrap items-end gap-3 p-3" method="get">
      {children}
      <div>
        <label className="label" htmlFor="f-category">Category</label>
        <select id="f-category" name="category" defaultValue={params.category ?? ""} className="input w-56">
          <option value="">All categories</option>
          {BUILTIN_TEMPLATES.map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="f-plant">Plant</label>
        <select id="f-plant" name="plant" defaultValue={params.plant ?? ""} className="input w-44">
          <option value="">All plants</option>
          {plants.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="f-line">Line</label>
        <select id="f-line" name="line" defaultValue={params.line ?? ""} className="input w-44">
          <option value="">All lines</option>
          {lines.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </div>
      {extra && (
        <div>
          <label className="label" htmlFor="f-product">Product</label>
          <input id="f-product" name="product" defaultValue={params.product ?? ""} className="input w-40" placeholder="Contains…" />
        </div>
      )}
      <div>
        <label className="label" htmlFor="f-from">From</label>
        <input id="f-from" type="date" name="from" defaultValue={params.from ?? ""} className="input" />
      </div>
      <div>
        <label className="label" htmlFor="f-to">To</label>
        <input id="f-to" type="date" name="to" defaultValue={params.to ?? ""} className="input" />
      </div>
      <button className="inline-flex items-center rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700">Apply</button>
      <a href="?" className="px-2 py-2 text-sm text-slate-600 hover:underline">Reset</a>
    </form>
  );
}
