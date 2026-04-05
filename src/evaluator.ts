/**
 * Purpose: Orchestrates source-aware evaluation from discovery through canonical artifact generation.
 * Responsibilities: Discover transcripts, probe recency, filter sessions, parse sessions, process metrics, and build summary/report/presentation artifacts.
 * Scope: Shared pipeline for supported developer-agent sources.
 * Usage: `evaluateArtifacts({ source, home, outputMode: "full" })`.
 * Invariants/Assumptions: Discovery and parsing are source-aware while scoring, reporting, and presentation remain shared.
 */

import type { EvaluationArtifacts } from "./artifact-writer.js";
import { assignSessionAttribution } from "./attribution.js";
import { getConfig } from "./config/index.js";
import { discoverArtifacts } from "./discovery.js";
import { MissingTranscriptInputError } from "./errors.js";
import { aggregateMetrics } from "./metrics-aggregation.js";
import { buildPresentationArtifacts } from "./presentation.js";
import { buildReleaseManifest } from "./release-manifest.js";
import { renderSummaryReport } from "./report.js";
import type {
  IncidentRecord,
  LabelCountRecord,
  LabelName,
  MetricsRecord,
  RawTurnRecord,
  Severity,
} from "./schema.js";
import {
  buildSessionFacts,
  type SessionFactProjection,
} from "./session-facts.js";
import {
  createEmptyProcessedSessionAnalysis,
  type ProcessedSession,
  type ProcessedSessionAnalysis,
  processSession,
} from "./session-processor.js";
import type { SourceProvider } from "./sources.js";
import {
  buildSummaryInputsFromSessions,
  createEmptySeverityCounts,
} from "./summary/index.js";
import { collectSessionContexts } from "./summary/session-display.js";
import type { SessionContext } from "./summary/types.js";
import { buildSummaryArtifact } from "./summary-core.js";
import { buildTemplateRegistry } from "./template-analysis.js";
import { parseTranscriptFile } from "./transcript/index.js";
import {
  probeFallsInDateRange,
  probeSessionOrder,
  resolveProbeTimeValue,
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
  /** Path to the source home directory (typically ~/.codex, ~/.claude, or ~/.pi) */
  home: string;
  /** Maximum number of most recent sessions to evaluate (undefined for all) */
  sessionLimit?: number;
  /** Inclusive UTC start date filter */
  startDate?: string;
  /** Inclusive UTC end date filter */
  endDate?: string;
  /** Temporal bucket for metrics.json */
  timeBucket?: MetricsRecord["temporalBuckets"]["bucket"];
  /** Timeout for parsing individual transcript files (milliseconds). Default: 30000 */
  parseTimeoutMs?: number;
  /** Output mode for artifact generation. */
  outputMode?: EvaluationOutputMode;
}

interface SessionSummaryProjection extends SessionFactProjection {
  metrics: ProcessedSession["metrics"];
  rawLabelCounts: LabelCountRecord;
  labelCounts: LabelCountRecord;
  sessionLabelCounts: Record<LabelName, number>;
  attribution: ProcessedSessionAnalysis["attribution"];
  template: ProcessedSessionAnalysis["template"];
  sessionContext?: SessionContext;
  severityCounts: Record<Severity, number>;
}

interface SelectedSessionWindow {
  sessionPaths: readonly string[];
  discoveredSessionCount: number;
  eligibleSessionCount: number;
  undatedExcludedCount: number;
  selection: MetricsRecord["corpusScope"]["selection"];
}

