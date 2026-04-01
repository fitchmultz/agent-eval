/**
 * Purpose: Main render orchestrator for source-neutral HTML reports.
 * Responsibilities: Assemble the complete static HTML triage report document for supported transcript sources.
 * Scope: Used by the presentation layer after deterministic metrics and summary generation.
 * Usage: `renderHtmlReport(summary, metrics, charts)`.
 * Invariants/Assumptions: The HTML report remains static, portable, and dependency-free.
 */

import { describeCorpusScope } from "../report-scope.js";
import type { MetricsRecord, SummaryArtifact } from "../schema.js";
import {
  renderExecutiveSummaryCards,
  renderIncidentCards,
  renderInventoryList,
  renderMetricGlossary,
  renderOperatorMetrics,
  renderOpportunityList,
  renderSessionCards,
} from "./cards.js";
import {
  renderComparativeSliceTable,
  renderComplianceTable,
} from "./tables.js";
import { escapeHtml, renderStyles } from "./templates.js";

export interface HtmlReportCharts {
  labelChartSvg: string;
  complianceChartSvg: string;
  severityChartSvg: string;
}

function renderMethodologyList(metrics: MetricsRecord): string {
  const items = [
    "This report is a deterministic transcript analytics summary with heuristic policy proxies, not a rigorous correctness evaluator.",
    "Labels represent transcript-visible heuristics and should be read as operator-friction signals, not ground-truth task outcomes.",
    "Compliance scores are event-order proxies based on observed transcript behavior and do not prove repository correctness.",
    "Static HTML is intentional: this report favors shareable, portable triage output over client-side interaction.",
  ];

  if (metrics.parseWarningCount > 0) {
    items.push(
      `Parse warnings: ${metrics.parseWarningCount}. Some malformed transcript lines were skipped, so affected sessions may be partial.`,
    );
  }

  return `<ul class="opportunity-list">${items
    .map((item) => `<li><span>${escapeHtml(item)}</span></li>`)
    .join("")}</ul>`;
}

function renderNoDataPanel(summary: SummaryArtifact): string {
  if (summary.sessions > 0) {
    return "";
  }

  return `<section><div class="panel empty-hero">
    <h2>No Data Yet</h2>
    <p>The selected source home has the expected transcript layout, but no session JSONL files were discovered yet.</p>
    <p>This is a valid first-run or freshly bootstrapped state, so the report renders a deterministic empty corpus instead of treating it as a runtime failure. The transcript home is reachable, but required transcript input stays missing until canonical session JSONL files appear.</p>
  </div></section>`;
}

function renderHeaderContext(
  summary: SummaryArtifact,
  metrics: MetricsRecord,
): string {
  const providers = [
    ...new Set(metrics.inventory.map((record) => record.provider)),
  ];
  return `${providers.join(", ")} corpus · ${summary.sessions} sessions · ${metrics.corpusScope.selection === "most_recent_window" ? "recent-window" : "full corpus"} · generated ${summary.generatedAt}`;
}

function renderReportMetadata(
  summary: SummaryArtifact,
  metrics: MetricsRecord,
): string {
  const providers = [
    ...new Set(metrics.inventory.map((record) => record.provider)),
  ];
  return `<details class="panel report-metadata"><summary>Report metadata</summary>
    <ul class="opportunity-list">
      <li><strong>Engine</strong><span>${escapeHtml(summary.engineVersion)}</span></li>
      <li><strong>Schema</strong><span>${escapeHtml(summary.schemaVersion)}</span></li>
      <li><strong>Providers</strong><span>${escapeHtml(providers.join(", "))}</span></li>
      <li><strong>Parse warnings</strong><span>${metrics.parseWarningCount}</span></li>
    </ul>
  </details>`;
}

/**
 * Generates a complete HTML report from summary artifacts.
 */
export function renderHtmlReport(
  summary: SummaryArtifact,
  metrics: MetricsRecord,
  _charts: HtmlReportCharts,
): string {
  const styles = renderStyles();
  const scope = describeCorpusScope(metrics);
  const title = "Transcript Analytics Report";
  const isEmptyCorpus = summary.sessions === 0;
  const bodyClassName = isEmptyCorpus ? ' class="empty-report"' : "";
  const contentSections = isEmptyCorpus
    ? [
        renderNoDataPanel(summary),
        `<section><h2>Operator Action Metrics</h2><div class="metric-grid">${renderOperatorMetrics(summary)}</div></section>`,
        `<section><h2>Inventory</h2>${renderInventoryList(metrics)}</section>`,
        `<section><h2>Methodology And Limitations</h2><div class="panel">${renderMethodologyList(metrics)}</div></section>`,
      ]
    : [
        `<section><h2>Executive Summary</h2><div class="metric-grid executive-grid">${renderExecutiveSummaryCards(summary)}</div></section>`,
        `<section><h2>Operator Action Metrics</h2><div class="metric-grid">${renderOperatorMetrics(summary)}</div></section>`,
        `<section><h2>Sessions To Review First</h2><div class="sessions-grid">${renderSessionCards(summary)}</div></section>`,
        `<section><h2>Compliance Breakdown</h2><div class="panel">${renderComplianceTable(summary)}</div></section>`,
        `<section><h2>Comparative Slices</h2><div class="panel">${renderComparativeSliceTable(summary)}</div>${renderMetricGlossary(summary)}</section>`,
        `<section><h2>Recurring Patterns And Incidents</h2><div class="incident-grid">${renderIncidentCards(summary)}</div></section>`,
        `<section><h2>Deterministic Opportunities</h2><ul class="opportunity-list">${renderOpportunityList(summary)}</ul></section>`,
        `<section><h2>Methodology And Limitations</h2><div class="panel">${renderMethodologyList(metrics)}</div></section>`,
        `<section><h2>Inventory</h2>${renderInventoryList(metrics)}</section>`,
        renderReportMetadata(summary, metrics),
      ];

  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    `<title>${escapeHtml(title)}</title>`,
    '<link rel="icon" href="./favicon.svg" type="image/svg+xml" />',
    '<link rel="icon" href="./favicon.ico" sizes="any" type="image/x-icon" />',
    `<style>${styles}</style>`,
    "</head>",
    `<body${bodyClassName}>`,
    "<main>",
    "<header>",
    `<h1>${escapeHtml(title)}</h1>`,
    `<p class="lede">${escapeHtml(
      "A deterministic, transcript-first session triage report for reviewing operator burden, verification habits, and transcript-visible workflow behavior.",
    )}</p>`,
    `<p class="context-line">${escapeHtml(renderHeaderContext(summary, metrics))}</p>`,
    `<div class="scope-banner${scope.isWindowed ? " scope-banner-windowed" : ""}">
      <p class="scope-banner-title">${escapeHtml(scope.headline)}</p>
      <p>${escapeHtml(scope.detail)}</p>
      <p>${escapeHtml(scope.comparability)}</p>
    </div>`,
    "</header>",
    ...contentSections,
    `<p class="footer-note">${escapeHtml(
      "Incident evidence is redacted and truncated for compact reporting. Preview sanitization reduces common sensitive data exposure but is not a guarantee of full anonymization.",
    )}</p>`,
    "</main>",
    "</body>",
    "</html>",
  ].join("");
}
