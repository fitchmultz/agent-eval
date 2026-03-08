#!/usr/bin/env node
/**
 * Purpose: Implements the `codex-eval` CLI entrypoint and dispatches inventory, parse, eval, and report workflows.
 * Entrypoint: `main()` is invoked when the file is run directly or through the package bin.
 * Notes: All commands emit machine-readable data to stdout and write artifacts only when requested by the command.
 */

import { Command } from "commander";

import { getConfig, setConfig } from "./config.js";
import { discoverArtifacts } from "./discovery.js";
import {
  EvaluatorError,
  errorToMessage,
  FileNotFoundError,
  isEnoentError,
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
import { throwIfAborted } from "./utils/abort.js";
import { getValidatedHomeDirectory } from "./utils/environment.js";

interface GlobalOptions {
  codexHome: string;
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
  const inventory = await discoverArtifacts(options.codexHome, { signal });
  process.stdout.write(
    `${formatInspectOutput(
      options.codexHome,
      inventory.sessionFiles.length,
      inventory.inventory,
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
  // Validate and get home directory with cross-platform support
  let defaultCodexHome: string;
  try {
    const homeDirectory = getValidatedHomeDirectory();
    defaultCodexHome = `${homeDirectory}/.codex`;
  } catch {
    // Fallback to relative path if HOME is not set
    defaultCodexHome = ".codex";
  }

  // Apply CLI-provided config overrides before any command runs
  const applyConfigOverrides = (options: GlobalOptions): void => {
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
  };

  const program = new Command();

  program
    .name("codex-eval")
    .description(
      "Evaluate local Codex session artifacts and emit structured reports.",
    )
    .version("0.1.0")
    .showHelpAfterError()
    .option("--codex-home <path>", "Codex home to inspect", defaultCodexHome)
    .option(
      "--output-dir <path>",
      "Directory for generated evaluator artifacts",
      "artifacts",
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
      "Number of concurrent sessions to process (full evaluation)",
      (value) => Number.parseInt(value, 10),
    )
    .option(
      "--max-turn-gap <n>",
      "Maximum turn gap for incident clustering",
      (value) => Number.parseInt(value, 10),
    )
    .addHelpText(
      "after",
      [
        "",
        "Examples:",
        "  codex-eval inspect --codex-home ~/.codex",
        "  codex-eval parse --codex-home ~/.codex --output-dir artifacts",
        "  codex-eval eval --codex-home ~/.codex --output-dir artifacts",
        "  codex-eval report --codex-home ~/.codex --output-dir artifacts",
        "  codex-eval eval --codex-home ~/.codex --output-dir artifacts --session-limit 25",
        "  codex-eval eval --codex-home ~/.codex --output-dir artifacts --summary-only",
        "",
        "Exit codes:",
        "  0 success",
        "  1 runtime failure",
        "  2 usage error",
      ].join("\n"),
    );

  program
    .command("inspect")
    .description("Discover canonical and optional local Codex artifact stores.")
    .action(async () => {
      throwIfAborted(signal);
      const options = program.opts<GlobalOptions>();
      applyConfigOverrides(options);
      await runInspectCommand(options, signal);
    });

  program
    .command("parse")
    .description("Parse transcript files and emit raw turn artifacts.")
    .action(async () => {
      throwIfAborted(signal);
      const options = program.opts<GlobalOptions>();
      applyConfigOverrides(options);
      await runParseCommand(options, signal);
    });

  program
    .command("eval")
    .description(
      "Run parsing, labeling, clustering, scoring, and artifact emission.",
    )
    .action(async () => {
      throwIfAborted(signal);
      const options = program.opts<GlobalOptions>();
      applyConfigOverrides(options);
      await runEvalCommand(options, signal);
    });

  program
    .command("report")
    .description(
      "Generate the markdown evaluator report and write all artifacts.",
    )
    .action(async () => {
      throwIfAborted(signal);
      const options = program.opts<GlobalOptions>();
      applyConfigOverrides(options);
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

if (import.meta.url === `file://${process.argv[1]}`) {
  const exitCode = await main(process.argv);
  process.exit(exitCode);
}
