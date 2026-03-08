/**
 * Purpose: Processes individual sessions into summarized turns and incidents.
 * Entrypoint: `processSession()` for single-session evaluation.
 */
import { clusterIncidents } from "./clustering.js";
import { scoreCompliance } from "./compliance.js";
import { labelTurn } from "./labels.js";
import { createMessagePreviews } from "./sanitization.js";
import type {
  ComplianceRuleResult,
  IncidentRecord,
  RawTurnRecord,
  ToolCallSummary,
} from "./schema.js";
import { categorizeToolCall } from "./tool-classification.js";
import type { ParsedSession } from "./transcript.js";
import { EVALUATOR_VERSION, SCHEMA_VERSION } from "./version.js";

/**
 * Metrics for a single processed session.
 */
export interface SessionMetrics {
  sessionId: string;
  turnCount: number;
  labeledTurnCount: number;
  incidentCount: number;
  writeCount: number;
  verificationCount: number;
  verificationPassedCount: number;
  verificationFailedCount: number;
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
  const commandText = argumentsText?.includes('"cmd"')
    ? argumentsText
    : undefined;
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
 * Redacts the home directory from a path.
 */
function redactPath(path: string, homeDirectory?: string): string {
  return homeDirectory ? path.replace(homeDirectory, "~") : path;
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
        maxItems: 2,
        maxLength: 220,
      }),
      assistantMessagePreviews: createMessagePreviews(turn.assistantMessages, {
        homeDirectory,
        maxItems: 2,
        maxLength: 220,
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
  },
  incidents: IncidentRecord[],
  labeledTurnCount: number,
): SessionMetrics {
  return {
    sessionId: session.sessionId,
    turnCount: session.turns.length,
    labeledTurnCount,
    incidentCount: incidents.length,
    writeCount: compliance.writeCount,
    verificationCount: compliance.verificationCount,
    verificationPassedCount: compliance.verificationPassedCount,
    verificationFailedCount: compliance.verificationFailedCount,
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
  const labeledTurns = turns.filter((turn) => turn.labels.length > 0);

  // Cluster incidents from labeled turns
  const incidents = clusterIncidents(
    labeledTurns,
    { maxTurnGap: 2 },
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
      incidents,
      labeledTurnCount,
    ),
  };
}

/**
 * Processes a session from a file path.
 * @param sessionPath - Path to the session transcript file
 * @param homeDirectory - Optional home directory for path redaction
 * @returns Processed session with turns, incidents, and metrics
 */
export async function processSessionFromPath(
  sessionPath: string,
  homeDirectory?: string,
): Promise<ProcessedSession> {
  const { parseTranscriptFile } = await import("./transcript.js");
  const session = await parseTranscriptFile(sessionPath);
  return processSession(session, homeDirectory);
}
