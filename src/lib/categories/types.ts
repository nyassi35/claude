import type { SixM } from "@/lib/types";

export type QuestionType = "text" | "textarea" | "number" | "select" | "multiselect" | "boolean" | "date";

/** Conditional-display rule. `field` is a dotted path into the investigation
 *  (e.g. "problem.problem_type", "answers.feed_moisture_measured"). */
export type Condition =
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition }
  | {
      field: string;
      op: "eq" | "neq" | "in" | "includes" | "gt" | "gte" | "lt" | "lte" | "truthy" | "falsy" | "matches";
      value?: unknown;
    };

export interface Question {
  id: string;
  label: string;
  type: QuestionType;
  section: "context" | "process" | "followup";
  options?: string[];
  unit?: string;
  help?: string;
  required?: boolean;
  showIf?: Condition;
  /** Why this follow-up is being asked — shown to the user so the logic is transparent. */
  rationale?: string;
}

export interface ParameterDef {
  name: string;
  unit: string;
}

export interface ProblemTypeDef {
  key: string;
  label: string;
}

export interface CategoryTemplate {
  key: string;
  name: string;
  description: string;
  icon: string; // lucide icon name
  problemTypes: ProblemTypeDef[];
  parameters: ParameterDef[];
  failureModes: string[];
  hazards: string[];
  qualityCharacteristics: string[];
  processSteps: string[];
  kpis: string[]; // keys from KPI_DEFS
  fishboneHints: Partial<Record<SixM, string[]>>;
  questions: Question[];
  suggestions: string[];
  /** Enables GMP deviation-management fields. Never implies regulatory compliance. */
  gmp?: boolean;
}

export interface KpiDef {
  key: string;
  label: string;
  unit: string;
  higherIsBetter: boolean;
}
