/**
 * Purpose: Shared deterministic helpers for summary math.
 * Entrypoint: Used by evaluator, summary builders, and comparative slices.
 * Notes: Keeps small, reusable counting/rate helpers independent from product-specific summary shape.
 */

import type { LabelName, MetricsRecord, Severity } from "../schema.js";
import { labelTaxonomy } from "../schema.js";

/**
 * Calculates a rate as a percentage with safe division.
 */
export function safeRate(numerator: number, denominator: number): number {
  if (denominator <= 0) {
    return 0;
  }

  return Number(((numerator / denominator) * 100).toFixed(1));
}

/**
 * Gets the count for a specific label from label counts.
 */
export function countLabel(
  labels: MetricsRecord["labelCounts"],
  label: LabelName,
): number {
  return labels[label] ?? 0;
}

/**
 * Creates an empty label count map for a session.
 */
export function createEmptySessionLabelMap(): Record<LabelName, number> {
  return Object.fromEntries(labelTaxonomy.map((l) => [l, 0])) as Record<
    LabelName,
    number
  >;
}

/**
 * Creates an empty severity count map.
 */
export function createEmptySeverityCounts(): Record<Severity, number> {
  return {
    info: 0,
    low: 0,
    medium: 0,
    high: 0,
  };
}
