/**
 * Purpose: Ranks sessions into an operator-facing triage queue and selects ended-verified delivery spotlights.
 * Entrypoint: `buildTopSessions()` and `buildEndedVerifiedDeliverySpotlights()` for session prioritization.
 * Notes: Queue rows are deterministic, evidence-linked, and use humane identity instead of raw session ids.
 */

import { getConfig } from "./config/index.js";
import { SCORING } from "./constants/index.js";
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
import {
  deriveSessionDisplayLabel,
  deriveSessionProjectLabel,
  deriveSessionShortId,
  deriveSessionTimestampLabel,
  isTruncatedPreview,
} from "./summary/session-display.js";
import type {
  SessionContext,
  SessionInsightRow,
  SessionMetricRecord,
} from "./summary/types.js";

const RULE_LABELS: Record<string, string> = {
  scope_confirmed_before_major_write: "Scope confirmed before major write",
  cwd_or_repo_echoed_before_write: "Repo or cwd confirmed before write",
  short_plan_before_large_change: "Short plan before large change",
  verification_after_code_changes: "Verification after code changes",
  no_unverified_ending: "No unverified ending",
};

function dedupeSessionInsights(
  sessions: readonly SessionInsightRow[],
): SessionInsightRow[] {
  const uniqueSessions: SessionInsightRow[] = [];
  const seenSessionIds = new Set<string>();

  for (const session of sessions) {
    if (seenSessionIds.has(session.sessionId)) {
      continue;
    }

    seenSessionIds.add(session.sessionId);
    uniqueSessions.push(session);
  }

  return uniqueSessions;
}

function pluralize(count: number, singular: string, plural?: string): string {
  return `${count} ${count === 1 ? singular : (plural ?? `${singular}s`)}`;
}

function buildFailedRules(session: SessionMetricRecord): string[] {
  return session.complianceRules
    .filter((rule) => rule.status === "fail")
    .map((rule) => RULE_LABELS[rule.rule] ?? rule.rule);
}

function buildWhySelected(
  session: SessionMetricRecord,
  frictionScore: number,
  dominantLabels: readonly LabelName[],
  failedRules: readonly string[],
): string[] {
  const reasons: string[] = [];

  if (session.writeCount > 0 && !session.endedVerified) {
    reasons.push(
      "Ended without a passing post-write verification after code changes.",
    );
  }

  if (failedRules.includes("Verification after code changes")) {
    reasons.push("Failed the verification-after-code-changes rule.");
  }

  if (failedRules.includes("No unverified ending")) {
    reasons.push("Failed the no-unverified-ending rule.");
  }

  if (frictionScore >= SCORING.FRICTION_THRESHOLD) {
    reasons.push(
      `${frictionScore} friction points from incident pressure and compliance penalties.`,
    );
  }

  if (session.incidentCount > 0) {
    reasons.push(
      `${pluralize(session.incidentCount, "labeled incident")} in this session.`,
    );
  }

  if (dominantLabels.length > 0) {
    reasons.push(`Dominant signals: ${dominantLabels.join(", ")}.`);
  }

  if (reasons.length === 0) {
    reasons.push(
      "Ranked for operator review based on overall session friction and delivery profile.",
    );
  }

  return reasons.slice(0, 4);
}

function buildTrustFlags(
  session: SessionMetricRecord,
  context?: SessionContext,
): string[] {
  const flags: string[] = [];

  if (session.parseWarningCount > 0) {
    flags.push("Parse warnings were present, so this session may be partial.");
  }

  if (!context || context.evidencePreviews.length === 0) {
    flags.push(
      "No strong evidence preview was available in summary-only output.",
    );
  }

  if (!context || context.sourceRefs.length === 0) {
    flags.push("No source references were captured for this session.");
  }

  if (!context?.leadPreview && context?.evidencePreviews.length) {
    flags.push(
      "No strong human problem statement was available, so the queue title falls back to metadata.",
    );
  }

  if (context?.leadPreviewSource === "assistant") {
    flags.push(
      "Queue title fell back to assistant text because no stronger user preview was available.",
    );
  }

  if (context?.leadPreviewIsCodeLike) {
    flags.push(
      "Queue title fell back to code-like text; inspect the source refs for full context.",
    );
  }

  if (context?.evidencePreviews.some(isTruncatedPreview)) {
    flags.push("Evidence previews were truncated for compact reporting.");
  }

  return flags;
}

