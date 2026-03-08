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
import { parseTranscriptFile } from "./transcript.js";
import { mapWithConcurrency } from "./utils/concurrency.js";
import { EVALUATOR_VERSION, SCHEMA_VERSION } from "./version.js";

export type { EvaluationResult, SummaryOnlyEvaluationResult };
export { writeEvaluationArtifacts, writeSummaryArtifacts };

export interface EvaluateOptions {
  codexHome: string;
  outputDir: string;
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