interface DiscoveredSessionInputs {
  inventory: Awaited<ReturnType<typeof discoverArtifacts>>["inventory"];
  sessionInventoryPath: string;
  sessionFiles: readonly string[];
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
  const leftTimeValue = resolveProbeTimeValue(left);
  const rightTimeValue = resolveProbeTimeValue(right);

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

async function selectSessionWindow(
  sessionFiles: readonly string[],
  source: SourceProvider,
  concurrency: number,
  options: Pick<EvaluateOptions, "sessionLimit" | "startDate" | "endDate">,
  signal?: AbortSignal,
): Promise<SelectedSessionWindow> {
  const probes = await mapWithConcurrency(
    sessionFiles,
    concurrency,
    (path) => probeSessionOrder(path, source),
    signal,
  );

  const filtered: SessionOrderProbe[] = [];
  let undatedExcludedCount = 0;
  for (const probe of probes) {
    const match = probeFallsInDateRange(
      probe,
      options.startDate,
      options.endDate,
    );
    if (match.undated) {
      undatedExcludedCount += 1;
    }
    if (match.matches) {
      filtered.push(probe);
    }
  }

  const sortedPaths = filtered
    .sort(compareSessionProbes)
    .map((probe) => probe.path);
  const sessionPaths =
    typeof options.sessionLimit === "number"
      ? sortedPaths.slice(-options.sessionLimit)
      : sortedPaths;
  const hasDateFilter = Boolean(options.startDate || options.endDate);

  return {
    sessionPaths,
    discoveredSessionCount: sessionFiles.length,
    eligibleSessionCount: filtered.length,
    undatedExcludedCount,
    selection: hasDateFilter
      ? typeof options.sessionLimit === "number" &&
        filtered.length > options.sessionLimit
        ? "date_filtered_window"
        : "date_filtered"
      : typeof options.sessionLimit === "number" &&
          sessionFiles.length > options.sessionLimit
        ? "most_recent_window"
        : "all_discovered",
  };
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

function assertUniqueSessionIds(
  sessions: ReadonlyArray<{ sessionId: string; path?: string }>,
  scope: string,
): void {
  const seen = new Map<string, string | undefined>();

  for (const session of sessions) {
    if (seen.has(session.sessionId)) {
      const currentPath = session.path ?? "unknown path";
      const priorPath = seen.get(session.sessionId) ?? "unknown path";
      throw new Error(
        `Duplicate sessionId ${session.sessionId} detected in ${scope}: ${priorPath} and ${currentPath}.`,
      );
    }

    seen.set(session.sessionId, session.path);
  }
}

const FAILED_RULE_LABELS: Record<string, string> = {
  scope_confirmed_before_major_write: "Scope confirmed before major write",
  cwd_or_repo_echoed_before_write: "Repo or cwd confirmed before write",
  short_plan_before_large_change: "Short plan before large change",
  verification_after_code_changes: "Verification after code changes",
  no_unverified_ending: "No unverified ending",
};

function summarizeProcessedSession(
  session: ProcessedSession,
): SessionSummaryProjection {
  const analysis = session.analysis ?? createEmptyProcessedSessionAnalysis();
  const sessionLabelCounts = createEmptySessionLabelMap();
  const severityCounts = createEmptySeverityCounts();
  const sessionContext = collectSessionContexts(session.turns).get(
    session.metrics.sessionId,
  );

  for (const [label, count] of Object.entries(
    analysis.deTemplatedLabelCounts,
  )) {
    if (typeof count !== "number") {
      continue;
    }
    sessionLabelCounts[label as LabelName] = count;
  }

  for (const incident of session.incidents) {
    severityCounts[incident.severity] += 1;
  }

  return {
    sessionId: session.metrics.sessionId,
    provider: session.metrics.provider,
    harness: session.metrics.harness,
    modelProvider: session.metrics.modelProvider,
    model: session.metrics.model,
    startedAt: session.metrics.startedAt,
    endedAt: session.metrics.endedAt,
    durationMs: session.metrics.durationMs,
    turnCount: session.metrics.turnCount,
    userMessageCount: session.metrics.userMessageCount,
    assistantMessageCount: session.metrics.assistantMessageCount,
    toolCallCount: session.metrics.toolCallCount,
    writeToolCallCount: session.metrics.writeToolCallCount,
    verificationToolCallCount: session.metrics.verificationToolCallCount,
    mcpToolCallCount: session.metrics.mcpToolCallCount,
    writeCount: session.metrics.writeCount,
    verificationCount: session.metrics.verificationCount,
    endedVerified: session.metrics.endedVerified,
    complianceScore: session.metrics.complianceScore,
    failedRules: session.metrics.complianceRules
      .filter((rule) => rule.status === "fail")
      .map((rule) => FAILED_RULE_LABELS[rule.rule] ?? rule.rule),
    topTools: session.metrics.topTools,
    mcpServers: session.metrics.mcpServers,
    title: sessionContext?.leadPreview,
    evidencePreviews: sessionContext?.evidencePreviews ?? [],
    sourceRefs: sessionContext?.sourceRefs ?? [],
    metrics: session.metrics,
    rawLabelCounts: analysis.rawLabelCounts,
    labelCounts: analysis.deTemplatedLabelCounts,
    deTemplatedLabelCounts: analysis.deTemplatedLabelCounts,
    sessionLabelCounts,
    attribution: analysis.attribution,
    template: analysis.template,
    ...(sessionContext ? { sessionContext } : {}),
    severityCounts,
  };
}

function buildCorpusScope(
  selectionWindow: SelectedSessionWindow,
  options: Pick<
    EvaluateOptions,
    "sessionLimit" | "startDate" | "endDate" | "timeBucket"
  >,
): MetricsRecord["corpusScope"] {
  return {
    selection: selectionWindow.selection,
    discoveredSessionCount: selectionWindow.discoveredSessionCount,
    eligibleSessionCount: selectionWindow.eligibleSessionCount,
    appliedSessionLimit: options.sessionLimit ?? null,
    startDate: options.startDate ?? null,
    endDate: options.endDate ?? null,
    timeBucket: options.timeBucket ?? "week",
    undatedExcludedCount: selectionWindow.undatedExcludedCount,
  };
}

function buildAppliedFilters(
  selectionWindow: SelectedSessionWindow,
  options: Pick<
    EvaluateOptions,
    "sessionLimit" | "startDate" | "endDate" | "timeBucket"
  >,
): MetricsRecord["appliedFilters"] {
  return {
    startDate: options.startDate ?? null,
    endDate: options.endDate ?? null,
    sessionLimit: options.sessionLimit ?? null,
    timeBucket: options.timeBucket ?? "week",
    discoveredSessionCount: selectionWindow.discoveredSessionCount,
    eligibleSessionCount: selectionWindow.eligibleSessionCount,
    undatedExcludedCount: selectionWindow.undatedExcludedCount,
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
      : options.source === "pi"
        ? `${options.home}/agent/sessions`
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
  appliedFilters: MetricsRecord["appliedFilters"];
  templateLabelSummaries: ReturnType<
    typeof buildTemplateRegistry
  >["labelSummaries"];
  processed: Awaited<ReturnType<typeof processSession>>[];
}> {
  const { inventory, sessionInventoryPath, sessionFiles } =
    await discoverSessionInputs(options, signal);

  const selectionWindow = await selectSessionWindow(
    sessionFiles,
    options.source,
    concurrency,
    options,
    signal,
  );
  const corpusScope = buildCorpusScope(selectionWindow, options);
  const appliedFilters = buildAppliedFilters(selectionWindow, options);
  const hasDateFilter = Boolean(options.startDate || options.endDate);

  if (sessionFiles.length === 0) {
    if (allowEmptyCorpus || hasDateFilter) {
      return {
        inventory,
        corpusScope,
        appliedFilters,
        templateLabelSummaries: [],
        processed: [],
      };
    }
    throw new MissingTranscriptInputError(
      sessionInventoryPath,
      "no-jsonl-files",
    );
  }

  if (selectionWindow.sessionPaths.length === 0) {
    if (allowEmptyCorpus || hasDateFilter) {
      return {
        inventory,
        corpusScope,
        appliedFilters,
        templateLabelSummaries: [],
        processed: [],
      };
    }
    throw new MissingTranscriptInputError(
      sessionInventoryPath,
      "no-jsonl-files",
    );
  }

  const parseTimeoutMs = options.parseTimeoutMs ?? 30000;
  const parsedSessions = await mapWithConcurrency(
    selectionWindow.sessionPaths,
    concurrency,
    (sessionPath) =>
      parseTranscriptFile(sessionPath, {
        sourceProvider: options.source,
        timeoutMs: parseTimeoutMs,
        signal,
      }),
    signal,
  );
  const templateRegistry = buildTemplateRegistry(parsedSessions);
  const homeDirectory = getValidatedHomeDirectory();
  const processed = await mapWithConcurrency(
    parsedSessions,
    concurrency,
    async (session) => {
      const baseProcessed = await processSession(session, homeDirectory, {
        templateAnalysis: templateRegistry.sessionAnalyses.get(
          session.sessionId,
        ),
      });
      const analysis =
        baseProcessed.analysis ?? createEmptyProcessedSessionAnalysis();
      return {
        ...baseProcessed,
        analysis: {
          ...analysis,
          attribution: assignSessionAttribution({
            rawLabelCounts: analysis.rawLabelCounts,
            deTemplatedLabelCounts: analysis.deTemplatedLabelCounts,
            template: {
              artifactScore: analysis.template.artifactScore,
              textSharePct: analysis.template.textSharePct,
              flags: analysis.template.flags,
            },
            writeCount: baseProcessed.metrics.writeCount,
            endedVerified: baseProcessed.metrics.endedVerified,
          }),
        },
      } satisfies ProcessedSession;
    },
    signal,
  );

  assertUniqueSessionIds(processed, "processed sessions");

  return {
    inventory,
    corpusScope,
    appliedFilters,
    templateLabelSummaries: templateRegistry.labelSummaries,
    processed,
  };
}

async function collectParsedArtifacts(
  options: EvaluateOptions,
  concurrency: number,
  allowEmptyCorpus = false,
  signal?: AbortSignal,
): Promise<{
  inventory: Awaited<ReturnType<typeof discoverArtifacts>>["inventory"];
  processed: Awaited<ReturnType<typeof processSession>>[];
  rawTurns: RawTurnRecord[];
}> {
  const { inventory, processed } = await processDiscoveredSessions(
    options,
    concurrency,
    allowEmptyCorpus,
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

  const parsed = await processDiscoveredSessions(
    { ...options, outputMode },
    concurrency,
    true,
    signal,
  );
  throwIfAborted(signal);

  const rawTurns = extractTurns(parsed.processed);
  const incidents = extractIncidents(parsed.processed);
  const projections = parsed.processed.map(summarizeProcessedSession);
  const metrics = aggregateMetrics(parsed.processed, parsed.inventory, {
    corpusScope: parsed.corpusScope,
    appliedFilters: parsed.appliedFilters,
    templateLabelSummaries: parsed.templateLabelSummaries,
  });
  const summary = buildSummaryArtifact(
    metrics,
    buildSummaryInputsFromSessions(parsed.processed),
  );
  const sessionFacts = buildSessionFacts(projections, summary);
  assertUniqueSessionIds(sessionFacts, "session facts");
  const report = renderSummaryReport(metrics, summary);
  const presentation = buildPresentationArtifacts(metrics, summary);
  const artifactFiles = [
    "metrics.json",
    "summary.json",
    "session-facts.jsonl",
    "release-manifest.json",
    "report.md",
    "report.html",
    "favicon.ico",
    "favicon.svg",
    "sessions-over-time.svg",
    "provider-share.svg",
    "harness-share.svg",
    "tool-family-share.svg",
    "attribution-mix.svg",
    ...(outputMode === "full" ? ["raw-turns.jsonl", "incidents.jsonl"] : []),
  ];
  const releaseManifest = buildReleaseManifest(
    metrics,
    summary,
    sessionFacts,
    { ...options, outputMode },
    artifactFiles,
  );

  return {
    metrics,
    summary,
    sessionFacts,
    releaseManifest,
    report,
    presentation,
    ...(outputMode === "full" ? { rawTurns, incidents } : {}),
  };
}
