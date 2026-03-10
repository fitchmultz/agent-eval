/**
 * Purpose: Orchestrates source-aware evaluation from discovery through canonical artifact generation.
 * Responsibilities: Discover transcripts, parse sessions, process metrics, cluster incidents, and build summary/report/presentation artifacts.
 * Scope: Shared pipeline for supported developer-agent sources.
 * Usage: `evaluateArtifacts({ source, home, outputMode: "full" })`.
 * Invariants/Assumptions: Discovery and parsing are source-aware while scoring, reporting, and presentation remain shared.
 */

import type { EvaluationArtifacts } from "./artifact-writer.js";
import { clusterIncidents } from "./clustering.js";
import { getConfig } from "./config/index.js";
import { discoverArtifacts } from "./discovery.js";
import {
  buildSummaryArtifact,
  buildSummaryInputsFromArtifacts,
} from "./insights.js";
import { aggregateMetrics } from "./metrics-aggregation.js";
import { buildPresentationArtifacts } from "./presentation.js";
import { renderSummaryReport } from "./report.js";
import type { IncidentRecord, MetricsRecord, RawTurnRecord } from "./schema.js";
import { processSession } from "./session-processor.js";
import type { SourceProvider } from "./sources.js";
import { parseTranscriptFile } from "./transcript/index.js";
import { throwIfAborted } from "./utils/abort.js";
import { mapWithConcurrency } from "./utils/concurrency.js";
import { getHomeDirectory } from "./utils/environment.js";
import { EVALUATOR_VERSION, SCHEMA_VERSION } from "./version.js";

export type EvaluationOutputMode = "full" | "summary";

/**
 * Options for evaluating supported transcript artifacts.
 */
export interface EvaluateOptions {
  /** Source provider for the selected home */
  source: SourceProvider;
  /** Path to the source home directory (typically ~/.codex or ~/.claude) */
  home: string;
  /** Directory where evaluation artifacts will be written */
  outputDir: string;
  /** Maximum number of most recent sessions to evaluate (undefined for all) */
  sessionLimit?: number;
  /** Timeout for parsing individual transcript files (milliseconds). Default: 30000 */
  parseTimeoutMs?: number;
  /** Output mode for artifact generation. */
  outputMode?: EvaluationOutputMode;
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
  incidents: readonly IncidentRecord[],
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

function extractTurns(
  sessions: ReadonlyArray<{ turns: readonly RawTurnRecord[] }>,
): RawTurnRecord[] {
  return sessions.flatMap((session) => session.turns);
}

function clusterCorpusIncidents(
  turns: readonly RawTurnRecord[],
): IncidentRecord[] {
  const labeledTurns = turns.filter((turn) => turn.labels.length > 0);
  return clusterIncidents(
    labeledTurns,
    { maxTurnGap: getConfig().clustering.maxTurnGap },
    EVALUATOR_VERSION,
    SCHEMA_VERSION,
  );
}

async function processDiscoveredSessions(
  options: EvaluateOptions,
  signal?: AbortSignal,
): Promise<{
  inventory: Awaited<ReturnType<typeof discoverArtifacts>>["inventory"];
  processed: Awaited<ReturnType<typeof processSession>>[];
}> {
  throwIfAborted(signal);

  const discovered = await discoverArtifacts(options.home, {
    provider: options.source,
    signal,
  });
  throwIfAborted(signal);

  const sessionPaths = selectSessionPaths(
    discovered.sessionFiles,
    options.sessionLimit,
  );
  const concurrency =
    options.outputMode === "summary"
      ? getConfig().concurrency.summary
      : getConfig().concurrency.full;
  const parseTimeoutMs = options.parseTimeoutMs ?? 30000;
  const homeDirectory = getHomeDirectory();

  const processed = await mapWithConcurrency(
    sessionPaths,
    concurrency,
    async (sessionPath) => {
      const session = await parseTranscriptFile(sessionPath, {
        sourceProvider: options.source,
        timeoutMs: parseTimeoutMs,
        signal,
      });
      return processSession(session, homeDirectory);
    },
    signal,
  );

  return {
    inventory: discovered.inventory,
    processed,
  };
}

/**
 * Performs a canonical evaluation of transcript artifacts.
 *
 * Both full and summary-only modes use the same discovery, parsing, incident clustering,
 * summary generation, and presentation generation path. Output mode only controls whether
 * raw turns and incidents are retained in the returned artifact bundle.
 */
export async function evaluateArtifacts(
  options: EvaluateOptions,
  signal?: AbortSignal,
): Promise<EvaluationArtifacts> {
  const outputMode = options.outputMode ?? "full";
  const { inventory, processed } = await processDiscoveredSessions(
    { ...options, outputMode },
    signal,
  );
  throwIfAborted(signal);

  const rawTurns = extractTurns(processed);
  const incidents = clusterCorpusIncidents(rawTurns);
  const metrics = recalculateIncidentCounts(
    aggregateMetrics(processed, inventory),
    incidents,
  );
  const summary = buildSummaryArtifact(
    metrics,
    buildSummaryInputsFromArtifacts(rawTurns, incidents),
  );
  const report = renderSummaryReport(metrics, summary);
  const presentation = buildPresentationArtifacts(metrics, summary);

  if (outputMode === "summary") {
    return {
      metrics,
      summary,
      report,
      presentation,
    };
  }

  return {
    metrics,
    summary,
    report,
    presentation,
    rawTurns,
    incidents,
  };
}
