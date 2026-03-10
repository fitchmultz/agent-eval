/**
 * Purpose: Orchestrates source-aware evaluation from discovery through output generation.
 * Responsibilities: Discover transcripts, parse sessions, process metrics, and build report artifacts.
 * Scope: Shared pipeline for supported developer-agent sources.
 * Usage: `evaluateArtifacts({ source, home, outputDir })`.
 * Invariants/Assumptions: Discovery and parsing are source-aware while scoring/reporting remain shared.
 */
import {
  createSummaryInputs,
  type EvaluationResult,
  type SummaryOnlyEvaluationResult,
  writeEvaluationArtifacts,
  writeSummaryArtifacts,
} from "./artifact-writer.js";
import { clusterIncidents } from "./clustering.js";
import { getConfig } from "./config/index.js";
import { type DiscoveryOptions, discoverArtifacts } from "./discovery.js";
import { buildSummaryArtifact } from "./insights.js";
import { aggregateMetrics, countWriteTurns } from "./metrics-aggregation.js";
import { renderReport, renderSummaryReport } from "./report.js";
import type { MetricsRecord } from "./schema.js";
import { processSession } from "./session-processor.js";
import { parseTranscriptFile } from "./transcript/index.js";
import { throwIfAborted } from "./utils/abort.js";
import { mapWithConcurrency } from "./utils/concurrency.js";
import { getHomeDirectory } from "./utils/environment.js";
import { EVALUATOR_VERSION, SCHEMA_VERSION } from "./version.js";

export type { EvaluationResult, SummaryOnlyEvaluationResult };
export { writeEvaluationArtifacts, writeSummaryArtifacts };

/**
 * Options for evaluating supported transcript artifacts.
 */
export interface EvaluateOptions {
  /** Source provider for the selected home */
  source: import("./sources.js").SourceProvider;
  /** Path to the source home directory (typically ~/.codex or ~/.claude) */
  home: string;
  /** Directory where evaluation artifacts will be written */
  outputDir: string;
  /** Maximum number of most recent sessions to evaluate (undefined for all) */
  sessionLimit?: number;
  /** Timeout for parsing individual transcript files (milliseconds). Default: 30000 */
  parseTimeoutMs?: number;
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
 * Performs a full evaluation of transcript artifacts.
 *
 * This function orchestrates the complete evaluation pipeline:
 * 1. Discovers session files in the selected source home directory
 * 2. Parses transcript files into normalized sessions
 * 3. Labels turns based on user message heuristics
 * 4. Clusters incidents from labeled turns
 * 5. Aggregates metrics and generates reports
 *
 * @param options - Evaluation options including source, home, outputDir, and optional sessionLimit
 * @param signal - Optional AbortSignal for cancellation
 * @returns Promise resolving to the full evaluation result with raw turns, incidents, metrics, and report
 * @throws {FileNotFoundError} If the source home directory does not exist
 * @throws {TranscriptParseError} If strict mode is enabled and a transcript fails to parse
 * @throws {DOMException} with name "AbortError" if signal is aborted
 *
 * @example
 * ```typescript
 * const result = await evaluateArtifacts({
 *   source: "claude",
 *   home: "~/.claude",
 *   outputDir: "./artifacts",
 *   sessionLimit: 100
 * });
 * console.log(`Found ${result.incidents.length} incidents across ${result.metrics.sessionCount} sessions`);
 * ```
 */
export async function evaluateArtifacts(
  options: EvaluateOptions,
  signal?: AbortSignal,
): Promise<EvaluationResult> {
  const { home, source } = options;
  // Check for abort before starting
  throwIfAborted(signal);

  const discoveryOptions: DiscoveryOptions = {
    provider: source,
    signal,
  };
  const discovered = await discoverArtifacts(home, discoveryOptions);

  // Check for abort after discovery
  throwIfAborted(signal);

  const sessionPaths = selectSessionPaths(
    discovered.sessionFiles,
    options.sessionLimit,
  );
  const homeDirectory = getHomeDirectory();

  const { full } = getConfig().concurrency;
  const parseTimeoutMs = options.parseTimeoutMs ?? 30000;

  const processed = await mapWithConcurrency(
    sessionPaths,
    full,
    async (sessionPath) => {
      const session = await parseTranscriptFile(sessionPath, {
        sourceProvider: source,
        timeoutMs: parseTimeoutMs,
        signal,
      });
      return processSession(session, homeDirectory);
    },
    signal,
  );

  // Check for abort after processing
  throwIfAborted(signal);

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
 * Performs a summary-only evaluation of transcript artifacts.
 *
 * This is a lightweight alternative to `evaluateArtifacts()` that:
 * - Skips raw turn and incident JSONL emission
 * - Computes only summary metrics and reports
 * - Uses lower concurrency for reduced resource usage
 *
 * Use this when you only need high-level insights without detailed incident data.
 *
 * @param options - Evaluation options including source, home, outputDir, and optional sessionLimit
 * @param signal - Optional AbortSignal for cancellation
 * @returns Promise resolving to summary metrics, summary artifact, and markdown report
 * @throws {FileNotFoundError} If the source home directory does not exist
 * @throws {TranscriptParseError} If strict mode is enabled and a transcript fails to parse
 * @throws {DOMException} with name "AbortError" if signal is aborted
 *
 * @example
 * ```typescript
 * const result = await evaluateArtifactsSummaryOnly({
 *   source: "codex",
 *   home: "~/.codex",
 *   outputDir: "./artifacts"
 * });
 * console.log(result.report); // Markdown report
 * ```
 */
export async function evaluateArtifactsSummaryOnly(
  options: EvaluateOptions,
  signal?: AbortSignal,
): Promise<SummaryOnlyEvaluationResult> {
  const { home, source } = options;
  // Check for abort before starting
  throwIfAborted(signal);

  const { summary: summaryConcurrency } = getConfig().concurrency;
  const discoveryOptions: DiscoveryOptions = {
    provider: source,
    signal,
  };
  const discovered = await discoverArtifacts(home, discoveryOptions);

  // Check for abort after discovery
  throwIfAborted(signal);

  const sessionPaths = selectSessionPaths(
    discovered.sessionFiles,
    options.sessionLimit,
  );
  const homeDirectory = getHomeDirectory();
  const parseTimeoutMs = options.parseTimeoutMs ?? 30000;

  const processed = await mapWithConcurrency(
    sessionPaths,
    summaryConcurrency,
    async (sessionPath) => {
      const session = await parseTranscriptFile(sessionPath, {
        sourceProvider: source,
        timeoutMs: parseTimeoutMs,
        signal,
      });
      return processSession(session, homeDirectory);
    },
    signal,
  );

  // Check for abort after processing
  throwIfAborted(signal);

  const metrics = aggregateMetrics(processed, discovered.inventory);
  const summaryInputs = createSummaryInputs(
    processed,
    countWriteTurns(processed),
  );
  const summary = buildSummaryArtifact(metrics, summaryInputs);
  const report = renderSummaryReport(metrics, summary);

  return { metrics, summary, report };
}
