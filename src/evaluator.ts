/**
 * Purpose: Orchestrates evaluation pipeline from discovery through output generation.
 * Entrypoint: `evaluateArtifacts()` for full evaluation, `evaluateArtifactsSummaryOnly()` for summary-only.
 */
import {
  createSummaryInputs,
  type EvaluationResult,
  type SummaryOnlyEvaluationResult,
  writeEvaluationArtifacts,
  writeSummaryArtifacts,
} from "./artifact-writer.js";
import { clusterIncidents } from "./clustering.js";
import { getConfig } from "./config.js";
import { discoverArtifacts } from "./discovery.js";
import { buildSummaryArtifact } from "./insights.js";
import { aggregateMetrics, countWriteTurns } from "./metrics-aggregation.js";
import { renderReport, renderSummaryReport } from "./report.js";
import type { MetricsRecord } from "./schema.js";
import { processSession } from "./session-processor.js";
import { parseTranscriptFile } from "./transcript/index.js";
import { mapWithConcurrency } from "./utils/concurrency.js";
import { EVALUATOR_VERSION, SCHEMA_VERSION } from "./version.js";

export type { EvaluationResult, SummaryOnlyEvaluationResult };
export { writeEvaluationArtifacts, writeSummaryArtifacts };

/**
 * Options for evaluating Codex session artifacts.
 */
export interface EvaluateOptions {
  /** Path to the Codex home directory (typically ~/.codex) */
  codexHome: string;
  /** Directory where evaluation artifacts will be written */
  outputDir: string;
  /** Maximum number of most recent sessions to evaluate (undefined for all) */
  sessionLimit?: number;
}

function getHomeDirectory(): string | undefined {
  // biome-ignore lint/complexity/useLiteralKeys: Required for TypeScript index signature access
  return process.env["HOME"];
}

function selectSessionPaths(
  sessionFiles: readonly string[],
  sessionLimit?: number,
): readonly string[] {
  return typeof sessionLimit === "number"
    ? sessionFiles.slice(-sessionLimit)
    : sessionFiles;
}

function recalculateIncidentCounts(
  metrics: MetricsRecord,
  incidents: import("./schema.js").IncidentRecord[],
): MetricsRecord {
  const incidentCountBySession = new Map<string, number>();
  for (const incident of incidents) {
    incidentCountBySession.set(
      incident.sessionId,
      (incidentCountBySession.get(incident.sessionId) ?? 0) + 1,
    );
  }
  return {
    ...metrics,
    incidentCount: incidents.length,
    sessions: metrics.sessions.map((sessionMetrics) => ({
      ...sessionMetrics,
      incidentCount: incidentCountBySession.get(sessionMetrics.sessionId) ?? 0,
    })),
  };
}

/**
 * Performs a full evaluation of Codex session artifacts.
 *
 * This function orchestrates the complete evaluation pipeline:
 * 1. Discovers session files in the Codex home directory
 * 2. Parses transcript files into normalized sessions
 * 3. Labels turns based on user message heuristics
 * 4. Clusters incidents from labeled turns
 * 5. Aggregates metrics and generates reports
 *
 * @param options - Evaluation options including codexHome, outputDir, and optional sessionLimit
 * @returns Promise resolving to the full evaluation result with raw turns, incidents, metrics, and report
 * @throws {FileNotFoundError} If the codexHome directory does not exist
 * @throws {TranscriptParseError} If strict mode is enabled and a transcript fails to parse
 *
 * @example
 * ```typescript
 * const result = await evaluateArtifacts({
 *   codexHome: "~/.codex",
 *   outputDir: "./artifacts",
 *   sessionLimit: 100
 * });
 * console.log(`Found ${result.incidents.length} incidents across ${result.metrics.sessionCount} sessions`);
 * ```
 */
export async function evaluateArtifacts(
  options: EvaluateOptions,
): Promise<EvaluationResult> {
  const discovered = await discoverArtifacts(options.codexHome);
  const sessionPaths = selectSessionPaths(
    discovered.sessionFiles,
    options.sessionLimit,
  );
  const homeDirectory = getHomeDirectory();

  const { full } = getConfig().concurrency;
  const processed = await mapWithConcurrency(
    sessionPaths,
    full,
    async (sessionPath) => {
      const session = await parseTranscriptFile(sessionPath);
      return processSession(session, homeDirectory);
    },
  );

  const metrics = aggregateMetrics(processed, discovered.inventory);
  const allTurns = processed.flatMap((s) => s.turns);
  const evaluatedTurns = allTurns.filter((turn) => turn.labels.length > 0);
  const { maxTurnGap } = getConfig().clustering;
  const incidents = clusterIncidents(
    evaluatedTurns,
    { maxTurnGap },
    EVALUATOR_VERSION,
    SCHEMA_VERSION,
  );

  const updatedMetrics = recalculateIncidentCounts(metrics, incidents);
  const report = renderReport(updatedMetrics, incidents, allTurns);

  return {
    rawTurns: allTurns,
    incidents,
    metrics: updatedMetrics,
    report,
  };
}

/**
 * Performs a summary-only evaluation of Codex session artifacts.
 *
 * This is a lightweight alternative to `evaluateArtifacts()` that:
 * - Skips raw turn and incident JSONL emission
 * - Computes only summary metrics and reports
 * - Uses lower concurrency for reduced resource usage
 *
 * Use this when you only need high-level insights without detailed incident data.
 *
 * @param options - Evaluation options including codexHome, outputDir, and optional sessionLimit
 * @returns Promise resolving to summary metrics, summary artifact, and markdown report
 * @throws {FileNotFoundError} If the codexHome directory does not exist
 * @throws {TranscriptParseError} If strict mode is enabled and a transcript fails to parse
 *
 * @example
 * ```typescript
 * const result = await evaluateArtifactsSummaryOnly({
 *   codexHome: "~/.codex",
 *   outputDir: "./artifacts"
 * });
 * console.log(result.report); // Markdown report
 * ```
 */
export async function evaluateArtifactsSummaryOnly(
  options: EvaluateOptions,
): Promise<SummaryOnlyEvaluationResult> {
  const { summary: summaryConcurrency } = getConfig().concurrency;
  const discovered = await discoverArtifacts(options.codexHome);
  const sessionPaths = selectSessionPaths(
    discovered.sessionFiles,
    options.sessionLimit,
  );
  const homeDirectory = getHomeDirectory();

  const processed = await mapWithConcurrency(
    sessionPaths,
    summaryConcurrency,
    async (sessionPath) => {
      const session = await parseTranscriptFile(sessionPath);
      return processSession(session, homeDirectory);
    },
  );

  const metrics = aggregateMetrics(processed, discovered.inventory);
  const summaryInputs = createSummaryInputs(
    processed,
    countWriteTurns(processed),
  );
  const summary = buildSummaryArtifact(metrics, summaryInputs);
  const report = renderSummaryReport(metrics, summary);

  return { metrics, summary, report };
}
