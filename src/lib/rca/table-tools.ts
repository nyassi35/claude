import { IS_IS_NOT_DEFAULT_ROWS } from "./methods";

export interface Column {
  key: string;
  label: string;
  type?: "text" | "textarea" | "select";
  options?: string[];
  width?: string;
}

export const TABLE_TOOLS: Record<string, { columns: Column[]; defaults?: Record<string, unknown>[]; hint: string }> = {
  process_map: {
    hint: "Document each step as actually performed. Mark where the problem is observed and whether the step adds value.",
    columns: [
      { key: "step", label: "Step", width: "w-40" },
      { key: "type", label: "Type", type: "select", options: ["Operation", "Inspection", "Transport", "Delay", "Storage", "Decision"] },
      { key: "owner", label: "Owner" },
      { key: "inputs", label: "Inputs" },
      { key: "outputs", label: "Outputs" },
      { key: "value_added", label: "Value-added", type: "select", options: ["Yes", "No", "Required non-value-added"] },
      { key: "issues", label: "Observed issues / deviation from SOP", type: "textarea" },
    ],
  },
  barrier: {
    hint: "For each control that should have prevented or detected the event, record whether it existed and performed.",
    columns: [
      { key: "barrier", label: "Barrier / control", width: "w-48" },
      { key: "type", label: "Type", type: "select", options: ["Physical / engineering", "Administrative / procedure", "Detection / inspection", "Human action", "Supervisory"] },
      { key: "intended", label: "Intended function" },
      { key: "status", label: "Performance", type: "select", options: ["Worked", "Failed", "Missing", "Bypassed / not used", "Not assessed"] },
      { key: "why", label: "How / why it failed (evidence)", type: "textarea" },
    ],
  },
  change_analysis: {
    hint: "Compare the problem-free situation with the problem situation, factor by factor.",
    columns: [
      { key: "factor", label: "Factor", type: "select", options: ["People", "Materials / supplier", "Machine / equipment", "Method / procedure", "Settings / recipe", "Software / control", "Measurement", "Environment", "Product / design", "Other"] },
      { key: "before", label: "Before (no problem)" },
      { key: "after", label: "After (problem)" },
      { key: "change", label: "Difference / change" },
      { key: "relevant", label: "Could explain effect?", type: "select", options: ["Yes", "Maybe", "No"] },
      { key: "test", label: "How to test", type: "textarea" },
    ],
  },
  ecfa: {
    hint: "Build the chronological chain of events and conditions. Mark causal factors: removing them would have prevented or mitigated the outcome.",
    columns: [
      { key: "time", label: "Time", width: "w-32" },
      { key: "description", label: "Event / condition", type: "textarea" },
      { key: "kind", label: "Kind", type: "select", options: ["Event", "Condition", "Causal factor", "Outcome"] },
      { key: "source", label: "Source / evidence" },
    ],
  },
  is_is_not: {
    hint: "Any candidate cause must explain both the IS and the IS NOT columns.",
    defaults: IS_IS_NOT_DEFAULT_ROWS,
    columns: [
      { key: "dimension", label: "Dimension", type: "select", options: ["What", "Where", "When", "Extent"], width: "w-24" },
      { key: "question", label: "Question" },
      { key: "is", label: "IS", type: "textarea" },
      { key: "is_not", label: "IS NOT", type: "textarea" },
      { key: "distinction", label: "Distinction", type: "textarea" },
      { key: "change", label: "Related change", type: "textarea" },
    ],
  },
  human_factors: {
    hint: "Look beyond the individual: why did the system allow or encourage the action? Avoid blame; focus on systemic contributors.",
    columns: [
      { key: "level", label: "Level", type: "select", options: ["Unsafe act / error", "Precondition (fatigue, workload, environment, communication)", "Supervision", "Organisational influence (resources, culture, process)"] },
      { key: "finding", label: "Finding", type: "textarea" },
      { key: "evidence", label: "Evidence (interview, record, observation)", type: "textarea" },
      { key: "systemic", label: "Systemic?", type: "select", options: ["Yes", "No"] },
      { key: "action", label: "Organisational action", type: "textarea" },
    ],
  },
  lessons_learned: {
    hint: "Capture transferable lessons and where else they apply (horizontal deployment). Review recurrence of similar problems.",
    columns: [
      { key: "lesson", label: "Lesson", type: "textarea" },
      { key: "applies_to", label: "Applies to (lines, sites, products)" },
      { key: "shared", label: "Shared?", type: "select", options: ["Yes", "Planned", "No"] },
      { key: "owner", label: "Owner" },
    ],
  },
};

