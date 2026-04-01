/**
 * Purpose: Compute the deterministic core summary data shared by every analytics output.
 * Responsibilities: Turn metrics and aggregated inputs into stable rates, triage queues, comparative slices, and operator-facing conclusions.
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
  buildEndedVerifiedDeliverySpotlights,
  buildTopSessions,
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

function buildComplianceRows(
  metrics: MetricsRecord,
): SummaryCoreData["compliance"] {
  return metrics.complianceSummary
    .map((rule) => ({
      ...rule,
      passRate: safeRate(rule.passCount, rule.passCount + rule.failCount),
      affectedSessionCount: rule.passCount + rule.failCount,
    }))
    .sort(
      (left, right) =>
        right.failCount - left.failCount ||
        right.affectedSessionCount - left.affectedSessionCount ||
        left.rule.localeCompare(right.rule),
    );
}

function buildOperatorMetrics(
  metrics: MetricsRecord,
  comparativeSlices: SummaryCoreData["comparativeSlices"],
): SummaryCoreData["operatorMetrics"] {
  const writeSessions = filterWriteSessions(metrics.sessions).length;
  const endedVerified = filterEndedVerifiedWriteSessions(
    metrics.sessions,
  ).length;
  const endedUnverified = Math.max(0, writeSessions - endedVerified);
  const verificationRule = metrics.complianceSummary.find(
    (rule) => rule.rule === "verification_after_code_changes",
  );
  const corpus = comparativeSlices.find(
    (slice) => slice.key === "selected_corpus",
  );
  const recent =
    comparativeSlices.find((slice) => slice.key === "recent_500") ??
    comparativeSlices.find((slice) => slice.key === "recent_100") ??
    comparativeSlices.find((slice) => slice.key !== "selected_corpus");
  const verificationDelta =
    recent?.writeSessionVerificationRate !== null &&
    recent?.writeSessionVerificationRate !== undefined &&
    corpus?.writeSessionVerificationRate !== null &&
    corpus?.writeSessionVerificationRate !== undefined
      ? Number(
          (
            recent.writeSessionVerificationRate -
            corpus.writeSessionVerificationRate
          ).toFixed(1),
        )
      : null;

  return [
    {
      label: "Write Sessions",
      value: `${writeSessions}`,
      detail: "Sessions that performed transcript-visible code changes.",
      tone: writeSessions > 0 ? "neutral" : "warn",
    },
    {
      label: "Ended Verified",
      value: `${endedVerified}`,
      detail:
        writeSessions > 0
          ? `${safeRate(endedVerified, writeSessions)}% of write sessions ended with a passing post-write verification signal.`
          : "No write sessions were observed in this corpus.",
      tone:
        writeSessions === 0
          ? "neutral"
          : endedUnverified === 0
            ? "good"
            : "warn",
    },
    {
      label: "Ended Unverified",
      value: `${endedUnverified}`,
      detail:
        writeSessions > 0
          ? `${safeRate(endedUnverified, writeSessions)}% of write sessions ended without a passing post-write verification signal.`
          : "No write sessions were observed in this corpus.",
      tone:
        endedUnverified === 0
          ? "good"
          : endedUnverified >= endedVerified
            ? "danger"
            : "warn",
    },
    {
      label: "Recent Verification Momentum",
      value:
        verificationDelta === null
          ? "N/A"
          : `${verificationDelta >= 0 ? "+" : ""}${verificationDelta} pts`,
      detail:
        verificationDelta === null
          ? "Not enough recent sessions were available for a recent-vs-corpus comparison."
          : `${recent?.label ?? "Recent slice"} versus selected corpus on write-session verification rate.${
              verificationRule
                ? ` Current verification-after-code-changes failures: ${verificationRule.failCount}.`
                : ""
            }`,
      tone:
        verificationDelta === null
          ? "neutral"
          : verificationDelta <= -5
            ? "danger"
            : verificationDelta < 0
              ? "warn"
              : verificationDelta >= 5
                ? "good"
                : "neutral",
    },
  ];
}

function buildMetricGlossary(): SummaryCoreData["metricGlossary"] {
  return [
    {
      key: "write_session_verification_rate",
      label: "Write-Session Verification Rate",
      plainLanguage:
        "The share of sessions with code changes that ended with a passing post-write verification signal.",
      caveat:
        "This is transcript-visible verification behavior, not proof that the underlying repository state is correct.",
    },
    {
      key: "verification_proxy_score",
      label: "Verification Proxy Score",
      plainLanguage:
        "A shorthand version of write-session verification rate used for corpus comparisons.",
      caveat:
        "It reflects observed verification outcomes only and can miss off-transcript checks.",
    },
    {
      key: "workflow_proxy_score",
      label: "Workflow Proxy Score",
      plainLanguage:
        "Average pass rate across scope confirmation, cwd or repo confirmation, planning, and post-write verification rules.",
      caveat: "It summarizes workflow discipline, not task correctness.",
    },
    {
      key: "flow_proxy_score",
      label: "Flow Proxy Score",
      plainLanguage:
        "A calmer-session proxy that drops as interrupts, reinjection, and explicit drift complaints increase.",
      caveat:
        "This score can saturate on noisy corpora, so treat it as secondary context instead of a headline signal.",
    },
  ];
}

function buildExecutiveSummary(
  metrics: MetricsRecord,
  topSessions: SummaryCoreData["topSessions"],
  comparativeSlices: SummaryCoreData["comparativeSlices"],
): SummaryCoreData["executiveSummary"] {
  const sessionsWithWrites = filterWriteSessions(metrics.sessions);
  const endedVerifiedWriteSessions = filterEndedVerifiedWriteSessions(
    metrics.sessions,
  );
  const unverifiedWriteSessions = Math.max(
    0,
    sessionsWithWrites.length - endedVerifiedWriteSessions.length,
  );
  const recent =
    comparativeSlices.find((slice) => slice.key === "recent_500") ??
    comparativeSlices.find((slice) => slice.key === "recent_100") ??
    comparativeSlices.find((slice) => slice.key !== "selected_corpus");
  const corpus = comparativeSlices.find(
    (slice) => slice.key === "selected_corpus",
  );
  const verificationFailures = metrics.complianceSummary.find(
    (rule) => rule.rule === "verification_after_code_changes",
  )?.failCount;
  const topSession = topSessions[0];

  const problem =
    sessionsWithWrites.length === 0
      ? `No write sessions were observed across ${metrics.sessionCount} sessions, so the main story is operational exploration rather than delivery risk.`
      : `${unverifiedWriteSessions} of ${sessionsWithWrites.length} write sessions ended unverified, making post-change verification the primary delivery gap in this corpus.`;

  const change =
    recent &&
    corpus &&
    recent.writeSessionVerificationRate !== null &&
    corpus.writeSessionVerificationRate !== null
      ? `${recent.label} ${
          recent.writeSessionVerificationRate >=
          corpus.writeSessionVerificationRate
            ? "improved"
            : "declined"
        } on verification discipline (${recent.writeSessionVerificationRate}% vs ${corpus.writeSessionVerificationRate}%) while incident density moved to ${recent.incidentsPer100Turns} vs ${corpus.incidentsPer100Turns} incidents per 100 turns.`
      : topSession
        ? "Recent-versus-corpus change is not yet scoreable, so use the current triage queue as the primary investigation path."
        : "Recent-versus-corpus change is not yet scoreable, and no triage-worthy sessions were ranked in this run.";

  const action = topSession
    ? `Inspect "${topSession.sessionDisplayLabel ?? topSession.sessionId}" first because ${(topSession.whySelected?.[0] ?? "it ranked highest in the triage queue").toLowerCase()}${
        typeof verificationFailures === "number"
          ? ` Verification-after-code-changes failures currently affect ${verificationFailures} sessions.`
          : ""
      }`
    : "No ranked sessions were available, so start with compliance and inventory review instead.";

  return { problem, change, action };
}

/**
 * Builds the core summary data from metrics and inputs.
 */
export function buildSummaryCore(
  metrics: MetricsRecord,
  inputs: SummaryInputs,
): SummaryCoreData {
  const sessionsWithWrites = filterWriteSessions(metrics.sessions);
  const endedVerifiedWriteSessions = filterEndedVerifiedWriteSessions(
    metrics.sessions,
  );
  const topSessions = buildTopSessions(
    metrics,
    inputs.sessionLabelCounts,
    inputs.sessionContexts,
  );
  const endedVerifiedDeliverySpotlights =
    buildEndedVerifiedDeliverySpotlights(topSessions);
  const comparativeSlices = buildComparativeSlices(
    metrics,
    inputs.sessionLabelCounts,
  );
  const compliance = buildComplianceRows(metrics);
  const executiveSummary = buildExecutiveSummary(
    metrics,
    topSessions,
    comparativeSlices,
  );
  const operatorMetrics = buildOperatorMetrics(metrics, comparativeSlices);
  const metricGlossary = buildMetricGlossary();

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
    compliance,
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
    endedVerifiedDeliverySpotlights,
    topIncidents: inputs.topIncidents,
    executiveSummary,
    operatorMetrics,
    metricGlossary,
  };
}
