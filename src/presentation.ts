/**
 * Purpose: Build presentation-ready HTML and SVG artifacts from canonical evaluation data.
 * Responsibilities: Render the polished HTML report and deterministic dashboard charts from metrics plus a pre-built summary.
 * Scope: Shared presentation layer for all supported transcript sources.
 * Usage: Call `buildPresentationArtifacts(metrics, summary)` after summary generation.
 * Invariants/Assumptions: Presentation is derived entirely from canonical metrics and summary data; it does not recompute evaluator logic.
 */

import { renderFaviconIco, renderFaviconSvg } from "./html-report/favicon.js";
import { renderHtmlReport } from "./html-report/index.js";
import type { MetricsRecord, SummaryArtifact } from "./schema.js";
import {
  renderAttributionMixChart,
  renderHarnessShareChart,
  renderProviderShareChart,
  renderSessionsOverTimeChart,
  renderToolFamilyShareChart,
} from "./svg-charts.js";

/**
 * Collection of presentation artifacts generated from evaluation results.
 */
export interface PresentationArtifacts {
  /** Polished HTML report with charts and styled cards */
  reportHtml: string;
  /** Static ICO favicon fallback for browsers that still probe favicon.ico */
  faviconIco: Uint8Array;
  /** Static favicon asset for the report bundle */
  faviconSvg: string;
  /** SVG chart of sessions over time */
  sessionsOverTimeChartSvg: string;
  /** SVG chart of provider share */
  providerShareChartSvg: string;
  /** SVG chart of harness share */
  harnessShareChartSvg: string;
  /** SVG chart of tool-family share */
  toolFamilyShareChartSvg: string;
  /** SVG chart of attribution mix */
  attributionMixChartSvg: string;
}

/**
 * Creates the derived presentation bundle from canonical metrics and summary data.
 */
export function buildPresentationArtifacts(
  metrics: MetricsRecord,
  summary: SummaryArtifact,
): PresentationArtifacts {
  const sessionsOverTimeChartSvg = renderSessionsOverTimeChart(metrics);
  const providerShareChartSvg = renderProviderShareChart(summary);
  const harnessShareChartSvg = renderHarnessShareChart(summary);
  const toolFamilyShareChartSvg = renderToolFamilyShareChart(summary);
  const attributionMixChartSvg = renderAttributionMixChart(summary);
  const faviconIco = renderFaviconIco();
  const faviconSvg = renderFaviconSvg();

  return {
    reportHtml: renderHtmlReport(summary, metrics, {
      sessionsOverTimeChartSvg,
      providerShareChartSvg,
      harnessShareChartSvg,
      toolFamilyShareChartSvg,
      attributionMixChartSvg,
    }),
    faviconIco,
    faviconSvg,
    sessionsOverTimeChartSvg,
    providerShareChartSvg,
    harnessShareChartSvg,
    toolFamilyShareChartSvg,
    attributionMixChartSvg,
  };
}
