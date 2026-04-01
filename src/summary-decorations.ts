/**
 * Purpose: Builds optional deterministic presentation-oriented decorations on top of the canonical summary core.
 * Entrypoint: `buildSummaryDecorations()` is composed into the final summary artifact by the insights facade.
 * Notes: This module keeps badges, brag cards, score cards, and opportunities out of the core summary math.
 */

import { buildScoreSnapshot } from "./comparative-slices.js";
import { BADGES, OPPORTUNITIES } from "./constants/index.js";
import type { MetricsRecord, SummaryArtifact } from "./schema.js";
import {
  filterEndedVerifiedWriteSessions,
  filterQuietSessions,
  filterWriteSessions,
} from "./session-filters.js";
import { countLabel, safeRate, toneForScore } from "./summary/index.js";

/**
 * Presentation-oriented decorations added to the summary core.
 *
 * These are non-essential, UI-friendly extras that enhance the report
 * but are not part of the deterministic core metrics.
 */
export interface SummaryDecorations {
  /** Score cards for verification, flow, and workflow proxy scores */
  scoreCards: SummaryArtifact["scoreCards"];
  /** Highlight cards for operator-facing achievements */
  highlightCards: SummaryArtifact["highlightCards"];
  /** Deterministic recognitions earned by the corpus */
  recognitions: SummaryArtifact["recognitions"];
  /** Deterministic improvement opportunities identified */
  opportunities: SummaryArtifact["opportunities"];
}

function buildScoreCards(
  metrics: MetricsRecord,
): SummaryArtifact["scoreCards"] {
  const snapshot = buildScoreSnapshot(metrics);

  return [
    {
      title: "Verification Proxy Score",
      score: snapshot.verificationProxyScore,
      detail:
        snapshot.verificationProxyScore === null
          ? "No write sessions were observed in this slice."
          : "How often write sessions ended with a passing verification signal.",
      tone:
        snapshot.verificationProxyScore === null
          ? "neutral"
          : toneForScore(snapshot.verificationProxyScore),
    },
    {
      title: "Flow Proxy Score",
      score: snapshot.flowProxyScore,
      detail:
        snapshot.flowProxyScore === null
          ? "No sessions were observed in this slice, so flow is not scoreable yet."
          : "Higher is calmer. This penalizes interrupts, context reinjection, and explicit drift complaints.",
      tone:
        snapshot.flowProxyScore === null
          ? "neutral"
          : toneForScore(snapshot.flowProxyScore),
    },
    {
      title: "Workflow Proxy Score",
      score: snapshot.workflowProxyScore,
      detail:
        snapshot.workflowProxyScore === null
          ? "No write-related compliance rules were exercised in this slice."
          : "Average pass rate across scope, cwd/repo echo, short planning, and post-write verification rules.",
      tone:
        snapshot.workflowProxyScore === null
          ? "neutral"
          : toneForScore(snapshot.workflowProxyScore),
    },
  ];
}

function buildHighlightCards(
  metrics: MetricsRecord,
): SummaryArtifact["highlightCards"] {
  const endedVerifiedWriteSessions = filterEndedVerifiedWriteSessions(
    metrics.sessions,
  );
  const quietSessions = filterQuietSessions(metrics.sessions);

  return [
    {
      title: "Ended-Verified Deliveries",
      value: `${endedVerifiedWriteSessions.length}`,
      detail:
        "Sessions that ended with both code changes and a passing verification signal.",
      tone: endedVerifiedWriteSessions.length > 0 ? "good" : "neutral",
    },
    {
      title: "Low-Incident Sessions",
      value: `${quietSessions.length}`,
      detail:
        quietSessions.length > 0
          ? `${safeRate(quietSessions.length, metrics.sessionCount)}% of sessions finished without a labeled incident.`
          : "No fully incident-free sessions were detected in this slice.",
      tone: quietSessions.length > 0 ? "good" : "neutral",
    },
    {
      title: "Corpus Coverage",
      value: `${metrics.sessionCount}`,
      detail: "Sessions included in this deterministic corpus slice.",
      tone: metrics.sessionCount >= 1000 ? "good" : "neutral",
    },
  ];
}

