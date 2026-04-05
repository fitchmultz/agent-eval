/**
 * Purpose: Defines CLI option parsing, defaults, and normalization for the public agent-eval entrypoint.
 * Entrypoint: Used by CLI command registration and runtime execution.
 * Notes: Keeps source-aware defaults and CLI override shaping separate from command execution.
 */

import type { DeepPartial, EvaluatorConfig } from "../config/index.js";
import { ENV_VARS, getEnvVarName } from "../config/index.js";
import { ValidationError } from "../errors.js";
import {
  getDefaultSourceHome,
  isSourceProvider,
  type SourceProvider,
} from "../sources.js";
import { getValidatedHomeDirectory } from "../utils/environment.js";

export type TimeBucket = "day" | "week" | "month";

export interface GlobalOptions {
  source: SourceProvider;
  home: string;
  outputDir: string;
  sessionLimit?: number;
  summaryOnly?: boolean;
  concurrency?: number;
  maxTurnGap?: number;
  startDate?: string;
  endDate?: string;
  timeBucket?: TimeBucket;
}

export function getDefaultSource(): SourceProvider {
  const envSource = process.env[getEnvVarName(ENV_VARS.SOURCE)];

  if (envSource && isSourceProvider(envSource)) {
    return envSource;
  }

  return "codex";
}

export function getDefaultHome(source: SourceProvider): string {
  const envHome = process.env[getEnvVarName(ENV_VARS.SOURCE_HOME)];
  if (envHome) {
    return envHome;
  }

  try {
    return getDefaultSourceHome(source, getValidatedHomeDirectory());
  } catch {
    if (source === "claude") {
      return ".claude";
    }
    if (source === "pi") {
      return ".pi";
    }
    return ".codex";
  }
}

export function getDefaultOutputDir(): string {
  return process.env[getEnvVarName(ENV_VARS.OUTPUT_DIR)] ?? "artifacts";
}

function validatePositiveIntegerOption(
  value: number | undefined,
  flag: string,
): void {
  if (typeof value === "undefined") {
    return;
  }

  if (!Number.isInteger(value) || value <= 0) {
    throw new ValidationError(`${flag} must be a positive integer.`);
  }
}

function normalizeDateInput(
  value: string | undefined,
  bound: "start" | "end",
): string | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return bound === "start"
      ? `${trimmed}T00:00:00.000Z`
      : `${trimmed}T23:59:59.999Z`;
  }

  const parsedMs = Date.parse(trimmed);
  if (Number.isNaN(parsedMs)) {
    throw new ValidationError(
      `Invalid ${bound === "start" ? "--start-date" : "--end-date"} value: ${value}`,
    );
  }

  return new Date(parsedMs).toISOString();
}

function normalizeTimeBucket(value?: string): TimeBucket {
  if (!value) {
    return "week";
  }

  if (value === "day" || value === "week" || value === "month") {
    return value;
  }

  throw new ValidationError("--time-bucket must be one of: day, week, month.");
}

export function normalizeOptions(options: GlobalOptions): GlobalOptions {
  const fallbackSource = getDefaultSource();
  if (!isSourceProvider(options.source)) {
    throw new ValidationError(
      `Invalid source provider: ${options.source}. Expected one of: codex, claude, pi.`,
    );
  }

  const source = options.source;
  const fallbackHome = getDefaultHome(fallbackSource);
  const home =
    !options.home ||
    (options.home === fallbackHome && source !== fallbackSource)
      ? getDefaultHome(source)
      : options.home;

  validatePositiveIntegerOption(options.sessionLimit, "--session-limit");
  validatePositiveIntegerOption(options.concurrency, "--concurrency");
  validatePositiveIntegerOption(options.maxTurnGap, "--max-turn-gap");

  const startDate = normalizeDateInput(options.startDate, "start");
  const endDate = normalizeDateInput(options.endDate, "end");
  if (startDate && endDate && Date.parse(startDate) > Date.parse(endDate)) {
    throw new ValidationError(
      "--start-date must be less than or equal to --end-date.",
    );
  }

  return {
    ...options,
    source,
    home,
    ...(startDate ? { startDate } : {}),
    ...(endDate ? { endDate } : {}),
    timeBucket: normalizeTimeBucket(options.timeBucket),
  };
}

export function buildCliOverrides(
  options: GlobalOptions,
): DeepPartial<EvaluatorConfig> {
  const overrides: DeepPartial<EvaluatorConfig> = {};

  if (
    typeof options.concurrency === "number" &&
    !Number.isNaN(options.concurrency)
  ) {
    overrides.concurrency = {
      full: options.concurrency,
      summary: options.concurrency,
    };
  }

  if (
    typeof options.maxTurnGap === "number" &&
    !Number.isNaN(options.maxTurnGap)
  ) {
    overrides.clustering = {
      maxTurnGap: options.maxTurnGap,
    };
  }

  return overrides;
}
