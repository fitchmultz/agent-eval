/**
 * Purpose: Aggregation helpers for v3 summary generation.
 * Entrypoint: Used by evaluator/report flows to build the canonical per-session summary substrate.
 * Notes: Processed-session aggregation is canonical; raw-turn aggregation remains a non-canonical convenience path.
 */

import type {
  IncidentRecord,
  LabelName,
  MetricsRecord,
  RawTurnRecord,
} from "../schema.js";
import type { ProcessedSession } from "../session-processor.js";
import {
  createEmptySessionLabelMap,
  createEmptySeverityCounts,
} from "./scoring.js";
import { collectSessionContexts } from "./session-display.js";
import type {
  SessionTemplateInfo,
  SummaryAggregateStats,
  SummaryInputs,
  SummarySessionRecord,
  SurfaceAttribution,
} from "./types.js";

const DEFAULT_ATTRIBUTION: SurfaceAttribution = {
  primary: "unknown",
  confidence: "low",
  reasons: ["Transcript-visible evidence was insufficient."],
};

const DEFAULT_TEMPLATE: SessionTemplateInfo = {
  artifactScore: 0,
  textSharePct: 0,
  hasTemplateContent: false,
  flags: [],
  dominantFamilyId: null,
  dominantFamilyLabel: null,
};

function extractTurns(
  sessions: ReadonlyArray<{ turns: readonly RawTurnRecord[] }>,
): RawTurnRecord[] {
  return sessions.flatMap((session) => session.turns);
}

function aggregateSummaryStats(
  rawTurns: readonly RawTurnRecord[],
): SummaryAggregateStats {
  return rawTurns.reduce<SummaryAggregateStats>(
    (stats, turn) => {
      stats.totalUserMessages += turn.userMessageCount;
      stats.totalAssistantMessages += turn.assistantMessageCount;
      stats.totalToolCalls += turn.toolCalls.length;
      stats.totalWriteToolCalls += turn.toolCalls.filter(
        (tool) => tool.writeLike,
      ).length;
      stats.totalVerificationToolCalls += turn.toolCalls.filter(
        (tool) => tool.verificationLike,
      ).length;
      return stats;
    },
    {
      totalUserMessages: 0,
      totalAssistantMessages: 0,
      totalToolCalls: 0,
      totalWriteToolCalls: 0,
      totalVerificationToolCalls: 0,
    },
  );
}

function toLabelMap(
  labelCounts: Record<string, number | undefined>,
): Record<LabelName, number> {
  const counts = createEmptySessionLabelMap();

  for (const [label, count] of Object.entries(labelCounts)) {
    if (typeof count === "number") {
      counts[label as LabelName] = count;
    }
  }

  return counts;
}

/**
 * Collects label counts per session from raw turn records.
 */
export function collectSessionLabelCounts(
  rawTurns: readonly RawTurnRecord[],
): Map<string, Record<LabelName, number>> {
  const counts = new Map<string, Record<LabelName, number>>();

  for (const turn of rawTurns) {
    const sessionCounts =
      counts.get(turn.sessionId) ?? createEmptySessionLabelMap();
    for (const label of turn.labels) {
      sessionCounts[label.label] += 1;
    }
    counts.set(turn.sessionId, sessionCounts);
  }

  return counts;
}

/**
 * Counts turns that include write-like tool calls.
 */
export function countWriteTurns(rawTurns: readonly RawTurnRecord[]): number {
  return rawTurns.filter((turn) =>
    turn.toolCalls.some((tool) => tool.writeLike),
  ).length;
}

/**
 * Builds canonical summary inputs from processed sessions.
 */
export function buildSummaryInputsFromSessions(
  sessions: readonly ProcessedSession[],
): SummaryInputs {
  const rawTurns = extractTurns(sessions);
  const sessionContexts = collectSessionContexts(rawTurns);
  const severityCounts = createEmptySeverityCounts();

  const summarySessions: SummarySessionRecord[] = sessions.map((session) => {
    const rawLabels = toLabelMap(session.analysis?.rawLabelCounts ?? {});
    const labels = toLabelMap(session.analysis?.deTemplatedLabelCounts ?? {});

    for (const incident of session.incidents) {
      severityCounts[incident.severity] += 1;
    }

    return {
      sessionId: session.sessionId,
      metrics: session.metrics,
      labels,
      rawLabels,
      context: sessionContexts.get(session.sessionId) ?? null,
      attribution: session.analysis?.attribution ?? DEFAULT_ATTRIBUTION,
      template: session.analysis?.template ?? DEFAULT_TEMPLATE,
    };
  });

  return {
    sessions: summarySessions,
    severityCounts,
    aggregateStats: aggregateSummaryStats(rawTurns),
  };
}

/**
 * Builds summary inputs from raw turns and incidents for convenience wrappers.
 * This path is intentionally non-canonical and should not replace processed-session aggregation.
 */
export function buildSummaryInputsFromArtifacts(
  metrics: MetricsRecord,
  rawTurns: readonly RawTurnRecord[],
  incidents: readonly IncidentRecord[],
): SummaryInputs {
  const sessionLabelCounts = collectSessionLabelCounts(rawTurns);
  const sessionContexts = collectSessionContexts(rawTurns);
  const severityCounts = createEmptySeverityCounts();

  for (const incident of incidents) {
    severityCounts[incident.severity] += 1;
  }

  return {
    sessions: metrics.sessions.map((session) => ({
      sessionId: session.sessionId,
      metrics: session,
      labels:
        sessionLabelCounts.get(session.sessionId) ??
        createEmptySessionLabelMap(),
      rawLabels:
        sessionLabelCounts.get(session.sessionId) ??
        createEmptySessionLabelMap(),
      context: sessionContexts.get(session.sessionId) ?? null,
      attribution: DEFAULT_ATTRIBUTION,
      template: DEFAULT_TEMPLATE,
    })),
    severityCounts,
    aggregateStats: aggregateSummaryStats(rawTurns),
  };
}
