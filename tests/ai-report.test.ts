import { beforeEach, describe, expect, it } from "vitest";
import { as, resetStore } from "./helpers";
import { getBundle, templateFor } from "@/lib/services/investigations";
import { runRuleEngine, missingInformation } from "@/lib/ai/engine";
import { runAssistant, llmOutputSchema, buildPromptPayload } from "@/lib/ai/llm";
import { buildReport, REPORT_SECTIONS } from "@/lib/report/model";
import { renderPdf, renderXlsx, toCsv } from "@/lib/report/render";
import { DEFAULT_ORG_SETTINGS, type Investigation } from "@/lib/types";

let store: ReturnType<typeof resetStore>;
beforeEach(() => {
  store = resetStore();
});
const idOf = (t: string) => store.tables.investigations.find((i) => (i.title as string).startsWith(t))!.id as string;
async function load(title: string) {
  const c = as.engineer();
  const b = await getBundle(c, idOf(title));
  return { c, b, t: await templateFor(c, b.investigation.category_key) };
}

describe("rule-based assistant", () => {
  it("biochar: identifies missing data and evidence-dependent hypotheses without confirming anything", async () => {
    const { b, t } = await load("Biochar");
    const out = runRuleEngine(b, t);
    const missing = out.missing_information.map((m) => m.item).join(" | ");
    expect(missing).toMatch(/Actual values for listed parameters/); // particle size has no actual
    expect(out.hypotheses.length).toBeGreaterThan(0);
    expect(out.hypotheses.every((h) => ["hypothesis", "under_investigation", "supported"].includes(h.status))).toBe(true);
    expect(out.hypotheses.every((h) => h.verification_test.length > 10)).toBe(true);
    expect(out.data_findings.some((f) => /Feedstock moisture/.test(f.title) && f.kind === "correlation")).toBe(true);
    expect(out.recommended_methods.map((m) => m.method)).toEqual(expect.arrayContaining(["dmaic", "pareto", "change_analysis"]));
    expect(out.proposed_actions).toHaveLength(0); // no supported/confirmed root cause yet
  });

  it("hypotheses depend on the evidence: without measurements no data-backed hypothesis appears", async () => {
    const { b, t } = await load("Biochar");
    const without = runRuleEngine({ ...b, measurements: [], analyses: [] }, t);
    expect(without.data_findings).toHaveLength(0);
    expect(without.hypotheses.every((h) => h.confidence === "low")).toBe(true);
    const withData = runRuleEngine(b, t);
    expect(withData.hypotheses.some((h) => h.evidence_for.includes("Related data finding"))).toBe(true);
  });

  it("chemical: proposes actions only for confirmed/supported causes", async () => {
    const { b, t } = await load("Assay");
    const out = runRuleEngine(b, t);
    expect(out.proposed_actions.length).toBeGreaterThan(0);
    expect(out.proposed_actions.every((a) => b.causes.some((c) => c.description === a.cause && ["supported", "confirmed"].includes(c.status)))).toBe(true);
  });

  it("flags empty and contradictory records", async () => {
    const { b, t } = await load("Biochar");
    const empty = { ...b, investigation: { ...b.investigation, problem: {}, kpis: [], process: {} } as Investigation, evidence: [], measurements: [] };
    const items = missingInformation(empty, t).map((m) => m.item);
    expect(items).toEqual(expect.arrayContaining(["What happened", "Any recorded evidence (records, measurements, photos, logs)"]));
    const contradictory = { ...b, causes: [{ ...b.causes[0], status: "confirmed" as const, evidence_ids: [], evidence_for: null, evidence_against: "Strong evidence that moisture is not the cause at all" }] };
    expect(runRuleEngine(contradictory, t).warnings.join(" ")).toMatch(/no linked evidence|contrary evidence/);
  });
});

describe("LLM integration error handling", () => {
  it("falls back to the rule engine with a notice when no API key is configured", async () => {
    const { b, t } = await load("Biochar");
    const r = await runAssistant(b, t, "");
    expect(r.output.engine).toBe("rules");
    expect(r.notice).toMatch(/No AI API key/);
  });
  it("falls back gracefully when the AI service is unreachable", async () => {
    const { b, t } = await load("Biochar");
    process.env.ANTHROPIC_BASE_URL = "http://127.0.0.1:9";
    const r = await runAssistant(b, t, "sk-test-invalid");
    delete process.env.ANTHROPIC_BASE_URL;
    expect(r.output.engine).toBe("rules");
    expect(r.error).toMatch(/rule-based analysis is shown instead/);
  }, 60000);
  it("LLM output schema cannot express a confirmed cause", () => {
    const bad = { summary: "", facts: [], assumptions: [], follow_up_questions: [], suggested_tests: [], proposed_actions: [], reasoning_notes: [], hypotheses: [{ description: "X cause", category: null, rationale: "", evidence_for: "", evidence_against: "", confidence: "high", confidence_explanation: "", verification_test: "", status: "confirmed" }] };
    expect(llmOutputSchema.safeParse(bad).success).toBe(false);
  });
  it("prompt payload summarises measurement series and keeps secrets out", async () => {
    const { b, t } = await load("Assay");
    const payload = buildPromptPayload(b, t, runRuleEngine(b, t));
    expect(payload.measurement_summaries.length).toBeGreaterThan(0);
    expect(JSON.stringify(payload)).not.toMatch(/sk-|ANTHROPIC/);
  });
});

describe("reports and exports", () => {
  const input = async (title: string) => {
    const { b, t } = await load(title);
    return { ...b, template: t, orgName: "Northwind", settings: DEFAULT_ORG_SETTINGS, memberName: () => "Erin Engineer" };
  };
  it("includes all 24+ required sections and respects selection", async () => {
    const r = buildReport(await input("Assay"));
    expect(r.sections.map((s) => s.key)).toEqual(REPORT_SECTIONS.map((s) => s.key));
    const sel = buildReport(await input("Assay"), ["executive_summary", "fmea"]);
    expect(sel.sections.map((s) => s.key)).toEqual(["executive_summary", "fmea"]);
    const exec = r.sections[0].blocks.map((b) => ("text" in b ? b.text : "")).join(" ");
    expect(exec).toMatch(/Confirmed root cause/);
  });
  it("does not present unconfirmed causes as confirmed", async () => {
    const r = buildReport(await input("Biochar"));
    const exec = r.sections[0].blocks.map((b) => ("text" in b ? b.text : "")).join(" ");
    expect(exec).toMatch(/No root cause has been confirmed yet/);
  });
  it("renders a valid PDF and XLSX", async () => {
    const i = await input("Biochar");
    const pdf = Buffer.from(renderPdf(buildReport(i)));
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(5000);
    const xlsx = Buffer.from(await renderXlsx(buildReport(i), i));
    expect(xlsx.subarray(0, 2).toString()).toBe("PK");
  });
  it("CSV escapes quotes/commas and neutralises spreadsheet formulas", () => {
    const csv = toCsv([{ org_id: "secret", a: 'He said "hi", ok', b: "=HYPERLINK(\"x\")", c: null }]);
    expect(csv).not.toContain("secret");
    expect(csv).toContain('"He said ""hi"", ok"');
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
  });
});
