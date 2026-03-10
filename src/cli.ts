#!/usr/bin/env node
/**
 * Purpose: Implements the source-aware `agent-eval` CLI entrypoint with file/env config support.
 * Responsibilities: Parse CLI flags, initialize config, dispatch commands, and emit machine-readable stdout.
 * Scope: Public CLI for transcript discovery, parsing, evaluation, and report generation across supported providers.
 * Usage: `agent-eval inspect --source claude --home ~/.claude`.
 * Invariants/Assumptions: CLI defaults remain local-first, transcript-first, and source-aware across supported providers.
 */

import { Command } from "commander";

import {
  ENV_VARS,
  getConfig,
  initializeConfig,
  setConfig,
} from "./config/index.js";
import { discoverArtifacts } from "./discovery.js";
import {
  EvaluatorError,
  errorToMessage,
  FileNotFoundError,
  isEnoentError,
  ValidationError,
} from "./errors.js";
import {
  evaluateArtifacts,
  evaluateArtifactsSummaryOnly,
  writeEvaluationArtifacts,
  writeSummaryArtifacts,
} from "./evaluator.js";
import {
  formatEvalOutput,
  formatInspectOutput,
  formatParseOutput,
} from "./formatters/index.js";
import {
  getDefaultSourceHome,
  isSourceProvider,
  type SourceProvider,
} from "./sources.js";
import { throwIfAborted } from "./utils/abort.js";
import { getValidatedHomeDirectory } from "./utils/environment.js";

interface GlobalOptions {
  source: SourceProvider;
  home: string;
  outputDir: string;
  sessionLimit?: number;
  summaryOnly?: boolean;
  concurrency?: number;
  maxTurnGap?: number;
}

async function runInspectCommand(
  options: GlobalOptions,
  signal: AbortSignal,
): Promise<void> {
  const discovered = await discoverArtifacts(options.home, {
    provider: options.source,
    signal,
  });
  process.stdout.write(
    `${formatInspectOutput(
      discovered.provider,
      discovered.homePath,
      discovered.sessionFiles.length,
      discovered.inventory,
    )}\n`,
  );
}

async function runParseCommand(
  options: GlobalOptions,
  signal: AbortSignal,
): Promise<void> {
  const result = await evaluateArtifacts(options, signal);
  await writeEvaluationArtifacts(
    {
      ...result,
      incidents: [],
      metrics: {
        ...result.metrics,
        incidentCount: 0,
      },
      report: "# Parse Only\n",
    },
    options.outputDir,
  );
  process.stdout.write(
    `${formatParseOutput(options.outputDir, result.rawTurns.length)}\n`,
  );
}

async function runEvalCommand(
  options: GlobalOptions,
  signal: AbortSignal,
): Promise<void> {
  if (options.summaryOnly) {
    const result = await evaluateArtifactsSummaryOnly(options, signal);
    await writeSummaryArtifacts(result, options.outputDir);
    process.stdout.write(
      `${formatEvalOutput(
        options.outputDir,
        result.metrics.sessionCount,
        result.metrics.incidentCount,
        true,
      )}\n`,
    );
    return;
  }

  const result = await evaluateArtifacts(options, signal);
  await writeEvaluationArtifacts(result, options.outputDir);
  process.stdout.write(
    `${formatEvalOutput(
      options.outputDir,
      result.metrics.sessionCount,
      result.metrics.incidentCount,
    )}\n`,
  );
}

async function runReportCommand(
  options: GlobalOptions,
  signal: AbortSignal,
): Promise<void> {
  if (options.summaryOnly) {
    const result = await evaluateArtifactsSummaryOnly(options, signal);
    await writeSummaryArtifacts(result, options.outputDir);
    process.stdout.write(result.report);
    return;
  }

  const result = await evaluateArtifacts(options, signal);
  await writeEvaluationArtifacts(result, options.outputDir);
  process.stdout.write(result.report);
}

/**
 * Gets the default source provider.
 */
function getDefaultSource(): SourceProvider {
  const envSource = process.env[`CODEX_EVAL_${ENV_VARS.SOURCE}`];

  if (envSource && isSourceProvider(envSource)) {
    return envSource;
  }

  return "codex";
}

/**
 * Gets the default source home directory.
 */
