import Link from "next/link";
import { loadInvestigation } from "@/lib/investigation-context";
import { can, canEditInvestigation } from "@/lib/auth/permissions";
import { listPlants } from "@/lib/services/admin";
import { Alert, Card } from "@/components/ui";
import { ContextForm } from "@/components/forms/ContextForm";
import { FollowUpForm, ProblemForm, ProcessForm } from "@/components/forms/WizardForms";
import { RiskForm } from "@/components/forms/RiskForm";
import { cn } from "@/lib/utils";

const STEPS = ["Production context", "Problem definition", "Process information", "Follow-up questions", "Risk & impact"];

export default async function Intake({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ step?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const d = await loadInvestigation(id);
  const { s, investigation: inv, template } = d;
  const step = Math.min(5, Math.max(1, Number(sp.step) || Math.min(inv.wizard_step, 5)));
  const closed = inv.status === "closed" || inv.status === "cancelled";
  const readOnly = closed || !canEditInvestigation(s.role, s.user.id, inv);
  const { plants, lines } = step === 1 ? await listPlants(s) : { plants: [], lines: [] };
  return (
    <div className="space-y-4">
      <ol className="flex flex-wrap gap-2" aria-label="Intake steps">
        {STEPS.map((label, i) => (
          <li key={label}>
            <Link href={`?step=${i + 1}`} aria-current={step === i + 1 ? "step" : undefined} className={cn("flex items-center gap-2 rounded-full border px-3 py-1 text-xs", step === i + 1 ? "border-brand-600 bg-brand-50 font-medium text-brand-800" : i + 1 < inv.wizard_step ? "border-emerald-300 text-emerald-800" : "border-slate-200 text-slate-600")}>
              <span className="font-semibold">{i + 1}</span> {label}
            </Link>
          </li>
        ))}
      </ol>
      {readOnly && <Alert kind="info">{closed ? "This investigation is closed; intake data is read-only." : "You can view but not edit this intake (operators may edit only their own drafts)."}</Alert>}
      <Card title={`Step ${step}: ${STEPS[step - 1]}`} description="Progress is saved per step — you can leave and resume later.">
        {step === 1 && (readOnly ? <p className="text-sm text-slate-600">Context editing is not available.</p> : (
          <ContextForm
            categoryKey={inv.category_key}
            categoryName={template.name}
            plants={plants}
            lines={lines}
            members={d.members.map((m) => ({ user_id: m.user_id, name: m.profile?.full_name || m.profile?.email || m.user_id }))}
            canAssign={can(s.role, "investigation.assign")}
            currentUserId={s.user.id}
            investigation={inv}
          />
        ))}
        {step === 2 && <ProblemForm inv={inv} template={template} readOnly={readOnly} />}
        {step === 3 && <ProcessForm inv={inv} template={template} readOnly={readOnly} />}
        {step === 4 && <FollowUpForm inv={inv} template={template} readOnly={readOnly} />}
        {step === 5 && <RiskForm inv={inv} mode="wizard" currency={s.settings.currency} readOnly={readOnly} />}
      </Card>
      {step === 3 && template.suggestions.length > 0 && (
        <Card title="Investigation suggestions for this category">
          <ul className="list-disc space-y-1 pl-5 text-sm">{template.suggestions.map((x) => <li key={x}>{x}</li>)}</ul>
          <p className="mt-3 text-xs text-slate-500">Typical hazards: {template.hazards.join(", ") || "—"} · Quality characteristics: {template.qualityCharacteristics.join(", ") || "—"}</p>
        </Card>
      )}
    </div>
  );
}
