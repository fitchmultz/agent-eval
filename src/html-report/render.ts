/**
 * Purpose: Main render orchestrator for HTML reports.
 * Entrypoint: `renderHtmlReport()` generates the complete HTML document.
 * Notes: Orchestrates all card and table renderers to build the final report.
 */

import type { MetricsRecord, SummaryArtifact } from "../schema.js";
import {
  renderBadges,
  renderBragCards,
  renderIncidentCards,
  renderInventoryList,
  renderMomentumCards,
  renderOpportunityList,
  renderScoreCards,
  renderSessionCards,
  renderSummaryCards,
  renderVictoryLapCards,
} from "./cards.js";
import {
  renderComparativeSliceTable,
  renderComplianceTable,
} from "./tables.js";
import { escapeHtml, renderStyles } from "./templates.js";

/**
 * Generates a complete HTML report from summary artifacts.
 *
 * Creates a self-contained HTML document with inline CSS styling,
 * including all sections: summary cards, charts, incidents, sessions,
 * opportunities, compliance breakdown, and inventory.
 *
 * @param summary - The summary artifact with metrics and insights
 * @param metrics - The aggregated metrics record
 * @returns Complete HTML document as a string
 */
export function renderHtmlReport(
  summary: SummaryArtifact,
  metrics: MetricsRecord,
): string {
  const styles = renderStyles();

  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    `<title>Codex Evaluator Report</title>`,
    `<style>${styles}</style>`,
    "</head>",
    "<body>",
    "<main>",
    "<header>",
    "<h1>Codex Evaluator Report</h1>",
    `<p class="lede">A deterministic, transcript-first evaluation summary for Codex session artifacts. The canonical JSONL and JSON outputs remain the source of truth, while this layer turns them into operator-facing insights: where friction clustered, what got verified, and which sessions deserve attention first.</p>`,
    `<div class="meta-row">
      <span class="pill">evaluator ${escapeHtml(summary.evaluatorVersion)}</span>
      <span class="pill">schema ${escapeHtml(summary.schemaVersion)}</span>
      <span class="pill">${escapeHtml(summary.generatedAt)}</span>
    </div>`,
    "</header>",
    `<section><div class="metric-grid">${renderSummaryCards(summary)}</div></section>`,
    `<section><h2>Show-Off Stats</h2><div class="metric-grid">${renderBragCards(summary)}</div></section>`,
    `<section><h2>Shareable Scoreboard</h2><div class="metric-grid">${renderScoreCards(summary)}</div></section>`,
    `<section><h2>Recent Momentum</h2><div class="metric-grid">${renderMomentumCards(summary)}</div></section>`,
    `<section><h2>Badges</h2><div class="badge-row">${renderBadges(summary)}</div></section>`,
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
      <div class="panel wide"><img alt="Label counts chart" src="label-counts.svg" /></div>
      <div class="panel"><img alt="Incident severity chart" src="severity-breakdown.svg" /></div>
      <div class="panel"><img alt="Compliance rule chart" src="compliance-summary.svg" /></div>
    </div></section>`,
    `<section><h2>Sessions To Review First</h2><div class="sessions-grid">${renderSessionCards(summary)}</div></section>`,
    `<section><h2>Victory Lap Sessions</h2><div class="sessions-grid">${renderVictoryLapCards(summary)}</div></section>`,
    `<section><h2>Top Incidents</h2><div class="incident-grid">${renderIncidentCards(summary)}</div></section>`,
    `<section><h2>Deterministic Opportunities</h2><ul class="opportunity-list">${renderOpportunityList(summary)}</ul></section>`,
    `<section><h2>Compliance Breakdown</h2><div class="panel">${renderComplianceTable(summary)}</div></section>`,
    `<section><h2>Inventory</h2><ul class="inventory-list">${renderInventoryList(metrics)}</ul></section>`,
    `<p class="footer-note">Incident evidence is redacted and truncated for compact, public-safe reporting. Derived outputs can be regenerated at any time from the canonical transcript-first artifacts.</p>`,
    "</main>",
    "</body>",
    "</html>",
  ].join("");
}
