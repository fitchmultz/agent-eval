/**
 * Purpose: Computes deterministic core summary data like rankings, rates, slices, and incident selection.
 * Entrypoint: `buildSummaryCore()` and `buildSummaryInputsFromArtifacts()` feed the higher-level summary facade.
 * Notes: This module intentionally excludes presentation-only decorations. Comparative slices, archetype,
 *           friction scoring, ranking, and incident selection logic have been extracted to focused modules.
 */

import { buildComparativeSlices } from "./comparative-slices.js";
import { getConfig } from "./config.js";
import { insertTopIncident } from "./incident-selection.js";
import type {
  IncidentRecord,
  LabelName,
  MetricsRecord,
  RawTurnRecord,
  Severity,
  SummaryArtifact,
} from "./schema.js";
import { severityValues } from "./schema.js";
import {
  filterVerifiedWriteSessions,
  filterWriteSessions,
} from "./session-filters.js";
import { buildTopSessions, buildVictoryLaps } from "./session-ranking.js";
import type { SummaryCoreData, SummaryInputs } from "./types.js";

export {
  buildComparativeSlices,
  buildScoreSnapshot,
} from "./comparative-slices.js";
export type {
  ScoreSnapshot,
  SessionInsightRow,
  SummaryCoreData,
  SummaryInputs,
} from "./types.js";

/**
 * Gets the count for a specific label from label counts.
 *
 * @param labels - Record of label names to counts
 * @param label - The label name to look up
 * @returns The count for the label, or 0 if not present
 *
 * @example
 * ```typescript
 * const count = countLabel(metrics.labelCounts, "interrupt");
 * ```
 */
export function countLabel(
  labels: MetricsRecord["labelCounts"],
  label: LabelName,
): number {
  return labels[label] ?? 0;
}

/**
 * Calculates a rate as a percentage with safe division.
 *
 * Returns 0 if the denominator is 0 or negative to avoid NaN/Infinity.
 * Results are rounded to 1 decimal place.
 *
 * @param numerator - The count of occurrences
 * @param denominator - The total count
 * @returns The rate as a percentage (0-100+), rounded to 1 decimal
 *
 * @example
 * ```typescript
 * safeRate(15, 100); // 15.0
 * safeRate(0, 0); // 0
 * ```
 */
export function safeRate(numerator: number, denominator: number): number {
  if (denominator <= 0) {
    return 0;
  }

  return Number(((numerator / denominator) * 100).toFixed(1));
}

/**
 * Creates an empty label count map for a session.
 *
 * @returns Record with all label names initialized to 0
 */
export function createEmptySessionLabelMap(): Record<LabelName, number> {
  return {
    context_drift: 0,
    test_build_lint_failure_complaint: 0,
    interrupt: 0,
    regression_report: 0,
    praise: 0,
    context_reinjection: 0,
    verification_request: 0,
    stalled_or_guessing: 0,
  };
}

/**
 * Creates an empty severity count map.
 *
 * @returns Record with all severity levels initialized to 0
 */
export function createEmptySeverityCounts(): Record<Severity, number> {
  return {
    info: 0,
    low: 0,
    medium: 0,
    high: 0,
  };
}

/**
 * Collects label counts per session from raw turn records.
 *
 * @param rawTurns - All parsed and labeled turns
 * @returns Map from session ID to label counts for that session
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
 *
 * @param rawTurns - All parsed turns
 * @returns Number of turns containing at least one write tool call
 */
export function countWriteTurns(rawTurns: readonly RawTurnRecord[]): number {
  return rawTurns.filter((turn) =>
    turn.toolCalls.some((tool) => tool.writeLike),
  ).length;
}

/**
 * Determines the tone classification for a score value.
 *
 * Scores are classified as:
 * - "good": 90-100
 * - "neutral": 70-89
 * - "warn": 40-69
 * - "danger": 0-39
 *
 * @param score - The score value (0-100)
 * @returns The tone classification for the score
 */
export function toneForScore(
  score: number,
): import("./schema.js").SummaryArtifact["scoreCards"][number]["tone"] {
  if (score >= 90) {
    return "good";
  }
  if (score >= 70) {
    return "neutral";
  }
  if (score >= 40) {
    return "warn";
  }
  return "danger";
}

