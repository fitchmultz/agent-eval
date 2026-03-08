/**
 * Purpose: Scoring functions for summary generation.
 * Entrypoint: Used by summary-core for all score calculations.
 * Notes: Deterministic scoring for compliance, tone, and rates.
 */

import { SCORE_TONE } from "../constants/index.js";
import type {
  LabelName,
  MetricsRecord,
  Severity,
  SummaryArtifact,
} from "../schema.js";
import { labelTaxonomy } from "../schema.js";
import type { ScoreSnapshot, SessionInsightRow } from "./types.js";

/**
 * Calculates a rate as a percentage with safe division.
 *
 * Returns 0 if the denominator is 0 or negative to avoid NaN/Infinity.
 * Results are rounded to 1 decimal place.
 *
 * @param numerator - The count of occurrences
 * @param denominator - The total count
 * @returns The rate as a percentage (0-100+), rounded to 1 decimal
 */
export function safeRate(numerator: number, denominator: number): number {
  if (denominator <= 0) {
    return 0;
  }

  return Number(((numerator / denominator) * 100).toFixed(1));
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
): SummaryArtifact["scoreCards"][number]["tone"] {
  if (score >= SCORE_TONE.GOOD) {
    return "good";
  }
  if (score >= SCORE_TONE.NEUTRAL) {
    return "neutral";
  }
  if (score >= SCORE_TONE.WARN) {
    return "warn";
  }
  return "danger";
}

/**
 * Gets the count for a specific label from label counts.
 *
 * @param labels - Record of label names to counts
 * @param label - The label name to look up
 * @returns The count for the label, or 0 if not present
 */
export function countLabel(
  labels: MetricsRecord["labelCounts"],
  label: LabelName,
): number {
  return labels[label] ?? 0;
}

/**
 * Creates an empty label count map for a session.
 *
 * @returns Record with all label names initialized to 0
 */
export function createEmptySessionLabelMap(): Record<LabelName, number> {
  return Object.fromEntries(labelTaxonomy.map((l) => [l, 0])) as Record<
    LabelName,
    number
  >;
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
 * Calculates a composite score snapshot for a set of sessions.
 *
 * Used for comparative slice analysis.
 */
export function buildScoreSnapshot(
  sessions: SessionInsightRow[],
  turnCount: number,
  incidentCount: number,
): ScoreSnapshot {
  if (sessions.length === 0) {
    return {
      proofScore: 0,
      flowScore: 0,
      disciplineScore: 0,
      writeVerificationRate: 0,
      incidentsPer100Turns: 0,
    };
  }

  const avgComplianceScore =
    sessions.reduce((sum, s) => sum + s.complianceScore, 0) / sessions.length;

  // Flow score: inverse of friction (100 - friction score normalized to 0-100)
  const avgFrictionScore =
    sessions.reduce((sum, s) => sum + s.frictionScore, 0) / sessions.length;
  const flowScore = Math.max(0, 100 - avgFrictionScore * 10);

  // Discipline: sessions with few incidents relative to turns
  const totalWriteSessions = sessions.filter((s) => s.writeCount > 0).length;
  const verifiedWriteSessions = sessions.filter(
    (s) => s.verificationPassedCount > 0,
  ).length;
  const writeVerificationRate =
    totalWriteSessions > 0
      ? Math.round((verifiedWriteSessions / totalWriteSessions) * 100)
      : 0;

  return {
    proofScore: Math.round(avgComplianceScore),
    flowScore: Math.round(flowScore),
    disciplineScore: Math.round(avgComplianceScore * 0.8 + flowScore * 0.2),
    writeVerificationRate,
    incidentsPer100Turns: safeRate(incidentCount, turnCount),
  };
}
