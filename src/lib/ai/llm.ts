import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { CategoryTemplate } from "@/lib/categories/types";
import { summary as statSummary } from "@/lib/calc/stats";
import { runRuleEngine, type AssistantOutput, type InvestigationBundle } from "./engine";

export const DEFAULT_MODEL = "claude-opus-5-5";

const SYSTEM_PROMPT = `You are the investigation assistant inside RootCause AI, a manufacturing root cause analysis application used by production, process, quality and maintenance engineers.

Rules you must follow:
- Use ONLY the information in the investigation record you are given. Never invent equipment readings, measurements, test results, standards, regulations, citations, dates or names.
- Separate facts (verified evidence, recorded measurements) from assumptions (unverified statements, hypotheses).
- Every causal hypothesis must state the evidence for it, the evidence against it or remaining uncertainty, a confidence level (low/medium/high) with an explanation tied to the recorded evidence, and a concrete verification test.
- You may never mark a cause as confirmed. Allowed statuses: hypothesis, under_investigation, supported. "supported" requires recorded evidence that directly supports the cause.
- Correlation is not causation; say so when relying on statistical associations.
- When information is missing, say what is missing and ask targeted follow-up questions instead of guessing.
- Propose corrective/preventive actions only for causes that the record shows as supported or confirmed, and give a measurable verification criterion for each.
- Safety-critical matters must be escalated to authorised people; you do not replace emergency procedures.
- Be concise and specific to the production category and process.`;

const hypothesisSchema = z.object({
  description: z.string().min(3).max(400),
  category: z.enum(["manpower", "machine", "method", "material", "measurement", "environment"]).nullable(),
  rationale: z.string().max(1200),
  evidence_for: z.string().max(1500),
  evidence_against: z.string().max(1500),
  confidence: z.enum(["low", "medium", "high"]),
  confidence_explanation: z.string().max(1000),
  verification_test: z.string().max(1000),
  status: z.enum(["hypothesis", "under_investigation", "supported"]),
});

export const llmOutputSchema = z.object({
  summary: z.string().max(3000),
  facts: z.array(z.string().max(600)).max(40),
  assumptions: z.array(z.string().max(600)).max(40),
  follow_up_questions: z.array(z.string().max(400)).max(15),
  hypotheses: z.array(hypothesisSchema).max(10),
  suggested_tests: z.array(z.string().max(600)).max(15),
  proposed_actions: z
    .array(
      z.object({
        cause: z.string().max(400),
        action: z.string().max(800),
        type: z.enum(["containment", "corrective", "preventive"]),
        verification: z.string().max(600),
      }),
    )
    .max(15),
  reasoning_notes: z.array(z.string().max(800)).max(12),
});

const str = { type: "string" } as const;
const arr = (items: object) => ({ type: "array", items });
const obj = (properties: Record<string, object>) => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });

const OUTPUT_JSON_SCHEMA = obj({
  summary: str,
  facts: arr(str),
  assumptions: arr(str),
  follow_up_questions: arr(str),
  hypotheses: arr(
    obj({
      description: str,
      category: { anyOf: [{ type: "string", enum: ["manpower", "machine", "method", "material", "measurement", "environment"] }, { type: "null" }] },
      rationale: str,
      evidence_for: str,
      evidence_against: str,
      confidence: { type: "string", enum: ["low", "medium", "high"] },
      confidence_explanation: str,
      verification_test: str,
      status: { type: "string", enum: ["hypothesis", "under_investigation", "supported"] },
    }),
  ),
  suggested_tests: arr(str),
  proposed_actions: arr(obj({ cause: str, action: str, type: { type: "string", enum: ["containment", "corrective", "preventive"] }, verification: str })),
  reasoning_notes: arr(str),
});

/** Compact, lossless-in-meaning view of the record for the model. Raw measurement series are
 *  summarised per parameter and group (n, mean, sd, min, max); the full series stays in the app. */
