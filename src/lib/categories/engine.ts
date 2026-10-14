import { z } from "zod";
import { BUILTIN_TEMPLATES } from "./templates";
import { COMMON_FOLLOWUPS, COMMON_PROBLEM_TYPES } from "./common";
import type { CategoryTemplate, Condition, Question } from "./types";

/** Read a dotted path such as "problem.problem_type" from an object. */
export function getPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

const isEmpty = (v: unknown) =>
  v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);

export function evaluateCondition(cond: Condition | undefined, ctx: unknown): boolean {
  if (!cond) return true;
  if ("all" in cond) return cond.all.every((c) => evaluateCondition(c, ctx));
  if ("any" in cond) return cond.any.some((c) => evaluateCondition(c, ctx));
  if ("not" in cond) return !evaluateCondition(cond.not, ctx);
  const v = getPath(ctx, cond.field);
  switch (cond.op) {
    case "eq":
      return v === cond.value;
    case "neq":
      return !isEmpty(v) && v !== cond.value;
    case "in":
      return Array.isArray(cond.value) && cond.value.includes(v as never);
    case "includes":
      return Array.isArray(v) && v.includes(cond.value as never);
    case "gt":
      return typeof v === "number" && v > Number(cond.value);
    case "gte":
      return typeof v === "number" && v >= Number(cond.value);
    case "lt":
      return typeof v === "number" && v < Number(cond.value);
    case "lte":
      return typeof v === "number" && v <= Number(cond.value);
    case "truthy":
      return !isEmpty(v) && v !== false;
    case "falsy":
      return isEmpty(v) || v === false;
    case "matches":
      if (typeof v !== "string") return false;
      try {
        return new RegExp(String(cond.value), "i").test(v);
      } catch {
        return false;
      }
  }
}

export interface QuestionContext {
  problem?: object;
  process?: object;
  answers?: Record<string, unknown>;
}

/** Questions applicable to the investigation, in order: category process questions,
 *  category follow-ups, then shared follow-ups. Hidden questions are excluded. */
export function visibleQuestions(template: CategoryTemplate, ctx: QuestionContext, section?: Question["section"]): Question[] {
  const all = [...template.questions, ...COMMON_FOLLOWUPS];
  return all.filter((qn) => (!section || qn.section === section) && evaluateCondition(qn.showIf, ctx));
}

/** Drop answers to questions that are no longer visible so irrelevant data isn't stored. */
export function pruneHiddenAnswers(template: CategoryTemplate, ctx: QuestionContext): Record<string, unknown> {
  const visible = new Set(visibleQuestions(template, ctx).map((qn) => qn.id));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(ctx.answers ?? {})) if (visible.has(k)) out[k] = v;
  return out;
}

export function missingRequired(template: CategoryTemplate, ctx: QuestionContext): Question[] {
  return visibleQuestions(template, ctx).filter((qn) => qn.required && isEmpty(ctx.answers?.[qn.id]));
}

export function problemTypesFor(template: CategoryTemplate) {
  return [...template.problemTypes, ...COMMON_PROBLEM_TYPES];
}

// ---------------------------------------------------------------------------
// Template overrides (admin-configurable). Stored in category_templates.config.
// ---------------------------------------------------------------------------
const conditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z.union([
    z.object({ all: z.array(conditionSchema) }),
    z.object({ any: z.array(conditionSchema) }),
    z.object({ not: conditionSchema }),
    z.object({
      field: z.string().regex(/^(problem|process|answers)\.[a-zA-Z0-9_]+$/),
      op: z.enum(["eq", "neq", "in", "includes", "gt", "gte", "lt", "lte", "truthy", "falsy", "matches"]),
      value: z.unknown().optional(),
    }),
  ]),
);

export const questionSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]{1,48}$/, "Use lower_snake_case ids"),
  label: z.string().min(3).max(300),
  type: z.enum(["text", "textarea", "number", "select", "multiselect", "boolean", "date"]),
  section: z.enum(["context", "process", "followup"]),
  options: z.array(z.string().min(1)).optional(),
  unit: z.string().max(30).optional(),
  help: z.string().max(500).optional(),
  required: z.boolean().optional(),
  showIf: conditionSchema.optional(),
  rationale: z.string().max(500).optional(),
});

export const templateOverrideSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  description: z.string().max(500).optional(),
  processSteps: z.array(z.string().min(1).max(120)).max(50).optional(),
  failureModes: z.array(z.string().min(1).max(160)).max(100).optional(),
  hazards: z.array(z.string().min(1).max(160)).max(50).optional(),
  qualityCharacteristics: z.array(z.string().min(1).max(160)).max(50).optional(),
  parameters: z.array(z.object({ name: z.string().min(1).max(80), unit: z.string().max(30) })).max(50).optional(),
  problemTypes: z.array(z.object({ key: z.string().regex(/^[a-z][a-z0-9_]{1,40}$/), label: z.string().min(2).max(120) })).max(30).optional(),
  extraQuestions: z.array(questionSchema).max(60).optional(),
  hiddenQuestionIds: z.array(z.string()).optional(),
  fishboneCategories: z.array(z.string().min(1).max(60)).min(3).max(10).optional(),
});
export type TemplateOverride = z.infer<typeof templateOverrideSchema>;

export function applyOverride(base: CategoryTemplate, override?: TemplateOverride | null): CategoryTemplate {
  if (!override) return base;
  const hidden = new Set(override.hiddenQuestionIds ?? []);
  return {
    ...base,
    name: override.name ?? base.name,
    description: override.description ?? base.description,
    processSteps: override.processSteps ?? base.processSteps,
    failureModes: override.failureModes ?? base.failureModes,
    hazards: override.hazards ?? base.hazards,
    qualityCharacteristics: override.qualityCharacteristics ?? base.qualityCharacteristics,
    parameters: override.parameters ?? base.parameters,
    problemTypes: override.problemTypes ?? base.problemTypes,
    questions: [...base.questions.filter((qn) => !hidden.has(qn.id)), ...(override.extraQuestions ?? [])],
  };
}

export function getBuiltinTemplate(key: string): CategoryTemplate {
  return BUILTIN_TEMPLATES.find((t) => t.key === key) ?? BUILTIN_TEMPLATES.find((t) => t.key === "general")!;
}

export function resolveTemplate(key: string, overrides: { category_key: string; config: unknown }[] = []): CategoryTemplate {
  const base = getBuiltinTemplate(key);
  const row = overrides.find((o) => o.category_key === key);
  if (!row) return base;
  const parsed = templateOverrideSchema.safeParse(row.config);
  return parsed.success ? applyOverride(base, parsed.data) : base;
}

export { BUILTIN_TEMPLATES };
