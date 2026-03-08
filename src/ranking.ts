/**
 * Purpose: Provides severity and confidence ranking utilities for incident clustering and scoring.
 * Entrypoint: Use `severityRank`, `confidenceRank`, `chooseMaxSeverity()`, and `chooseMaxConfidence()` for consistent ordering.
 * Notes: Centralizes ranking logic to eliminate duplication between clustering and summary generation.
 *        All Map lookups validate key existence and throw on invalid keys.
 */

import type { Confidence, Severity } from "./schema.js";
import { confidenceValues, severityValues } from "./schema.js";

/**
 * Error thrown when an invalid severity or confidence value is encountered.
 */
export class RankingError extends Error {
  constructor(
    public readonly invalidValue: string,
    public readonly validValues: readonly string[],
  ) {
    super(
      `Invalid value "${invalidValue}". Expected one of: ${validValues.join(", ")}`,
    );
    this.name = "RankingError";
  }
}

/**
 * Maps severity levels to numeric ranks for comparison.
 * Higher numbers represent more severe incidents.
 */
export const severityRank = new Map<Severity, number>(
  severityValues.map((value, index) => [value, index]),
);

/**
 * Maps confidence levels to numeric ranks for comparison.
 * Higher numbers represent higher confidence.
 */
export const confidenceRank = new Map<Confidence, number>(
  confidenceValues.map((value, index) => [value, index]),
);

/**
 * Gets the rank for a severity value, validating the key exists.
 * @param severity - The severity value to look up
 * @returns The numeric rank
 * @throws RankingError if the severity value is invalid
 */
function getSeverityRank(severity: Severity): number {
  const rank = severityRank.get(severity);
  if (rank === undefined) {
    throw new RankingError(severity, severityValues);
  }
  return rank;
}

/**
 * Gets the rank for a confidence value, validating the key exists.
 * @param confidence - The confidence value to look up
 * @returns The numeric rank
 * @throws RankingError if the confidence value is invalid
 */
function getConfidenceRank(confidence: Confidence): number {
  const rank = confidenceRank.get(confidence);
  if (rank === undefined) {
    throw new RankingError(confidence, confidenceValues);
  }
  return rank;
}

/**
 * Selects the maximum severity from a list of severity values.
 * Uses numeric ranking to determine which severity is most severe.
 * @param values - Array of severity values to compare
 * @returns The most severe value from the input
 * @throws RankingError if any severity value is invalid
 */
export function chooseMaxSeverity(values: readonly Severity[]): Severity {
  if (values.length === 0) {
    throw new RankingError("(empty array)", severityValues);
  }
  return values.reduce((current, candidate) =>
    getSeverityRank(candidate) > getSeverityRank(current) ? candidate : current,
  );
}

/**
 * Selects the maximum confidence from a list of confidence values.
 * Uses numeric ranking to determine which confidence is highest.
 * @param values - Array of confidence values to compare
 * @returns The highest confidence value from the input
 * @throws RankingError if any confidence value is invalid
 */
export function chooseMaxConfidence(values: readonly Confidence[]): Confidence {
  if (values.length === 0) {
    throw new RankingError("(empty array)", confidenceValues);
  }
  return values.reduce((current, candidate) =>
    getConfidenceRank(candidate) > getConfidenceRank(current)
      ? candidate
      : current,
  );
}
