/**
 * Purpose: Facade for presentation artifact generation.
 * Entrypoint: `createPresentationArtifacts()` is used by the evaluator when writing output files.
 * Notes: Delegates to specialized modules for HTML and SVG generation.
 */

import { renderHtmlReport } from "./html-report/index.js";
import {
  buildSummaryArtifact,
  buildSummaryInputsFromArtifacts,
} from "./insights.js";
import type {
  IncidentRecord,
  MetricsRecord,
  RawTurnRecord,
  SummaryArtifact,
} from "./schema.js";
import {
  renderComplianceChart,
  renderLabelChart,
  renderSeverityChart,
} from "./svg-charts.js";

/**
 * Collection of presentation artifacts generated from evaluation results.
 */
export interface PresentationArtifacts {
  /** The complete summary artifact with metrics, rates, and insights */
  summary: SummaryArtifact;
  /** Polished HTML report with charts and styled cards */
  reportHtml: string;
  /** SVG bar chart of label counts */
  labelChartSvg: string;
  /** SVG bar chart of compliance pass counts */
  complianceChartSvg: string;
  /** SVG bar chart of incident severity distribution */
  severityChartSvg: string;
}

function buildPresentationArtifacts(
  metrics: MetricsRecord,
  summary: SummaryArtifact,
): PresentationArtifacts {
  return {
    summary,
    reportHtml: renderHtmlReport(summary, metrics),
    labelChartSvg: renderLabelChart(summary),
    complianceChartSvg: renderComplianceChart(summary),
    severityChartSvg: renderSeverityChart(summary),
  };
}

/**
 * Creates presentation artifacts from evaluation results.
 *
 * Generates a complete set of derived outputs suitable for sharing:
 * - Summary JSON with all metrics and insights
 * - Polished HTML report with styled sections
 * - SVG charts for label counts, compliance, and severity
 *
 * @param metrics - Aggregated metrics from the evaluation
 * @param incidents - Clustered incidents detected during evaluation
 * @param rawTurns - All parsed and labeled turns from the sessions
 * @returns PresentationArtifacts containing HTML report, SVG charts, and summary data
 *
 * @example
 * ```typescript
 * const artifacts = createPresentationArtifacts(metrics, incidents, rawTurns);
 * await writeFile("report.html", artifacts.reportHtml);
 * await writeFile("summary.json", JSON.stringify(artifacts.summary));
 * ```
 */
export function createPresentationArtifacts(
  metrics: MetricsRecord,
  incidents: readonly IncidentRecord[],
  rawTurns: readonly RawTurnRecord[],
): PresentationArtifacts {
  const summary = buildSummaryArtifact(
    metrics,
    buildSummaryInputsFromArtifacts(rawTurns, incidents),
  );

  return buildPresentationArtifacts(metrics, summary);
}

/**
 * Creates presentation artifacts from an existing summary artifact.
 *
 * Use this when you already have a summary and want to regenerate
 * the derived presentation outputs (HTML, SVG charts) without
 * re-running the full evaluation.
 *
 * @param metrics - Aggregated metrics from the evaluation
 * @param summary - Pre-built summary artifact
 * @returns PresentationArtifacts containing HTML report, SVG charts, and summary data
 *
 * @example
 * ```typescript
 * // Regenerate HTML report from cached summary
 * const artifacts = createPresentationArtifactsFromSummary(metrics, cachedSummary);
 * await writeFile("report.html", artifacts.reportHtml);
 * ```
 */
export function createPresentationArtifactsFromSummary(
  metrics: MetricsRecord,
  summary: SummaryArtifact,
): PresentationArtifacts {
  return buildPresentationArtifacts(metrics, summary);
}