/**
 * Builds summary inputs from raw turn and incident data.
 *
 * Collects session label counts, severity counts, and top incidents
 * for use in summary generation.
 *
 * @param rawTurns - All parsed and labeled turns
 * @param incidents - Clustered incidents
 * @returns SummaryInputs ready for buildSummaryArtifact()
 */
export function buildSummaryInputsFromArtifacts(
  rawTurns: readonly RawTurnRecord[],
  incidents: readonly IncidentRecord[],
): SummaryInputs {
  const severityCounts = createEmptySeverityCounts();
  let topIncidents: SummaryArtifact["topIncidents"] = [];

  for (const incident of incidents) {
    severityCounts[incident.severity] += 1;
    topIncidents = insertTopIncident(
      topIncidents,
      {
        incidentId: incident.incidentId,
        sessionId: incident.sessionId,
        summary: incident.summary,
        severity: incident.severity,
        confidence: incident.confidence,
        turnSpan: incident.turnIndices.length,
        evidencePreview: incident.evidencePreviews[0],
      },
      getConfig().previews.maxTopIncidents,
    );
  }

  return {
    sessionLabelCounts: collectSessionLabelCounts(rawTurns),
    topIncidents,
    severityCounts,
    writeTurnCount: countWriteTurns(rawTurns),
  };
}

/**
 * Builds the core summary data from metrics and inputs.
 *
 * This function computes all deterministic metrics including:
 * - Label counts and severity distribution
 * - Operational rates (incidents, writes, verifications per 100 turns)
 * - Delivery metrics (write verification rates)
 * - Comparative slices and session rankings
 * - Top incidents
 *
 * @param metrics - Aggregated metrics from the evaluation
 * @param inputs - Summary inputs containing session data
 * @returns Core summary data ready for decoration and reporting
 */
export function buildSummaryCore(
  metrics: MetricsRecord,
  inputs: SummaryInputs,
): SummaryCoreData {
  const sessionsWithWrites = filterWriteSessions(metrics.sessions);
  const verifiedWriteSessions = filterVerifiedWriteSessions(metrics.sessions);
  const topSessions = buildTopSessions(metrics, inputs.sessionLabelCounts);
  const victoryLaps = buildVictoryLaps(topSessions);
  const comparativeSlices = buildComparativeSlices(
    metrics,
    inputs.sessionLabelCounts,
  );

  return {
    labels: Object.entries(metrics.labelCounts)
      .filter((entry): entry is [LabelName, number] => {
        const [key, value] = entry;
        return (
          value !== undefined &&
          value > 0 &&
          [
            "context_drift",
            "test_build_lint_failure_complaint",
            "interrupt",
            "regression_report",
            "praise",
            "context_reinjection",
            "verification_request",
            "stalled_or_guessing",
          ].includes(key)
        );
      })
      .map(([label, count]) => ({ label, count }))
      .sort(
        (left, right) =>
          right.count - left.count || left.label.localeCompare(right.label),
      ),
    severities: severityValues.map((severity) => ({
      severity,
      count: inputs.severityCounts[severity],
    })),
    compliance: metrics.complianceSummary,
    rates: {
      incidentsPer100Turns: safeRate(metrics.incidentCount, metrics.turnCount),
      writesPer100Turns: safeRate(inputs.writeTurnCount, metrics.turnCount),
      verificationRequestsPer100Turns: safeRate(
        countLabel(metrics.labelCounts, "verification_request"),
        metrics.turnCount,
      ),
      interruptionsPer100Turns: safeRate(
        countLabel(metrics.labelCounts, "interrupt"),
        metrics.turnCount,
      ),
      reinjectionsPer100Turns: safeRate(
        countLabel(metrics.labelCounts, "context_reinjection"),
        metrics.turnCount,
      ),
      praisePer100Turns: safeRate(
        countLabel(metrics.labelCounts, "praise"),
        metrics.turnCount,
      ),
    },
    delivery: {
      sessionsWithWrites: sessionsWithWrites.length,
      verifiedWriteSessions: verifiedWriteSessions.length,
      writeVerificationRate: safeRate(
        verifiedWriteSessions.length,
        sessionsWithWrites.length,
      ),
    },
    comparativeSlices,
    topSessions: topSessions.slice(0, getConfig().previews.maxTopSessions),
    victoryLaps,
    topIncidents: inputs.topIncidents,
  };
}
