/**
 * Purpose: Centralized configuration system with file loading, env vars, and validation.
 * Responsibilities: Default configuration, config loading, runtime overrides, and validation.
 * Entrypoint: getConfig() returns current configuration; initializeConfig() loads from file/env.
 * Usage:
 *   - Import: import { getConfig, setConfig, initializeConfig } from "./config/index.js";
 *   - Initialize: await initializeConfig(); // loads file/env config
 *   - Access: const config = getConfig();
 *   - Update: setConfig({ concurrency: { full: 8 } });
 * Invariants:
 *   - Configuration is immutable after getConfig() returns
 *   - All numeric values are positive integers
 *   - initializeConfig() must be called before accessing env/file-based overrides
 */

import {
  CLUSTERING,
  CONCURRENCY,
  LABEL_WEIGHTS,
  PREVIEWS,
  SCORING,
} from "../constants/index.js";
import type { LabelName } from "../schema.js";
import {
  type DeepPartial,
  loadConfigFile,
  loadEnvConfig,
  mergeConfigs,
} from "./loader.js";
import { validateConfig } from "./validation.js";

export {
  ENV_VARS,
  getEnvNumber,
} from "./env.js";
export {
  type DeepPartial,
  loadConfigFile,
  loadEnvConfig,
  mergeConfigs,
} from "./loader.js";
export { ConfigValidationError, validateConfig } from "./validation.js";

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
    full: CONCURRENCY.FULL_EVALUATION,
    summary: CONCURRENCY.SUMMARY_EVALUATION,
  },
  clustering: {
    maxTurnGap: CLUSTERING.MAX_TURN_GAP,
  },
  previews: {
    maxMessageLength: PREVIEWS.MAX_MESSAGE_LENGTH,
    maxMessageItems: PREVIEWS.MAX_MESSAGE_ITEMS,
    maxIncidentEvidence: PREVIEWS.MAX_INCIDENT_EVIDENCE,
    maxTopIncidents: PREVIEWS.MAX_TOP_INCIDENTS,
    maxVictoryLaps: PREVIEWS.MAX_VICTORY_LAPS,
    maxTopSessions: PREVIEWS.MAX_TOP_SESSIONS,
  },
  scoring: {
    labelWeights: { ...LABEL_WEIGHTS },
    frictionThreshold: SCORING.FRICTION_THRESHOLD,
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

/**
 * Configuration initialization options.
 */
export interface InitializeConfigOptions {
  /** Working directory to search for config files */
  cwd?: string;
  /** Whether to load from config files (default: true) */
  loadFile?: boolean;
  /** Whether to load from environment variables (default: true) */
  loadEnv?: boolean;
  /** Whether to validate the final configuration (default: true) */
  validate?: boolean;
  /** CLI-provided overrides to apply after file/env */
  cliOverrides?: DeepPartial<EvaluatorConfig>;
}

/**
 * Initializes configuration from file and environment variables.
 * Loads in order: defaults → file config → env config → CLI overrides.
 * Can be called multiple times; subsequent calls reinitialize from scratch.
 *
 * @param options - Initialization options
 * @returns Promise that resolves when config is loaded and validated
 * @throws {ConfigValidationError} If validation is enabled and config is invalid
 *
 * @example
 * // Standard initialization
 * await initializeConfig();
 *
 * // With CLI overrides
 * await initializeConfig({
 *   cliOverrides: { concurrency: { full: 8 } }
 * });
 *
 * // Environment variables only (skip files)
 * await initializeConfig({ loadFile: false });
 */
export async function initializeConfig(
  options: InitializeConfigOptions = {},
): Promise<void> {
  const {
    cwd = process.cwd(),
    loadFile = true,
    loadEnv = true,
    validate = true,
    cliOverrides = {},
  } = options;

  // Start with defaults
  let mergedConfig: DeepPartial<EvaluatorConfig> = { ...DEFAULT_CONFIG };

  // Load from file if enabled
  if (loadFile) {
    const fileConfig = await loadConfigFile(cwd);
    mergedConfig = mergeConfigs(mergedConfig, fileConfig);
  }

  // Load from environment if enabled
  if (loadEnv) {
    const envConfig = loadEnvConfig();
    mergedConfig = mergeConfigs(mergedConfig, envConfig);
  }

  // Apply CLI overrides last (highest priority)
  mergedConfig = mergeConfigs(mergedConfig, cliOverrides);

  // Validate if enabled
  if (validate) {
    validateConfig(mergedConfig);
  }

  currentConfig = mergedConfig as EvaluatorConfig;
}