function buildSessionInsight(
  session: SessionMetricRecord,
  sessionLabelCounts: Map<string, Record<LabelName, number>>,
  sessionContexts?: Map<string, SessionContext>,
): SessionInsightRow {
  const labelCounts =
    sessionLabelCounts.get(session.sessionId) ?? createEmptySessionLabelMap();
  const context = sessionContexts?.get(session.sessionId);
  const dominantLabels = dominantLabelsForSession(labelCounts);
  const frictionScore = calculateFrictionScore(
    labelCounts,
    session.complianceScore,
  );
  const archetype = determineArchetype(
    session.writeCount,
    session.endedVerified,
    frictionScore,
  );
  const failedRules = buildFailedRules(session);

  return {
    sessionId: session.sessionId,
    sessionShortId: deriveSessionShortId(session.sessionId),
    sessionDisplayLabel: deriveSessionDisplayLabel(session.sessionId, context),
    sessionTimestampLabel: deriveSessionTimestampLabel(context?.startedAt),
    sessionProjectLabel: deriveSessionProjectLabel(
      context?.cwd,
      context?.sourceRefs,
    ),
    archetype,
    archetypeLabel: archetypeLabel(archetype),
    frictionScore,
    complianceScore: session.complianceScore,
    incidentCount: session.incidentCount,
    labeledTurnCount: session.labeledTurnCount,
    writeCount: session.writeCount,
    verificationPassedCount: session.verificationPassedCount,
    endedVerified: session.endedVerified,
    dominantLabels,
    whySelected: buildWhySelected(
      session,
      frictionScore,
      dominantLabels,
      failedRules,
    ),
    failedRules,
    evidencePreviews: context?.evidencePreviews ?? [],
    sourceRefs: context?.sourceRefs ?? [],
    trustFlags: buildTrustFlags(session, context),
    note: createArchetypeNote(archetype, dominantLabels, session),
  };
}

function hasMeaningfulReviewSignal(session: SessionInsightRow): boolean {
  return (
    session.writeCount > 0 ||
    session.incidentCount > 0 ||
    session.frictionScore > 0 ||
    session.failedRules.length > 0 ||
    session.dominantLabels.length > 0
  );
}

function hasActiveDeliveryRisk(session: SessionInsightRow): boolean {
  return (
    session.writeCount > 0 &&
    (!session.endedVerified || session.failedRules.length > 0)
  );
}

function operatorActionBucket(session: SessionInsightRow): number {
  if (hasActiveDeliveryRisk(session)) {
    return 0;
  }

  if (session.writeCount > 0) {
    return 1;
  }

  return 2;
}

function compareSessionInsights(
  left: SessionInsightRow,
  right: SessionInsightRow,
): number {
  return (
    operatorActionBucket(left) - operatorActionBucket(right) ||
    left.complianceScore - right.complianceScore ||
    right.frictionScore - left.frictionScore ||
    right.incidentCount - left.incidentCount ||
    right.failedRules.length - left.failedRules.length ||
    left.sessionDisplayLabel.localeCompare(right.sessionDisplayLabel) ||
    left.sessionId.localeCompare(right.sessionId)
  );
}

/**
 * Builds a ranked list of session insights sorted by friction (highest first).
 * @param metrics - Metrics record containing session data
 * @param sessionLabelCounts - Map of session IDs to their label counts
 * @param sessionContexts - Optional map of session IDs to display/evidence context
 * @returns Array of session insight rows sorted by friction score
 */
export function buildTopSessions(
  metrics: MetricsRecord,
  sessionLabelCounts: Map<string, Record<LabelName, number>>,
  sessionContexts?: Map<string, SessionContext>,
): SessionInsightRow[] {
  const rankedSessions = metrics.sessions
    .map((session) =>
      buildSessionInsight(session, sessionLabelCounts, sessionContexts),
    )
    .filter(hasMeaningfulReviewSignal)
    .sort(compareSessionInsights);

  return dedupeSessionInsights(rankedSessions);
}

/**
 * Selects the top ended-verified delivery sessions for highlighting.
 * @param topSessions - Array of ranked session insights
 * @returns Array of up to 6 best ended-verified delivery sessions
 */
export function buildEndedVerifiedDeliverySpotlights(
  topSessions: readonly SessionInsightRow[],
): SessionInsightRow[] {
  const rankedSpotlights = topSessions
    .filter((session) => session.archetype === "verified_delivery")
    .sort(
      (left, right) =>
        right.complianceScore - left.complianceScore ||
        right.verificationPassedCount - left.verificationPassedCount ||
        left.incidentCount - right.incidentCount ||
        left.frictionScore - right.frictionScore ||
        (left.sessionDisplayLabel ?? left.sessionId).localeCompare(
          right.sessionDisplayLabel ?? right.sessionId,
        ) ||
        left.sessionId.localeCompare(right.sessionId),
    );

  return dedupeSessionInsights(rankedSpotlights).slice(
    0,
    getConfig().previews.maxVictoryLaps,
  );
}
