/**
 * Purpose: Generates HTML report from summary artifacts.
 * Entrypoint: `renderHtmlReport()` generates the complete HTML document.
 * Notes: HTML is self-contained with inline CSS for portability.
 */

import type { MetricsRecord, SummaryArtifact } from "./schema.js";
import { buildSummarySections } from "./summary-sections.js";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderSummaryCards(summary: SummaryArtifact): string {
  const sections = buildSummarySections(summary);
  const cards = [
    {
      label: "Sessions",
      value: `${summary.sessions}`,
      detail: "Parsed transcript sessions",
      tone: "neutral",
    },
    {
      label: "Incidents / 100 Turns",
      value: `${summary.rates.incidentsPer100Turns}`,
      detail: "Aggregate friction density",
      tone: "neutral",
    },
    {
      label: "Verified Write Rate",
      value: `${summary.delivery.writeVerificationRate}%`,
      detail: `${summary.delivery.verifiedWriteSessions}/${summary.delivery.sessionsWithWrites} write sessions`,
      tone: summary.delivery.writeVerificationRate >= 100 ? "good" : "warn",
    },
    ...sections.headlineInsights.map((card) => ({
      label: card.title,
      value: card.value,
      detail: card.detail,
      tone: card.tone,
    })),
  ];

  return cards
    .map(
      (card) => `
      <article class="metric-card tone-${escapeHtml(card.tone ?? "neutral")}">
        <div class="metric-label">${escapeHtml(card.label)}</div>
        <div class="metric-value">${escapeHtml(card.value)}</div>
        <div class="metric-detail">${escapeHtml(card.detail)}</div>
      </article>`,
    )
    .join("");
}

function renderBragCards(summary: SummaryArtifact): string {
  return summary.bragCards
    .map(
      (card) => `
      <article class="metric-card tone-${escapeHtml(card.tone)} brag-card">
        <div class="metric-label">${escapeHtml(card.title)}</div>
        <div class="metric-value">${escapeHtml(card.value)}</div>
        <div class="metric-detail">${escapeHtml(card.detail)}</div>
      </article>`,
    )
    .join("");
}

function renderScoreCards(summary: SummaryArtifact): string {
  return summary.scoreCards
    .map(
      (card) => `
      <article class="metric-card tone-${escapeHtml(card.tone)} score-card">
        <div class="metric-label">${escapeHtml(card.title)}</div>
        <div class="metric-value">${card.score}<span class="metric-suffix">/100</span></div>
        <div class="metric-detail">${escapeHtml(card.detail)}</div>
      </article>`,
    )
    .join("");
}

function renderMomentumCards(summary: SummaryArtifact): string {
  const sections = buildSummarySections(summary);
  if (sections.recentMomentum.length === 0) {
    return `<p class="empty-state">Not enough sessions in this slice for recent-vs-corpus momentum comparisons yet.</p>`;
  }

  return sections.recentMomentum
    .map(
      (card) => `
      <article class="metric-card tone-${escapeHtml(card.tone)} score-card">
        <div class="metric-label">${escapeHtml(card.title)}</div>
        <div class="metric-value">${escapeHtml(card.value)}</div>
        <div class="metric-detail">${escapeHtml(card.detail)}</div>
      </article>`,
    )
    .join("");
}

function renderBadges(summary: SummaryArtifact): string {
  if (summary.achievementBadges.length === 0) {
    return `<p class="empty-state">No badges earned for this slice yet.</p>`;
  }

  return summary.achievementBadges
    .map((badge) => `<span class="badge">${escapeHtml(badge)}</span>`)
    .join("");
}

function renderIncidentCards(summary: SummaryArtifact): string {
  if (summary.topIncidents.length === 0) {
    return `<p class="empty-state">No labeled incidents were detected.</p>`;
  }

  return summary.topIncidents
    .map(
      (incident) => `
      <article class="incident-card severity-${incident.severity}">
        <div class="incident-meta">
          <span class="pill severity">${escapeHtml(incident.severity)}</span>
          <span class="pill confidence">${escapeHtml(incident.confidence)}</span>
          <span class="pill">span ${incident.turnSpan}</span>
          <span class="session-ref">${escapeHtml(incident.sessionId)}</span>
        </div>
        <h3>${escapeHtml(incident.summary)}</h3>
        <p>${escapeHtml(incident.evidencePreview ?? "No preview available.")}</p>
      </article>`,
    )
    .join("");
}

