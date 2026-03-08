/**
 * Purpose: JSON output formatting for CLI commands.
 * Entrypoint: Used by CLI to format JSON output consistently.
 * Notes: Extracted from CLI to separate presentation from business logic.
 */

import { EVALUATOR_VERSION, SCHEMA_VERSION } from "../version.js";

interface InspectOutput {
  evaluatorVersion: string;
  schemaVersion: string;
  codexHome: string;
  sessionFileCount: number;
  inventory: Array<{
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
  rawTurnCount: number;
}

interface EvalOutput {
  evaluatorVersion: string;
  schemaVersion: string;
  outputDir: string;
  sessionCount: number;
  incidentCount: number;
  summaryOnly?: boolean;
}

/**
 * Formats the inspect command output as JSON.
 */
export function formatInspectOutput(
  codexHome: string,
  sessionFileCount: number,
  inventory: InspectOutput["inventory"],
): string {
  const output: InspectOutput = {
    evaluatorVersion: EVALUATOR_VERSION,
    schemaVersion: SCHEMA_VERSION,
    codexHome,
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
): string {
  const output: ParseOutput = {
    evaluatorVersion: EVALUATOR_VERSION,
    schemaVersion: SCHEMA_VERSION,
    outputDir,
    rawTurnCount,
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
