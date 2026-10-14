import Link from "next/link";
import { PageHeader } from "@/components/ui";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PageHeader title="Settings" />
      <nav className="mb-4 flex gap-3 border-b border-slate-200 text-sm">
        <Link href="/settings" className="px-1 pb-2 hover:text-brand-700">Organization & users</Link>
        <Link href="/settings/templates" className="px-1 pb-2 hover:text-brand-700">Category templates</Link>
        <Link href="/settings/audit" className="px-1 pb-2 hover:text-brand-700">Audit trail</Link>
      </nav>
      {children}
    </>
  );
}
