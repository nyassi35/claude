import Link from "next/link";
import * as Icons from "lucide-react";
import { requireSession } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { BUILTIN_TEMPLATES } from "@/lib/categories/templates";
import { listMembers, listPlants } from "@/lib/services/admin";
import { Alert, Card, PageHeader } from "@/components/ui";
import { ContextForm } from "@/components/forms/ContextForm";

export const metadata = { title: "New investigation" };

export default async function NewInvestigation({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const { category } = await searchParams;
  const s = await requireSession();
  if (!can(s.role, "investigation.create")) return <Alert kind="error" title="Not permitted">Your role cannot create investigations.</Alert>;
  const tpl = BUILTIN_TEMPLATES.find((t) => t.key === category);
  if (!tpl) {
    return (
      <>
        <PageHeader title="New investigation" subtitle="Step 1 of 5 — choose the production category. Questions, parameters and failure modes adapt to it." />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {BUILTIN_TEMPLATES.map((t) => {
            const Icon = (Icons as unknown as Record<string, Icons.LucideIcon>)[t.icon] ?? Icons.Factory;
            return (
              <Link key={t.key} href={`?category=${t.key}`} className="card group flex flex-col gap-2 p-4 transition hover:border-brand-400 hover:shadow-md" data-testid={`category-${t.key}`}>
                <Icon className="h-6 w-6 text-brand-600" aria-hidden />
                <p className="font-medium text-slate-900 group-hover:text-brand-700">{t.name}</p>
                <p className="text-xs text-slate-500">{t.description}</p>
              </Link>
            );
          })}
        </div>
      </>
    );
  }
  const [{ plants, lines }, members] = await Promise.all([listPlants(s), listMembers(s)]);
  return (
    <>
      <PageHeader title="New investigation" subtitle="Step 1 of 5 — production context" actions={<Link className="text-sm text-brand-700 hover:underline" href="/investigations/new">Change category</Link>} />
      <Card>
        <ContextForm
          categoryKey={tpl.key}
          categoryName={tpl.name}
          plants={plants}
          lines={lines}
          members={members.map((m) => ({ user_id: m.user_id, name: m.profile?.full_name || m.profile?.email || m.user_id }))}
          canAssign={can(s.role, "investigation.assign")}
          currentUserId={s.user.id}
        />
      </Card>
    </>
  );
}