export function buildPromptPayload(b: InvestigationBundle, t: CategoryTemplate, rules: AssistantOutput) {
  const i = b.investigation;
  const groups = new Map<string, number[]>();
  for (const m of b.measurements) {
    const k = `${m.parameter}${m.unit ? ` [${m.unit}]` : ""}${m.group_label ? ` | group=${m.group_label}` : ""}`;
    groups.set(k, [...(groups.get(k) ?? []), m.value]);
  }
  return {
    category: { key: t.key, name: t.name, typical_failure_modes: t.failureModes, quality_characteristics: t.qualityCharacteristics },
    investigation: {
      number: i.number,
      title: i.title,
      severity: i.severity,
      priority: i.priority,
      status: i.status,
      process: i.process_name,
      product: i.product,
      batch: i.batch_number,
      asset: i.asset_id,
      occurred_at: i.occurred_at,
      shift: i.shift,
      problem: i.problem,
      process_info: i.process,
      category_answers: i.answers,
      kpis: i.kpis,
      risk: i.risk?.ratings,
    },
    timeline: b.timeline.map((e) => ({ at: e.occurred_at, what: e.description, verified: e.is_verified, source: e.source })),
    evidence: b.evidence.map((e) => ({ title: e.title, kind: e.kind, description: e.description, source: e.source, verified: e.is_verified })),
    measurement_summaries: [...groups.entries()].map(([k, v]) => ({ series: k, ...statSummary(v) })),
    existing_causes: b.causes.map((c) => ({ description: c.description, status: c.status, type: c.cause_type, evidence_for: c.evidence_for, evidence_against: c.evidence_against, verification_result: c.verification_result })),
    capa: b.capa.map((a) => ({ description: a.description, status: a.status, type: a.action_type })),
    deterministic_engine: {
      missing_information: rules.missing_information,
      data_findings: rules.data_findings,
      recommended_methods: rules.recommended_methods.map((r) => r.name),
    },
  };
}

export type AssistantResult = { output: AssistantOutput; notice?: string; error?: string };

export async function runAssistant(b: InvestigationBundle, t: CategoryTemplate, apiKey = process.env.ANTHROPIC_API_KEY): Promise<AssistantResult> {
  const rules = runRuleEngine(b, t);
  if (!apiKey) {
    return { output: rules, notice: "No AI API key is configured, so the deterministic rule-based engine produced this analysis. Set ANTHROPIC_API_KEY on the server to enable LLM-assisted analysis." };
  }
  const client = new Anthropic({ apiKey, timeout: 120_000, maxRetries: 1 });
  try {
    const payload = buildPromptPayload(b, t, rules);
    const response = await client.beta.messages.create({
      model: process.env.ANTHROPIC_MODEL || DEFAULT_MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM_PROMPT,
      output_config: { effort: "medium", format: { type: "json_schema", schema: OUTPUT_JSON_SCHEMA } },
      messages: [
        {
          role: "user",
          content: `Analyse this investigation record and return the structured assessment.\n\n<investigation_record>\n${JSON.stringify(payload, null, 1)}\n</investigation_record>`,
        },
      ],
    });
    if (response.stop_reason === "refusal") {
      return { output: rules, error: "The AI model declined this request; the rule-based analysis is shown instead." };
    }
    if (response.stop_reason === "max_tokens") {
      return { output: rules, error: "The AI response was incomplete (length limit); the rule-based analysis is shown instead." };
    }
    const textBlock = response.content.find((c) => c.type === "text");
    if (!textBlock || textBlock.type !== "text") return { output: rules, error: "The AI response contained no analysis; the rule-based analysis is shown instead." };
    let raw: unknown;
    try {
      raw = JSON.parse(textBlock.text);
    } catch {
      return { output: rules, error: "The AI response was not valid JSON; the rule-based analysis is shown instead." };
    }
    const parsed = llmOutputSchema.safeParse(raw);
    if (!parsed.success) return { output: rules, error: "The AI response failed validation; the rule-based analysis is shown instead." };
    const llm = parsed.data;
    return {
      output: {
        ...rules,
        engine: "llm",
        summary: llm.summary,
        facts: llm.facts.length ? llm.facts : rules.facts,
        assumptions: llm.assumptions.length ? llm.assumptions : rules.assumptions,
        follow_up_questions: [...new Set([...llm.follow_up_questions, ...rules.follow_up_questions])].slice(0, 15),
        hypotheses: llm.hypotheses,
        suggested_tests: llm.suggested_tests,
        // Never let the LLM introduce actions for causes that are not supported/confirmed in the record.
        proposed_actions: llm.proposed_actions.filter((a) =>
          b.causes.some((c) => ["supported", "confirmed"].includes(c.status) && a.cause.toLowerCase().includes(c.description.toLowerCase().slice(0, 20))),
        ),
        reasoning_notes: llm.reasoning_notes,
      },
    };
  } catch (err) {
    let msg = "The AI service could not be reached";
    if (err instanceof Anthropic.AuthenticationError) msg = "The AI API key was rejected (check ANTHROPIC_API_KEY)";
    else if (err instanceof Anthropic.RateLimitError) msg = "The AI service is rate-limited; try again shortly";
    else if (err instanceof Anthropic.BadRequestError) msg = "The AI request was rejected as invalid";
    else if (err instanceof Anthropic.APIConnectionError) msg = "The AI service could not be reached (network/timeout)";
    else if (err instanceof Anthropic.APIError) msg = `The AI service returned an error (${err.status ?? "unknown"})`;
    return { output: rules, error: `${msg}; the rule-based analysis is shown instead.` };
  }
}
