/**
 * Purpose: Main render orchestrator for source-neutral v3 HTML reports.
 * Responsibilities: Assemble the complete static HTML evaluation report document for supported transcript sources.
 * Scope: Used by the presentation layer after deterministic metrics and summary generation.
 * Usage: `renderHtmlReport(model, charts)`.
 * Invariants/Assumptions: The HTML report remains static, portable, and dependency-free.
 */

import { buildReportPresentationModel } from "../presentation-model.js";
import type { MetricsRecord, SummaryArtifact } from "../schema.js";
import {
  renderAppliedFilters,
  renderAttributionSummary,
  renderCausePatterns,
  renderDashboardDistributions,
  renderInventoryList,
  renderMetadata,
  renderOverviewHighlights,
  renderPrimaryMetricCards,
  renderSecondaryMetricCards,
  renderSummaryNotes,
  renderSurfaceSection,
  renderTemplateSubstrate,
} from "./cards.js";
import { renderStyles } from "./styles.js";
import {
  renderComparativeSliceGroups,
  renderComplianceTable,
} from "./tables.js";
import { escapeHtml } from "./templates.js";

export interface HtmlReportCharts {
  sessionsOverTimeChartSvg: string;
  providerShareChartSvg: string;
  harnessShareChartSvg: string;
  toolFamilyShareChartSvg: string;
  attributionMixChartSvg: string;
}

function renderMethodologyList(
  model: ReturnType<typeof buildReportPresentationModel>,
): string {
  return `<ul class="stack-list">${model.methodology
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("")}</ul>`;
}

function renderHeaderNotes(
  model: ReturnType<typeof buildReportPresentationModel>,
): string {
  return `${renderSummaryNotes(model.coverageNotes)}${renderSummaryNotes(model.sampleNotes)}`;
}

function renderSectionNavigation(): string {
  const links: Array<[string, string]> = [
    ["#overview", "Overview"],
    ["#what-worked", "What Worked"],
    ["#needs-review", "Needs Review"],
    ["#why-this-happened", "Why This Happened"],
    ["#comparative-slices", "Comparative Slices"],
  ];

  return `<nav class="section-nav" aria-label="Report sections"><ul>${links
    .map(
      ([href, label]) =>
        `<li><a href="${escapeHtml(href)}">${escapeHtml(label)}</a></li>`,
    )
    .join("")}</ul></nav>`;
}

function renderOverviewCharts(charts: HtmlReportCharts): string {
  return `<div class="chart-grid">
    ${charts.sessionsOverTimeChartSvg}
    ${charts.providerShareChartSvg}
    ${charts.harnessShareChartSvg}
    ${charts.toolFamilyShareChartSvg}
    ${charts.attributionMixChartSvg}
  </div>`;
}

function renderNoDataPanel(
  model: ReturnType<typeof buildReportPresentationModel>,
): string {
  if (!model.isEmptyCorpus) {
    return "";
  }

  return `<section><div class="panel empty-hero">
    <h2>No Data Yet</h2>
    <p>The selected source home has the expected transcript layout, but no session JSONL files were discovered yet.</p>
    <p>This is a valid first-run or freshly bootstrapped state, so the report renders a deterministic empty corpus instead of treating it as a runtime failure.</p>
  </div></section>`;
}

export function renderHtmlReport(
  summary: SummaryArtifact,
  metrics: MetricsRecord,
  charts: HtmlReportCharts,
): string {
  const model = buildReportPresentationModel(metrics, summary);
  const styles = renderStyles();

  const contentSections = model.isEmptyCorpus
    ? [
        renderNoDataPanel(model),
        `<section id="overview"><h2>Overview Dashboard</h2><div class="metric-grid">${renderPrimaryMetricCards(model)}</div><div class="metric-grid secondary-metric-grid">${renderSecondaryMetricCards(model)}</div></section>`,
        `<details class="panel lower-section" id="inventory"><summary>Inventory</summary>${renderInventoryList(model)}</details>`,
        `<details class="panel lower-section" id="methodology-and-limitations"><summary>Methodology And Limitations</summary>${renderMethodologyList(model)}</details>`,
      ]
    : [
        `<section id="overview"><h2>Overview Dashboard</h2><div class="metric-grid">${renderPrimaryMetricCards(model)}</div><div class="metric-grid secondary-metric-grid">${renderSecondaryMetricCards(model)}</div><div class="panel overview-highlights">${renderOverviewHighlights(model)}</div>${renderOverviewCharts(charts)}<div class="detail-grid">${renderDashboardDistributions(model)}</div>${renderSummaryNotes(model.overviewNotes)}</section>`,
        `<section id="what-worked"><h2>What Worked</h2>${renderSurfaceSection(model.worked)}</section>`,
        `<section id="needs-review"><h2>Needs Review</h2>${renderSurfaceSection(model.review)}</section>`,
        `<section id="why-this-happened"><h2>Why This Happened</h2><div class="detail-grid">${renderAttributionSummary(model)}${renderTemplateSubstrate(model)}</div><div class="detail-grid cause-grid">${renderCausePatterns(model)}</div></section>`,
        `<section id="comparative-slices"><h2>Comparative Slices</h2>${renderComparativeSliceGroups(model)}</section>`,
        `<details class="panel lower-section" id="diagnostics"><summary>Diagnostics</summary>${renderComplianceTable(model)}</details>`,
        `<details class="panel lower-section" id="methodology-and-limitations"><summary>Methodology And Limitations</summary>${renderMethodologyList(model)}</details>`,
        `<details class="panel lower-section" id="inventory"><summary>Inventory</summary>${renderInventoryList(model)}</details>`,
        `<details class="panel lower-section report-metadata"><summary>Report metadata</summary>${renderMetadata(model)}</details>`,
      ];

  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    `<title>${escapeHtml(model.title)}</title>`,
    '<link rel="icon" href="./favicon.svg" type="image/svg+xml" />',
    '<link rel="icon" href="./favicon.ico" sizes="any" type="image/x-icon" />',
    `<style>${styles}</style>`,
    "</head>",
    `<body${model.isEmptyCorpus ? ' class="empty-report"' : ""}>`,
    "<main>",
    "<header>",
    `<h1>${escapeHtml(model.title)}</h1>`,
    `<p class="lede">${escapeHtml(model.lede)}</p>`,
    `<p class="context-line">${escapeHtml(model.corpusContext)}</p>`,
    `<div class="scope-banner${model.scope.isWindowed ? " scope-banner-windowed" : ""}">
      <p class="scope-banner-title">${escapeHtml(model.scope.headline)}</p>
      <p>${escapeHtml(model.scope.detail)}</p>
      <p>${escapeHtml(model.scope.comparability)}</p>
    </div>`,
    renderAppliedFilters(model),
    renderHeaderNotes(model),
    model.isEmptyCorpus ? "" : renderSectionNavigation(),
    "</header>",
    ...contentSections,
    `<p class="footer-note">${escapeHtml(
      "Session previews in summary and session-facts artifacts are redacted and truncated for compact reporting. Public-safe output reduces common sensitive data exposure but is not a guarantee of full anonymization.",
    )}</p>`,
    "</main>",
    "</body>",
    "</html>",
  ].join("");
}
