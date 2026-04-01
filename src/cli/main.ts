#!/usr/bin/env node
/**
 * Purpose: Main public CLI runtime for agent-eval.
 * Entrypoint: `main(argv)` drives the source-aware CLI from argument parsing through command execution.
 * Notes: Keeps process signal handling and command registration separate from command implementation details.
 */

import { Command } from "commander";

import { initializeConfig } from "../config/index.js";
import {
  EvaluatorError,
  errorToMessage,
  FileNotFoundError,
  isEnoentError,
} from "../errors.js";
import { throwIfAborted } from "../utils/abort.js";
import {
  runBenchmarkCommand,
  runEvalCommand,
  runInspectCommand,
  runParseCommand,
  runReportCommand,
} from "./commands.js";
import {
  buildCliOverrides,
  type GlobalOptions,
  getDefaultHome,
  getDefaultOutputDir,
  getDefaultSource,
  normalizeOptions,
} from "./options.js";

async function initializeCliConfig(
  options: GlobalOptions,
): Promise<GlobalOptions> {
  const normalized = normalizeOptions(options);
  await initializeConfig({
    cliOverrides: buildCliOverrides(normalized),
  });
  return normalized;
}

function registerCommands(program: Command, signal: AbortSignal): void {
  program
    .command("inspect")
    .description(
      "Discover canonical and optional local transcript stores for a supported source.",
    )
    .action(async () => {
      throwIfAborted(signal);
      const options = await initializeCliConfig(program.opts<GlobalOptions>());
      await runInspectCommand(options, signal);
    });

  program
    .command("parse")
    .description(
      "Normalize transcript files and emit raw turn artifacts without scoring or report generation.",
    )
    .action(async () => {
      throwIfAborted(signal);
      const options = await initializeCliConfig(program.opts<GlobalOptions>());
      await runParseCommand(options, signal);
    });

  program
    .command("eval")
    .description(
      "Run parsing, labeling, clustering, scoring, and artifact emission.",
    )
    .action(async () => {
      throwIfAborted(signal);
      const options = await initializeCliConfig(program.opts<GlobalOptions>());
      await runEvalCommand(options, signal);
    });

  program
    .command("benchmark")
    .description(
      "Run the synthetic calibration corpus and emit benchmark artifacts.",
    )
    .action(async () => {
      throwIfAborted(signal);
      const options = await initializeCliConfig(program.opts<GlobalOptions>());
      await runBenchmarkCommand(options, signal);
    });

  program
    .command("report")
    .description(
      "Generate the markdown transcript analytics report and write all artifacts.",
    )
    .action(async () => {
      throwIfAborted(signal);
      const options = await initializeCliConfig(program.opts<GlobalOptions>());
      await runReportCommand(options, signal);
    });
}

function buildProgram(): Command {
  const defaultSource = getDefaultSource();
  const defaultHome = getDefaultHome(defaultSource);
  const defaultOutputDir = getDefaultOutputDir();

  return new Command()
    .name("agent-eval")
    .description(
      "Analyze local developer-agent transcript artifacts and emit structured transcript analytics reports.",
    )
    .version("0.1.0")
    .showHelpAfterError()
    .option(
      "--source <provider>",
      "Source provider to inspect: codex, claude, or pi (env: CODEX_EVAL_SOURCE)",
      defaultSource,
    )
    .option(
      "--home <path>",
      "Source home to inspect (env: CODEX_EVAL_SOURCE_HOME)",
      defaultHome,
    )
    .option(
      "--output-dir <path>",
      "Directory for generated analytics artifacts (env: CODEX_EVAL_OUTPUT_DIR)",
      defaultOutputDir,
    )
    .option(
      "--report-skin <skin>",
      "Report presentation skin: operator or showcase (env: CODEX_EVAL_REPORT_SKIN)",
      "operator",
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
        "    CODEX_EVAL_SOURCE              - Source provider (codex|claude|pi)",
        "    CODEX_EVAL_SOURCE_HOME         - Source home directory",
        "    CODEX_EVAL_OUTPUT_DIR          - Output directory for artifacts",
        "    CODEX_EVAL_REPORT_SKIN         - Report skin (operator|showcase)",
        "    CODEX_EVAL_CONCURRENCY_FULL    - Concurrency for full evaluation",
        "    CODEX_EVAL_CONCURRENCY_SUMMARY - Concurrency for summary evaluation",
        "    CODEX_EVAL_MAX_TURN_GAP        - Max turn gap for clustering",
        "",
        "Examples:",
        "  agent-eval inspect --source codex --home ~/.codex",
        "  agent-eval inspect --source claude --home ~/.claude",
        "  agent-eval inspect --source pi --home ~/.pi",
        "  agent-eval parse --source codex --home ~/.codex --output-dir artifacts",
        "  cat artifacts/raw-turns.jsonl",
        "  agent-eval eval --source claude --home ~/.claude --output-dir artifacts",
        "  agent-eval eval --source pi --home ~/.pi --summary-only --session-limit 25",
        "  agent-eval benchmark --output-dir artifacts/benchmark",
        "  agent-eval report --source codex --home ~/.codex --output-dir artifacts",
        "  agent-eval report --source pi --home ~/.pi --report-skin showcase",
        "",
        "Exit codes:",
        "  0 success",
        "  1 runtime failure",
        "  2 usage error",
      ].join("\n"),
    );
}

async function runMain(argv: string[], signal: AbortSignal): Promise<number> {
  const program = buildProgram();
  registerCommands(program, signal);

  try {
    await program.parseAsync(argv);
    return 0;
  } catch (error) {
    if (error instanceof EvaluatorError) {
      process.stderr.write(`${error.message}\n`);
      return error.exitCode;
    }

    if (isEnoentError(error)) {
      const path =
        typeof error === "object" && error !== null && "path" in error
          ? String(error.path)
          : "unknown path";
      const fileError = new FileNotFoundError(path);
      process.stderr.write(`${fileError.message}\n`);
      return fileError.exitCode;
    }

    process.stderr.write(`${errorToMessage(error)}\n`);
    return 1;
  }
}

export async function main(argv: string[]): Promise<number> {
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
    if (error instanceof DOMException && error.name === "AbortError") {
      return 130;
    }
    throw error;
  } finally {
    process.off("SIGINT", handleInterrupt);
    process.off("SIGTERM", handleInterrupt);
  }
}
