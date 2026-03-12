/**
 * Purpose: Build presentation-ready HTML and SVG artifacts from canonical evaluation data.
 * Responsibilities: Render the polished HTML report and deterministic charts from metrics plus a pre-built summary.
 * Scope: Shared presentation layer for all supported transcript sources.
 * Usage: Call `buildPresentationArtifacts(metrics, summary)` after summary generation.
 * Invariants/Assumptions: Presentation is derived entirely from canonical metrics and summary data; it does not recompute evaluator logic.
 */

import { renderFaviconSvg } from "./html-report/favicon.js";
import { renderHtmlReport } from "./html-report/index.js";
import type { MetricsRecord, SummaryArtifact } from "./schema.js";
import {
  renderComplianceChart,
  renderLabelChart,
  renderSeverityChart,
} from "./svg-charts.js";

/**
 * Collection of presentation artifacts generated from evaluation results.
 */
export interface PresentationArtifacts {
  /** Polished HTML report with charts and styled cards */
  reportHtml: string;
  /** Static favicon asset for the report bundle */
  faviconSvg: string;
  /** SVG bar chart of label counts */
  labelChartSvg: string;
  /** SVG bar chart of compliance pass counts */
  complianceChartSvg: string;
  /** SVG bar chart of incident severity distribution */
  severityChartSvg: string;
}

/**
 * Creates the derived presentation bundle from canonical metrics and summary data.
 */
export function buildPresentationArtifacts(
  metrics: MetricsRecord,
  summary: SummaryArtifact,
): PresentationArtifacts {
  const labelChartSvg = renderLabelChart(summary);
  const complianceChartSvg = renderComplianceChart(summary);
  const severityChartSvg = renderSeverityChart(summary);
  const faviconSvg = renderFaviconSvg();

  return {
    reportHtml: renderHtmlReport(summary, metrics, {
      labelChartSvg,
      complianceChartSvg,
      severityChartSvg,
    }),
    faviconSvg,
    labelChartSvg,
    complianceChartSvg,
    severityChartSvg,
  };
}
