/**
 * Purpose: Environment variable names and parsing helpers for configuration.
 * Responsibilities: Define ENV_VARS constants, build canonical env var names, and provide typed access for config loading.
 * Scope: All environment variable names are prefixed with AGENT_EVAL_.
 * Usage: import { ENV_VARS, ENV_PREFIX, getEnvNumber, getEnvVarName } from "./env.js";
 * Invariants/Assumptions: Environment variables remain namespaced under `AGENT_EVAL_`.
 */

/**
 * Environment variable names for configuration.
 * All variables are prefixed with AGENT_EVAL_ for namespacing.
 */
export const ENV_VARS = {
  /** Generic source home directory */
  SOURCE_HOME: "SOURCE_HOME",
  /** Source provider name */
  SOURCE: "SOURCE",
  /** Output directory for artifacts */
  OUTPUT_DIR: "OUTPUT_DIR",
  /** Concurrency for full evaluation */
  CONCURRENCY_FULL: "CONCURRENCY_FULL",
  /** Concurrency for summary evaluation */
  CONCURRENCY_SUMMARY: "CONCURRENCY_SUMMARY",
  /** Max turn gap for clustering */
  MAX_TURN_GAP: "MAX_TURN_GAP",
  /** Maximum length for a single message preview */
  MAX_MESSAGE_LENGTH: "MAX_MESSAGE_LENGTH",
  /** Maximum number of message previews to include */
  MAX_MESSAGE_ITEMS: "MAX_MESSAGE_ITEMS",
  /** Maximum number of evidence previews per incident */
  MAX_INCIDENT_EVIDENCE: "MAX_INCIDENT_EVIDENCE",
  /** Maximum number of top incidents to include in summaries */
  MAX_TOP_INCIDENTS: "MAX_TOP_INCIDENTS",
  /** Maximum number of exemplar sessions to include in summaries */
  MAX_EXEMPLAR_SESSIONS: "MAX_EXEMPLAR_SESSIONS",
  /** Maximum number of review-queue sessions to include in summaries */
  MAX_REVIEW_QUEUE_SESSIONS: "MAX_REVIEW_QUEUE_SESSIONS",
  /** Friction threshold for scoring */
  FRICTION_THRESHOLD: "FRICTION_THRESHOLD",
} as const;

/** Type of environment variable keys */
export type EnvVarKey = keyof typeof ENV_VARS;
export const ENV_PREFIX = "AGENT_EVAL_";

export function getEnvVarName(key: EnvVarKey): string {
  return `${ENV_PREFIX}${ENV_VARS[key]}`;
}

/**
 * Gets a number value from environment variables with a default fallback.
 * Invalid number strings return the default value.
 * @param key - The environment variable key from ENV_VARS
 * @param defaultValue - Value to return if env var is not set or invalid
 * @returns The parsed number or default
 */
export function getEnvNumber(key: EnvVarKey, defaultValue: number): number {
  const value = process.env[getEnvVarName(key)];
  if (!value) return defaultValue;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

export function getEnvString(key: EnvVarKey): string | undefined {
  const value = process.env[getEnvVarName(key)];
  return typeof value === "string" && value.trim().length > 0
    ? value
    : undefined;
}
