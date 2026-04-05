/**
 * Purpose: Processes individual sessions into summarized turns, incidents, canonical metrics, and de-templated analysis facts.
 * Responsibilities: Convert parsed sessions into public-safe turns, clustered incidents, canonical per-session metrics, raw/de-templated label counts, template stats, and deterministic attribution facts.
 * Scope: Shared by all supported transcript sources after normalization.
 * Usage: `processSession(parsedSession, homeDirectory, { templateAnalysis })`.
 * Invariants/Assumptions: Source-specific parsing is complete before processing begins and template analysis is corpus-relative but optional.
 */

import type { SessionAttribution } from "./attribution.js";
import { clusterIncidents } from "./clustering.js";
import { scoreCompliance } from "./compliance.js";
import { getConfig } from "./config/index.js";
import { isIncidentLabel, labelText } from "./labels.js";
import { createMessagePreviews } from "./sanitization.js";
import type {
  ComplianceRuleResult,
  IncidentRecord,
  LabelCountRecord,
  RawTurnRecord,
  ToolCallSummary,
} from "./schema.js";
import {
  createTemplateMessageKey,
  type SessionTemplateAnalysis,
} from "./template-analysis.js";
import { categorizeToolCall } from "./tool-classification.js";
import { extractCommandTextFromArgumentsText } from "./tool-command-text.js";
import type { ParsedSession } from "./transcript/index.js";
import { redactPath } from "./utils/path-redaction.js";
import { ENGINE_VERSION, SCHEMA_VERSION } from "./version.js";

interface CountedEntry {
  key: string;
  count: number;
}

function toDurationMs(
  startedAt: string | undefined,
  endedAt: string | undefined,
): number | null {
  if (!startedAt || !endedAt) {
    return null;
  }

  const startedMs = Date.parse(startedAt);
  const endedMs = Date.parse(endedAt);
  if (Number.isNaN(startedMs) || Number.isNaN(endedMs) || endedMs < startedMs) {
    return null;
  }

  return endedMs - startedMs;
}

function sortCountedEntries(entries: CountedEntry[]): CountedEntry[] {
  return [...entries].sort(
    (left, right) =>
      right.count - left.count || left.key.localeCompare(right.key),
  );
}

function incrementLabelCounts(
  counts: LabelCountRecord,
  labels: readonly { label: keyof LabelCountRecord & string }[],
): void {
  for (const label of labels) {
    counts[label.label] = (counts[label.label] ?? 0) + 1;
  }
}

function defaultAttribution(): SessionAttribution {
  return {
    primary: "unknown",
    confidence: "low",
    reasons: ["Transcript-visible evidence was insufficient."],
  };
}

export interface SessionTemplateStats {
  artifactScore: number | null;
  textSharePct: number | null;
  hasTemplateContent: boolean;
  flags: string[];
  dominantFamilyId: string | null;
  dominantFamilyLabel: string | null;
}

/**
 * Metrics for a single processed session.
 */
export interface SessionMetrics {
  sessionId: string;
  provider: ParsedSession["provider"];
  harness: string | null;
  modelProvider: string | null;
  model: string | null;
  startedAt: string | null;
  endedAt: string | null;
  durationMs: number | null;
  turnCount: number;
  labeledTurnCount: number;
  incidentCount: number;
  parseWarningCount: number;
  userMessageCount: number;
  assistantMessageCount: number;
  toolCallCount: number;
  writeToolCallCount: number;
  verificationToolCallCount: number;
  mcpToolCallCount: number;
  topTools: Array<{ toolName: string; count: number }>;
  toolFamilies: Array<{
    family: ToolCallSummary["toolFamily"] extends infer T
      ? Extract<T, string>
      : string;
    count: number;
  }>;
  mcpServers: Array<{ server: string; toolCallCount: number }>;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  compactionCount: number | null;
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

export interface ProcessedSessionAnalysis {
  rawLabelCounts: LabelCountRecord;
  deTemplatedLabelCounts: LabelCountRecord;
  template: SessionTemplateStats;
  attribution: SessionAttribution;
}

/**
 * Result of processing a single session.
 */
export interface ProcessedSession {
  sessionId: string;
  turns: RawTurnRecord[];
  incidents: IncidentRecord[];
  metrics: SessionMetrics;
  analysis?: ProcessedSessionAnalysis;
}

export interface ProcessSessionOptions {
  templateAnalysis?: SessionTemplateAnalysis | undefined;
}

export function createEmptyProcessedSessionAnalysis(): ProcessedSessionAnalysis {
  return {
    rawLabelCounts: {},
    deTemplatedLabelCounts: {},
    template: {
      artifactScore: 0,
      textSharePct: 0,
      hasTemplateContent: false,
      flags: [],
      dominantFamilyId: null,
      dominantFamilyLabel: null,
    },
    attribution: defaultAttribution(),
  };
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
    normalizedToolName: categorization.normalizedToolName,
    toolFamily: categorization.toolFamily,
    isMcp: categorization.isMcp,
    ...(categorization.mcpServer
      ? { mcpServer: categorization.mcpServer }
      : {}),
    ...(categorization.mcpToolName
      ? { mcpToolName: categorization.mcpToolName }
      : {}),
    category: categorization.category,
    commandText,
    writeLike: categorization.writeLike,
    verificationLike: categorization.verificationLike,
    status: "unknown",
  };
}

