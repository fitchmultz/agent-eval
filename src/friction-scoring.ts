/**
 * Purpose: Calculates friction scores for sessions based on label weights and compliance.
 * Entrypoint: `calculateFrictionScore()` for session friction assessment.
 * Notes: Higher friction scores indicate more operator burden and session disruption.
 */

import { DOMINANT_LABELS, SCORING } from "./constants/index.js";
import { getConfig } from "./config.js";
import type { LabelName } from "./schema.js";
import { labelTaxonomy } from "./schema.js";

/**
 * Gets the friction weight for a specific label.
 * @param label - The label to get weight for
 * @returns The weight value for the label
 */
export function getLabelWeight(label: LabelName): number {
  return getConfig().scoring.labelWeights[label];
}

/**
 * Calculates the friction score for a session based on label counts and compliance.
 * @param labelCounts - Count of each label type in the session
 * @param complianceScore - Session compliance score (0-100)
 * @returns The calculated friction score (higher = more friction)
 */
export function calculateFrictionScore(
  labelCounts: Record<LabelName, number>,
  complianceScore: number,
): number {
  const { labelWeights } = getConfig().scoring;
  const weighted = labelTaxonomy.reduce(
    (total, label) => total + labelCounts[label] * labelWeights[label],
    0,
  );
  const compliancePenalty =
    Math.max(0, 100 - complianceScore) / SCORING.COMPLIANCE_PENALTY_DIVISOR;
  return Number(Math.max(0, weighted + compliancePenalty).toFixed(1));
}

/**
 * Determines the dominant labels for a session sorted by frequency.
 * @param labelCounts - Count of each label type in the session
 * @returns Array of up to 3 most frequent labels, sorted by count then alphabetically
 */
export function dominantLabelsForSession(
  labelCounts: Record<LabelName, number>,
): LabelName[] {
  return [...labelTaxonomy]
    .filter((label) => labelCounts[label] > 0)
    .sort(
      (left, right) =>
        labelCounts[right] - labelCounts[left] || left.localeCompare(right),
    )
    .slice(0, DOMINANT_LABELS.MAX_COUNT);
}
