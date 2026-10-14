import type { Block, ReportSection } from "@/lib/report/model";

function BlockView({ b }: { b: Block }) {
  if (b.t === "p") return <p className="mb-2 text-sm">{b.text}</p>;
  if (b.t === "note") return <p className="mb-2 text-xs italic text-slate-500">{b.text}</p>;
  if (b.t === "list") return <ul className="mb-2 list-disc space-y-0.5 pl-5 text-sm">{b.items.map((x, i) => <li key={i}>{x}</li>)}</ul>;
  if (b.t === "kv")
    return (
      <dl className="mb-3 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[220px_1fr]">
        {b.rows.map(([k, v], i) => (
          <div key={i} className="contents"><dt className="font-medium text-slate-600">{k}</dt><dd className="whitespace-pre-wrap">{v}</dd></div>
        ))}
      </dl>
    );
  return (
    <div className="mb-3 overflow-x-auto">
      {b.caption && <p className="mb-1 text-xs font-semibold text-slate-600">{b.caption}</p>}
      <table className="table-base text-xs">
        <thead><tr>{b.head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>{b.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

export function ReportView({ title, subtitle, sections, generatedAt }: { title: string; subtitle: string; sections: ReportSection[]; generatedAt: string }) {
  return (
    <article className="card p-6 print:border-0 print:shadow-none">
      <header className="mb-6 border-b border-slate-200 pb-4">
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="text-sm text-slate-600">{subtitle}</p>
        <p className="mt-1 text-xs text-slate-500">Generated {generatedAt.slice(0, 16).replace("T", " ")} UTC. Causes are hypotheses unless marked Confirmed (evidence + approval).</p>
      </header>
      {sections.map((s, i) => (
        <section key={s.key} className="mb-6 break-inside-avoid-page">
          <h2 className="mb-2 text-base font-semibold text-slate-900">{i + 1}. {s.title}</h2>
          {s.blocks.map((b, j) => <BlockView key={j} b={b} />)}
        </section>
      ))}
    </article>
  );
}
