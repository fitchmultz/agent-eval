/**
 * Purpose: Computes deterministic core summary data like rankings, rates, slices, and incident selection.
 * Entrypoint: `buildSummaryCore()` and `buildSummaryInputsFromArtifacts()` feed the higher-level summary facade.
 * Notes: This is a thin orchestrator that delegates to specialized modules in src/summary/
 */

import { buildComparativeSlices, buildScoreSnapshot } from "./comparative-slices.js";
import { getConfig } from "./config.js";
import type {
  LabelName,
  MetricsRecord,
  SummaryArtifact,
} from "./schema.js";
import {
  filterVerifiedWriteSessions,
  filterWriteSessions,
} from "./session-filters.js";
import { buildTopSessions, buildVictoryLaps } from "./session-ranking.js";
import {
  buildSummaryInputsFromArtifacts,
  countLabel,
  safeRate,
} from "./summary/index.js";
import type { SummaryCoreData, SummaryInputs } from "./summary/types.js";

// Re-export for backward compatibility during transition
export {
  buildComparativeSlices,
  buildScoreSnapshot,
} from "./comparative-slices.js";
export {
  buildSummaryInputsFromArtifacts,
  countLabel,
  safeRate,
} from "./summary/index.js";
export type {
  ScoreSnapshot,
  SessionInsightRow,
  SummaryCoreData,
  SummaryInputs,
} from "./summary/types.js";

const VALID_LABELS: LabelName[] = [
  "context_drift",
  "test_build_lint_failure_complaint",
  "interrupt",
  "regression_report",
  "praise",
  "context_reinjection",
  "verification_request",
  "stalled_or_guessing",
];

/**
 * Builds the core summary data from metrics and inputs.
 *
 * This orchestrator function computes all deterministic metrics including:
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
        return value !== undefined && value > 0 && VALID_LABELS.includes(key as LabelName);
      })
      .map(([label, count]) => ({ label, count }))
      .sort(
        (left, right) =>
          right.count - left.count || left.label.localeCompare(right.label),
      ),
    severities: ["info", "low", "medium", "high"].map((severity) => ({
      severity: severity as SummaryCoreData["severities"][number]["severity"],
      count: inputs.severityCounts[severity as keyof typeof inputs.severityCounts],
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
