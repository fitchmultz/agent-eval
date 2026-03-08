/**
 * Purpose: Centralizes configuration options with sensible defaults.
 * Entrypoint: `getConfig()` returns current configuration.
 */

import type { LabelName } from "./schema.js";

/**
 * Configuration interface for the evaluator.
 * All numeric values have sensible defaults that can be overridden.
 */
export interface EvaluatorConfig {
  /** Concurrency settings for different evaluation modes */
  concurrency: {
    /** Number of concurrent sessions for full evaluation */
    full: number;
    /** Number of concurrent sessions for summary-only evaluation */
    summary: number;
  };
  /** Clustering algorithm settings */
  clustering: {
    /** Maximum turn gap between labels to be clustered together */
    maxTurnGap: number;
  };
  /** Preview and truncation settings for message handling */
  previews: {
    /** Maximum length for a single message preview (characters) */
    maxMessageLength: number;
    /** Maximum number of message previews to include */
    maxMessageItems: number;
    /** Maximum number of evidence previews per incident */
    maxIncidentEvidence: number;
    /** Maximum number of top incidents to include in summaries */
    maxTopIncidents: number;
    /** Maximum number of victory lap sessions to highlight */
    maxVictoryLaps: number;
    /** Maximum number of top sessions to include in summaries */
    maxTopSessions: number;
  };
  /** Scoring and weight settings for friction calculation */
  scoring: {
    /** Weights for each label type when calculating friction scores */
    labelWeights: Record<LabelName, number>;
    /** Threshold above which friction score is considered significant */
    frictionThreshold: number;
  };
}

/**
 * Default configuration values.
 * These values are tuned for v1 of the evaluator and favor precision over recall.
 */
const DEFAULT_CONFIG: EvaluatorConfig = {
  concurrency: {
    full: 4,
    summary: 8,
  },
  clustering: {
    maxTurnGap: 2,
  },
  previews: {
    maxMessageLength: 220,
    maxMessageItems: 2,
    maxIncidentEvidence: 3,
    maxTopIncidents: 8,
    maxVictoryLaps: 6,
    maxTopSessions: 8,
  },
  scoring: {
    labelWeights: {
      context_drift: 4,
      test_build_lint_failure_complaint: 5,
      interrupt: 2,
      regression_report: 5,
      praise: -1,
      context_reinjection: 2,
      verification_request: 2,
      stalled_or_guessing: 5,
    },
    frictionThreshold: 6,
  },
};

/** Current configuration, starts with defaults */
let currentConfig: EvaluatorConfig = { ...DEFAULT_CONFIG };

/**
 * Gets the current configuration.
 * @returns The current EvaluatorConfig
 */
export function getConfig(): EvaluatorConfig {
  return currentConfig;
}

/**
 * Updates the current configuration with partial overrides.
 * Unspecified values retain their current settings.
 * @param config - Partial configuration to merge
 */
export function setConfig(
  config: Partial<{
    concurrency: Partial<EvaluatorConfig["concurrency"]>;
    clustering: Partial<EvaluatorConfig["clustering"]>;
    previews: Partial<EvaluatorConfig["previews"]>;
    scoring: Partial<{
      labelWeights: Partial<EvaluatorConfig["scoring"]["labelWeights"]>;
      frictionThreshold: number;
    }>;
  }>,
): void {
  currentConfig = {
    ...currentConfig,
    ...config,
    concurrency: { ...currentConfig.concurrency, ...config.concurrency },
    clustering: { ...currentConfig.clustering, ...config.clustering },
    previews: { ...currentConfig.previews, ...config.previews },
    scoring: {
      ...currentConfig.scoring,
      ...config.scoring,
      labelWeights: {
        ...currentConfig.scoring.labelWeights,
        ...config.scoring?.labelWeights,
      },
    },
  };
}

/**
 * Resets configuration to default values.
 * Useful for testing.
 */
export function resetConfig(): void {
  currentConfig = { ...DEFAULT_CONFIG };
}
