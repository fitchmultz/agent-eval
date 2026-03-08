/**
 * Purpose: Ranks sessions by friction and selects top performers for review.
 * Entrypoint: `buildTopSessions()` and `buildVictoryLaps()` for session prioritization.
 * Notes: Victory laps highlight the best verified delivery sessions.
 */

import { getConfig } from "./config.js";
import {
  calculateFrictionScore,
  dominantLabelsForSession,
} from "./friction-scoring.js";
import type { LabelName, MetricsRecord } from "./schema.js";
import {
  archetypeLabel,
  createArchetypeNote,
  determineArchetype,
} from "./session-archetype.js";
import { createEmptySessionLabelMap } from "./summary/index.js";
import type { SessionInsightRow } from "./summary/types.js";

/**
 * Builds a ranked list of session insights sorted by friction (highest first).
 * @param metrics - Metrics record containing session data
 * @param sessionLabelCounts - Map of session IDs to their label counts
 * @returns Array of session insight rows sorted by friction score
 */
export function buildTopSessions(
  metrics: MetricsRecord,
  sessionLabelCounts: Map<string, Record<LabelName, number>>,
): SessionInsightRow[] {
  return metrics.sessions
    .map((session) => {
      const labelCounts =
        sessionLabelCounts.get(session.sessionId) ??
        createEmptySessionLabelMap();
      const dominantLabels = dominantLabelsForSession(labelCounts);
      const frictionScore = calculateFrictionScore(
        labelCounts,
        session.complianceScore,
      );
      const archetype = determineArchetype(
        session.writeCount,
        session.verificationPassedCount,
        dominantLabels,
        frictionScore,
      );

      return {
        sessionId: session.sessionId,
        archetype,
        archetypeLabel: archetypeLabel(archetype),
        frictionScore,
        complianceScore: session.complianceScore,
        incidentCount: session.incidentCount,
        labeledTurnCount: session.labeledTurnCount,
        writeCount: session.writeCount,
        verificationPassedCount: session.verificationPassedCount,
        dominantLabels,
        note: createArchetypeNote(archetype, dominantLabels, session),
      };
    })
    .sort(
      (left, right) =>
        right.frictionScore - left.frictionScore ||
        right.incidentCount - left.incidentCount ||
        left.sessionId.localeCompare(right.sessionId),
    );
}

/**
 * Selects the top verified delivery sessions (victory laps) for highlighting.
 * @param topSessions - Array of ranked session insights
 * @returns Array of up to 6 best verified delivery sessions
 */
export function buildVictoryLaps(
  topSessions: readonly SessionInsightRow[],
): SessionInsightRow[] {
  return topSessions
    .filter((session) => session.archetype === "verified_delivery")
    .sort(
      (left, right) =>
        right.complianceScore - left.complianceScore ||
        right.verificationPassedCount - left.verificationPassedCount ||
        left.incidentCount - right.incidentCount ||
        left.frictionScore - right.frictionScore ||
        left.sessionId.localeCompare(right.sessionId),
    )
    .slice(0, getConfig().previews.maxVictoryLaps);
}
