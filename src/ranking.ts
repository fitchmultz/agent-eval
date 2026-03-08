/**
 * Purpose: Provides severity and confidence ranking utilities for incident clustering and scoring.
 * Entrypoint: Use `severityRank`, `confidenceRank`, `chooseMaxSeverity()`, and `chooseMaxConfidence()` for consistent ordering.
 * Notes: Centralizes ranking logic to eliminate duplication between clustering and summary generation.
 */

import type { Confidence, Severity } from "./schema.js";
import { confidenceValues, severityValues } from "./schema.js";

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
 * Selects the maximum severity from a list of severity values.
 * Uses numeric ranking to determine which severity is most severe.
 * @param values - Array of severity values to compare
 * @returns The most severe value from the input
 */
export function chooseMaxSeverity(values: readonly Severity[]): Severity {
  return values.reduce((current, candidate) =>
    (severityRank.get(candidate) ?? 0) > (severityRank.get(current) ?? 0)
      ? candidate
      : current,
  );
}

/**
 * Selects the maximum confidence from a list of confidence values.
 * Uses numeric ranking to determine which confidence is highest.
 * @param values - Array of confidence values to compare
 * @returns The highest confidence value from the input
 */
export function chooseMaxConfidence(values: readonly Confidence[]): Confidence {
  return values.reduce((current, candidate) =>
    (confidenceRank.get(candidate) ?? 0) > (confidenceRank.get(current) ?? 0)
      ? candidate
      : current,
  );
}
