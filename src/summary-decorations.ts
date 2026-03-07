/**
 * Purpose: Builds optional deterministic presentation-oriented decorations on top of the canonical summary core.
 * Entrypoint: `buildSummaryDecorations()` is composed into the final summary artifact by the insights facade.
 * Notes: This module keeps badges, brag cards, score cards, and opportunities out of the core summary math.
 */
import type { MetricsRecord, SummaryArtifact } from "./schema.js";
import type { SessionInsightRow } from "./summary-core.js";
import {
  buildScoreSnapshot,
  countLabel,
  safeRate,
  toneForScore,
} from "./summary-core.js";

export interface SummaryDecorations {
  scoreCards: SummaryArtifact["scoreCards"];
  bragCards: SummaryArtifact["bragCards"];
  achievementBadges: SummaryArtifact["achievementBadges"];
  opportunities: SummaryArtifact["opportunities"];
}

function buildScoreCards(
  metrics: MetricsRecord,
): SummaryArtifact["scoreCards"] {
  const snapshot = buildScoreSnapshot(metrics);

  return [
    {
      title: "Proof Score",
      score: snapshot.proofScore,
      detail:
        "How often write sessions ended with a passing verification signal.",
      tone: toneForScore(snapshot.proofScore),
    },
    {
      title: "Flow Score",
      score: snapshot.flowScore,
      detail:
        "Higher is calmer. This penalizes interrupts, context reinjection, and explicit drift complaints.",
      tone: toneForScore(snapshot.flowScore),
    },
    {
      title: "Discipline Score",
      score: snapshot.disciplineScore,
      detail:
        "Average pass rate across scope, cwd/repo echo, short planning, and post-write verification rules.",
      tone: toneForScore(snapshot.disciplineScore),
    },
  ];
}

function buildBragCards(metrics: MetricsRecord): SummaryArtifact["bragCards"] {
  const sessionsWithWrites = metrics.sessions.filter(
    (session) => session.writeCount > 0,
  );
  const verifiedWriteSessions = sessionsWithWrites.filter(
    (session) => session.verificationPassedCount > 0,
  );
  const quietSessions = metrics.sessions.filter(
    (session) => session.incidentCount === 0,
  );

  return [
    {
      title: "Proof-Backed Ships",
      value: `${verifiedWriteSessions.length}`,
      detail:
        "Sessions that ended with both code changes and a passing verification signal.",
      tone: verifiedWriteSessions.length > 0 ? "good" : "neutral",
    },
    {
      title: "Quiet Runs",
      value: `${quietSessions.length}`,
      detail:
        quietSessions.length > 0
          ? `${safeRate(quietSessions.length, metrics.sessionCount)}% of sessions finished without a labeled incident.`
          : "No fully incident-free sessions were detected in this slice.",
      tone: quietSessions.length > 0 ? "good" : "neutral",
    },
    {
      title: "Battle-Tested Runs",
      value: `${metrics.sessionCount}`,
      detail: "Sessions included in this deterministic corpus slice.",
      tone: metrics.sessionCount >= 1000 ? "good" : "neutral",
    },
  ];
}

function buildAchievementBadges(
  metrics: MetricsRecord,
  topSessions: readonly SessionInsightRow[],
): SummaryArtifact["achievementBadges"] {
  const badges: string[] = [];
  const sessionsWithWrites = metrics.sessions.filter(
    (session) => session.writeCount > 0,
  );
  const verifiedWriteSessions = sessionsWithWrites.filter(
    (session) => session.verificationPassedCount > 0,
  );
  const verificationRate = safeRate(
    verifiedWriteSessions.length,
    sessionsWithWrites.length,
  );
  const interruptionRate = safeRate(
    countLabel(metrics.labelCounts, "interrupt"),
    metrics.turnCount,
  );
  const driftSignals = countLabel(metrics.labelCounts, "context_drift");

  if (metrics.sessionCount >= 1000) {
    badges.push("Battle-Tested Corpus");
  }
  if (verificationRate >= 90) {
    badges.push("Proof-Backed Builder");
  }
  if (interruptionRate <= 2) {
    badges.push("Low-Drama Operator");
  }
  if (driftSignals === 0) {
    badges.push("Zero Drift Complaints");
  }
  if (
    topSessions.some(
      (session) => session.archetype === "high_friction_recovery",
    )
  ) {
    badges.push("Recovery Specialist");
  }

  return badges;
}

function buildOpportunities(
  metrics: MetricsRecord,
  topSessions: readonly SessionInsightRow[],
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

  if (verificationDemand >= 15) {
    opportunities.push({
      title: "Reduce verification prompting burden",
      rationale:
        "Users are frequently asking for verification explicitly. Consider stronger default post-change verification behavior or more visible verification status updates.",
    });
  }

  if (reinjectionDemand >= 8) {
    opportunities.push({
      title: "Improve context retention",
      rationale:
        "Repeated goal or constraint restatement suggests sessions may need better plan persistence or clearer progress anchors.",
    });
  }

  if (driftSignals > 0) {
    opportunities.push({
      title: "Guard against scope drift",
      rationale:
        "At least one session included an explicit context drift complaint. This is a strong candidate for turn-level reminders and tighter write gating.",
    });
  }

  if (
    topSessions.some((session) => session.archetype === "unverified_delivery")
  ) {
    opportunities.push({
      title: "Block unverified deliveries",
      rationale:
        "Some write sessions ended without a passing verification signal. The evaluator should keep emphasizing this as a policy breach, not just a metric.",
    });
  }

  return opportunities.slice(0, 5);
}

export function buildSummaryDecorations(
  metrics: MetricsRecord,
  topSessions: readonly SessionInsightRow[],
): SummaryDecorations {
  return {
    scoreCards: buildScoreCards(metrics),
    bragCards: buildBragCards(metrics),
    achievementBadges: buildAchievementBadges(metrics, topSessions),
    opportunities: buildOpportunities(metrics, topSessions),
  };
}
