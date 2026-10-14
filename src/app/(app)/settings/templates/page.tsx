import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { BUILTIN_TEMPLATES } from "@/lib/categories/templates";
import { templateOverrideSchema } from "@/lib/categories/engine";
import { TemplateEditor } from "@/components/forms/TemplateEditor";
import { Badge } from "@/components/ui";
import type { CategoryTemplateOverride } from "@/lib/types";
import { cn } from "@/lib/utils";

export const metadata = { title: "Category templates" };

export default async function TemplatesPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const sp = await searchParams;
  const s = await requireSession();
  const overrides = (await s.db.list<CategoryTemplateOverride>("category_templates")).rows;
  const key = sp.c && BUILTIN_TEMPLATES.some((t) => t.key === sp.c) ? sp.c : BUILTIN_TEMPLATES[0].key;
  const base = BUILTIN_TEMPLATES.find((t) => t.key === key)!;
  const row = overrides.find((o) => o.category_key === key);
  const parsed = row ? templateOverrideSchema.safeParse(row.config) : null;
  return (
    <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
      <nav className="card h-fit p-2" aria-label="Categories">
        {BUILTIN_TEMPLATES.map((t) => (
          <Link key={t.key} href={`?c=${t.key}`} className={cn("flex items-center justify-between rounded px-2 py-1.5 text-sm", t.key === key ? "bg-brand-50 font-medium text-brand-800" : "hover:bg-slate-50")}>
            {t.name}{overrides.some((o) => o.category_key === t.key) && <Badge color="blue">custom</Badge>}
          </Link>
        ))}
      </nav>
      <div>
        <h2 className="mb-3 text-lg font-semibold">{base.name}</h2>
        <TemplateEditor key={key + (row?.updated_at ?? "")} base={base} override={parsed?.success ? parsed.data : null} canEdit={can(s.role, "templates.manage")} />
      </div>
    </div>
  );
}
