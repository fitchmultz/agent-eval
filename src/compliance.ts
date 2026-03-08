/**
 * Purpose: Scores session compliance against the evaluator's AGENTS-style operating rules.
 * Entrypoint: `scoreCompliance()` is called once per parsed session during evaluation.
 * Notes: Rules are heuristic and optimized for precision over recall in evaluator v1.
 */
import type { ComplianceRuleResult, ComplianceStatus } from "./schema.js";
import {
  extractCommandText,
  isVerificationTool,
  isWriteTool,
} from "./tool-classification.js";
import type { ParsedSession, ParsedTurn } from "./transcript.js";

/**
 * Scorecard for a session's compliance with AGENTS-style operating rules.
 */
export interface ComplianceScorecard {
  /** Overall compliance score (0-100, higher is better) */
  score: number;
  /** Results for each individual compliance rule */
  rules: ComplianceRuleResult[];
  /** Total number of verification tool calls observed */
  verificationCount: number;
  /** Number of verification tool calls that succeeded */
  verificationPassedCount: number;
  /** Number of verification tool calls that failed */
  verificationFailedCount: number;
  /** Number of write tool calls observed */
  writeCount: number;
}

function hasPreWriteContext(
  turns: readonly ParsedTurn[],
  firstWriteIndex: number,
): boolean {
  const priorTurns = turns.slice(0, firstWriteIndex + 1);
  return priorTurns.some(
    (turn) =>
      turn.assistantMessages.some((message) => message.trim().length >= 20) ||
      turn.toolCalls.some((toolCall) => {
        const commandText = extractCommandText(toolCall);
        return (
          typeof commandText === "string" &&
          /\b(pwd|git status|ls|find|rg)\b/.test(commandText)
        );
      }),
  );
}

function hasPreWritePlan(
  turns: readonly ParsedTurn[],
  firstWriteIndex: number,
): boolean {
  const priorTurns = turns.slice(0, firstWriteIndex + 1);
  return priorTurns.some(
    (turn) =>
      turn.toolCalls.some((toolCall) => toolCall.toolName === "update_plan") ||
      turn.assistantMessages.some(
        (message) =>
          /\bplan\b/i.test(message) ||
          /\n1\.\s|\n2\.\s|first|next|then/i.test(message),
      ),
  );
}

function createRule(
  rule: ComplianceRuleResult["rule"],
  status: ComplianceStatus,
  rationale: string,
): ComplianceRuleResult {
  return { rule, status, rationale };
}

/**
 * Scores a session's compliance against AGENTS-style operating rules.
 *
 * Evaluates five compliance rules:
 * 1. scope_confirmed_before_major_write - Context exploration before writing
 * 2. cwd_or_repo_echoed_before_write - Repository/cwd confirmation before writing
 * 3. short_plan_before_large_change - Explicit plan before major changes
 * 4. verification_after_code_changes - Verification after code changes
 * 5. no_unverified_ending - Session ends with passing verification
 *
 * The score starts at 100 and loses 20 points for each failed rule.
 *
 * @param session - The parsed session to evaluate
 * @returns ComplianceScorecard with overall score and per-rule results
 *
 * @example
 * ```typescript
 * const session = await parseTranscriptFile("session.jsonl");
 * const scorecard = scoreCompliance(session);
 * console.log(`Compliance: ${scorecard.score}/100`);
 * for (const rule of scorecard.rules) {
 *   console.log(`  ${rule.rule}: ${rule.status}`);
 * }
 * ```
 */
export function scoreCompliance(session: ParsedSession): ComplianceScorecard {
  const writeTurns = session.turns.flatMap((turn, turnIndex) =>
    turn.toolCalls
      .filter(isWriteTool)
      .map((toolCall) => ({ toolCall, turnIndex })),
  );
  const verificationCalls = session.turns.flatMap((turn) =>
    turn.toolCalls.filter(isVerificationTool),
  );
  const verificationPassedCount = verificationCalls.filter(
    (toolCall) => toolCall.status === "completed",
  ).length;
  const verificationFailedCount = verificationCalls.filter(
    (toolCall) => toolCall.status === "errored",
  ).length;

  const rules: ComplianceRuleResult[] = [];
  if (writeTurns.length === 0) {
    rules.push(
      createRule(
        "scope_confirmed_before_major_write",
        "not_applicable",
        "No high-confidence write tools were observed.",
      ),
      createRule(
        "cwd_or_repo_echoed_before_write",
        "not_applicable",
        "No high-confidence write tools were observed.",
      ),
      createRule(
        "short_plan_before_large_change",
        "not_applicable",
        "No high-confidence write tools were observed.",
      ),
      createRule(
        "verification_after_code_changes",
        "not_applicable",
        "No high-confidence write tools were observed.",
      ),
      createRule(
        "no_unverified_ending",
        "pass",
        "Session ended without code changes that required verification.",
      ),
    );
    return {
      score: 100,
      rules,
      verificationCount: verificationCalls.length,
      verificationPassedCount,
      verificationFailedCount,
      writeCount: 0,
    };
  }

  const firstWriteTurnIndex = writeTurns[0]?.turnIndex ?? 0;
  rules.push(
    createRule(
      "scope_confirmed_before_major_write",
      hasPreWriteContext(session.turns, firstWriteTurnIndex) ? "pass" : "fail",
      "Checks whether the agent acknowledged scope or explored context before writing.",
    ),
    createRule(
      "cwd_or_repo_echoed_before_write",
      hasPreWriteContext(session.turns, firstWriteTurnIndex) ? "pass" : "fail",
      "Checks for early repository or cwd confirmation signals before writing.",
    ),
    createRule(
      "short_plan_before_large_change",
      hasPreWritePlan(session.turns, firstWriteTurnIndex) ? "pass" : "fail",
      "Checks for a short explicit plan before the first major write.",
    ),
    createRule(
      "verification_after_code_changes",
      verificationPassedCount > 0
        ? "pass"
        : verificationFailedCount > 0
          ? "fail"
          : "fail",
      "Checks whether a verification command passed after code changes.",
    ),
    createRule(
      "no_unverified_ending",
      verificationPassedCount > 0 ? "pass" : "fail",
      "Checks whether the session ended after changes without a passing verification signal.",
    ),
  );

  let score = 100;
  for (const rule of rules) {
    if (rule.status === "fail") {
      score -= 20;
    }
  }

  return {
    score: Math.max(0, score),
    rules,
    verificationCount: verificationCalls.length,
    verificationPassedCount,
    verificationFailedCount,
    writeCount: writeTurns.length,
  };
}
