import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { listCapa } from "@/lib/services/capa";
import { listMembers } from "@/lib/services/admin";
import { CapaCard } from "@/components/investigation/CapaPanel";
import { capaCtx } from "@/lib/capa-ctx";
import { EmptyState, PageHeader } from "@/components/ui";
import { CAPA_STATUSES, type Cause, type Investigation } from "@/lib/types";
import { titleCase } from "@/lib/utils";

export const metadata = { title: "CAPA board" };

export default async function CapaBoard({ searchParams }: { searchParams: Promise<{ mine?: string; overdue?: string }> }) {
  const sp = await searchParams;
  const s = await requireSession();
  const [actions, members, invs, causes] = await Promise.all([
    listCapa(s, { mine: sp.mine === "1", overdue: sp.overdue === "1" }),
    listMembers(s),
    s.db.list<Investigation>("investigations"),
    s.db.list<Cause>("causes"),
  ]);
  const ctx = capaCtx(s, members);
  const num = (id: string) => invs.rows.find((i) => i.id === id)?.number;
  const filterLink = (label: string, q: string, active: boolean) => <Link href={q} className={`rounded-full px-3 py-1 text-sm ${active ? "bg-slate-800 text-white" : "bg-white ring-1 ring-slate-200"}`}>{label}</Link>;
  return (
    <>
      <PageHeader title="CAPA tracking board" subtitle={`${actions.length} action(s) across all investigations`} />
      <div className="mb-4 flex flex-wrap gap-2">
        {filterLink("All", "/capa", !sp.mine && !sp.overdue)}
        {filterLink("Assigned to me", "/capa?mine=1", sp.mine === "1")}
        {filterLink("Overdue", "/capa?overdue=1", sp.overdue === "1")}
      </div>
      {actions.length === 0 ? <EmptyState title="No actions match">Actions are created from the CAPA tab of an investigation.</EmptyState> : (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {CAPA_STATUSES.map((st) => {
            const col = actions.filter((a) => a.status === st);
            return (
              <section key={st} className="w-80 shrink-0 rounded-lg bg-slate-100 p-2" aria-label={titleCase(st)}>
                <h2 className="mb-2 flex justify-between px-1 text-xs font-semibold uppercase tracking-wide text-slate-600"><span>{titleCase(st)}</span><span>{col.length}</span></h2>
                <div className="space-y-2">
                  {col.map((a) => <CapaCard key={a.id} a={a} ctx={ctx} causes={causes.rows.filter((c) => c.investigation_id === a.investigation_id)} invId={a.investigation_id} number={num(a.investigation_id)} compact />)}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