function renderSessionCards(summary: SummaryArtifact): string {
  if (summary.topSessions.length === 0) {
    return `<p class="empty-state">No session insights were available.</p>`;
  }

  return summary.topSessions
    .map(
      (session) => `
      <article class="session-card">
        <div class="incident-meta">
          <span class="pill">${escapeHtml(session.archetype)}</span>
          <span class="pill">${escapeHtml(session.archetypeLabel)}</span>
          <span class="pill">friction ${session.frictionScore}</span>
          <span class="pill">score ${session.complianceScore}</span>
        </div>
        <h3>${escapeHtml(session.sessionId)}</h3>
        <p>${escapeHtml(session.note)}</p>
        <p class="session-detail">Dominant labels: ${escapeHtml(session.dominantLabels.join(", ") || "none")}</p>
      </article>`,
    )
    .join("");
}

function renderVictoryLapCards(summary: SummaryArtifact): string {
  if (summary.victoryLaps.length === 0) {
    return `<p class="empty-state">No clean verified delivery sessions were available in this slice.</p>`;
  }

  return summary.victoryLaps
    .map(
      (session) => `
      <article class="session-card victory-lap">
        <div class="incident-meta">
          <span class="pill">${escapeHtml(session.archetypeLabel)}</span>
          <span class="pill">score ${session.complianceScore}</span>
          <span class="pill">${session.verificationPassedCount} verifications</span>
          <span class="pill">${session.incidentCount} incidents</span>
        </div>
        <h3>${escapeHtml(session.sessionId)}</h3>
        <p>${escapeHtml(session.note)}</p>
      </article>`,
    )
    .join("");
}

function renderComplianceTable(summary: SummaryArtifact): string {
  return [
    `<table class="compliance-table">`,
    `<thead><tr><th>Rule</th><th>Pass</th><th>Fail</th><th>N/A</th><th>Unknown</th></tr></thead>`,
    "<tbody>",
    ...summary.compliance.map(
      (rule) =>
        `<tr><td>${escapeHtml(rule.rule)}</td><td>${rule.passCount}</td><td>${rule.failCount}</td><td>${rule.notApplicableCount}</td><td>${rule.unknownCount}</td></tr>`,
    ),
    "</tbody>",
    "</table>",
  ].join("");
}

function renderComparativeSliceTable(summary: SummaryArtifact): string {
  return [
    `<table class="compliance-table">`,
    `<thead><tr><th>Slice</th><th>Sessions</th><th>Proof</th><th>Flow</th><th>Discipline</th><th>Write Verification</th><th>Incidents / 100 Turns</th></tr></thead>`,
    "<tbody>",
    ...summary.comparativeSlices.map(
      (slice) =>
        `<tr><td>${escapeHtml(slice.label)}</td><td>${slice.sessionCount}</td><td>${slice.proofScore}</td><td>${slice.flowScore}</td><td>${slice.disciplineScore}</td><td>${slice.writeVerificationRate}%</td><td>${slice.incidentsPer100Turns}</td></tr>`,
    ),
    "</tbody>",
    "</table>",
  ].join("");
}

function renderOpportunityList(summary: SummaryArtifact): string {
  if (summary.opportunities.length === 0) {
    return `<p class="empty-state">No deterministic improvement opportunities were identified.</p>`;
  }

  return summary.opportunities
    .map(
      (opportunity) => `
      <li>
        <strong>${escapeHtml(opportunity.title)}</strong>
        <span>${escapeHtml(opportunity.rationale)}</span>
      </li>`,
    )
    .join("");
}

function renderInventoryList(metrics: MetricsRecord): string {
  return metrics.inventory
    .map(
      (record) => `
      <li>
        <span class="pill ${record.required ? "required" : "optional"}">${record.required ? "required" : "optional"}</span>
        <strong>${escapeHtml(record.kind)}</strong>
        <span>${record.discovered ? "present" : "missing"}</span>
        <code>${escapeHtml(record.path)}</code>
      </li>`,
    )
    .join("");
}

/**
 * Generates the CSS styles for the HTML report.
 *
 * @returns CSS string
 */
