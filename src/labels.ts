/**
 * Purpose: Applies user-message heuristics to infer label taxonomy, severity, and confidence.
 * Entrypoint: `labelTurn()` is used during evaluation to annotate normalized turns.
 * Notes: User-role messages are the primary label source by design for evaluator v1.
 */
import type { LabelRecord } from "./schema.js";

import type { ParsedTurn } from "./transcript.js";

interface LabelRule {
  label: LabelRecord["label"];
  severity: LabelRecord["severity"];
  confidence: LabelRecord["confidence"];
  rationale: string;
  test: (text: string) => boolean;
}

const labelRules: LabelRule[] = [
  {
    label: "context_drift",
    severity: "medium",
    confidence: "high",
    rationale:
      "User indicated the agent drifted away from the requested context or scope.",
    test: (text) =>
      /context drift|lost context|wrong repo|not what i asked|off track|drifting|you forgot the context/i.test(
        text,
      ),
  },
  {
    label: "test_build_lint_failure_complaint",
    severity: "high",
    confidence: "high",
    rationale: "User called out failing tests, build, lint, or CI behavior.",
    test: (text) =>
      /(still fails?|still failing|tests? (are )?(still )?(failing|broken)|build (is )?(still )?(failing|broken)|lint (is )?(still )?(failing|broken)|typecheck (is )?(still )?(failing|broken)|ci (is )?(red|broken|failing)|make ci (still )?fails?|you (didn['’]t|did not) run (tests?|make ci))/i.test(
        text,
      ),
  },
  {
    label: "interrupt",
    severity: "medium",
    confidence: "high",
    rationale: "User explicitly interrupted or redirected ongoing work.",
    test: (text) =>
      /\b(stop|pause|hold on|wait|sorry to interrupt|interrupting)\b/i.test(
        text,
      ),
  },
  {
    label: "regression_report",
    severity: "high",
    confidence: "medium",
    rationale:
      "User reported a regression or breakage introduced by prior work.",
    test: (text) =>
      /\b(regression(?! tests?\b)|you broke|this broke|broken now|used to work|now fails|now broken)\b/i.test(
        text,
      ),
  },
  {
    label: "praise",
    severity: "info",
    confidence: "high",
    rationale: "User expressed positive feedback or appreciation.",
    test: (text) =>
      /\b(thanks|thank you|nice|great|good job|well done)\b/i.test(text),
  },
  {
    label: "context_reinjection",
    severity: "low",
    confidence: "high",
    rationale: "User restated goals or constraints to re-anchor the agent.",
    test: (text) =>
      /(goals?:|constraints?:|deliverables?:|primary objective:|minimum you should evaluate)/i.test(
        text,
      ),
  },
  {
    label: "verification_request",
    severity: "medium",
    confidence: "high",
    rationale: "User explicitly requested verification or validation steps.",
    test: (text) =>
      /\b(verify|verification|run tests|make ci|check build|lint|typecheck|ensure.*pass)\b/i.test(
        text,
      ),
  },
  {
    label: "stalled_or_guessing",
    severity: "high",
    confidence: "high",
    rationale:
      "User indicated the agent appears stalled, guessing, or not making progress.",
    test: (text) =>
      /\b(stalled|guessing|not making progress|spinning|you seem unsure|don't guess|stop guessing)\b/i.test(
        text,
      ),
  },
];

/**
 * Labels a turn based on user message heuristics.
 *
 * Applies a taxonomy of label rules to user messages to detect:
 * - context_drift - User indicated the agent drifted from requested scope
 * - test_build_lint_failure_complaint - User reported failing tests/build/lint
 * - interrupt - User explicitly interrupted or redirected work
 * - regression_report - User reported a regression or breakage
 * - praise - User expressed positive feedback
 * - context_reinjection - User restated goals or constraints
 * - verification_request - User requested verification or validation
 * - stalled_or_guessing - User indicated agent appears stalled
 *
 * User-role messages are the primary label source by design for evaluator v1.
 *
 * @param turn - The parsed turn to label
 * @returns Array of label records for the turn (empty if no patterns match)
 *
 * @example
 * ```typescript
 * const labels = labelTurn(turn);
 * if (labels.some(l => l.label === "test_build_lint_failure_complaint")) {
 *   console.log("Build failure detected");
 * }
 * ```
 */
export function labelTurn(turn: ParsedTurn): LabelRecord[] {
  const text = turn.userMessages.join("\n").trim();
  if (text.length === 0) {
    return [];
  }

  return labelRules
    .filter((rule) => rule.test(text))
    .map((rule) => ({
      label: rule.label,
      severity: rule.severity,
      confidence: rule.confidence,
      rationale: rule.rationale,
    }));
}
