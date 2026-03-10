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
import { MissingTranscriptInputError } from "./errors.js";
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
 * Parse-only artifact bundle used by the CLI parse command.
 */
export interface ParseArtifactsResult {
  /** Canonical discovery inventory for the selected source home. */
  inventory: Awaited<ReturnType<typeof discoverArtifacts>>["inventory"];
  /** Number of parsed sessions included in the result. */
  sessionCount: number;
  /** Flattened normalized turns emitted from parsed sessions. */
  rawTurns: RawTurnRecord[];
}

/**
 * Options for evaluating supported transcript artifacts.
 */
export interface EvaluateOptions {
  /** Source provider for the selected home */
  source: SourceProvider;
  /** Path to the source home directory (typically ~/.codex or ~/.claude) */
  home: string;
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
  concurrency: number,
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

  const sessionInventory = discovered.inventory.find(
    (item) => item.kind === "session_jsonl",
  );
  if (!sessionInventory?.discovered) {
    throw new MissingTranscriptInputError(
      sessionInventory?.path ??
        (options.source === "claude"
          ? `${options.home}/projects`
          : `${options.home}/sessions`),
      "missing-directory",
    );
  }
  if (discovered.sessionFiles.length === 0) {
    throw new MissingTranscriptInputError(
      sessionInventory.path,
      "no-jsonl-files",
    );
  }

  const sessionPaths = selectSessionPaths(
    discovered.sessionFiles,
    options.sessionLimit,
  );
  if (sessionPaths.length === 0) {
    throw new MissingTranscriptInputError(
      sessionInventory.path,
      "no-jsonl-files",
    );
  }
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

async function collectParsedArtifacts(
  options: EvaluateOptions,
  concurrency: number,
  signal?: AbortSignal,
): Promise<{
  inventory: Awaited<ReturnType<typeof discoverArtifacts>>["inventory"];
  processed: Awaited<ReturnType<typeof processSession>>[];
  rawTurns: RawTurnRecord[];
}> {
  const { inventory, processed } = await processDiscoveredSessions(
    options,
    concurrency,
    signal,
  );
  throwIfAborted(signal);

  return {
    inventory,
    processed,
    rawTurns: extractTurns(processed),
  };
}

/**
 * Performs transcript discovery and normalization without running scoring/report generation.
 */
export async function parseArtifacts(
  options: EvaluateOptions,
  signal?: AbortSignal,
): Promise<ParseArtifactsResult> {
  const parsed = await collectParsedArtifacts(
    options,
    getConfig().concurrency.full,
    signal,
  );

  return {
    inventory: parsed.inventory,
    sessionCount: parsed.processed.length,
    rawTurns: parsed.rawTurns,
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
  const concurrency =
    outputMode === "summary"
      ? getConfig().concurrency.summary
      : getConfig().concurrency.full;
  const parsed = await collectParsedArtifacts(
    { ...options, outputMode },
    concurrency,
    signal,
  );
  throwIfAborted(signal);

  const rawTurns = parsed.rawTurns;
  const incidents = clusterCorpusIncidents(rawTurns);
  const metrics = recalculateIncidentCounts(
    aggregateMetrics(parsed.processed, parsed.inventory),
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
