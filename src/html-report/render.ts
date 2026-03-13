/**
 * Purpose: Main render orchestrator for source-neutral HTML reports.
 * Responsibilities: Assemble the complete static HTML report document for supported transcript sources.
 * Scope: Used by the presentation layer after deterministic metrics and summary generation.
 * Usage: `renderHtmlReport(summary, metrics, charts)`.
 * Invariants/Assumptions: The HTML report remains static, portable, and dependency-free.
 */

import { getConfig } from "../config/index.js";
import { describeCorpusScope } from "../report-scope.js";
import type { MetricsRecord, SummaryArtifact } from "../schema.js";
import {
  renderEndedVerifiedDeliverySpotlightCards,
  renderHighlightCards,
  renderIncidentCards,
  renderInventoryList,
  renderMomentumCards,
  renderOpportunityList,
  renderRecognitions,
  renderScoreCards,
  renderSessionCards,
  renderSummaryCards,
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
    "A synthetic benchmark harness validates key proxy behavior, but benchmark coverage remains limited and should not be treated as comprehensive external validation.",
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

function renderChartPanel(
  title: string,
  content: string,
  emptyMessage?: string,
  extraClass = "",
): string {
  const classes = ["panel", "chart-panel", extraClass];

  if (emptyMessage) {
    classes.push("chart-panel-empty");
    return `<div class="${classes.filter(Boolean).join(" ")}">
      <div class="chart-empty-state">
        <h3>${escapeHtml(title)}</h3>
        <p class="empty-state">${escapeHtml(emptyMessage)}</p>
      </div>
    </div>`;
  }

  return `<div class="${classes.filter(Boolean).join(" ")}">${content}</div>`;
}

/**
 * Generates a complete HTML report from summary artifacts.
 */
export function renderHtmlReport(
  summary: SummaryArtifact,
  metrics: MetricsRecord,
  charts: HtmlReportCharts,
): string {
  const styles = renderStyles();
  const scope = describeCorpusScope(metrics);
  const providers = [
    ...new Set(metrics.inventory.map((record) => record.provider)),
  ];
  const skin = getConfig().reporting.skin;
  const title =
    skin === "showcase"
      ? "Transcript Analytics Engine Report"
      : "Transcript Analytics Report";
  const scoreHeading =
    skin === "showcase" ? "Shareable Scoreboard" : "Heuristic Scorecards";
  const isEmptyCorpus = summary.sessions === 0;
  const bodyClassName = isEmptyCorpus ? ' class="empty-report"' : "";
  const contentSections = isEmptyCorpus
    ? [
        renderNoDataPanel(summary),
        `<section><div class="metric-grid">${renderSummaryCards(summary)}</div></section>`,
        `<section><h2>Inventory</h2><ul class="inventory-list">${renderInventoryList(metrics)}</ul></section>`,
        `<section><h2>Methodology And Limitations</h2><div class="panel">${renderMethodologyList(metrics)}</div></section>`,
      ]
    : [
        renderNoDataPanel(summary),
        `<section><div class="metric-grid">${renderSummaryCards(summary)}</div></section>`,
        `<section><h2>${escapeHtml(scoreHeading)}</h2><div class="metric-grid">${renderScoreCards(summary)}</div></section>`,
        `<section><h2>Recent Momentum</h2><div class="metric-grid">${renderMomentumCards(summary)}</div></section>`,
        ...(skin === "showcase"
          ? [
              `<section><h2>Showcase Highlights</h2><div class="metric-grid">${renderHighlightCards(summary)}</div></section>`,
              `<section><h2>Recognitions</h2><div class="badge-row">${renderRecognitions(summary)}</div></section>`,
            ]
          : []),
        `<section><h2>Operational Rates</h2><div class="rates-grid">
      <div class="rate-item"><strong>Incidents / 100 turns</strong><div class="rate-value">${summary.rates.incidentsPer100Turns}</div></div>
      <div class="rate-item"><strong>Writes / 100 turns</strong><div class="rate-value">${summary.rates.writesPer100Turns}</div></div>
      <div class="rate-item"><strong>Verification requests / 100 turns</strong><div class="rate-value">${summary.rates.verificationRequestsPer100Turns}</div></div>
      <div class="rate-item"><strong>Interruptions / 100 turns</strong><div class="rate-value">${summary.rates.interruptionsPer100Turns}</div></div>
      <div class="rate-item"><strong>Reinjections / 100 turns</strong><div class="rate-value">${summary.rates.reinjectionsPer100Turns}</div></div>
      <div class="rate-item"><strong>Praise / 100 turns</strong><div class="rate-value">${summary.rates.praisePer100Turns}</div></div>
    </div></section>`,
        `<section><h2>Comparative Slices</h2><div class="panel">${renderComparativeSliceTable(summary)}</div></section>`,
        `<section><h2>Charts</h2><div class="charts-grid">
      ${renderChartPanel(
        "Label Counts",
        charts.labelChartSvg,
        summary.labels.length === 0
          ? "No labels were detected in this slice."
          : undefined,
        "wide",
      )}
      ${renderChartPanel(
        "Incident Severity",
        charts.severityChartSvg,
        summary.severities.some((entry) => entry.count > 0)
          ? undefined
          : "No incidents were recorded in this slice.",
      )}
      ${renderChartPanel(
        "Compliance Pass Counts",
        charts.complianceChartSvg,
        summary.compliance.some((entry) => entry.passCount > 0)
          ? undefined
          : "No passing compliance checks were recorded in this slice.",
      )}
    </div></section>`,
        `<section><h2>Sessions To Review First</h2><div class="sessions-grid">${renderSessionCards(summary)}</div></section>`,
        ...(skin === "showcase"
          ? [
              `<section><h2>Ended-Verified Delivery Spotlights</h2><div class="sessions-grid">${renderEndedVerifiedDeliverySpotlightCards(summary)}</div></section>`,
            ]
          : []),
        `<section><h2>Top Incidents</h2><div class="incident-grid">${renderIncidentCards(summary)}</div></section>`,
        `<section><h2>Deterministic Opportunities</h2><ul class="opportunity-list">${renderOpportunityList(summary)}</ul></section>`,
        `<section><h2>Compliance Breakdown</h2><div class="panel">${renderComplianceTable(summary)}</div></section>`,
        `<section><h2>Methodology And Limitations</h2><div class="panel">${renderMethodologyList(metrics)}</div></section>`,
        `<section><h2>Inventory</h2><ul class="inventory-list">${renderInventoryList(metrics)}</ul></section>`,
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
      skin === "showcase"
        ? "A deterministic, transcript-first summary of developer-agent sessions for sharing and review."
        : "A deterministic, transcript-first analytics summary for developer-agent session artifacts. These outputs emphasize operator burden, verification habits, and transcript-visible workflow signals rather than correctness claims.",
    )}</p>`,
    `<div class="meta-row">
      <span class="pill">engine ${escapeHtml(summary.engineVersion)}</span>
      <span class="pill">schema ${escapeHtml(summary.schemaVersion)}</span>
      <span class="pill">sources ${escapeHtml(providers.join(", "))}</span>
      <span class="pill">${escapeHtml(scope.pill)}</span>
      <span class="pill">${escapeHtml(summary.generatedAt)}</span>
      <span class="pill">parse warnings ${metrics.parseWarningCount}</span>
    </div>`,
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
