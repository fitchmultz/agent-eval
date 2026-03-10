/**
 * Purpose: Environment variable names and number-parsing helpers for configuration.
 * Responsibilities: Define ENV_VARS constants and provide typed access for config loading.
 * Scope: All environment variable names are prefixed with CODEX_EVAL_.
 * Usage: import { ENV_VARS, getEnvNumber } from "./env.js";
 * Invariants/Assumptions: Environment variables remain namespaced under `CODEX_EVAL_`.
 */

/**
 * Environment variable names for configuration.
 * All variables are prefixed with CODEX_EVAL_ for namespacing.
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
  /** Maximum number of victory lap sessions to highlight */
  MAX_VICTORY_LAPS: "MAX_VICTORY_LAPS",
  /** Maximum number of top sessions to include in summaries */
  MAX_TOP_SESSIONS: "MAX_TOP_SESSIONS",
  /** Friction threshold for scoring */
  FRICTION_THRESHOLD: "FRICTION_THRESHOLD",
} as const;

/** Type of environment variable keys */
export type EnvVarKey = keyof typeof ENV_VARS;
const ENV_PREFIX = "CODEX_EVAL_";

/**
 * Gets a number value from environment variables with a default fallback.
 * Invalid number strings return the default value.
 * @param key - The environment variable key from ENV_VARS
 * @param defaultValue - Value to return if env var is not set or invalid
 * @returns The parsed number or default
 */
export function getEnvNumber(key: EnvVarKey, defaultValue: number): number {
  const value = process.env[`${ENV_PREFIX}${ENV_VARS[key]}`];
  if (!value) return defaultValue;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}
