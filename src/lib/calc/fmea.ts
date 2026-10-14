import type { OrgSettings } from "@/lib/types";

export type ActionPriority = "H" | "M" | "L";

export const rpn = (s: number, o: number, d: number) => s * o * d;

export function validRating(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 10;
}

/**
 * AIAG-VDA-style Action Priority (PFMEA) lookup. Implemented as a separate framework from RPN:
 * AP weighs Severity first, then Occurrence, then Detection, and is NOT a function of S×O×D.
 * The table reproduces the published AIAG-VDA (2019) PFMEA AP structure; organisations should
 * verify it against their licensed handbook and may adjust it in configuration.
 */
type Row = [ActionPriority, ActionPriority, ActionPriority, ActionPriority]; // D: 7-10, 5-6, 2-4, 1
const oBand = (o: number) => (o >= 8 ? 0 : o >= 6 ? 1 : o >= 4 ? 2 : o >= 2 ? 3 : 4);
const dBand = (d: number) => (d >= 7 ? 0 : d >= 5 ? 1 : d >= 2 ? 2 : 3);

const AP_TABLE: { sMin: number; rows: Row[] }[] = [
  {
    sMin: 9,
    rows: [
      ["H", "H", "H", "H"],
      ["H", "H", "H", "H"],
      ["H", "H", "H", "M"],
      ["H", "M", "L", "L"],
      ["L", "L", "L", "L"],
    ],
  },
  {
    sMin: 7,
    rows: [
      ["H", "H", "H", "H"],
      ["H", "H", "H", "M"],
      ["H", "M", "M", "M"],
      ["M", "M", "L", "L"],
      ["L", "L", "L", "L"],
    ],
  },
  {
    sMin: 4,
    rows: [
      ["H", "H", "M", "M"],
      ["M", "M", "M", "L"],
      ["M", "L", "L", "L"],
      ["L", "L", "L", "L"],
      ["L", "L", "L", "L"],
    ],
  },
  {
    sMin: 2,
    rows: [
      ["M", "M", "L", "L"],
      ["L", "L", "L", "L"],
      ["L", "L", "L", "L"],
      ["L", "L", "L", "L"],
      ["L", "L", "L", "L"],
    ],
  },
];

export function actionPriority(s: number, o: number, d: number): ActionPriority {
  if (![s, o, d].every(validRating)) throw new Error("S, O and D must be integers from 1 to 10");
  if (s === 1) return "L";
  const band = AP_TABLE.find((b) => s >= b.sMin)!;
  return band.rows[oBand(o)][dBand(d)];
}

export interface RiskFlag {
  highRisk: boolean;
  reasons: string[];
}

/** Flags a failure mode using configurable RPN threshold AND severity escalation, so that
 *  high-severity / low-RPN items (e.g. S=10, O=2, D=2 → RPN 40) are not missed. */
export function classifyFmeaRisk(item: { severity: number; occurrence: number; detection: number }, settings: Pick<OrgSettings, "rpn_threshold" | "severity_escalation" | "use_action_priority">): RiskFlag {
  const reasons: string[] = [];
  const value = rpn(item.severity, item.occurrence, item.detection);
  if (value >= settings.rpn_threshold) reasons.push(`RPN ${value} ≥ threshold ${settings.rpn_threshold}`);
  if (item.severity >= settings.severity_escalation) reasons.push(`Severity ${item.severity} ≥ escalation level ${settings.severity_escalation}`);
  if (settings.use_action_priority && actionPriority(item.severity, item.occurrence, item.detection) === "H") reasons.push("Action Priority = High");
  return { highRisk: reasons.length > 0, reasons };
}

export const RATING_CRITERIA: Record<"severity" | "occurrence" | "detection", { range: string; text: string }[]> = {
  severity: [
    { range: "9–10", text: "Affects safe operation, worker health or regulatory compliance; 10 = without warning." },
    { range: "7–8", text: "Product inoperable or major loss of primary function; 100% scrap or significant line disruption." },
    { range: "4–6", text: "Degraded function or appearance; partial scrap or rework; noticeable to most customers." },
    { range: "2–3", text: "Minor nuisance or slight rework; noticed by discriminating customers." },
    { range: "1", text: "No discernible effect." },
  ],
  occurrence: [
    { range: "9–10", text: "Very high: failure is almost inevitable / no prevention control." },
    { range: "7–8", text: "High: frequent failures; prevention control weak." },
    { range: "4–6", text: "Moderate: occasional failures; prevention control somewhat effective." },
    { range: "2–3", text: "Low: isolated failures; effective prevention control." },
    { range: "1", text: "Extremely low: failure eliminated through design / error-proofing." },
  ],
  detection: [
    { range: "9–10", text: "No or random detection; failure will almost certainly reach the customer." },
    { range: "7–8", text: "Detection by manual inspection / sampling with low capability." },
    { range: "5–6", text: "Detection by gauging or variable inspection after the process." },
    { range: "2–4", text: "Automated in-station detection that stops the process." },
    { range: "1", text: "Failure cannot physically be produced (error-proofed)." },
  ],
};
