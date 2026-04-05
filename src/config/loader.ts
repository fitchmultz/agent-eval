/**
 * Purpose: Load configuration from files and environment variables.
 * Responsibilities: File discovery, JSON parsing, env var mapping.
 * Scope: Supports .agent-evalrc, .agent-evalrc.json, agent-eval.config.json.
 * Usage: import { loadConfigFile, loadEnvConfig, mergeConfigs } from "./loader.js";
 * Invariants: Missing config files are ignored, but malformed config content fails fast with a usage error.
 */

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ConfigFileParseError, normalizeError } from "../errors.js";
import { ENV_VARS, getEnvNumber } from "./env.js";
import type { EvaluatorConfig } from "./index.js";

/** Supported configuration file names in order of precedence */
const CONFIG_FILES = [
  ".agent-evalrc",
  ".agent-evalrc.json",
  "agent-eval.config.json",
] as const;

/** Partial config type helper */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/**
 * Loads configuration from file if it exists.
 * Tries multiple file names in order of precedence.
 * Returns empty object if no config file is present.
 * Throws a usage error when a matching config file exists but contains invalid JSON.
 * @param cwd - Directory to search for config files (default: process.cwd())
 * @returns Partial configuration from file, or empty object
 */
export async function loadConfigFile(
  cwd: string = process.cwd(),
): Promise<DeepPartial<EvaluatorConfig>> {
  for (const filename of CONFIG_FILES) {
    const filepath = join(cwd, filename);
    if (existsSync(filepath)) {
      try {
        const content = await readFile(filepath, "utf8");
        const parsed = JSON.parse(content) as DeepPartial<EvaluatorConfig>;
        return parsed;
      } catch (error) {
        throw new ConfigFileParseError(filepath, normalizeError(error));
      }
    }
  }
  return {};
}

/**
 * Loads configuration from environment variables.
 * All env vars are prefixed with AGENT_EVAL_.
 * @returns Partial configuration from environment variables
 */
export function loadEnvConfig(): DeepPartial<EvaluatorConfig> {
  const config: DeepPartial<EvaluatorConfig> = {};

  // Concurrency settings
  const concurrencyFull = getEnvNumber(ENV_VARS.CONCURRENCY_FULL, 0);
  const concurrencySummary = getEnvNumber(ENV_VARS.CONCURRENCY_SUMMARY, 0);
  if (concurrencyFull > 0 || concurrencySummary > 0) {
    config.concurrency = {};
    if (concurrencyFull > 0) {
      config.concurrency.full = concurrencyFull;
    }
    if (concurrencySummary > 0) {
      config.concurrency.summary = concurrencySummary;
    }
  }

  // Clustering settings
  const maxTurnGap = getEnvNumber(ENV_VARS.MAX_TURN_GAP, 0);
  if (maxTurnGap > 0) {
    config.clustering = { maxTurnGap };
  }

  // Preview settings
  const maxMessageLength = getEnvNumber(ENV_VARS.MAX_MESSAGE_LENGTH, 0);
  const maxMessageItems = getEnvNumber(ENV_VARS.MAX_MESSAGE_ITEMS, 0);
  const maxIncidentEvidence = getEnvNumber(ENV_VARS.MAX_INCIDENT_EVIDENCE, 0);
  const maxTopIncidents = getEnvNumber(ENV_VARS.MAX_TOP_INCIDENTS, 0);
  const maxExemplarSessions = getEnvNumber(ENV_VARS.MAX_EXEMPLAR_SESSIONS, 0);
  const maxReviewQueueSessions = getEnvNumber(
    ENV_VARS.MAX_REVIEW_QUEUE_SESSIONS,
    0,
  );

  if (
    maxMessageLength > 0 ||
    maxMessageItems > 0 ||
    maxIncidentEvidence > 0 ||
    maxTopIncidents > 0 ||
    maxExemplarSessions > 0 ||
    maxReviewQueueSessions > 0
  ) {
    config.previews = {};
    if (maxMessageLength > 0) {
      config.previews.maxMessageLength = maxMessageLength;
    }
    if (maxMessageItems > 0) {
      config.previews.maxMessageItems = maxMessageItems;
    }
    if (maxIncidentEvidence > 0) {
      config.previews.maxIncidentEvidence = maxIncidentEvidence;
    }
    if (maxTopIncidents > 0) {
      config.previews.maxTopIncidents = maxTopIncidents;
    }
    if (maxExemplarSessions > 0) {
      config.previews.maxExemplarSessions = maxExemplarSessions;
    }
    if (maxReviewQueueSessions > 0) {
      config.previews.maxReviewQueueSessions = maxReviewQueueSessions;
    }
  }

  // Scoring settings
  const frictionThreshold = getEnvNumber(ENV_VARS.FRICTION_THRESHOLD, 0);
  if (frictionThreshold > 0) {
    config.scoring = { frictionThreshold };
  }

  return config;
}

/**
 * Merges multiple partial configurations into one.
 * Later configs override earlier ones (shallow merge per section).
 * @param configs - Array of partial configs to merge
 * @returns Merged partial configuration
 */
export function mergeConfigs(
  ...configs: Array<DeepPartial<EvaluatorConfig>>
): DeepPartial<EvaluatorConfig> {
  return configs.reduce<DeepPartial<EvaluatorConfig>>((merged, current) => {
    const result: DeepPartial<EvaluatorConfig> = {};

    for (const [key, value] of Object.entries(merged)) {
      result[key as keyof EvaluatorConfig] = value as never;
    }
    for (const [key, value] of Object.entries(current)) {
      result[key as keyof EvaluatorConfig] = value as never;
    }

    if (merged.concurrency || current.concurrency) {
      result.concurrency = {
        ...merged.concurrency,
        ...current.concurrency,
      };
    }

    if (merged.clustering || current.clustering) {
      result.clustering = {
        ...merged.clustering,
        ...current.clustering,
      };
    }

    if (merged.previews || current.previews) {
      result.previews = {
        ...merged.previews,
        ...current.previews,
      };
    }

    if (merged.scoring || current.scoring) {
      result.scoring = {
        ...merged.scoring,
        ...current.scoring,
        incidentLabelWeights: {
          ...merged.scoring?.incidentLabelWeights,
          ...current.scoring?.incidentLabelWeights,
        },
      };
    }

    return result;
  }, {});
}
