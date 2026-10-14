"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Activity, BookOpen, ClipboardCheck, FileSearch, LayoutDashboard, LogOut, Menu, Plus, Settings, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { switchOrgAction } from "@/app/actions";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/investigations", label: "Investigations", icon: FileSearch },
  { href: "/capa", label: "CAPA board", icon: ClipboardCheck },
  { href: "/methods", label: "Methods guide", icon: BookOpen },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar(props: {
  user: { name: string; email: string };
  roleLabel: string;
  orgId: string;
  orgs: { org_id: string; org_name: string }[];
  mode: "demo" | "supabase";
  canCreate: boolean;
}) {
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  async function signOut() {
    if (props.mode === "supabase") {
      await createSupabaseBrowserClient().auth.signOut();
      router.replace("/login");
      router.refresh();
    }
  }

  const content = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-4 py-4">
        <Activity className="h-6 w-6 text-brand-400" aria-hidden />
        <div>
          <p className="text-sm font-semibold text-white">RootCause AI</p>
          <p className="text-[11px] text-slate-400">Manufacturing RCA</p>
        </div>
      </div>
      <div className="px-3">
        {props.orgs.length > 1 ? (
          <select
            aria-label="Organization"
            className="w-full rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-white"
            value={props.orgId}
            disabled={pending}
            onChange={(e) => start(async () => { await switchOrgAction(e.target.value); router.refresh(); })}
          >
            {props.orgs.map((o) => (
              <option key={o.org_id} value={o.org_id}>{o.org_name}</option>
            ))}
          </select>
        ) : (
          <p className="truncate rounded-md bg-slate-800 px-2 py-1.5 text-sm text-white">{props.orgs[0]?.org_name}</p>
        )}
      </div>
      {props.canCreate && (
        <div className="px-3 pt-3">
          <Link href="/investigations/new" onClick={() => setOpen(false)} className="flex items-center justify-center gap-1.5 rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-500">
            <Plus className="h-4 w-4" aria-hidden /> New investigation
          </Link>
        </div>
      )}
      <nav className="mt-4 flex-1 space-y-0.5 px-2" aria-label="Main">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = path === href || path.startsWith(href + "/");
          return (
            <Link key={href} href={href} onClick={() => setOpen(false)} className={cn("flex items-center gap-2 rounded-md px-3 py-2 text-sm", active ? "bg-slate-800 text-white" : "text-slate-300 hover:bg-slate-800/60 hover:text-white")}>
              <Icon className="h-4 w-4" aria-hidden /> {label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-slate-800 px-4 py-3">
        <p className="truncate text-sm font-medium text-white">{props.user.name}</p>
        <p className="truncate text-xs text-slate-400">{props.roleLabel}</p>
        {props.mode === "demo" ? (
          <form action="/api/auth/demo" method="post" className="mt-2">
            <input type="hidden" name="action" value="logout" />
            <button className="flex items-center gap-1 text-xs text-slate-300 hover:text-white"><LogOut className="h-3.5 w-3.5" aria-hidden /> Switch user</button>
          </form>
        ) : (
          <button onClick={signOut} className="mt-2 flex items-center gap-1 text-xs text-slate-300 hover:text-white"><LogOut className="h-3.5 w-3.5" aria-hidden /> Sign out</button>
        )}
      </div>
    </div>
  );

  return (
    <>
      <div className="no-print sticky top-0 z-30 flex items-center justify-between bg-slate-900 px-4 py-2 lg:hidden">
        <span className="flex items-center gap-2 text-sm font-semibold text-white"><Activity className="h-5 w-5 text-brand-400" aria-hidden /> RootCause AI</span>
        <button aria-label={open ? "Close menu" : "Open menu"} onClick={() => setOpen(!open)} className="text-white">
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>
      {open && <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={() => setOpen(false)} />}
      <aside className={cn("no-print fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 transition-transform lg:translate-x-0", open ? "translate-x-0" : "-translate-x-full")}>{content}</aside>
    </>
  );
}
