"use client";
import { useState, useTransition } from "react";
import { Bot, Plus, RefreshCw } from "lucide-react";
import { createCauseAction, runAssistantAction } from "@/app/actions";
import { Alert, Badge, Button, Card, EmptyState } from "@/components/ui";
import { useAction } from "@/components/forms/useAction";
import type { AssistantOutput } from "@/lib/ai/engine";
import { SIX_M_LABELS } from "@/lib/types";
import { fmtDate } from "@/lib/utils";

export function AssistantPanel({ invId, canAddCauses, canRun }: { invId: string; canAddCauses: boolean; canRun: boolean }) {
  const [out, setOut] = useState<AssistantOutput | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [running, start] = useTransition();
  const [added, setAdded] = useState<Set<string>>(new Set());
  const add = useAction();

  const run = () =>
    start(async () => {
      setErr(null);
      const r = await runAssistantAction(invId);
      if (!r.ok) return setErr(r.error);
      const d = r.data as { output: AssistantOutput; notice?: string; error?: string };
      setOut(d.output);
      setNotice(d.notice ?? null);
      if (d.error) setErr(d.error);
    });

  return (
    <div className="space-y-4">
      <Card
        title={<span className="flex items-center gap-2"><Bot className="h-4 w-4 text-brand-600" /> Investigation assistant</span>}
        description="Structured reasoning: establish the problem → separate facts from assumptions → review evidence → generate hypotheses → define tests → assess evidence → recommend actions. The assistant never confirms a cause; confirmation requires evidence and human approval."
        actions={canRun && <Button onClick={run} disabled={running}><RefreshCw className={`h-4 w-4 ${running ? "animate-spin" : ""}`} /> {out ? "Re-run analysis" : "Analyse investigation"}</Button>}
      >
        {!canRun && <Alert kind="info">Your role can view but not run the assistant.</Alert>}
        {err && <Alert kind="warning">{err}</Alert>}
        {notice && <Alert kind="info">{notice}</Alert>}
        {!out && !running && <EmptyState title="No analysis yet">Run the assistant to summarise the incident, find missing information and generate testable hypotheses from the evidence recorded so far.</EmptyState>}
        {running && <p className="text-sm text-slate-500">Analysing…</p>}
        {out && (
          <div className="space-y-2 text-sm">
            <p className="text-xs text-slate-500">Engine: {out.engine === "llm" ? "LLM-assisted (validated against the record)" : "Deterministic rule-based engine"} · {fmtDate(out.generated_at, true)}</p>
            <p>{out.summary}</p>
          </div>
        )}
      </Card>
      {add.feedback}
      {out && (
        <>
          {out.warnings.length > 0 && <Alert kind="warning" title="Warnings"><ul>{out.warnings.map((w) => <li key={w}>{w}</li>)}</ul></Alert>}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Facts (verified / recorded)">
              {out.facts.length ? <ul className="list-disc space-y-1 pl-5 text-sm">{out.facts.map((f) => <li key={f}>{f}</li>)}</ul> : <p className="text-sm text-slate-500">No verified facts recorded yet.</p>}
            </Card>
            <Card title="Assumptions & unverified statements">
              {out.assumptions.length ? <ul className="list-disc space-y-1 pl-5 text-sm">{out.assumptions.map((f) => <li key={f}>{f}</li>)}</ul> : <p className="text-sm text-slate-500">None.</p>}
            </Card>
          </div>
          <Card title={`Missing information (${out.missing_information.length})`} description="Collect these before drawing conclusions">
            {out.missing_information.length ? (
              <table className="table-base text-sm"><thead><tr><th>Area</th><th>Missing</th><th>Why it matters</th></tr></thead>
                <tbody>{out.missing_information.map((m) => <tr key={m.area + m.item}><td className="whitespace-nowrap text-xs font-semibold">{m.area}</td><td>{m.item}</td><td className="text-xs text-slate-600">{m.why}</td></tr>)}</tbody>
              </table>
            ) : <p className="text-sm text-emerald-700">No obvious gaps.</p>}
            {out.follow_up_questions.length > 0 && (
              <div className="mt-3"><p className="label">Targeted follow-up questions</p><ul className="list-disc pl-5 text-sm">{out.follow_up_questions.map((q) => <li key={q}>{q}</li>)}</ul></div>
            )}
          </Card>
          {out.data_findings.length > 0 && (
            <Card title="Relationships found in the data">
              <ul className="space-y-2 text-sm">
                {out.data_findings.map((f) => (
                  <li key={f.title} className="rounded border border-slate-200 p-2">
                    <p className="font-medium">{f.title} <Badge color={f.strength === "strong" ? "red" : f.strength === "moderate" ? "amber" : "slate"}>{f.strength}</Badge></p>
                    <p>{f.detail}</p>
                    <p className="text-xs text-slate-500">{f.caveat}</p>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <Card title="Candidate causal hypotheses" description="Each is a hypothesis to test — not a finding. Adding one to the register records it as an AI-suggested hypothesis.">
            {out.hypotheses.length ? (
              <ul className="space-y-3">
                {out.hypotheses.map((h) => (
                  <li key={h.description} className="rounded-md border border-violet-200 bg-violet-50/30 p-3 text-sm">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">{h.description}</p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          <Badge color="purple">{h.status.replace(/_/g, " ")}</Badge>
                          {h.category && <Badge color="blue">{SIX_M_LABELS[h.category]}</Badge>}
                          <Badge color={h.confidence === "high" ? "green" : h.confidence === "medium" ? "amber" : "slate"}>confidence: {h.confidence}</Badge>
                        </div>
                      </div>
                      {canAddCauses && (
                        <Button size="sm" variant="secondary" disabled={added.has(h.description) || add.pending} onClick={() => add.exec(() => createCauseAction(invId, {
                          description: h.description,
                          category: h.category,
                          cause_type: "possible_cause",
                          status: h.status === "supported" ? "under_investigation" : h.status,
                          evidence_for: h.evidence_for,
                          evidence_against: h.evidence_against,
                          confidence: h.confidence === "high" ? "medium" : h.confidence,
                          confidence_rationale: h.confidence_explanation,
                          verification_test: h.verification_test,
                          source_method: "ai_assistant",
                          ai_suggested: true,
                        }), { success: "Added to the cause register as an AI-suggested hypothesis", onOk: () => setAdded(new Set([...added, h.description])) })}>
                          <Plus className="h-3.5 w-3.5" /> {added.has(h.description) ? "Added" : "Add to register"}
                        </Button>
                      )}
                    </div>
                    <dl className="mt-2 grid gap-2 md:grid-cols-2">
                      <div><dt className="text-xs font-semibold text-slate-600">Rationale</dt><dd>{h.rationale}</dd></div>
                      <div><dt className="text-xs font-semibold text-emerald-700">Evidence for</dt><dd>{h.evidence_for}</dd></div>
                      <div><dt className="text-xs font-semibold text-red-700">Evidence against / uncertainty</dt><dd>{h.evidence_against}</dd></div>
                      <div><dt className="text-xs font-semibold text-slate-600">Confidence explanation</dt><dd>{h.confidence_explanation}</dd></div>
                      <div className="md:col-span-2"><dt className="text-xs font-semibold text-slate-600">Verification test</dt><dd>{h.verification_test}</dd></div>
                    </dl>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-slate-500">No new hypotheses — existing causes may already cover the template&apos;s typical causes.</p>}
          </Card>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Recommended methods">
              <ul className="space-y-1.5 text-sm">{out.recommended_methods.map((m) => <li key={m.method}><span className="font-medium">{m.name}</span> <Badge color={m.priority === "recommended" ? "blue" : "slate"}>{m.priority}</Badge><p className="text-xs text-slate-500">{m.reason}</p></li>)}</ul>
            </Card>
            <Card title="Proposed actions" description="Only for causes already supported or confirmed in the record">
              {out.proposed_actions.length ? (
                <ul className="space-y-2 text-sm">{out.proposed_actions.map((a, i) => <li key={i} className="rounded border border-slate-200 p-2"><Badge>{a.type}</Badge> {a.action}<p className="text-xs text-slate-500">For: {a.cause}</p><p className="text-xs text-slate-500">Verify: {a.verification}</p></li>)}</ul>
              ) : <p className="text-sm text-slate-500">No supported or confirmed causes yet — actions are proposed once a cause is supported by evidence. Containment actions can still be created on the CAPA tab.</p>}
            </Card>
          </div>
          <Card title="Reasoning trail">
            <ol className="list-none space-y-1 text-sm">{out.reasoning_notes.map((n) => <li key={n}>{n}</li>)}</ol>
            {out.suggested_tests.length > 0 && <><p className="label mt-3">Suggested tests</p><ul className="list-disc pl-5 text-sm">{out.suggested_tests.map((t) => <li key={t}>{t}</li>)}</ul></>}
          </Card>
        </>
      )}
    </div>
  );
}
