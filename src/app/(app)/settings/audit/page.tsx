import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { listAudit, listMembers } from "@/lib/services/admin";
import { Alert, Card } from "@/components/ui";
import { fmtDate } from "@/lib/utils";
import { ForbiddenError } from "@/lib/db/types";

export const metadata = { title: "Audit trail" };

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const sp = await searchParams;
  const s = await requireSession();
  const page = Math.max(1, Number(sp.page) || 1);
  let data;
  try {
    data = await listAudit(s, { page });
  } catch (e) {
    if (e instanceof ForbiddenError) return <Alert kind="error">{e.message}</Alert>;
    throw e;
  }
  const members = await listMembers(s);
  const name = (id: string | null) => members.find((m) => m.user_id === id)?.profile?.full_name ?? (id ? id.slice(0, 8) : "system");
  return (
    <Card title="Audit trail" description="Every create, update and delete on investigation records is logged with actor, timestamp and changed fields. Records are append-only.">
      <div className="overflow-x-auto">
        <table className="table-base min-w-[900px] text-xs">
          <thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Record</th><th>Investigation</th><th>Changes</th></tr></thead>
          <tbody>
            {data.rows.map((a) => (
              <tr key={a.id}>
                <td className="whitespace-nowrap">{fmtDate(a.created_at, true)}</td>
                <td>{name(a.actor_id)}</td>
                <td className="font-medium uppercase">{a.action}</td>
                <td>{a.table_name}<br /><span className="font-mono text-[10px] text-slate-500">{a.record_id?.slice(0, 8)}</span></td>
                <td>{a.investigation_id ? <Link className="text-brand-700 hover:underline" href={`/investigations/${a.investigation_id}`}>open</Link> : "—"}</td>
                <td className="max-w-md break-words font-mono text-[10px] text-slate-600">{a.action === "update" ? Object.entries(a.details).map(([k, v]) => `${k}: ${JSON.stringify((v as { from: unknown }).from)?.slice(0, 40)} → ${JSON.stringify((v as { to: unknown }).to)?.slice(0, 60)}`).join("; ") : a.action === "insert" ? "created" : "deleted"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex justify-between text-sm">
        <span className="text-slate-500">{data.count} events</span>
        <span className="flex gap-3">{page > 1 && <Link href={`?page=${page - 1}`} className="text-brand-700">← Newer</Link>}{page * 50 < data.count && <Link href={`?page=${page + 1}`} className="text-brand-700">Older →</Link>}</span>
      </div>
    </Card>
  );
}