function getDefaultHome(source: SourceProvider): string {
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

/**
 * Gets the default output directory.
 * Uses environment variable first, then falls back to "artifacts".
 * @returns The default output directory path
 */
function getDefaultOutputDir(): string {
  return process.env[ENV_VARS.OUTPUT_DIR] ?? "artifacts";
}

/**
 * Builds CLI overrides from parsed options.
 * Only includes options that were explicitly provided.
 * @param options - Parsed CLI options
 * @returns Partial config with CLI overrides
 */
function buildCliOverrides(
  options: GlobalOptions,
): Partial<import("./config/index.js").EvaluatorConfig> {
  const overrides: Partial<import("./config/index.js").EvaluatorConfig> = {};

  if (
    typeof options.concurrency === "number" &&
    !Number.isNaN(options.concurrency)
  ) {
    overrides.concurrency = {
      ...getConfig().concurrency,
      full: options.concurrency,
    };
  }

  if (
    typeof options.maxTurnGap === "number" &&
    !Number.isNaN(options.maxTurnGap)
  ) {
    overrides.clustering = {
      ...getConfig().clustering,
      maxTurnGap: options.maxTurnGap,
    };
  }

  return overrides;
}

export async function main(argv: string[]): Promise<number> {
  // Set up abort controller for graceful shutdown
  const abortController = new AbortController();

  const handleInterrupt = (): void => {
    abortController.abort();
    process.stderr.write("\nInterrupted, cleaning up...\n");
  };

  process.on("SIGINT", handleInterrupt);
  process.on("SIGTERM", handleInterrupt);

  try {
    return await runMain(argv, abortController.signal);
  } catch (error) {
    // Handle abort errors from signal
    if (error instanceof DOMException && error.name === "AbortError") {
      return 130; // Standard exit code for SIGINT
    }
    throw error;
  } finally {
    process.off("SIGINT", handleInterrupt);
    process.off("SIGTERM", handleInterrupt);
  }
}

async function runMain(argv: string[], signal: AbortSignal): Promise<number> {
  const defaultSource = getDefaultSource();
  const defaultHome = getDefaultHome(defaultSource);
  const defaultOutputDir = getDefaultOutputDir();

  const program = new Command();

  program
    .name("agent-eval")
    .description(
      "Evaluate local developer-agent transcript artifacts and emit structured reports.",
    )
    .version("0.1.0")
    .showHelpAfterError()
    .option(
      "--source <provider>",
      "Source provider to inspect: codex or claude (env: CODEX_EVAL_SOURCE)",
      defaultSource,
    )
    .option(
      "--home <path>",
      "Source home to inspect (env: CODEX_EVAL_SOURCE_HOME)",
      defaultHome,
    )
    .option(
      "--output-dir <path>",
      "Directory for generated evaluator artifacts (env: CODEX_EVAL_OUTPUT_DIR)",
      defaultOutputDir,
    )
    .option(
      "--session-limit <count>",
      "Limit transcript files processed during this run",
      (value) => Number.parseInt(value, 10),
    )
    .option(
      "--summary-only",
      "Skip raw-turn and incident JSONL emission and compute only summary/report artifacts",
      false,
    )
    .option(
      "--concurrency <n>",
      "Number of concurrent sessions to process (env: CODEX_EVAL_CONCURRENCY_FULL)",
      (value) => Number.parseInt(value, 10),
    )
    .option(
      "--max-turn-gap <n>",
      "Maximum turn gap for incident clustering (env: CODEX_EVAL_MAX_TURN_GAP)",
      (value) => Number.parseInt(value, 10),
    )
    .addHelpText(
      "after",
      [
        "",
        "Configuration:",
        "  Config files (in order of precedence):",
        "    - .agent-evalrc",
        "    - .agent-evalrc.json",
        "    - agent-eval.config.json",
        "",
        "  Environment variables:",
        "    CODEX_EVAL_SOURCE              - Source provider (codex|claude)",
        "    CODEX_EVAL_SOURCE_HOME         - Source home directory",
        "    CODEX_EVAL_OUTPUT_DIR          - Output directory for artifacts",
        "    CODEX_EVAL_CONCURRENCY_FULL    - Concurrency for full evaluation",
        "    CODEX_EVAL_CONCURRENCY_SUMMARY - Concurrency for summary evaluation",
        "    CODEX_EVAL_MAX_TURN_GAP        - Max turn gap for clustering",
        "",
        "Examples:",
        "  agent-eval inspect --source codex --home ~/.codex",
        "  agent-eval inspect --source claude --home ~/.claude",
        "  agent-eval eval --source codex --home ~/.codex --output-dir artifacts",
        "  agent-eval eval --source claude --home ~/.claude --output-dir artifacts",
        "  agent-eval eval --source claude --home ~/.claude --session-limit 25",
        "  agent-eval eval --source codex --home ~/.codex --summary-only",
        "",
        "Exit codes:",
        "  0 success",
        "  1 runtime failure",
        "  2 usage error",
      ].join("\n"),
    );

  program
    .command("inspect")
    .description(
      "Discover canonical and optional local transcript stores for a supported source.",
    )
    .action(async () => {
      throwIfAborted(signal);
      const options = normalizeOptions(program.opts<GlobalOptions>());

      // Initialize config with CLI overrides
      await initializeConfig({
        cliOverrides: buildCliOverrides(options),
      });

      // Apply any remaining runtime config updates
      applyRuntimeConfigOverrides(options);

      await runInspectCommand(options, signal);
    });

  program
    .command("parse")
    .description("Parse transcript files and emit raw turn artifacts.")
    .action(async () => {
      throwIfAborted(signal);
      const options = normalizeOptions(program.opts<GlobalOptions>());

      await initializeConfig({
        cliOverrides: buildCliOverrides(options),
      });

      applyRuntimeConfigOverrides(options);

      await runParseCommand(options, signal);
    });

  program
    .command("eval")
    .description(
      "Run parsing, labeling, clustering, scoring, and artifact emission.",
    )
    .action(async () => {
      throwIfAborted(signal);
      const options = normalizeOptions(program.opts<GlobalOptions>());

      await initializeConfig({
        cliOverrides: buildCliOverrides(options),
      });

      applyRuntimeConfigOverrides(options);

      await runEvalCommand(options, signal);
    });

  program
    .command("report")
    .description(
      "Generate the markdown evaluator report and write all artifacts.",
    )
    .action(async () => {
      throwIfAborted(signal);
      const options = normalizeOptions(program.opts<GlobalOptions>());

      await initializeConfig({
        cliOverrides: buildCliOverrides(options),
      });

      applyRuntimeConfigOverrides(options);

      await runReportCommand(options, signal);
    });

  try {
    await program.parseAsync(argv);
    return 0;
  } catch (error) {
    // Handle typed errors with appropriate exit codes
    if (error instanceof EvaluatorError) {
      process.stderr.write(`${error.message}\n`);
      return error.exitCode;
    }

    // Convert ENOENT errors to FileNotFoundError for better messaging
    if (isEnoentError(error)) {
      const path =
        typeof error === "object" && error !== null && "path" in error
          ? String(error.path)
          : "unknown path";
      const fileError = new FileNotFoundError(path);
      process.stderr.write(`${fileError.message}\n`);
      return fileError.exitCode;
    }

    // Generic error handling
    const message = errorToMessage(error);
    process.stderr.write(`${message}\n`);
    return 1;
  }
}

function normalizeOptions(options: GlobalOptions): GlobalOptions {
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

/**
 * Applies runtime configuration overrides from CLI options.
 * This is for options that need to update the shared config state
 * after initialization.
 * @param options - Parsed CLI options
 */
function applyRuntimeConfigOverrides(options: GlobalOptions): void {
  const configUpdates: Partial<Parameters<typeof setConfig>[0]> = {};

  if (
    typeof options.concurrency === "number" &&
    !Number.isNaN(options.concurrency)
  ) {
    configUpdates.concurrency = {
      ...getConfig().concurrency,
      full: options.concurrency,
    };
  }

  if (
    typeof options.maxTurnGap === "number" &&
    !Number.isNaN(options.maxTurnGap)
  ) {
    configUpdates.clustering = {
      ...getConfig().clustering,
      maxTurnGap: options.maxTurnGap,
    };
  }

  if (Object.keys(configUpdates).length > 0) {
    setConfig(configUpdates);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const exitCode = await main(process.argv);
  process.exit(exitCode);
}
