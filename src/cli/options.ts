/**
 * Purpose: Defines CLI option parsing, defaults, and normalization for the public agent-eval entrypoint.
 * Entrypoint: Used by CLI command registration and runtime execution.
 * Notes: Keeps source-aware defaults and CLI override shaping separate from command execution.
 */

import type { DeepPartial, EvaluatorConfig } from "../config/index.js";
import { ENV_VARS } from "../config/index.js";
import { ValidationError } from "../errors.js";
import {
  getDefaultSourceHome,
  isSourceProvider,
  type SourceProvider,
} from "../sources.js";
import { getValidatedHomeDirectory } from "../utils/environment.js";

export interface GlobalOptions {
  source: SourceProvider;
  home: string;
  outputDir: string;
  sessionLimit?: number;
  summaryOnly?: boolean;
  concurrency?: number;
  maxTurnGap?: number;
}

export function getDefaultSource(): SourceProvider {
  const envSource = process.env[`CODEX_EVAL_${ENV_VARS.SOURCE}`];

  if (envSource && isSourceProvider(envSource)) {
    return envSource;
  }

  return "codex";
}

export function getDefaultHome(source: SourceProvider): string {
  const envHome = process.env[`CODEX_EVAL_${ENV_VARS.SOURCE_HOME}`];
  if (envHome) {
    return envHome;
  }

  try {
    return getDefaultSourceHome(source, getValidatedHomeDirectory());
  } catch {
    return source === "claude" ? ".claude" : ".codex";
  }
}

export function getDefaultOutputDir(): string {
  return process.env[ENV_VARS.OUTPUT_DIR] ?? "artifacts";
}

export function normalizeOptions(options: GlobalOptions): GlobalOptions {
  const fallbackSource = getDefaultSource();
  if (!isSourceProvider(options.source)) {
    throw new ValidationError(
      `Invalid source provider: ${options.source}. Expected one of: codex, claude.`,
    );
  }

  const source = options.source;
  const fallbackHome = getDefaultHome(fallbackSource);
  const home =
    !options.home ||
    (options.home === fallbackHome && source !== fallbackSource)
      ? getDefaultHome(source)
      : options.home;

  return {
    ...options,
    source,
    home,
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
