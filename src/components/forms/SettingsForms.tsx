"use client";
import { useState } from "react";
import { addLineAction, addMemberAction, addPlantAction, changeRoleAction, removeMemberAction, updateOrgSettingsAction } from "@/app/actions";
import { Button, Card, Field } from "@/components/ui";
import { ROLES, ROLE_LABELS, type OrgSettings, type Plant, type ProductionLine, type Role } from "@/lib/types";
import { useAction } from "./useAction";

export function OrgSettingsForm({ name, settings, canEdit }: { name: string; settings: OrgSettings; canEdit: boolean }) {
  const { exec, pending, feedback } = useAction();
  return (
    <Card title="Organization & risk thresholds">
      {feedback}
      <form className="grid gap-3 md:grid-cols-3" onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        exec(() => updateOrgSettingsAction({ ...Object.fromEntries(f.entries()), use_action_priority: f.get("use_action_priority") === "on" }), { success: "Settings saved" });
      }}>
        <Field label="Organization name" htmlFor="o-name"><input id="o-name" name="name" className="input" defaultValue={name} disabled={!canEdit} /></Field>
        <Field label="RPN high-risk threshold" htmlFor="o-rpn" hint="Failure modes at or above this RPN are flagged"><input id="o-rpn" name="rpn_threshold" type="number" min={1} max={1000} className="input" defaultValue={settings.rpn_threshold} disabled={!canEdit} /></Field>
        <Field label="Severity escalation level" htmlFor="o-sev" hint="Flag regardless of RPN when severity ≥ this"><input id="o-sev" name="severity_escalation" type="number" min={1} max={10} className="input" defaultValue={settings.severity_escalation} disabled={!canEdit} /></Field>
        <Field label="Currency (ISO code)" htmlFor="o-cur"><input id="o-cur" name="currency" className="input" maxLength={3} defaultValue={settings.currency} disabled={!canEdit} /></Field>
        <Field label="Default downtime cost per hour" htmlFor="o-dt"><input id="o-dt" name="downtime_cost_per_hour" type="number" step="any" className="input" defaultValue={settings.downtime_cost_per_hour ?? ""} disabled={!canEdit} /></Field>
        <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" name="use_action_priority" defaultChecked={settings.use_action_priority} disabled={!canEdit} /> Use AIAG-VDA-style Action Priority</label>
        {canEdit && <div className="md:col-span-3 flex justify-end"><Button disabled={pending}>Save settings</Button></div>}
      </form>
    </Card>
  );
}

export function MembersPanel({ members, canManage, currentUserId, demo }: { members: { id: string; user_id: string; role: Role; name: string; email: string }[]; canManage: boolean; currentUserId: string; demo: boolean }) {
  const { exec, pending, feedback } = useAction();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("engineer");
  return (
    <Card title="Users & roles" description="Role-based access is enforced on the server and in the database (RLS).">
      {feedback}
      <table className="table-base text-sm">
        <thead><tr><th>User</th><th>Role</th><th /></tr></thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.id}>
              <td>{m.name}<p className="text-xs text-slate-500">{m.email}</p></td>
              <td>
                {canManage && m.user_id !== currentUserId ? (
                  <select aria-label={`Role for ${m.name}`} className="input w-64 py-1" value={m.role} disabled={pending} onChange={(e) => exec(() => changeRoleAction(m.id, e.target.value as Role), { success: "Role updated" })}>
                    {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                  </select>
                ) : ROLE_LABELS[m.role]}
              </td>
              <td>{canManage && m.user_id !== currentUserId && <Button size="sm" variant="ghost" className="text-red-600" onClick={() => confirm(`Remove ${m.name} from the organization?`) && exec(() => removeMemberAction(m.id))}>Remove</Button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {canManage && (
        <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); exec(() => addMemberAction({ email, role }), { success: "Member added", onOk: () => setEmail("") }); }}>
          <Field label="Add registered user by email" htmlFor="m-email"><input id="m-email" type="email" className="input w-72" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
          <Field label="Role" htmlFor="m-role"><select id="m-role" className="input" value={role} onChange={(e) => setRole(e.target.value as Role)}>{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</select></Field>
          <Button disabled={pending}>Add member</Button>
          <p className="w-full text-xs text-slate-500">{demo ? "Demo mode: only the seeded demo users exist." : "The person must first sign up; then add them here."}</p>
        </form>
      )}
    </Card>
  );
}

export function PlantsPanel({ plants, lines, canManage }: { plants: Plant[]; lines: ProductionLine[]; canManage: boolean }) {
  const { exec, pending, feedback } = useAction();
  const [plant, setPlant] = useState("");
  const [loc, setLoc] = useState("");
  const [line, setLine] = useState<Record<string, string>>({});
  return (
    <Card title="Plants & production lines">
      {feedback}
      <ul className="space-y-2 text-sm">
        {plants.map((p) => (
          <li key={p.id} className="rounded border border-slate-200 p-2">
            <p className="font-medium">{p.name} <span className="text-xs text-slate-500">{p.location}</span></p>
            <p className="text-xs text-slate-600">Lines: {lines.filter((l) => l.plant_id === p.id).map((l) => l.name).join(", ") || "none"}</p>
            {canManage && (
              <div className="mt-1 flex gap-2">
                <input aria-label={`New line for ${p.name}`} className="input py-1 text-xs" placeholder="New line name" value={line[p.id] ?? ""} onChange={(e) => setLine({ ...line, [p.id]: e.target.value })} />
                <Button size="sm" variant="secondary" disabled={pending} onClick={() => exec(() => addLineAction(p.id, line[p.id] ?? ""), { onOk: () => setLine({ ...line, [p.id]: "" }) })}>Add line</Button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {canManage && (
        <div className="mt-3 flex flex-wrap gap-2">
          <input aria-label="Plant name" className="input w-56" placeholder="Plant name" value={plant} onChange={(e) => setPlant(e.target.value)} />
          <input aria-label="Location" className="input w-44" placeholder="Location" value={loc} onChange={(e) => setLoc(e.target.value)} />
          <Button variant="secondary" disabled={pending} onClick={() => exec(() => addPlantAction(plant, loc), { onOk: () => { setPlant(""); setLoc(""); } })}>Add plant</Button>
        </div>
      )}
    </Card>
  );
}