function buildRecognitions(
  metrics: MetricsRecord,
  topSessions: SummaryArtifact["topSessions"],
): SummaryArtifact["recognitions"] {
  if (metrics.sessionCount === 0) {
    return [];
  }

  const recognitions: string[] = [];
  const sessionsWithWrites = filterWriteSessions(metrics.sessions);
  const endedVerifiedWriteSessions = filterEndedVerifiedWriteSessions(
    metrics.sessions,
  );
  const verificationRate = safeRate(
    endedVerifiedWriteSessions.length,
    sessionsWithWrites.length,
  );
  const interruptionRate = safeRate(
    countLabel(metrics.labelCounts, "interrupt"),
    metrics.turnCount,
  );
  const driftSignals = countLabel(metrics.labelCounts, "context_drift");

  if (metrics.sessionCount >= BADGES.MIN_SESSIONS_FOR_BATTLE_TESTED) {
    recognitions.push("Battle-Tested Corpus");
  }
  if (verificationRate >= BADGES.MIN_VERIFICATION_RATE) {
    recognitions.push("Strong Terminal Verification Proxy");
  }
  if (interruptionRate <= BADGES.MAX_INTERRUPTION_RATE) {
    recognitions.push("Low-Interruption Corpus");
  }
  if (driftSignals === 0) {
    recognitions.push("Zero Drift Complaints");
  }
  if (
    topSessions.some(
      (session) => session.archetype === "high_friction_verified_delivery",
    )
  ) {
    recognitions.push("High-Friction Recovery Evidence");
  }

  return recognitions;
}

function buildOpportunities(
  metrics: MetricsRecord,
  topSessions: SummaryArtifact["topSessions"],
): SummaryArtifact["opportunities"] {
  const opportunities: SummaryArtifact["opportunities"] = [];
  const verificationDemand = safeRate(
    countLabel(metrics.labelCounts, "verification_request"),
    metrics.turnCount,
  );
  const reinjectionDemand = safeRate(
    countLabel(metrics.labelCounts, "context_reinjection"),
    metrics.turnCount,
  );
  const driftSignals = countLabel(metrics.labelCounts, "context_drift");

  if (verificationDemand >= OPPORTUNITIES.MIN_VERIFICATION_DEMAND) {
    opportunities.push({
      title: "Reduce verification prompting burden",
      rationale: `Verification requests appear at ${verificationDemand} per 100 turns. The corpus is signaling that post-change verification should be more automatic and more visible.`,
    });
  }

  if (reinjectionDemand >= OPPORTUNITIES.MIN_REINJECTION_DEMAND) {
    opportunities.push({
      title: "Improve context retention",
      rationale: `Context reinjection appears at ${reinjectionDemand} per 100 turns, suggesting sessions need stronger progress anchors or state carry-forward between steps.`,
    });
  }

  if (driftSignals > 0) {
    opportunities.push({
      title: "Guard against scope drift",
      rationale: `${driftSignals} explicit drift signal${driftSignals === 1 ? "" : "s"} appeared in this corpus. Tighten scope reminders before major writes and keep user intent visible during long runs.`,
    });
  }

  if (
    topSessions.some((session) => session.archetype === "unverified_delivery")
  ) {
    const unverifiedCount = topSessions.filter(
      (session) => session.archetype === "unverified_delivery",
    ).length;
    opportunities.push({
      title: "Block unverified deliveries",
      rationale: `${unverifiedCount} ranked review session${unverifiedCount === 1 ? "" : "s"} ended with code changes but without a passing post-write verification signal. Keep treating this as a triage priority, not just a score movement.`,
    });
  }

  return opportunities.slice(0, OPPORTUNITIES.MAX_SUGGESTIONS);
}

/**
 * Builds optional presentation decorations on top of the summary core.
 *
 * Creates UI-friendly elements including:
 * - Score cards (verification, flow, workflow proxy scores with tones)
 * - Highlight cards (verified deliveries, quiet runs, corpus coverage)
 * - Recognitions (earned based on corpus characteristics)
 * - Improvement opportunities (deterministic suggestions)
 *
 * These decorations are kept separate from core metrics to maintain
 * a clear distinction between deterministic data and presentation layer.
 *
 * @param metrics - Aggregated metrics from the evaluation
 * @param topSessions - Ranked session insight rows
 * @returns SummaryDecorations containing all presentation elements
 */
export function buildSummaryDecorations(
  metrics: MetricsRecord,
  topSessions: SummaryArtifact["topSessions"],
): SummaryDecorations {
  return {
    scoreCards: buildScoreCards(metrics),
    highlightCards: buildHighlightCards(metrics),
    recognitions: buildRecognitions(metrics, topSessions),
    opportunities: buildOpportunities(metrics, topSessions),
  };
}
