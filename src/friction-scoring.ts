/**
 * Purpose: Calculates friction scores for sessions based on label weights and compliance.
 * Entrypoint: `calculateFrictionScore()` for session friction assessment.
 * Notes: Higher friction scores indicate more operator burden and session disruption.
 *        All weight lookups validate key existence and throw on invalid labels.
 */

import { getConfig } from "./config/index.js";
import { DOMINANT_LABELS, SCORING } from "./constants/index.js";
import { ValidationError } from "./errors.js";
import { incidentLabelNames } from "./labels.js";
import type { LabelName } from "./schema.js";
import { labelTaxonomy } from "./schema.js";

/**
 * Error thrown when a label weight is not found or invalid.
 */
export class FrictionScoringError extends Error {
  constructor(
    public readonly label: string,
    message: string,
  ) {
    super(`Friction scoring error for label "${label}": ${message}`);
    this.name = "FrictionScoringError";
  }
}

/**
 * Validates that a label is in the taxonomy.
 * @param label - The label to validate
 * @throws FrictionScoringError if the label is not valid
 */
function validateLabel(label: string): asserts label is LabelName {
  if (!labelTaxonomy.includes(label as LabelName)) {
    throw new FrictionScoringError(
      label,
      `Invalid label. Expected one of: ${labelTaxonomy.join(", ")}`,
    );
  }
}

/**
 * Gets the friction weight for a specific label.
 * Validates that the label exists in the taxonomy and has a configured weight.
 *
 * @param label - The label to get weight for
 * @returns The weight value for the label
 * @throws FrictionScoringError if the label is invalid or weight is not configured
 */
export function getLabelWeight(label: LabelName): number {
  validateLabel(label);

  const { labelWeights } = getConfig().scoring;
  const weight = labelWeights[label];

  if (weight === undefined) {
    throw new FrictionScoringError(
      label,
      "Weight not configured in scoring configuration",
    );
  }

  if (typeof weight !== "number" || Number.isNaN(weight)) {
    throw new FrictionScoringError(
      label,
      `Invalid weight value: ${String(weight)}. Expected a valid number.`,
    );
  }

  return weight;
}

/**
 * Safely gets a label count from the record, defaulting to 0.
 * Validates the label before accessing.
 *
 * @param labelCounts - The record of label counts
 * @param label - The label to get the count for
 * @returns The count (0 if not present)
 * @throws FrictionScoringError if the label is invalid
 */
function getLabelCount(
  labelCounts: Record<LabelName, number>,
  label: LabelName,
): number {
  validateLabel(label);
  const count = labelCounts[label];
  return typeof count === "number" && !Number.isNaN(count) ? count : 0;
}

/**
 * Calculates the friction score for a session based on label counts and compliance.
 * Validates all labels and weights before calculation.
 *
 * @param labelCounts - Count of each label type in the session
 * @param complianceScore - Session compliance score (0-100)
 * @returns The calculated friction score (higher = more friction)
 * @throws FrictionScoringError if any label is invalid or weight is missing
 */
export function calculateFrictionScore(
  labelCounts: Record<LabelName, number>,
  complianceScore: number,
): number {
  // Validate compliance score
  if (
    typeof complianceScore !== "number" ||
    Number.isNaN(complianceScore) ||
    complianceScore < 0 ||
    complianceScore > 100
  ) {
    throw new ValidationError(
      `Invalid compliance score: ${complianceScore}. Expected a number between 0 and 100.`,
    );
  }

  // Calculate weighted sum using validated getters
  const weighted = labelTaxonomy.reduce((total, label) => {
    if (!incidentLabelNames.includes(label)) {
      return total;
    }
    const count = getLabelCount(labelCounts, label);
    const weight = getLabelWeight(label);
    return total + count * weight;
  }, 0);

  const compliancePenalty =
    Math.max(0, 100 - complianceScore) / SCORING.COMPLIANCE_PENALTY_DIVISOR;
  return Number(Math.max(0, weighted + compliancePenalty).toFixed(1));
}

/**
 * Determines the dominant labels for a session sorted by frequency.
 * Only includes labels that are in the taxonomy and have positive counts.
 *
 * @param labelCounts - Count of each label type in the session
 * @returns Array of up to 3 most frequent labels, sorted by count then alphabetically
 */
export function dominantLabelsForSession(
  labelCounts: Record<LabelName, number>,
): LabelName[] {
  return [...labelTaxonomy]
    .filter((label) => incidentLabelNames.includes(label))
    .filter((label) => {
      const count = labelCounts[label];
      return typeof count === "number" && !Number.isNaN(count) && count > 0;
    })
    .sort(
      (left, right) =>
        (labelCounts[right] ?? 0) - (labelCounts[left] ?? 0) ||
        left.localeCompare(right),
    )
    .slice(0, DOMINANT_LABELS.MAX_COUNT);
}
