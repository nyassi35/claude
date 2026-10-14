"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function InvestigationTabs({ id, tabs }: { id: string; tabs: { slug: string; label: string; badge?: number }[] }) {
  const path = usePathname();
  return (
    <nav aria-label="Investigation sections" className="no-print -mx-4 mb-5 overflow-x-auto border-b border-slate-200 px-4 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-1">
        {tabs.map((t) => {
          const href = `/investigations/${id}${t.slug ? `/${t.slug}` : ""}`;
          const active = t.slug ? path.startsWith(href) : path === href;
          return (
            <li key={t.slug}>
              <Link href={href} className={cn("inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm", active ? "border-brand-600 font-medium text-brand-700" : "border-transparent text-slate-600 hover:text-slate-900")}>
                {t.label}
                {t.badge ? <span className="rounded-full bg-slate-100 px-1.5 text-[11px] text-slate-600">{t.badge}</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
