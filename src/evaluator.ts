/**
 * Purpose: Orchestrates source-aware evaluation from discovery through canonical artifact generation.
 * Responsibilities: Discover transcripts, probe recency, parse sessions, process metrics, and build summary/report/presentation artifacts.
 * Scope: Shared pipeline for supported developer-agent sources.
 * Usage: `evaluateArtifacts({ source, home, outputMode: "full" })`.
 * Invariants/Assumptions: Discovery and parsing are source-aware while scoring, reporting, and presentation remain shared.
 */

import type { EvaluationArtifacts } from "./artifact-writer.js";
import { getConfig } from "./config/index.js";
import { discoverArtifacts } from "./discovery.js";
import { MissingTranscriptInputError } from "./errors.js";
import {
  chooseIncidentEvidencePreview,
  insertTopIncident,
} from "./incident-selection.js";
import { buildSummaryArtifact, type SummaryInputs } from "./insights.js";
import { aggregateMetrics, buildMetricsRecord } from "./metrics-aggregation.js";
import { buildPresentationArtifacts } from "./presentation.js";
import { renderSummaryReport } from "./report.js";
import { isLowSignalPreview, isUnsafePreview } from "./sanitization.js";
import type {
  IncidentRecord,
  InventoryRecord,
  LabelCountRecord,
  LabelName,
  MetricsRecord,
  RawTurnRecord,
  Severity,
} from "./schema.js";
import { type ProcessedSession, processSession } from "./session-processor.js";
import type { SourceProvider } from "./sources.js";
import { countWriteTurns, createEmptySeverityCounts } from "./summary/index.js";
import { parseTranscriptFile } from "./transcript/index.js";
import {
  probeSessionOrder,
  type SessionOrderProbe,
} from "./transcript/session-order.js";
import { throwIfAborted } from "./utils/abort.js";
import { mapWithConcurrency } from "./utils/concurrency.js";
import { getValidatedHomeDirectory } from "./utils/environment.js";

export type EvaluationOutputMode = "full" | "summary";

/**
 * Parse-only artifact bundle used by the CLI parse command.
 */
