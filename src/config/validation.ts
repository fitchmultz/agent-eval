/**
 * Purpose: Configuration validation using Zod schemas.
 * Responsibilities: Validate config structure, provide helpful error messages.
 * Scope: Validates all EvaluatorConfig fields with sensible constraints.
 * Usage: import { validateConfig, ConfigValidationError } from "./validation.js";
 * Invariants/Assumptions: All numeric fields must be positive integers.
 */

import { z } from "zod";
import { LABEL_WEIGHTS } from "../constants/index.js";
import type { LabelName } from "../schema.js";
import type { EvaluatorConfig } from "./index.js";
import type { DeepPartial } from "./loader.js";

/** Error thrown when configuration validation fails */
export class ConfigValidationError extends Error {
  /** Array of validation error messages */
  public readonly errors: readonly string[];
  /** Exit code for CLI usage */
  public readonly exitCode = 2;

  constructor(errors: string[]) {
    super(`Configuration validation failed:\n  - ${errors.join("\n  - ")}`);
    this.name = "ConfigValidationError";
    this.errors = errors;
  }
}

/** Positive integer schema */
const positiveInt = z.number().int().positive();

/** Label weights schema - validates all required labels (allows negative weights) */
const labelWeightsSchema = z.record(z.string(), z.number()).refine(
  (weights): weights is Record<LabelName, number> => {
    const requiredLabels = Object.keys(LABEL_WEIGHTS) as LabelName[];
    return requiredLabels.every((label) => label in weights);
  },
  {
    message: `Label weights must include all labels: ${Object.keys(LABEL_WEIGHTS).join(", ")}`,
  },
);

/** Concurrency configuration schema */
const concurrencySchema = z.object({
  full: positiveInt.describe(
    "Number of concurrent sessions for full evaluation",
  ),
  summary: positiveInt.describe(
    "Number of concurrent sessions for summary evaluation",
  ),
});

/** Clustering configuration schema */
const clusteringSchema = z.object({
  maxTurnGap: positiveInt.describe(
    "Maximum turn gap between labels to be clustered",
  ),
});

/** Previews configuration schema */
const previewsSchema = z.object({
  maxMessageLength: positiveInt.describe("Maximum length for message previews"),
  maxMessageItems: positiveInt.describe("Maximum number of message previews"),
  maxIncidentEvidence: positiveInt.describe(
    "Maximum evidence previews per incident",
  ),
  maxTopIncidents: positiveInt.describe("Maximum top incidents in summaries"),
  maxVictoryLaps: positiveInt.describe(
    "Maximum victory lap sessions to highlight",
  ),
  maxTopSessions: positiveInt.describe("Maximum top sessions in summaries"),
});

/** Scoring configuration schema */
const scoringSchema = z.object({
  labelWeights: labelWeightsSchema.describe("Weights for each label type"),
  frictionThreshold: z
    .number()
    .nonnegative()
    .describe("Friction score threshold"),
});

/** Complete configuration schema */
const configSchema = z.object({
  concurrency: concurrencySchema,
  clustering: clusteringSchema,
  previews: previewsSchema,
  scoring: scoringSchema,
});

/**
 * Validates a partial or complete configuration object.
 * @param config - Configuration to validate
 * @returns Validated configuration (with defaults applied)
 * @throws {ConfigValidationError} If validation fails
 */
export function validateConfig(
  config: DeepPartial<EvaluatorConfig> | unknown,
): EvaluatorConfig {
  const result = configSchema.safeParse(config);

  if (!result.success) {
    const errors = result.error.issues.map(
      (err) => `${err.path.join(".")}: ${err.message}`,
    );
    throw new ConfigValidationError(errors);
  }

  return result.data;
}
