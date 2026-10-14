"use client";
import { useState } from "react";
import { changeStatusAction, deleteInvestigationAction, signApprovalAction } from "@/app/actions";
import { Button } from "@/components/ui";
import { INVESTIGATION_STATUSES } from "@/lib/types";
import { titleCase } from "@/lib/utils";
import { useAction } from "@/components/forms/useAction";

export function StatusControl({ id, status, canClose, canEdit, canDelete }: { id: string; status: string; canClose: boolean; canEdit: boolean; canDelete: boolean }) {
  const [next, setNext] = useState(status);
  const [reason, setReason] = useState("");
  const { exec, pending, feedback } = useAction();
  const options = INVESTIGATION_STATUSES.filter((s) => (["closed", "cancelled"].includes(s) || status === "closed" ? canClose : canEdit));
  if (!options.length) return <p className="text-sm text-slate-500">Your role cannot change the status.</p>;
  return (
    <div className="space-y-2">
      {feedback}
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="label" htmlFor="next-status">Change status</label>
          <select id="next-status" className="input w-56" value={next} onChange={(e) => setNext(e.target.value)}>
            {options.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
          </select>
        </div>
        <div className="min-w-[200px] flex-1">
          <label className="label" htmlFor="reason">Reason / note</label>
          <input id="reason" className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Required to cancel, reopen, or close without a confirmed cause" />
        </div>
        <Button disabled={pending || next === status} onClick={() => exec(() => changeStatusAction(id, { status: next, reason }), { success: "Status updated" })}>Update</Button>
        {canDelete && (
          <Button variant="ghost" className="text-red-600" disabled={pending} onClick={() => confirm("Delete this investigation and all its records? This cannot be undone.") && exec(() => deleteInvestigationAction(id))}>
            Delete
          </Button>
        )}
      </div>
    </div>
  );
}

export function SignOffForm({ id, recordType = "report", recordId }: { id: string; recordType?: string; recordId?: string }) {
  const [comment, setComment] = useState("");
  const [decision, setDecision] = useState("approved");
  const { exec, pending, feedback } = useAction();
  return (
    <div className="space-y-2">
      {feedback}
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="label" htmlFor="decision">Decision</label>
          <select id="decision" className="input" value={decision} onChange={(e) => setDecision(e.target.value)}>
            <option value="approved">Approve</option>
            <option value="changes_requested">Request changes</option>
            <option value="rejected">Reject</option>
          </select>
        </div>
        <div className="min-w-[200px] flex-1">
          <label className="label" htmlFor="comment">Comment</label>
          <input id="comment" className="input" value={comment} onChange={(e) => setComment(e.target.value)} />
        </div>
        <Button variant="secondary" disabled={pending} onClick={() => exec(() => signApprovalAction(id, { record_type: recordType, record_id: recordId ?? id, decision, comment }), { success: "Sign-off recorded" })}>
          Sign
        </Button>
      </div>
    </div>
  );
}
