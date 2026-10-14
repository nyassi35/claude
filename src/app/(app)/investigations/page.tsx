import Link from "next/link";
import { FileSearch, Plus } from "lucide-react";
import { requireSession } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { listInvestigations } from "@/lib/services/investigations";
import { listPlants } from "@/lib/services/admin";
import { EmptyState, LinkButton, PageHeader, StatusBadge } from "@/components/ui";
import { FilterBar } from "@/components/forms/FilterBar";
import { INVESTIGATION_STATUSES, SEVERITIES } from "@/lib/types";
import { getBuiltinTemplate } from "@/lib/categories/engine";
import { fmtDate, titleCase } from "@/lib/utils";

export const metadata = { title: "Investigations" };

export default async function InvestigationsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const s = await requireSession();
  const page = Math.max(1, Number(sp.page) || 1);
  const pageSize = 15;
  const [{ rows, count }, ref] = await Promise.all([
    listInvestigations(s, { ...sp, page, pageSize, dir: sp.dir === "asc" ? "asc" : "desc" }),
    listPlants(s),
  ]);
  const pages = Math.max(1, Math.ceil(count / pageSize));
  const qs = (patch: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams(Object.entries({ ...sp, ...patch }).filter(([, v]) => v !== undefined && v !== "") as [string, string][]);
    return `?${p.toString()}`;
  };
  const sortLink = (col: string, label: string) => {
    const active = (sp.sort ?? "created_at") === col;
    const dir = active && sp.dir !== "asc" ? "asc" : "desc";
    return <Link href={qs({ sort: col, dir, page: 1 })} className="hover:underline">{label}{active ? (sp.dir === "asc" ? " ▲" : " ▼") : ""}</Link>;
  };
  return (
    <>
      <PageHeader
        title="Investigations"
        subtitle={`${count} investigation${count === 1 ? "" : "s"}`}
        actions={can(s.role, "investigation.create") && <LinkButton href="/investigations/new"><Plus className="h-4 w-4" /> New investigation</LinkButton>}
      />
      <FilterBar params={sp} plants={ref.plants} lines={ref.lines}>
        <div>
          <label className="label" htmlFor="q">Search</label>
          <input id="q" name="q" defaultValue={sp.q ?? ""} className="input w-56" placeholder="Title, number, product, batch…" />
        </div>
        <div>
          <label className="label" htmlFor="status">Status</label>
          <select id="status" name="status" defaultValue={sp.status ?? ""} className="input w-44">
            <option value="">All statuses</option>
            {INVESTIGATION_STATUSES.map((x) => <option key={x} value={x}>{titleCase(x)}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="severity">Severity</label>
          <select id="severity" name="severity" defaultValue={sp.severity ?? ""} className="input w-32">
            <option value="">Any</option>
            {SEVERITIES.map((x) => <option key={x} value={x}>{titleCase(x)}</option>)}
          </select>
        </div>
      </FilterBar>
      {rows.length === 0 ? (
        <EmptyState icon={<FileSearch className="h-8 w-8" />} title={sp.q || sp.status || sp.category ? "No investigations match your filters" : "No investigations yet"} action={can(s.role, "investigation.create") && <LinkButton href="/investigations/new">Start an investigation</LinkButton>}>
          Investigations guide you from problem definition through verified root causes to effective CAPA.
        </EmptyState>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table-base min-w-[860px]">
            <thead>
              <tr>
                <th>{sortLink("number", "No.")}</th>
                <th>{sortLink("title", "Title")}</th>
                <th>Category</th>
                <th>{sortLink("severity", "Severity")}</th>
                <th>{sortLink("status", "Status")}</th>
                <th>{sortLink("occurred_at", "Occurred")}</th>
                <th>{sortLink("due_date", "Due")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="whitespace-nowrap font-mono text-xs">{r.number}</td>
                  <td>
                    <Link href={`/investigations/${r.id}`} className="font-medium text-brand-700 hover:underline">{r.title}</Link>
                    <p className="text-xs text-slate-500">{[r.product, r.batch_number, r.asset_id].filter(Boolean).join(" · ")}</p>
                  </td>
                  <td className="text-xs">{getBuiltinTemplate(r.category_key).name}</td>
                  <td><StatusBadge value={r.severity} /></td>
                  <td><StatusBadge value={r.status} /></td>
                  <td className="whitespace-nowrap text-xs">{fmtDate(r.occurred_at)}</td>
                  <td className="whitespace-nowrap text-xs">{fmtDate(r.due_date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center justify-between px-3 py-2 text-sm">
            <span className="text-slate-500">Page {page} of {pages}</span>
            <div className="flex gap-2">
              {page > 1 && <Link className="text-brand-700 hover:underline" href={qs({ page: page - 1 })}>← Previous</Link>}
              {page < pages && <Link className="text-brand-700 hover:underline" href={qs({ page: page + 1 })}>Next →</Link>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
