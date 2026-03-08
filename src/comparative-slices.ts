/**
 * Purpose: Builds comparative slices for trend analysis across session windows.
 * Entrypoint: `buildComparativeSlices()` for generating corpus slices.
 * Notes: Creates snapshots of different corpus windows (recent 100/500/1000) for comparison.
 */

import {
  COMPARATIVE_SLICES,
  FLOW_PENALTY_MULTIPLIERS,
} from "./constants/index.js";
import type { LabelName, MetricsRecord, SummaryArtifact } from "./schema.js";
import { complianceRuleValues, labelTaxonomy } from "./schema.js";
import {
  filterVerifiedWriteSessions,
  filterWriteSessions,
} from "./session-filters.js";
import {
  countLabel,
  createEmptySessionLabelMap,
  safeRate,
} from "./summary-core.js";
import type { ScoreSnapshot } from "./types.js";

function applicablePassRate(
  metrics: MetricsRecord,
  ruleName: SummaryArtifact["compliance"][number]["rule"],
): number {
  const rule = metrics.complianceSummary.find((r) => r.rule === ruleName);
  if (!rule) {
    return 0;
  }
  return safeRate(rule.passCount, rule.passCount + rule.failCount);
}

export function buildScoreSnapshot(metrics: MetricsRecord): ScoreSnapshot {
  const sessionsWithWrites = filterWriteSessions(metrics.sessions);
  const verifiedWriteSessions = filterVerifiedWriteSessions(metrics.sessions);
  const writeVerificationRate = safeRate(
    verifiedWriteSessions.length,
    sessionsWithWrites.length,
  );
  const proofScore = Math.round(writeVerificationRate);
  const flowPenalty =
    safeRate(countLabel(metrics.labelCounts, "interrupt"), metrics.turnCount) *
      FLOW_PENALTY_MULTIPLIERS.INTERRUPT +
    safeRate(
      countLabel(metrics.labelCounts, "context_reinjection"),
      metrics.turnCount,
    ) *
      FLOW_PENALTY_MULTIPLIERS.CONTEXT_REINJECTION +
    safeRate(
      countLabel(metrics.labelCounts, "context_drift"),
      metrics.turnCount,
    ) *
      FLOW_PENALTY_MULTIPLIERS.CONTEXT_DRIFT;
  const flowScore = Math.max(0, Math.round(100 - flowPenalty));
  const disciplineScore = Math.round(
    (applicablePassRate(metrics, "scope_confirmed_before_major_write") +
      applicablePassRate(metrics, "cwd_or_repo_echoed_before_write") +
      applicablePassRate(metrics, "short_plan_before_large_change") +
      applicablePassRate(metrics, "verification_after_code_changes")) /
      4,
  );

  return {
    proofScore,
    flowScore,
    disciplineScore,
    writeVerificationRate,
    incidentsPer100Turns: safeRate(metrics.incidentCount, metrics.turnCount),
  };
}

function aggregateComplianceSummary(
  sessions: readonly MetricsRecord["sessions"][number][],
): SummaryArtifact["compliance"] {
  const summary = complianceRuleValues.map((rule) => ({
    rule,
    passCount: 0,
    failCount: 0,
    notApplicableCount: 0,
    unknownCount: 0,
  }));

  for (const session of sessions) {
    for (const rule of session.complianceRules) {
      const entry = summary.find((candidate) => candidate.rule === rule.rule);
      if (!entry) {
        continue;
      }

      if (rule.status === "pass") {
        entry.passCount += 1;
      } else if (rule.status === "fail") {
        entry.failCount += 1;
      } else if (rule.status === "not_applicable") {
        entry.notApplicableCount += 1;
      } else {
        entry.unknownCount += 1;
      }
    }
  }

  return summary;
}

function aggregateLabelCounts(
  sessions: readonly MetricsRecord["sessions"][number][],
  sessionLabelCounts: Map<string, Record<LabelName, number>>,
): MetricsRecord["labelCounts"] {
  const counts: MetricsRecord["labelCounts"] = {};

  for (const session of sessions) {
    const labels =
      sessionLabelCounts.get(session.sessionId) ?? createEmptySessionLabelMap();
    for (const label of labelTaxonomy) {
      if (labels[label] <= 0) {
        continue;
      }

      counts[label] = (counts[label] ?? 0) + labels[label];
    }
  }

  return counts;
}

function createSubsetMetrics(
  metrics: MetricsRecord,
  sessions: readonly MetricsRecord["sessions"][number][],
  sessionLabelCounts: Map<string, Record<LabelName, number>>,
): MetricsRecord {
  const turnCount = sessions.reduce(
    (total, session) => total + session.turnCount,
    0,
  );
  const incidentCount = sessions.reduce(
    (total, session) => total + session.incidentCount,
    0,
  );

  return {
    evaluatorVersion: metrics.evaluatorVersion,
    schemaVersion: metrics.schemaVersion,
    generatedAt: metrics.generatedAt,
    sessionCount: sessions.length,
    turnCount,
    incidentCount,
    labelCounts: aggregateLabelCounts(sessions, sessionLabelCounts),
    complianceSummary: aggregateComplianceSummary(sessions),
    sessions: [...sessions],
    inventory: metrics.inventory,
  };
}

export function buildComparativeSlices(
  metrics: MetricsRecord,
  sessionLabelCounts: Map<string, Record<LabelName, number>>,
): SummaryArtifact["comparativeSlices"] {
  const candidateSizes = [...COMPARATIVE_SLICES.CANDIDATE_SIZES];
  const slices: SummaryArtifact["comparativeSlices"] = [];
  const selectedSnapshot = buildScoreSnapshot(metrics);

  slices.push({
    key: "selected_corpus",
    label: "Selected Corpus",
    sessionCount: metrics.sessionCount,
    turnCount: metrics.turnCount,
    incidentCount: metrics.incidentCount,
    proofScore: selectedSnapshot.proofScore,
    flowScore: selectedSnapshot.flowScore,
    disciplineScore: selectedSnapshot.disciplineScore,
    writeVerificationRate: selectedSnapshot.writeVerificationRate,
    incidentsPer100Turns: selectedSnapshot.incidentsPer100Turns,
  });

  for (const size of candidateSizes) {
    if (metrics.sessions.length <= size) {
      continue;
    }

    const sessions = metrics.sessions.slice(-size);
    const subsetMetrics = createSubsetMetrics(
      metrics,
      sessions,
      sessionLabelCounts,
    );
    const snapshot = buildScoreSnapshot(subsetMetrics);

    slices.push({
      key: `recent_${size}`,
      label: `Recent ${size}`,
      sessionCount: subsetMetrics.sessionCount,
      turnCount: subsetMetrics.turnCount,
      incidentCount: subsetMetrics.incidentCount,
      proofScore: snapshot.proofScore,
      flowScore: snapshot.flowScore,
      disciplineScore: snapshot.disciplineScore,
      writeVerificationRate: snapshot.writeVerificationRate,
      incidentsPer100Turns: snapshot.incidentsPer100Turns,
    });
  }

  return slices;
}