export interface ParseArtifactsResult {
  /** Canonical discovery inventory for the selected source home. */
  inventory: Awaited<ReturnType<typeof discoverArtifacts>>["inventory"];
  /** Number of parsed sessions included in the result. */
  sessionCount: number;
  /** Aggregate number of parse warnings emitted across parsed sessions. */
  parseWarningCount: number;
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

interface SessionSummaryProjection {
  metrics: ProcessedSession["metrics"];
  turnCount: number;
  incidentCount: number;
  labelCounts: LabelCountRecord;
  sessionLabelCounts: Record<LabelName, number>;
  severityCounts: Record<Severity, number>;
  topIncidents: SummaryInputs["topIncidents"];
  writeTurnCount: number;
}

function createEmptySessionLabelMap(): Record<LabelName, number> {
  return {
    context_drift: 0,
    test_build_lint_failure_complaint: 0,
    interrupt: 0,
    regression_report: 0,
    praise: 0,
    context_reinjection: 0,
    verification_request: 0,
    stalled_or_guessing: 0,
  };
}

function compareSessionProbes(
  left: SessionOrderProbe,
  right: SessionOrderProbe,
): number {
  const leftTimeValue = resolveProbeTime(left);
  const rightTimeValue = resolveProbeTime(right);

  if (leftTimeValue !== null && rightTimeValue !== null) {
    return (
      leftTimeValue - rightTimeValue || left.path.localeCompare(right.path)
    );
  }

  if (left.mtimeMs !== right.mtimeMs) {
    return left.mtimeMs - right.mtimeMs;
  }

  return left.path.localeCompare(right.path);
}

function parseProbeTimestamp(value?: string): number | null {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function resolveProbeTime(probe: SessionOrderProbe): number | null {
  return (
    parseProbeTimestamp(probe.startedAt) ??
    parseProbeTimestamp(probe.earliestTimestamp) ??
    (Number.isFinite(probe.mtimeMs) ? probe.mtimeMs : null)
  );
}

async function selectSessionPaths(
  sessionFiles: readonly string[],
  source: SourceProvider,
  concurrency: number,
  sessionLimit?: number,
  signal?: AbortSignal,
): Promise<readonly string[]> {
  const probes = await mapWithConcurrency(
    sessionFiles,
    concurrency,
    (path) => probeSessionOrder(path, source),
    signal,
  );
  const sortedPaths = probes
    .sort(compareSessionProbes)
    .map((probe) => probe.path);
  return typeof sessionLimit === "number"
    ? sortedPaths.slice(-sessionLimit)
    : sortedPaths;
}

function extractTurns(
  sessions: ReadonlyArray<{ turns: readonly RawTurnRecord[] }>,
): RawTurnRecord[] {
  return sessions.flatMap((session) => session.turns);
}

function extractIncidents(
  sessions: ReadonlyArray<{ incidents: readonly IncidentRecord[] }>,
): IncidentRecord[] {
  return sessions.flatMap((session) => session.incidents);
}

function summarizeProcessedSession(
  session: ProcessedSession,
): SessionSummaryProjection {
  const sessionLabelCounts = createEmptySessionLabelMap();
  const labelCounts: LabelCountRecord = {};
  const severityCounts = createEmptySeverityCounts();
  let topIncidents: SummaryInputs["topIncidents"] = [];

  for (const turn of session.turns) {
    for (const label of turn.labels) {
      sessionLabelCounts[label.label] += 1;
      labelCounts[label.label] = (labelCounts[label.label] ?? 0) + 1;
    }
  }

  for (const incident of session.incidents) {
    severityCounts[incident.severity] += 1;
    const evidencePreview = chooseIncidentEvidencePreview(incident, session.turns);
    if (
      !evidencePreview ||
      isLowSignalPreview(evidencePreview) ||
      isUnsafePreview(evidencePreview)
    ) {
      continue;
    }
    topIncidents = insertTopIncident(
      topIncidents,
      {
        incidentId: incident.incidentId,
        sessionId: incident.sessionId,
        summary: incident.summary,
        severity: incident.severity,
        confidence: incident.confidence,
        turnSpan: incident.turnIndices.length,
        evidencePreview,
      },
      getConfig().previews.maxTopIncidents,
    );
  }

  return {
    metrics: session.metrics,
    turnCount: session.turns.length,
    incidentCount: session.incidents.length,
    labelCounts,
    sessionLabelCounts,
    severityCounts,
    topIncidents,
    writeTurnCount: countWriteTurns(session.turns),
  };
}

function mergeLabelCounts(
  target: LabelCountRecord,
  source: LabelCountRecord,
): LabelCountRecord {
  const merged: LabelCountRecord = { ...target };
  for (const [label, count] of Object.entries(source)) {
    if (typeof count !== "number" || count <= 0) {
      continue;
    }
    merged[label as LabelName] = (merged[label as LabelName] ?? 0) + count;
  }
  return merged;
}

function mergeSessionLabelCounts(
  target: Record<LabelName, number>,
  source: Record<LabelName, number>,
): Record<LabelName, number> {
  const merged = { ...target };

  for (const label of Object.keys(source) as LabelName[]) {
    merged[label] = (merged[label] ?? 0) + (source[label] ?? 0);
  }

  return merged;
}

function buildSummaryInputsFromSessions(
  projections: readonly SessionSummaryProjection[],
): SummaryInputs {
  const sessionLabelCounts = new Map<string, Record<LabelName, number>>();
  const severityCounts = createEmptySeverityCounts();
  let topIncidents: SummaryInputs["topIncidents"] = [];
  let writeTurnCount = 0;

  for (const projection of projections) {
    const existingSessionLabelCounts = sessionLabelCounts.get(
      projection.metrics.sessionId,
    );
    sessionLabelCounts.set(
      projection.metrics.sessionId,
      existingSessionLabelCounts
        ? mergeSessionLabelCounts(
            existingSessionLabelCounts,
            projection.sessionLabelCounts,
          )
        : projection.sessionLabelCounts,
    );
    writeTurnCount += projection.writeTurnCount;

    for (const severity of ["info", "low", "medium", "high"] as const) {
      severityCounts[severity] += projection.severityCounts[severity];
    }

    for (const incident of projection.topIncidents) {
      topIncidents = insertTopIncident(
        topIncidents,
        incident,
        getConfig().previews.maxTopIncidents,
      );
    }
  }

  return {
    sessionLabelCounts,
    topIncidents,
    severityCounts,
    writeTurnCount,
  };
}

function buildSummaryModeMetrics(
  projections: readonly SessionSummaryProjection[],
  inventory: InventoryRecord[],
  corpusScope: MetricsRecord["corpusScope"],
) {
  return buildMetricsRecord(
    {
      sessionMetrics: projections.map((projection) => projection.metrics),
      labelCounts: projections.reduce(
        (counts, projection) =>
          mergeLabelCounts(counts, projection.labelCounts),
        {} as LabelCountRecord,
      ),
      turnCount: projections.reduce(
        (total, projection) => total + projection.turnCount,
        0,
      ),
      incidentCount: projections.reduce(
        (total, projection) => total + projection.incidentCount,
        0,
      ),
      parseWarningCount: projections.reduce(
        (total, projection) => total + projection.metrics.parseWarningCount,
        0,
      ),
    },
    inventory,
    corpusScope,
  );
}

interface DiscoveredSessionInputs {
  inventory: Awaited<ReturnType<typeof discoverArtifacts>>["inventory"];
  sessionInventoryPath: string;
  sessionFiles: readonly string[];
}

function buildCorpusScope(
  discoveredSessionCount: number,
  sessionLimit: number | undefined,
): MetricsRecord["corpusScope"] {
  if (typeof sessionLimit !== "number") {
    return {
      selection: "all_discovered",
      discoveredSessionCount,
      appliedSessionLimit: null,
    };
  }

  return {
    selection:
      discoveredSessionCount > sessionLimit
        ? "most_recent_window"
        : "all_discovered",
    discoveredSessionCount,
    appliedSessionLimit: sessionLimit,
  };
}

async function discoverSessionInputs(
  options: EvaluateOptions,
  signal?: AbortSignal,
): Promise<DiscoveredSessionInputs> {
  throwIfAborted(signal);

  const discovered = await discoverArtifacts(options.home, {
    provider: options.source,
    signal,
  });
  throwIfAborted(signal);

  const sessionInventory = discovered.inventory.find(
    (item) => item.kind === "session_jsonl",
  );
  const sessionInventoryPath =
    sessionInventory?.path ??
    (options.source === "claude"
      ? `${options.home}/projects`
      : `${options.home}/sessions`);

  if (!discovered.sessionDirectoryExists) {
    throw new MissingTranscriptInputError(
      sessionInventoryPath,
      "missing-directory",
    );
  }

  return {
    inventory: discovered.inventory,
    sessionInventoryPath,
    sessionFiles: discovered.sessionFiles,
  };
}

async function processDiscoveredSessions(
  options: EvaluateOptions,
  concurrency: number,
  allowEmptyCorpus = false,
  signal?: AbortSignal,
): Promise<{
  inventory: Awaited<ReturnType<typeof discoverArtifacts>>["inventory"];
  corpusScope: MetricsRecord["corpusScope"];
  processed: Awaited<ReturnType<typeof processSession>>[];
}> {
  const { inventory, sessionInventoryPath, sessionFiles } =
    await discoverSessionInputs(options, signal);
  const corpusScope = buildCorpusScope(
    sessionFiles.length,
    options.sessionLimit,
  );

  if (sessionFiles.length === 0) {
    if (allowEmptyCorpus) {
      return {
        inventory,
        corpusScope,
        processed: [],
      };
    }
    throw new MissingTranscriptInputError(
      sessionInventoryPath,
      "no-jsonl-files",
    );
  }

  const sessionPaths = await selectSessionPaths(
    sessionFiles,
    options.source,
    concurrency,
    options.sessionLimit,
    signal,
  );
  if (sessionPaths.length === 0) {
    if (allowEmptyCorpus) {
      return {
        inventory,
        corpusScope,
        processed: [],
      };
    }
    throw new MissingTranscriptInputError(
      sessionInventoryPath,
      "no-jsonl-files",
    );
  }

  const parseTimeoutMs = options.parseTimeoutMs ?? 30000;
  const homeDirectory = getValidatedHomeDirectory();
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
    inventory,
    corpusScope,
    processed,
  };
}

async function processSummarySessions(
  options: EvaluateOptions,
  concurrency: number,
  allowEmptyCorpus = false,
  signal?: AbortSignal,
): Promise<{
  inventory: Awaited<ReturnType<typeof discoverArtifacts>>["inventory"];
  corpusScope: MetricsRecord["corpusScope"];
  projections: SessionSummaryProjection[];
}> {
  const { inventory, sessionInventoryPath, sessionFiles } =
    await discoverSessionInputs(options, signal);
  const corpusScope = buildCorpusScope(
    sessionFiles.length,
    options.sessionLimit,
  );

  if (sessionFiles.length === 0) {
    if (allowEmptyCorpus) {
      return {
        inventory,
        corpusScope,
        projections: [],
      };
    }
    throw new MissingTranscriptInputError(
      sessionInventoryPath,
      "no-jsonl-files",
    );
  }

  const sessionPaths = await selectSessionPaths(
    sessionFiles,
    options.source,
    concurrency,
    options.sessionLimit,
    signal,
  );
  if (sessionPaths.length === 0) {
    if (allowEmptyCorpus) {
      return {
        inventory,
        corpusScope,
        projections: [],
      };
    }
    throw new MissingTranscriptInputError(
      sessionInventoryPath,
      "no-jsonl-files",
    );
  }

  const parseTimeoutMs = options.parseTimeoutMs ?? 30000;
  const homeDirectory = getValidatedHomeDirectory();
  const projections = await mapWithConcurrency(
    sessionPaths,
    concurrency,
    async (sessionPath) => {
      const session = await parseTranscriptFile(sessionPath, {
        sourceProvider: options.source,
        timeoutMs: parseTimeoutMs,
        signal,
      });
      const processed = await processSession(session, homeDirectory);
      return summarizeProcessedSession(processed);
    },
    signal,
  );

  return {
    inventory,
    corpusScope,
    projections,
  };
}

async function collectParsedArtifacts(
  options: EvaluateOptions,
  concurrency: number,
  allowEmptyCorpus = false,
  signal?: AbortSignal,
): Promise<{
  inventory: Awaited<ReturnType<typeof discoverArtifacts>>["inventory"];
  corpusScope: MetricsRecord["corpusScope"];
  processed: Awaited<ReturnType<typeof processSession>>[];
  rawTurns: RawTurnRecord[];
}> {
  const { inventory, corpusScope, processed } = await processDiscoveredSessions(
    options,
    concurrency,
    allowEmptyCorpus,
    signal,
  );
  throwIfAborted(signal);

  return {
    inventory,
    corpusScope,
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
    false,
    signal,
  );

  return {
    inventory: parsed.inventory,
    sessionCount: parsed.processed.length,
    parseWarningCount: parsed.processed.reduce(
      (total, session) => total + session.metrics.parseWarningCount,
      0,
    ),
    rawTurns: parsed.rawTurns,
  };
}

/**
 * Performs a canonical evaluation of transcript artifacts.
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

  if (outputMode === "summary") {
    const { inventory, corpusScope, projections } = await processSummarySessions(
      { ...options, outputMode },
      concurrency,
      true,
      signal,
    );
    const metrics = buildSummaryModeMetrics(projections, inventory, corpusScope);
    const summary = buildSummaryArtifact(
      metrics,
      buildSummaryInputsFromSessions(projections),
    );
    const report = renderSummaryReport(metrics, summary);
    const presentation = buildPresentationArtifacts(metrics, summary);

    return {
      metrics,
      summary,
      report,
      presentation,
    };
  }

  const parsed = await collectParsedArtifacts(
    { ...options, outputMode },
    concurrency,
    true,
    signal,
  );
  throwIfAborted(signal);

  const rawTurns = parsed.rawTurns;
  const incidents = extractIncidents(parsed.processed);
  const projections = parsed.processed.map(summarizeProcessedSession);
  const metrics = aggregateMetrics(
    parsed.processed,
    parsed.inventory,
    parsed.corpusScope,
  );
  const summary = buildSummaryArtifact(
    metrics,
    buildSummaryInputsFromSessions(projections),
  );
  const report = renderSummaryReport(metrics, summary);
  const presentation = buildPresentationArtifacts(metrics, summary);

  return {
    metrics,
    summary,
    report,
    presentation,
    rawTurns,
    incidents,
  };
}
