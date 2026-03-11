/**
 * Purpose: Scores session compliance against heuristic operating-rule proxies using ordered session events.
 * Entrypoint: `scoreCompliance()` is called once per parsed session during evaluation.
 * Notes: Rules are intentionally heuristic and rely on transcript-visible evidence only, not ground-truth task outcomes.
 */

import { COMPLIANCE, CONTEXT_CONFIRMATION } from "./constants/index.js";
import type { ComplianceRuleResult, ComplianceStatus } from "./schema.js";
import { categorizeToolCall } from "./tool-classification.js";
import { extractCommandTextFromArgumentsText } from "./tool-command-text.js";
import type {
  ParsedSession,
  ParsedTurn,
  ScoringEvent,
} from "./transcript/index.js";

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
  /** Whether any verification was attempted after the final write */
  postWriteVerificationAttempted: boolean;
  /** Whether the last post-write verification attempt passed */
  postWriteVerificationPassed: boolean;
  /** Whether the session ended with the final write verified */
  endedVerified: boolean;
}

interface ScoredToolEvent extends ScoringEvent {
  kind: "tool_call";
  toolName: string;
}

function createRule(
  rule: ComplianceRuleResult["rule"],
  status: ComplianceStatus,
  rationale: string,
): ComplianceRuleResult {
  return { rule, status, rationale };
}

function isToolEvent(event: ScoringEvent): event is ScoredToolEvent {
  return event.kind === "tool_call" && typeof event.toolName === "string";
}