function filterMessages(
  sessionId: string,
  turnIndex: number,
  role: "user" | "assistant",
  messages: readonly string[],
  templateAnalysis?: SessionTemplateAnalysis,
): string[] {
  return messages
    .map(
      (message, messageIndex) =>
        templateAnalysis?.filteredMessages.get(
          createTemplateMessageKey(sessionId, turnIndex, role, messageIndex),
        ) ?? message,
    )
    .map((message) => message.trim())
    .filter((message) => message.length > 0);
}

/**
 * Builds raw turn records from a parsed session.
 */
function buildSessionTurns(
  session: ParsedSession,
  rawLabelCounts: LabelCountRecord,
  homeDirectory?: string,
  templateAnalysis?: SessionTemplateAnalysis,
): RawTurnRecord[] {
  const turns: RawTurnRecord[] = [];

  for (const turn of session.turns) {
    const rawLabels = labelText(turn.userMessages.join("\n"));
    incrementLabelCounts(rawLabelCounts, rawLabels);

    const filteredUserMessages = filterMessages(
      session.sessionId,
      turn.turnIndex,
      "user",
      turn.userMessages,
      templateAnalysis,
    );
    const filteredAssistantMessages = filterMessages(
      session.sessionId,
      turn.turnIndex,
      "assistant",
      turn.assistantMessages,
      templateAnalysis,
    );
    const labels = labelText(filteredUserMessages.join("\n"));

    const toolCalls = turn.toolCalls.map((toolCall) => ({
      ...summarizeToolCall(toolCall.toolName, toolCall.argumentsText),
      status: toolCall.status,
    }));

    turns.push({
      engineVersion: ENGINE_VERSION,
      schemaVersion: SCHEMA_VERSION,
      sessionId: session.sessionId,
      parentSessionId: session.parentSessionId,
      turnId: turn.turnId,
      turnIndex: turn.turnIndex,
      startedAt: turn.startedAt,
      cwd: turn.cwd ? redactPath(turn.cwd, homeDirectory) : undefined,
      userMessageCount: filteredUserMessages.length,
      assistantMessageCount: filteredAssistantMessages.length,
      userMessagePreviews: createMessagePreviews(filteredUserMessages, {
        homeDirectory,
        maxItems: getConfig().previews.maxMessageItems,
        maxLength: getConfig().previews.maxMessageLength,
      }),
      assistantMessagePreviews: createMessagePreviews(
        filteredAssistantMessages,
        {
          homeDirectory,
          maxItems: getConfig().previews.maxMessageItems,
          maxLength: getConfig().previews.maxMessageLength,
        },
      ),
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

function collectSessionToolMetrics(
  turns: RawTurnRecord[],
): Pick<
  SessionMetrics,
  | "userMessageCount"
  | "assistantMessageCount"
  | "toolCallCount"
  | "writeToolCallCount"
  | "verificationToolCallCount"
  | "mcpToolCallCount"
  | "topTools"
  | "toolFamilies"
  | "mcpServers"
> {
  let userMessageCount = 0;
  let assistantMessageCount = 0;
  let toolCallCount = 0;
  let writeToolCallCount = 0;
  let verificationToolCallCount = 0;
  let mcpToolCallCount = 0;

  const topToolCounts = new Map<string, number>();
  const toolFamilyCounts = new Map<string, number>();
  const mcpServerCounts = new Map<string, number>();

  for (const turn of turns) {
    userMessageCount += turn.userMessageCount;
    assistantMessageCount += turn.assistantMessageCount;

    for (const toolCall of turn.toolCalls) {
      toolCallCount += 1;
      if (toolCall.writeLike) {
        writeToolCallCount += 1;
      }
      if (toolCall.verificationLike) {
        verificationToolCallCount += 1;
      }
      if (toolCall.isMcp) {
        mcpToolCallCount += 1;
      }

      const normalizedToolName =
        toolCall.normalizedToolName ?? toolCall.toolName;
      topToolCounts.set(
        normalizedToolName,
        (topToolCounts.get(normalizedToolName) ?? 0) + 1,
      );

      const toolFamily = toolCall.toolFamily ?? "other";
      toolFamilyCounts.set(
        toolFamily,
        (toolFamilyCounts.get(toolFamily) ?? 0) + 1,
      );

      if (toolCall.mcpServer) {
        mcpServerCounts.set(
          toolCall.mcpServer,
          (mcpServerCounts.get(toolCall.mcpServer) ?? 0) + 1,
        );
      }
    }
  }

  return {
    userMessageCount,
    assistantMessageCount,
    toolCallCount,
    writeToolCallCount,
    verificationToolCallCount,
    mcpToolCallCount,
    topTools: sortCountedEntries(
      [...topToolCounts.entries()].map(([key, count]) => ({ key, count })),
    )
      .slice(0, 5)
      .map(({ key, count }) => ({ toolName: key, count })),
    toolFamilies: sortCountedEntries(
      [...toolFamilyCounts.entries()].map(([key, count]) => ({ key, count })),
    ).map(({ key, count }) => ({
      family: key as SessionMetrics["toolFamilies"][number]["family"],
      count,
    })),
    mcpServers: sortCountedEntries(
      [...mcpServerCounts.entries()].map(([key, count]) => ({ key, count })),
    ).map(({ key, count }) => ({ server: key, toolCallCount: count })),
  };
}

/**
 * Builds session metrics from processed data.
 */
function buildSessionMetrics(
  session: ParsedSession,
  turns: RawTurnRecord[],
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
  const sessionToolMetrics = collectSessionToolMetrics(turns);

  return {
    sessionId: session.sessionId,
    provider: session.provider,
    harness: session.harness ?? session.provider,
    modelProvider: session.modelProvider ?? null,
    model: session.model ?? null,
    startedAt: session.startedAt ?? null,
    endedAt: session.endedAt ?? null,
    durationMs: toDurationMs(session.startedAt, session.endedAt),
    turnCount: session.turns.length,
    labeledTurnCount,
    incidentCount: incidents.length,
    parseWarningCount,
    userMessageCount: sessionToolMetrics.userMessageCount,
    assistantMessageCount: sessionToolMetrics.assistantMessageCount,
    toolCallCount: sessionToolMetrics.toolCallCount,
    writeToolCallCount: sessionToolMetrics.writeToolCallCount,
    verificationToolCallCount: sessionToolMetrics.verificationToolCallCount,
    mcpToolCallCount: sessionToolMetrics.mcpToolCallCount,
    topTools: sessionToolMetrics.topTools,
    toolFamilies: sessionToolMetrics.toolFamilies,
    mcpServers: sessionToolMetrics.mcpServers,
    inputTokens: session.inputTokens ?? null,
    outputTokens: session.outputTokens ?? null,
    totalTokens: session.totalTokens ?? null,
    compactionCount: session.compactionCount ?? null,
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

function buildDeTemplatedLabelCounts(turns: RawTurnRecord[]): LabelCountRecord {
  const counts: LabelCountRecord = {};
  for (const turn of turns) {
    incrementLabelCounts(counts, turn.labels);
  }
  return counts;
}

/**
 * Processes a single session into turns, incidents, metrics, and canonical analysis facts.
 * @param session - The parsed session to process
 * @param homeDirectory - Optional home directory for path redaction
 * @param options - Optional template analysis for corpus-level de-templating
 * @returns Processed session with turns, incidents, metrics, and analysis
 */
export async function processSession(
  session: ParsedSession,
  homeDirectory?: string,
  options: ProcessSessionOptions = {},
): Promise<ProcessedSession> {
  const rawLabelCounts: LabelCountRecord = {};
  const turns = buildSessionTurns(
    session,
    rawLabelCounts,
    homeDirectory,
    options.templateAnalysis,
  );
  const compliance = scoreCompliance(session);

  const incidentTurns = turns
    .map((turn) => ({
      ...turn,
      labels: turn.labels.filter(isIncidentLabel),
    }))
    .filter((turn) => turn.labels.length > 0);

  const incidents = clusterIncidents(
    incidentTurns,
    { maxTurnGap: getConfig().clustering.maxTurnGap },
    ENGINE_VERSION,
    SCHEMA_VERSION,
  );

  const labeledTurnCount = countLabeledTurns(turns);
  const deTemplatedLabelCounts = buildDeTemplatedLabelCounts(turns);

  return {
    sessionId: session.sessionId,
    turns,
    incidents,
    metrics: buildSessionMetrics(
      session,
      turns,
      compliance,
      session.parseWarningCount ?? 0,
      incidents,
      labeledTurnCount,
    ),
    analysis: {
      ...createEmptyProcessedSessionAnalysis(),
      rawLabelCounts,
      deTemplatedLabelCounts,
      template: {
        artifactScore: options.templateAnalysis?.artifactScore ?? 0,
        textSharePct: options.templateAnalysis?.textSharePct ?? 0,
        hasTemplateContent:
          options.templateAnalysis?.hasTemplateContent ?? false,
        flags: options.templateAnalysis?.flags ?? [],
        dominantFamilyId: options.templateAnalysis?.dominantFamilyId ?? null,
        dominantFamilyLabel:
          options.templateAnalysis?.dominantFamilyLabel ?? null,
      },
    },
  };
}
