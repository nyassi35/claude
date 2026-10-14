import { METHOD_CATALOG } from "@/lib/rca/catalog";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "Methods guide" };

const GROUPS = { core: "Core RCA methods", analysis: "Analysis tools", data: "Data-driven tools", safety: "Safety & risk tools", closure: "Closure & recurrence prevention" } as const;

export default function MethodsGuide() {
  return (
    <>
      <PageHeader title="RCA methods guide" subtitle="Not every method suits every problem. The investigation overview recommends methods based on complexity, risk, data availability and objectives." />
      {(Object.keys(GROUPS) as (keyof typeof GROUPS)[]).map((g) => (
        <section key={g} className="mb-6">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-600">{GROUPS[g]}</h2>
          <div className="grid gap-3 lg:grid-cols-2">
            {METHOD_CATALOG.filter((m) => m.group === g).map((m) => (
              <article key={m.key} className="card p-4" id={m.key}>
                <h3 className="font-semibold text-slate-900">{m.name}</h3>
                <dl className="mt-2 space-y-1.5 text-sm">
                  <div><dt className="inline font-semibold">When useful: </dt><dd className="inline">{m.whenUseful}</dd></div>
                  <div><dt className="inline font-semibold">Input: </dt><dd className="inline">{m.inputs}</dd></div>
                  <div><dt className="inline font-semibold">How it works: </dt><dd className="inline">{m.how}</dd></div>
                  <div><dt className="inline font-semibold">Output: </dt><dd className="inline">{m.output}</dd></div>
                </dl>
              </article>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
