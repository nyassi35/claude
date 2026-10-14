export const dynamic = "force-dynamic";

import { Activity } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-slate-900 via-brand-950 to-slate-900 px-4 py-10">
      <div className="mb-6 flex items-center gap-2 text-white">
        <Activity className="h-7 w-7 text-brand-400" aria-hidden />
        <div>
          <p className="text-lg font-semibold leading-tight">RootCause AI</p>
          <p className="text-xs text-slate-300">Manufacturing Root Cause Analysis System</p>
        </div>
      </div>
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">{children}</div>
    </div>
  );
}
