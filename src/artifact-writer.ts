/**
 * Purpose: Writes evaluation artifacts to filesystem.
 * Entrypoint: `writeEvaluationArtifacts()` and `writeSummaryArtifacts()`.
 */
import { join } from "node:path";
import { writeJsonLinesFile, writeTextFile } from "./filesystem.js";
import {
  createEmptySessionLabelMap,
  createEmptySeverityCounts,
  insertTopIncident,
  type SummaryInputs,
} from "./insights.js";
import {
  createPresentationArtifacts,
  createPresentationArtifactsFromSummary,
} from "./presentation.js";
import type {
  IncidentRecord,
  MetricsRecord,
  RawTurnRecord,
  SummaryArtifact,
} from "./schema.js";

/**
 * Result of a full evaluation.
 */
export interface EvaluationResult {
  rawTurns: RawTurnRecord[];
  incidents: IncidentRecord[];
  metrics: MetricsRecord;
  report: string;
}

/**
 * Result of a summary-only evaluation.
 */
export interface SummaryOnlyEvaluationResult {
  metrics: MetricsRecord;
  summary: SummaryArtifact;
  report: string;
}

/**
 * Shared artifacts that both evaluation modes produce.
 */
interface SharedArtifactWriteResult {
  metrics: MetricsRecord;
  report: string;
  summary: SummaryArtifact;
}

/**
 * Writes shared artifacts (metrics, report, summary, charts).
 */
async function writeSharedArtifacts(
  result: SharedArtifactWriteResult,
  outputDir: string,
): Promise<void> {
  await writeTextFile(
    join(outputDir, "metrics.json"),
    `${JSON.stringify(result.metrics, null, 2)}\n`,
  );
  await writeTextFile(
    join(outputDir, "summary.json"),
    `${JSON.stringify(result.summary, null, 2)}\n`,
  );
  await writeTextFile(join(outputDir, "report.md"), result.report);
  const presentation = createPresentationArtifactsFromSummary(
    result.metrics,
    result.summary,
  );
  await writeTextFile(join(outputDir, "report.html"), presentation.reportHtml);
  await writeTextFile(
    join(outputDir, "label-counts.svg"),
    presentation.labelChartSvg,
  );
  await writeTextFile(
    join(outputDir, "compliance-summary.svg"),
    presentation.complianceChartSvg,
  );
  await writeTextFile(
    join(outputDir, "severity-breakdown.svg"),
    presentation.severityChartSvg,
  );
}

/**
 * Writes all artifacts from a full evaluation.
 * @param result - The full evaluation result
 * @param outputDir - Directory to write artifacts to
 */
export async function writeEvaluationArtifacts(
  result: EvaluationResult,
  outputDir: string,
): Promise<void> {
  await writeJsonLinesFile(join(outputDir, "raw-turns.jsonl"), result.rawTurns);
  await writeJsonLinesFile(
    join(outputDir, "incidents.jsonl"),
    result.incidents,
  );
  const presentation = createPresentationArtifacts(
    result.metrics,
    result.incidents,
    result.rawTurns,
  );
  await writeSharedArtifacts(
    {
      metrics: result.metrics,
      report: result.report,
      summary: presentation.summary,
    },
    outputDir,
  );
}

/**
 * Writes artifacts from a summary-only evaluation.
 * @param result - The summary-only evaluation result
 * @param outputDir - Directory to write artifacts to
 */
export async function writeSummaryArtifacts(
  result: SummaryOnlyEvaluationResult,
  outputDir: string,
): Promise<void> {
  await writeSharedArtifacts(
    {
      metrics: result.metrics,
      report: result.report,
      summary: result.summary,
    },
    outputDir,
  );
}

/**
 * Creates summary inputs from processed sessions for building summary artifact.
 * This is a helper for the evaluator's summary-only path.
 */
export function createSummaryInputs(
  sessions: ReadonlyArray<{
    sessionId: string;
    turns: ReadonlyArray<RawTurnRecord>;
    incidents: ReadonlyArray<IncidentRecord>;
  }>,
  writeTurnCount: number,
): SummaryInputs {
  const sessionLabelCounts = new Map<
    string,
    ReturnType<typeof createEmptySessionLabelMap>
  >();
  const severityCounts = createEmptySeverityCounts();
  let topIncidents: SummaryArtifact["topIncidents"] = [];

  for (const session of sessions) {
    const localLabelCounts = createEmptySessionLabelMap();

    for (const turn of session.turns) {
      for (const label of turn.labels) {
        localLabelCounts[label.label] += 1;
      }
    }

    sessionLabelCounts.set(session.sessionId, localLabelCounts);

    for (const incident of session.incidents) {
      severityCounts[incident.severity] += 1;
      topIncidents = insertTopIncident(
        topIncidents,
        {
          incidentId: incident.incidentId,
          sessionId: incident.sessionId,
          summary: incident.summary,
          severity: incident.severity,
          confidence: incident.confidence,
          turnSpan: incident.turnIndices.length,
          evidencePreview: incident.evidencePreviews[0],
        },
        8,
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
