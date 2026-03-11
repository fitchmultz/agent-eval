/**
 * Purpose: Processes individual sessions into summarized turns and incidents.
 * Responsibilities: Convert parsed sessions into raw turns, clustered incidents, and per-session metrics.
 * Scope: Shared by all supported transcript sources after normalization.
 * Usage: `processSession(parsedSession, homeDirectory)`.
 * Invariants/Assumptions: Source-specific parsing is complete before processing begins.
 */
import { clusterIncidents } from "./clustering.js";
import { scoreCompliance } from "./compliance.js";
import { getConfig } from "./config/index.js";
import { isIncidentLabel, labelTurn } from "./labels.js";
import { createMessagePreviews } from "./sanitization.js";
import type {
  ComplianceRuleResult,
  IncidentRecord,
  RawTurnRecord,
  ToolCallSummary,
} from "./schema.js";
import { categorizeToolCall } from "./tool-classification.js";
import { extractCommandTextFromArgumentsText } from "./tool-command-text.js";
import type { ParsedSession } from "./transcript/index.js";
import { redactPath } from "./utils/path-redaction.js";
import { EVALUATOR_VERSION, SCHEMA_VERSION } from "./version.js";

/**
 * Metrics for a single processed session.
 */
export interface SessionMetrics {
  sessionId: string;
  provider: ParsedSession["provider"];
  turnCount: number;
  labeledTurnCount: number;
  incidentCount: number;
  parseWarningCount: number;
  writeCount: number;
  verificationCount: number;
  verificationPassedCount: number;
  verificationFailedCount: number;
  postWriteVerificationAttempted: boolean;
  postWriteVerificationPassed: boolean;
  endedVerified: boolean;
  complianceScore: number;
  complianceRules: ComplianceRuleResult[];
}

/**
 * Result of processing a single session.
 */
export interface ProcessedSession {
  sessionId: string;
  turns: RawTurnRecord[];
  incidents: IncidentRecord[];
  metrics: SessionMetrics;
}

/**
 * Summarizes a tool call with classification.
 */
function summarizeToolCall(
  toolName: string,
  argumentsText?: string,
): ToolCallSummary {
  const commandText = extractCommandTextFromArgumentsText(argumentsText);
  const categorization = categorizeToolCall(toolName, commandText);

  return {
    toolName,
    category: categorization.category,
    commandText,
    writeLike: categorization.writeLike,
    verificationLike: categorization.verificationLike,
    status: "unknown",
  };
}

/**
 * Builds raw turn records from a parsed session.
 */
function buildSessionTurns(
  session: ParsedSession,
  homeDirectory?: string,
): RawTurnRecord[] {
  const turns: RawTurnRecord[] = [];

  for (const turn of session.turns) {
    const labels = labelTurn(turn);

    const toolCalls = turn.toolCalls.map((toolCall) => ({
      ...summarizeToolCall(toolCall.toolName, toolCall.argumentsText),
      status: toolCall.status,
    }));

    turns.push({
      evaluatorVersion: EVALUATOR_VERSION,
      schemaVersion: SCHEMA_VERSION,
      sessionId: session.sessionId,
      parentSessionId: session.parentSessionId,
      turnId: turn.turnId,
      turnIndex: turn.turnIndex,
      startedAt: turn.startedAt,
      cwd: turn.cwd ? redactPath(turn.cwd, homeDirectory) : undefined,
      userMessageCount: turn.userMessages.length,
      assistantMessageCount: turn.assistantMessages.length,
      userMessagePreviews: createMessagePreviews(turn.userMessages, {
        homeDirectory,
        maxItems: getConfig().previews.maxMessageItems,
        maxLength: getConfig().previews.maxMessageLength,
      }),
      assistantMessagePreviews: createMessagePreviews(turn.assistantMessages, {
        homeDirectory,
        maxItems: getConfig().previews.maxMessageItems,
        maxLength: getConfig().previews.maxMessageLength,
      }),
      toolCalls,
      labels,
      sourceRefs: turn.sourceRefs.map((sourceRef) => ({
        ...sourceRef,
        path: redactPath(sourceRef.path, homeDirectory),
      })),
    });
  }

  return turns;
}

/**
 * Builds session metrics from processed data.
 */
function buildSessionMetrics(
  session: ParsedSession,
  compliance: {
    score: number;
    rules: ComplianceRuleResult[];
    writeCount: number;
    verificationCount: number;
    verificationPassedCount: number;
    verificationFailedCount: number;
    postWriteVerificationAttempted: boolean;
    postWriteVerificationPassed: boolean;
    endedVerified: boolean;
  },
  parseWarningCount: number,
  incidents: IncidentRecord[],
  labeledTurnCount: number,
): SessionMetrics {
  return {
    sessionId: session.sessionId,
    provider: session.provider,
    turnCount: session.turns.length,
    labeledTurnCount,
    incidentCount: incidents.length,
    parseWarningCount,
    writeCount: compliance.writeCount,
    verificationCount: compliance.verificationCount,
    verificationPassedCount: compliance.verificationPassedCount,
    verificationFailedCount: compliance.verificationFailedCount,
    postWriteVerificationAttempted: compliance.postWriteVerificationAttempted,
    postWriteVerificationPassed: compliance.postWriteVerificationPassed,
    endedVerified: compliance.endedVerified,
    complianceScore: compliance.score,
    complianceRules: compliance.rules,
  };
}

/**
 * Counts labeled turns in a list of turns.
 */
function countLabeledTurns(turns: RawTurnRecord[]): number {
  return turns.filter((turn) => turn.labels.length > 0).length;
}

/**
 * Processes a single session into turns, incidents, and metrics.
 * @param session - The parsed session to process
 * @param homeDirectory - Optional home directory for path redaction
 * @returns Processed session with turns, incidents, and metrics
 */
export async function processSession(
  session: ParsedSession,
  homeDirectory?: string,
): Promise<ProcessedSession> {
  // Build turns with labels
  const turns = buildSessionTurns(session, homeDirectory);

  // Calculate compliance
  const compliance = scoreCompliance(session);

  // Get turns with labels for clustering
  const incidentTurns = turns
    .map((turn) => ({
      ...turn,
      labels: turn.labels.filter(isIncidentLabel),
    }))
    .filter((turn) => turn.labels.length > 0);

  // Cluster incidents from labeled turns
  const incidents = clusterIncidents(
    incidentTurns,
    { maxTurnGap: getConfig().clustering.maxTurnGap },
    EVALUATOR_VERSION,
    SCHEMA_VERSION,
  );

  const labeledTurnCount = countLabeledTurns(turns);

  return {
    sessionId: session.sessionId,
    turns,
    incidents,
    metrics: buildSessionMetrics(
      session,
      compliance,
      session.parseWarningCount ?? 0,
      incidents,
      labeledTurnCount,
    ),
  };
}
