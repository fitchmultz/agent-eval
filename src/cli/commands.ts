/**
 * Purpose: Implements CLI command handlers for inspect, parse, eval, and report flows.
 * Entrypoint: Used by the CLI runtime after option normalization and config initialization.
 * Notes: Command handlers are intentionally thin wrappers over the canonical evaluator and artifact writer.
 */

import { writeArtifacts, writeParseArtifacts } from "../artifact-writer.js";
import { runCalibrationBenchmark } from "../calibration/index.js";
import { discoverArtifacts } from "../discovery.js";
import {
  type EvaluateAllSourcesOptions,
  evaluateAllSourceArtifacts,
  evaluateArtifacts,
  parseAllSourceArtifacts,
  parseArtifacts,
} from "../evaluator.js";
import {
  formatBenchmarkOutput,
  formatEvalOutput,
  formatInspectOutput,
  formatParseOutput,
} from "../formatters/index.js";
import { getDefaultSourceHome, sourceProviderValues } from "../sources.js";
import { getValidatedHomeDirectory } from "../utils/environment.js";
import { ENGINE_VERSION, SCHEMA_VERSION } from "../version.js";
import type { GlobalOptions } from "./options.js";

function buildAllSourcesOptions(
  options: GlobalOptions,
): EvaluateAllSourcesOptions {
  const homeDirectory = getValidatedHomeDirectory();
  const allOptions: EvaluateAllSourcesOptions = {
    sources: sourceProviderValues.map((source) => ({
      source,
      home: getDefaultSourceHome(source, homeDirectory),
    })),
  };

  if (typeof options.sessionLimit === "number") {
    allOptions.sessionLimit = options.sessionLimit;
  }
  if (options.startDate) {
    allOptions.startDate = options.startDate;
  }
  if (options.endDate) {
    allOptions.endDate = options.endDate;
  }
  if (options.timeBucket) {
    allOptions.timeBucket = options.timeBucket;
  }

  return allOptions;
}

async function evaluateForCommand(
  options: GlobalOptions,
  signal: AbortSignal,
  outputMode: "full" | "summary",
) {
  if (options.source === "all") {
    return evaluateAllSourceArtifacts(
      {
        ...buildAllSourcesOptions(options),
        outputMode,
      },
      signal,
    );
  }

  return evaluateArtifacts(
    {
      ...options,
      source: options.source,
      outputMode,
    },
    signal,
  );
}

export async function runInspectCommand(
  options: GlobalOptions,
  signal: AbortSignal,
): Promise<void> {
  if (options.source === "all") {
    const homes = buildAllSourcesOptions(options).sources;
    const discoveries = await Promise.all(
      homes.map((sourceHome) =>
        discoverArtifacts(sourceHome.home, {
          provider: sourceHome.source,
          signal,
        }),
      ),
    );
    process.stdout.write(
      `${JSON.stringify(
        {
          engineVersion: ENGINE_VERSION,
          schemaVersion: SCHEMA_VERSION,
          source: "all",
          sessionFileCount: discoveries.reduce(
            (total, discovered) => total + discovered.sessionFiles.length,
            0,
          ),
          providers: discoveries.map((discovered) => ({
            provider: discovered.provider,
            homePath: discovered.homePath,
            sessionFileCount: discovered.sessionFiles.length,
            inventory: discovered.inventory,
          })),
        },
        null,
        2,
      )}\n`,
    );
    return;
  }

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
  const result =
    options.source === "all"
      ? await parseAllSourceArtifacts(buildAllSourcesOptions(options), signal)
      : await parseArtifacts(
          {
            ...options,
            source: options.source,
          },
          signal,
        );
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
      results.parseWarningMetrics.accuracy,
      results.attributionMetrics.accuracy,
      results.surfacedMetrics.accuracy,
    )}\n`,
  );
}
