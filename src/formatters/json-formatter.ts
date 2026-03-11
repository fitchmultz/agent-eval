/**
 * Purpose: JSON output formatting for CLI commands.
 * Responsibilities: Serialize CLI command results with stable machine-readable keys.
 * Scope: Used by the CLI for inspect/parse/eval output.
 * Usage: Import formatter helpers instead of hand-building stdout payloads in the CLI.
 * Invariants/Assumptions: Output remains JSON and includes evaluator/schema version fields.
 */

import type { SourceProvider } from "../sources.js";
import { EVALUATOR_VERSION, SCHEMA_VERSION } from "../version.js";

interface InspectOutput {
  evaluatorVersion: string;
  schemaVersion: string;
  provider: SourceProvider;
  homePath: string;
  sessionFileCount: number;
  inventory: Array<{
    provider: SourceProvider;
    kind: string;
    path: string;
    discovered: boolean;
    required: boolean;
    optional: boolean;
  }>;
}

interface ParseOutput {
  evaluatorVersion: string;
  schemaVersion: string;
  outputDir: string;
  sessionCount: number;
  rawTurnCount: number;
  parseWarningCount: number;
}

interface EvalOutput {
  evaluatorVersion: string;
  schemaVersion: string;
  outputDir: string;
  sessionCount: number;
  incidentCount: number;
  summaryOnly?: boolean;
}

interface BenchmarkOutput {
  evaluatorVersion: string;
  schemaVersion: string;
  outputDir: string;
  caseCount: number;
  endedVerifiedAccuracy: number;
  incidentPrecision: number;
}

/**
 * Formats the inspect command output as JSON.
 */
export function formatInspectOutput(
  provider: SourceProvider,
  homePath: string,
  sessionFileCount: number,
  inventory: InspectOutput["inventory"],
): string {
  const output: InspectOutput = {
    evaluatorVersion: EVALUATOR_VERSION,
    schemaVersion: SCHEMA_VERSION,
    provider,
    homePath,
    sessionFileCount,
    inventory,
  };
  return JSON.stringify(output, null, 2);
}

/**
 * Formats the parse command output as JSON.
 */
export function formatParseOutput(
  outputDir: string,
  rawTurnCount: number,
  sessionCount: number,
  parseWarningCount: number,
): string {
  const output: ParseOutput = {
    evaluatorVersion: EVALUATOR_VERSION,
    schemaVersion: SCHEMA_VERSION,
    outputDir,
    sessionCount,
    rawTurnCount,
    parseWarningCount,
  };
  return JSON.stringify(output, null, 2);
}

/**
 * Formats the eval command output as JSON.
 */
export function formatEvalOutput(
  outputDir: string,
  sessionCount: number,
  incidentCount: number,
  summaryOnly = false,
): string {
  const output: EvalOutput = {
    evaluatorVersion: EVALUATOR_VERSION,
    schemaVersion: SCHEMA_VERSION,
    outputDir,
    sessionCount,
    incidentCount,
    summaryOnly,
  };
  return JSON.stringify(output, null, 2);
}

export function formatBenchmarkOutput(
  outputDir: string,
  caseCount: number,
  endedVerifiedAccuracy: number,
  incidentPrecision: number,
): string {
  const output: BenchmarkOutput = {
    evaluatorVersion: EVALUATOR_VERSION,
    schemaVersion: SCHEMA_VERSION,
    outputDir,
    caseCount,
    endedVerifiedAccuracy,
    incidentPrecision,
  };
  return JSON.stringify(output, null, 2);
}
