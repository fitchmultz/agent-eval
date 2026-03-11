/**
 * Purpose: Compute the deterministic core summary data shared by every evaluator output.
 * Responsibilities: Turn metrics and aggregated inputs into stable rates, rankings, slices, and opportunities.
 * Scope: Internal summary math used by the public facade in insights.ts.
 * Usage: Called through `buildSummaryArtifact()` in normal evaluator flows.
 * Invariants/Assumptions: This module owns canonical summary math only; decorative cards and report rendering live elsewhere.
 */

import { buildComparativeSlices } from "./comparative-slices.js";
import { getConfig } from "./config/index.js";
import type { LabelName, MetricsRecord } from "./schema.js";
import {
  filterEndedVerifiedWriteSessions,
  filterWriteSessions,
} from "./session-filters.js";
import {
  buildTopSessions,
  buildVerifiedDeliverySpotlights,
} from "./session-ranking.js";
import { countLabel, safeRate } from "./summary/index.js";
import type { SummaryCoreData, SummaryInputs } from "./summary/types.js";

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
  const endedVerifiedWriteSessions = filterEndedVerifiedWriteSessions(
    metrics.sessions,
  );
  const topSessions = buildTopSessions(metrics, inputs.sessionLabelCounts);
  const verifiedDeliverySpotlights =
    buildVerifiedDeliverySpotlights(topSessions);
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
          VALID_LABELS.includes(key as LabelName)
        );
      })
      .map(([label, count]) => ({ label, count }))
      .sort(
        (left, right) =>
          right.count - left.count || left.label.localeCompare(right.label),
      ),
    severities: ["info", "low", "medium", "high"].map((severity) => ({
      severity: severity as SummaryCoreData["severities"][number]["severity"],
      count:
        inputs.severityCounts[severity as keyof typeof inputs.severityCounts],
    })),
    compliance: metrics.complianceSummary,
    parseWarningCount: metrics.parseWarningCount,
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
      sessionsEndingVerified: endedVerifiedWriteSessions.length,
      writeSessionVerificationRate: safeRate(
        endedVerifiedWriteSessions.length,
        sessionsWithWrites.length,
      ),
    },
    comparativeSlices,
    topSessions: topSessions.slice(0, getConfig().previews.maxTopSessions),
    verifiedDeliverySpotlights,
    topIncidents: inputs.topIncidents,
  };
}