function renderStyles(): string {
  return `
    :root {
      --bg: #f7f3ea;
      --panel: #fffdf8;
      --ink: #10263b;
      --muted: #5b6f82;
      --line: #d8e0e8;
      --accent: #0f766e;
      --warn: #f4a259;
      --danger: #d64545;
      --good: #2e9e6f;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", serif;
      background:
        radial-gradient(circle at top left, rgba(15,118,110,0.12), transparent 26%),
        linear-gradient(180deg, #faf6ee 0%, var(--bg) 100%);
      color: var(--ink);
    }
    main { max-width: 1220px; margin: 0 auto; padding: 48px 24px 72px; }
    header { margin-bottom: 32px; }
    h1, h2, h3 { margin: 0; }
    h1 { font-size: 3rem; line-height: 1; letter-spacing: -0.04em; margin-bottom: 12px; }
    h2 { font-size: 1.5rem; margin-bottom: 16px; }
    p, li, td, th, span { line-height: 1.5; }
    .lede { max-width: 760px; color: var(--muted); font-size: 1.05rem; }
    .meta-row { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 18px; }
    .pill {
      display: inline-flex;
      align-items: center;
      border-radius: 999px;
      padding: 4px 10px;
      font-size: 0.82rem;
      border: 1px solid var(--line);
      background: rgba(255,255,255,0.75);
    }
    .required { background: rgba(15,118,110,0.12); }
    .optional { background: rgba(91,111,130,0.08); }
    section { margin-top: 32px; }
    .metric-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
      gap: 16px;
    }
    .metric-card, .panel, .incident-card, .session-card {
      background: var(--panel);
      border: 1px solid rgba(16,38,59,0.08);
      border-radius: 20px;
      box-shadow: 0 16px 40px rgba(16,38,59,0.08);
    }
    .metric-card { padding: 20px; min-height: 144px; border-top: 6px solid rgba(16,38,59,0.06); }
    .brag-card .metric-value { font-size: 1.95rem; }
    .score-card .metric-value { display: flex; align-items: baseline; gap: 6px; }
    .metric-suffix { font-size: 1rem; color: var(--muted); }
    .tone-good { border-top-color: var(--good); }
    .tone-warn { border-top-color: var(--warn); }
    .tone-danger { border-top-color: var(--danger); }
    .metric-label { color: var(--muted); font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.08em; }
    .metric-value { font-size: 2.4rem; margin-top: 14px; }
    .metric-detail { color: var(--muted); margin-top: 8px; }
    .panel { padding: 18px; overflow-x: auto; }
    .charts-grid, .sessions-grid, .incident-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 18px;
    }
    .incident-card, .session-card { padding: 18px; }
    .incident-card { border-top: 6px solid var(--accent); }
    .incident-card.severity-high { border-top-color: var(--danger); }
    .incident-card.severity-medium { border-top-color: var(--warn); }
    .incident-card.severity-low, .incident-card.severity-info { border-top-color: var(--accent); }
    .incident-meta { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; color: var(--muted); }
    .session-ref { font-size: 0.82rem; }
    .incident-card h3, .session-card h3 { font-size: 1.1rem; margin-bottom: 10px; }
    .incident-card p, .session-card p { margin: 0; color: var(--muted); }
    .session-detail { margin-top: 8px !important; font-size: 0.92rem; }
    .compliance-table { width: 100%; border-collapse: collapse; }
    .compliance-table th, .compliance-table td { padding: 10px 12px; text-align: left; border-bottom: 1px solid var(--line); }
    .inventory-list, .opportunity-list { list-style: none; padding: 0; margin: 0; display: grid; gap: 12px; }
    .inventory-list li, .opportunity-list li { display: grid; gap: 6px; padding: 14px 16px; border: 1px solid var(--line); border-radius: 14px; background: rgba(255,255,255,0.7); }
    .rates-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
    .rate-item { padding: 14px 16px; border: 1px solid var(--line); border-radius: 14px; background: rgba(255,255,255,0.7); }
    .rate-value { font-size: 1.6rem; margin-top: 6px; }
    .badge-row { display: flex; flex-wrap: wrap; gap: 10px; }
    .badge {
      display: inline-flex;
      align-items: center;
      border-radius: 999px;
      padding: 8px 14px;
      background: linear-gradient(135deg, rgba(15,118,110,0.14), rgba(244,162,89,0.18));
      border: 1px solid rgba(16,38,59,0.1);
      font-size: 0.92rem;
      box-shadow: 0 10px 24px rgba(16,38,59,0.08);
    }
    code {
      font-family: "SFMono-Regular", "SF Mono", "Menlo", monospace;
      font-size: 0.86rem;
      word-break: break-all;
    }
    .footer-note { color: var(--muted); font-size: 0.92rem; margin-top: 14px; }
    .empty-state { color: var(--muted); }
    @media (min-width: 980px) {
      .charts-grid { grid-template-columns: 1fr 1fr; }
      .charts-grid .wide { grid-column: 1 / -1; }
      .sessions-grid, .incident-grid { grid-template-columns: repeat(2, 1fr); }
    }
  `;
}

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
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    `<title>Codex Evaluator Report</title>`,
    `<style>${renderStyles()}</style>`,
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
