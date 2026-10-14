import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { cn, titleCase } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "success";
const variants: Record<Variant, string> = {
  primary: "bg-brand-600 text-white hover:bg-brand-700 shadow-sm",
  secondary: "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 shadow-sm",
  ghost: "text-slate-700 hover:bg-slate-100",
  danger: "bg-red-600 text-white hover:bg-red-700 shadow-sm",
  success: "bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm",
};
const btnBase =
  "inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-50";

export function Button({ variant = "primary", size, className, ...p }: ComponentProps<"button"> & { variant?: Variant; size?: "sm" }) {
  return <button className={cn(btnBase, variants[variant], size === "sm" && "px-2 py-1 text-xs", className)} {...p} />;
}

export function LinkButton({ variant = "primary", size, className, ...p }: ComponentProps<typeof Link> & { variant?: Variant; size?: "sm" }) {
  return <Link className={cn(btnBase, variants[variant], size === "sm" && "px-2 py-1 text-xs", className)} {...p} />;
}

export function Card({ className, title, actions, children, description }: { className?: string; title?: ReactNode; actions?: ReactNode; description?: ReactNode; children?: ReactNode }) {
  return (
    <section className={cn("card", className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <div>
            {title && <h2 className="text-sm font-semibold text-slate-900">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

const badgeColors = {
  slate: "bg-slate-100 text-slate-700 ring-slate-200",
  blue: "bg-blue-50 text-blue-700 ring-blue-200",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  red: "bg-red-50 text-red-700 ring-red-200",
  purple: "bg-violet-50 text-violet-700 ring-violet-200",
} as const;
export type BadgeColor = keyof typeof badgeColors;

export function Badge({ color = "slate", children, className, title }: { color?: BadgeColor; children: ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", badgeColors[color], className)}>
      {children}
    </span>
  );
}

const STATUS_COLORS: Record<string, BadgeColor> = {
  draft: "slate",
  open: "blue",
  in_analysis: "blue",
  awaiting_evidence: "amber",
  root_cause_confirmed: "purple",
  capa_in_progress: "purple",
  verification: "amber",
  closed: "green",
  cancelled: "slate",
  hypothesis: "slate",
  under_investigation: "amber",
  supported: "blue",
  confirmed: "green",
  rejected: "red",
  assigned: "blue",
  in_progress: "blue",
  pending_verification: "amber",
  effective: "green",
  ineffective: "red",
  low: "slate",
  medium: "amber",
  high: "red",
  critical: "red",
  urgent: "red",
  not_started: "slate",
  complete: "green",
  approved: "green",
  changes_requested: "amber",
};

export function StatusBadge({ value, className }: { value: string | null | undefined; className?: string }) {
  if (!value) return null;
  return (
    <Badge color={STATUS_COLORS[value] ?? "slate"} className={className}>
      {titleCase(value)}
    </Badge>
  );
}

export function Alert({ kind = "info", title, children, className }: { kind?: "info" | "warning" | "error" | "success"; title?: ReactNode; children?: ReactNode; className?: string }) {
  const map = {
    info: { c: "border-blue-200 bg-blue-50 text-blue-900", I: Info },
    warning: { c: "border-amber-200 bg-amber-50 text-amber-900", I: AlertTriangle },
    error: { c: "border-red-200 bg-red-50 text-red-900", I: XCircle },
    success: { c: "border-emerald-200 bg-emerald-50 text-emerald-900", I: CheckCircle2 },
  }[kind];
  const Icon = map.I;
  return (
    <div role={kind === "error" ? "alert" : "status"} className={cn("flex gap-2 rounded-md border px-3 py-2 text-sm", map.c, className)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="text-sm [&_ul]:ml-4 [&_ul]:list-disc">{children}</div>}
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
      {icon && <div className="mb-2 text-slate-400">{icon}</div>}
      <p className="text-sm font-semibold text-slate-800">{title}</p>
      {children && <div className="mt-1 max-w-md text-sm text-slate-500">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Field({ label, htmlFor, hint, error, children, className }: { label: ReactNode; htmlFor?: string; hint?: ReactNode; error?: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

export function Stat({ label, value, sub, tone = "slate", href }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "slate" | "red" | "amber" | "green" | "blue"; href?: string }) {
  const toneC = { slate: "text-slate-900", red: "text-red-600", amber: "text-amber-600", green: "text-emerald-600", blue: "text-brand-700" }[tone];
  const inner = (
    <div className="card h-full px-4 py-3 transition hover:border-brand-300">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={cn("mt-1 text-2xl font-semibold tabular-nums", toneC)}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}
