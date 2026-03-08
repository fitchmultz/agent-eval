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

export interface ComplianceScorecard {
  score: number;
  rules: ComplianceRuleResult[];
  verificationCount: number;
  verificationPassedCount: number;
  verificationFailedCount: number;
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
