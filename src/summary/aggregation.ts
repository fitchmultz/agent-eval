/**
 * Purpose: Aggregation functions for summary generation.
 * Entrypoint: Used by summary-core for data aggregation.
 * Notes: Handles label counts, session contexts, top-incident selection, and shared artifact collection.
 */

import { getConfig } from "../config/index.js";
import {
  buildTopIncidentSummary,
  insertTopIncident,
} from "../incident-selection.js";
import { isLowSignalPreview, isUnsafePreview } from "../sanitization.js";
import type {
  IncidentRecord,
  LabelName,
  MetricsRecord,
  RawTurnRecord,
  SummaryArtifact,
} from "../schema.js";
import {
  createEmptySessionLabelMap,
  createEmptySeverityCounts,
} from "./scoring.js";
import { collectSessionContexts } from "./session-display.js";
import type { SummaryInputs } from "./types.js";

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

function buildTopIncidents(
  incidents: readonly IncidentRecord[],
  rawTurns: readonly RawTurnRecord[],
): SummaryArtifact["topIncidents"] {
  const sessionContexts = collectSessionContexts(rawTurns);
  let topIncidents: SummaryArtifact["topIncidents"] = [];

  for (const incident of incidents) {
    const summary = buildTopIncidentSummary(
      incident,
      rawTurns,
      sessionContexts.get(incident.sessionId),
    );
    if (
      !summary.evidencePreview ||
      isLowSignalPreview(summary.evidencePreview) ||
      isUnsafePreview(summary.evidencePreview)
    ) {
      continue;
    }
    topIncidents = insertTopIncident(
      topIncidents,
      summary,
      getConfig().previews.maxTopIncidents,
    );
  }

  return topIncidents;
}

/**
 * Builds summary inputs from raw turn and incident data.
 *
 * Collects session label counts, session contexts, severity counts, and top incidents
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

  for (const incident of incidents) {
    severityCounts[incident.severity] += 1;
  }

  return {
    sessionLabelCounts: collectSessionLabelCounts(rawTurns),
    sessionContexts: collectSessionContexts(rawTurns),
    topIncidents: buildTopIncidents(incidents, rawTurns),
    severityCounts,
    writeTurnCount: countWriteTurns(rawTurns),
  };
}

/**
 * Aggregates delivery metrics from session data.
 */
export function aggregateDeliveryMetrics(
  sessionsWithWrites: MetricsRecord["sessions"],
  endedVerifiedWriteSessions: MetricsRecord["sessions"],
): SummaryArtifact["delivery"] {
  return {
    sessionsWithWrites: sessionsWithWrites.length,
    sessionsEndingVerified: endedVerifiedWriteSessions.length,
    writeSessionVerificationRate:
      sessionsWithWrites.length > 0
        ? Math.round(
            (endedVerifiedWriteSessions.length / sessionsWithWrites.length) *
              100,
          )
        : 0,
  };
}
