/**
 * Purpose: Implements CLI command handlers for inspect, parse, eval, and report flows.
 * Entrypoint: Used by the CLI runtime after option normalization and config initialization.
 * Notes: Command handlers are intentionally thin wrappers over the canonical evaluator and artifact writer.
 */

import { writeArtifacts, writeParseArtifacts } from "../artifact-writer.js";
import { runCalibrationBenchmark } from "../calibration/index.js";
import { discoverArtifacts } from "../discovery.js";
import { evaluateArtifacts, parseArtifacts } from "../evaluator.js";
import {
  formatBenchmarkOutput,
  formatEvalOutput,
  formatInspectOutput,
  formatParseOutput,
} from "../formatters/index.js";
import type { GlobalOptions } from "./options.js";

async function evaluateForCommand(
  options: GlobalOptions,
  signal: AbortSignal,
  outputMode: "full" | "summary",
) {
  return evaluateArtifacts(
    {
      ...options,
      outputMode,
    },
    signal,
  );
}

export async function runInspectCommand(
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

export async function runParseCommand(
  options: GlobalOptions,
  signal: AbortSignal,
): Promise<void> {
  const result = await parseArtifacts(options, signal);
  await writeParseArtifacts(result, options.outputDir);
  process.stdout.write(
    `${formatParseOutput(
      options.outputDir,
      result.rawTurns.length,
      result.sessionCount,
      result.parseWarningCount,
    )}\n`,
  );
}

export async function runEvalCommand(
  options: GlobalOptions,
  signal: AbortSignal,
): Promise<void> {
  const outputMode = options.summaryOnly ? "summary" : "full";
  const result = await evaluateForCommand(options, signal, outputMode);
  await writeArtifacts(result, options.outputDir);
  process.stdout.write(
    `${formatEvalOutput(
      options.outputDir,
      result.metrics.sessionCount,
      result.metrics.incidentCount,
      outputMode === "summary",
    )}\n`,
  );
}

export async function runReportCommand(
  options: GlobalOptions,
  signal: AbortSignal,
): Promise<void> {
  const outputMode = options.summaryOnly ? "summary" : "full";
  const result = await evaluateForCommand(options, signal, outputMode);
  await writeArtifacts(result, options.outputDir);
  process.stdout.write(result.report);
}

export async function runBenchmarkCommand(
  options: GlobalOptions,
  signal: AbortSignal,
): Promise<void> {
  if (signal.aborted) {
    throw new DOMException("Operation aborted", "AbortError");
  }
  const { results } = await runCalibrationBenchmark(options.outputDir);
  process.stdout.write(
    `${formatBenchmarkOutput(
      options.outputDir,
      results.caseCount,
      results.terminalVerificationMetrics.endedVerifiedAccuracy,
      results.incidentMetrics.precision,
    )}\n`,
  );
}