function hasScopeAcknowledgement(text: string): boolean {
  return (
    /\b(i('| a)?ll|i will|plan|inspect|check|verify|fix|update|review|search|trace|debug|investigate)\b/i.test(
      text,
    ) || text.trim().length >= CONTEXT_CONFIRMATION.MIN_MESSAGE_LENGTH
  );
}

function hasPlanSignal(text: string): boolean {
  return (
    /\bplan\b/i.test(text) || /\n1\.\s|\n2\.\s|first|next|then/i.test(text)
  );
}

function hasRepoExplorationSignal(commandText: string): boolean {
  return /\b(pwd|git status|git rev-parse --show-toplevel|git branch --show-current|ls|find|rg|fd|tree)\b/i.test(
    commandText,
  );
}

function hasExplicitRepoOrCwdConfirmation(commandText: string): boolean {
  return /\b(pwd|git status|git rev-parse --show-toplevel|git branch --show-current)\b/i.test(
    commandText,
  );
}

function compareSequence(left: ScoringEvent, right: ScoringEvent): number {
  return left.sequenceIndex - right.sequenceIndex;
}

function synthesizeScoringEvents(turns: readonly ParsedTurn[]): ScoringEvent[] {
  const events: ScoringEvent[] = [];
  let sequenceIndex = 0;

  for (const turn of turns) {
    for (const text of turn.userMessages) {
      events.push({
        sessionId: "synthetic-session",
        turnIndex: turn.turnIndex,
        sequenceIndex,
        timestamp: turn.startedAt,
        cwd: turn.cwd,
        kind: "user_message",
        text,
      });
      sequenceIndex += 1;
    }

    for (const text of turn.assistantMessages) {
      events.push({
        sessionId: "synthetic-session",
        turnIndex: turn.turnIndex,
        sequenceIndex,
        timestamp: turn.startedAt,
        cwd: turn.cwd,
        kind: "assistant_message",
        text,
      });
      sequenceIndex += 1;
    }

    for (const toolCall of turn.toolCalls) {
      events.push({
        sessionId: "synthetic-session",
        turnIndex: turn.turnIndex,
        sequenceIndex,
        timestamp: toolCall.timestamp ?? turn.startedAt,
        cwd: turn.cwd,
        kind: "tool_call",
        toolName: toolCall.toolName,
        commandText: extractCommandTextFromArgumentsText(
          toolCall.argumentsText,
        ),
        status: toolCall.status,
      });
      sequenceIndex += 1;
    }
  }

  return events;
}

function getOrderedEvents(session: ParsedSession): ScoringEvent[] {
  const sourceEvents =
    session.scoringEvents && session.scoringEvents.length > 0
      ? session.scoringEvents
      : synthesizeScoringEvents(session.turns);

  return [...sourceEvents]
    .map((event) => ({
      ...event,
      sessionId: event.sessionId || session.sessionId,
    }))
    .sort(compareSequence);
}

function getToolEvents(events: readonly ScoringEvent[]): Array<
  ScoredToolEvent & {
    writeLike: boolean;
    verificationLike: boolean;
    commandText?: string | undefined;
  }
> {
  return events.filter(isToolEvent).map((event) => {
    const categorization = categorizeToolCall(
      event.toolName,
      event.commandText,
    );
    return {
      ...event,
      ...(event.commandText ? { commandText: event.commandText } : {}),
      writeLike: categorization.writeLike,
      verificationLike: categorization.verificationLike,
    };
  });
}

/**
 * Scores a session's compliance against AGENTS-style operating rules.
 */
export function scoreCompliance(session: ParsedSession): ComplianceScorecard {
  const events = getOrderedEvents(session);
  const toolEvents = getToolEvents(events);
  const writeEvents = toolEvents.filter((event) => event.writeLike);
  const verificationEvents = toolEvents.filter(
    (event) => event.verificationLike,
  );
  const verificationPassedCount = verificationEvents.filter(
    (event) => event.status === "completed",
  ).length;
  const verificationFailedCount = verificationEvents.filter(
    (event) => event.status === "errored",
  ).length;

  const rules: ComplianceRuleResult[] = [];
  if (writeEvents.length === 0) {
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
        "not_applicable",
        "No high-confidence write tools were observed.",
      ),
    );

    return {
      score: COMPLIANCE.STARTING_SCORE,
      rules,
      verificationCount: verificationEvents.length,
      verificationPassedCount,
      verificationFailedCount,
      writeCount: 0,
      postWriteVerificationAttempted: false,
      postWriteVerificationPassed: false,
      endedVerified: false,
    };
  }

  const [firstWriteEvent] = writeEvents;
  const lastWriteEvent = writeEvents.at(-1);
  if (!firstWriteEvent || !lastWriteEvent) {
    throw new Error("Expected write events after write-count guard.");
  }
  const preWriteEvents = events.filter(
    (event) => event.sequenceIndex < firstWriteEvent.sequenceIndex,
  );
  const postWriteVerificationEvents = verificationEvents.filter(
    (event) => event.sequenceIndex > lastWriteEvent.sequenceIndex,
  );
  const lastPostWriteVerification =
    postWriteVerificationEvents[postWriteVerificationEvents.length - 1];
  const scopeConfirmed = preWriteEvents.some((event) => {
    if (event.kind === "assistant_message" && typeof event.text === "string") {
      return hasScopeAcknowledgement(event.text);
    }
    return (
      event.kind === "tool_call" &&
      typeof event.commandText === "string" &&
      hasRepoExplorationSignal(event.commandText)
    );
  });
  const repoOrCwdConfirmed =
    Boolean(session.cwd) ||
    preWriteEvents.some((event) => {
      if (event.cwd) {
        return true;
      }
      return (
        event.kind === "tool_call" &&
        typeof event.commandText === "string" &&
        hasExplicitRepoOrCwdConfirmation(event.commandText)
      );
    });
  const plannedBeforeWrite = preWriteEvents.some((event) => {
    if (event.kind === "assistant_message" && typeof event.text === "string") {
      return hasPlanSignal(event.text);
    }
    return event.kind === "tool_call" && event.toolName === "update_plan";
  });
  const postWriteVerificationAttempted = postWriteVerificationEvents.length > 0;
  const postWriteVerificationPassed =
    lastPostWriteVerification?.status === "completed";
  const endedVerified = postWriteVerificationPassed;

  rules.push(
    createRule(
      "scope_confirmed_before_major_write",
      scopeConfirmed ? "pass" : "fail",
      "Checks whether the agent acknowledged scope or explored repository context before the first write.",
    ),
    createRule(
      "cwd_or_repo_echoed_before_write",
      repoOrCwdConfirmed ? "pass" : "fail",
      "Checks for explicit cwd or repository confirmation before the first write.",
    ),
    createRule(
      "short_plan_before_large_change",
      plannedBeforeWrite ? "pass" : "fail",
      "Checks for an explicit plan signal before the first write.",
    ),
    createRule(
      "verification_after_code_changes",
      postWriteVerificationAttempted ? "pass" : "fail",
      "Checks whether a verification attempt occurred after the final write.",
    ),
    createRule(
      "no_unverified_ending",
      endedVerified ? "pass" : "fail",
      "Checks whether the session ended without leaving the final write unverified.",
    ),
  );

  let score = COMPLIANCE.STARTING_SCORE;
  for (const rule of rules) {
    if (rule.status === "fail") {
      score -= COMPLIANCE.FAILURE_PENALTY;
    }
  }

  return {
    score: Math.max(0, score),
    rules,
    verificationCount: verificationEvents.length,
    verificationPassedCount,
    verificationFailedCount,
    writeCount: writeEvents.length,
    postWriteVerificationAttempted,
    postWriteVerificationPassed,
    endedVerified,
  };
}
