/**
 * Purpose: Generates derived presentation artifacts like summary JSON, SVG charts, and a polished HTML report.
 * Entrypoint: `createPresentationArtifacts()` is used by the evaluator when writing output files.
 * Notes: These outputs are derived from canonical evaluator artifacts and are safe to regenerate at any time.
 */
import type {
  IncidentRecord,
  LabelName,
  MetricsRecord,
  Severity,
  SummaryArtifact,
} from "./schema.js";
import { labelTaxonomy, severityValues } from "./schema.js";

export interface PresentationArtifacts {
  summary: SummaryArtifact;
  reportHtml: string;
  labelChartSvg: string;
  complianceChartSvg: string;
  severityChartSvg: string;
}

interface BarDatum {
  label: string;
  value: number;
  tone: string;
}

const severityTones: Record<Severity, string> = {
  info: "#5B8DEF",
  low: "#2E9E6F",
  medium: "#F4A259",
  high: "#D64545",
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getLabelCount(metrics: MetricsRecord, label: LabelName): number {
  return metrics.labelCounts[label] ?? 0;
}

function rankIncidents(incidents: readonly IncidentRecord[]): IncidentRecord[] {
  return [...incidents].sort(
    (left, right) =>
      right.turnIndices.length - left.turnIndices.length ||
      left.summary.localeCompare(right.summary),
  );
}

function buildSummary(
  metrics: MetricsRecord,
  incidents: readonly IncidentRecord[],
): SummaryArtifact {
  const labels = labelTaxonomy
    .map((label) => ({
      label,
      count: getLabelCount(metrics, label),
    }))
    .filter((entry) => entry.count > 0)
    .sort(
      (left, right) =>
        right.count - left.count || left.label.localeCompare(right.label),
    );
  const severityCounts = severityValues.map((severity) => ({
    severity,
    count: incidents.filter((incident) => incident.severity === severity)
      .length,
  }));

  return {
    evaluatorVersion: metrics.evaluatorVersion,
    schemaVersion: metrics.schemaVersion,
    generatedAt: metrics.generatedAt,
    sessions: metrics.sessionCount,
    turns: metrics.turnCount,
    incidents: metrics.incidentCount,
    labels,
    severities: severityCounts,
    compliance: metrics.complianceSummary,
    topIncidents: rankIncidents(incidents)
      .slice(0, 8)
      .map((incident) => ({
        incidentId: incident.incidentId,
        sessionId: incident.sessionId,
        summary: incident.summary,
        severity: incident.severity,
        confidence: incident.confidence,
        evidencePreview: incident.evidencePreviews[0],
      })),
  };
}

function renderBarChart(
  title: string,
  data: readonly BarDatum[],
  valueSuffix = "",
): string {
  const width = 920;
  const rowHeight = 34;
  const topPadding = 56;
  const leftPadding = 220;
  const rightPadding = 72;
  const chartWidth = width - leftPadding - rightPadding;
  const height = topPadding + data.length * rowHeight + 24;
  const maxValue = Math.max(1, ...data.map((entry) => entry.value));

  const rows = data
    .map((entry, index) => {
      const y = topPadding + index * rowHeight;
      const barWidth = Math.round((entry.value / maxValue) * chartWidth);
      return [
        `<text x="12" y="${y + 20}" font-size="14" fill="#17324D">${escapeHtml(entry.label)}</text>`,
        `<rect x="${leftPadding}" y="${y + 6}" width="${barWidth}" height="18" rx="6" fill="${entry.tone}" />`,
        `<text x="${leftPadding + barWidth + 10}" y="${y + 20}" font-size="13" fill="#17324D">${entry.value}${escapeHtml(valueSuffix)}</text>`,
      ].join("");
    })
    .join("");

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(title)}">`,
    `<rect width="${width}" height="${height}" fill="#FFFDF8" />`,
    `<text x="12" y="30" font-size="22" font-weight="700" fill="#10263B">${escapeHtml(title)}</text>`,
    `<line x1="${leftPadding}" y1="44" x2="${leftPadding}" y2="${height - 12}" stroke="#D8E0E8" stroke-width="1" />`,
    rows,
    "</svg>",
  ].join("");
}

function renderSummaryCards(summary: SummaryArtifact): string {
  const cards = [
    { label: "Sessions", value: summary.sessions },
    { label: "Turns", value: summary.turns },
    { label: "Incidents", value: summary.incidents },
    {
      label: "Top Label Count",
      value: summary.labels[0]?.count ?? 0,
      detail: summary.labels[0]?.label ?? "none",
    },
  ];

  return cards
    .map(
      (card) => `
      <article class="metric-card">
        <div class="metric-label">${escapeHtml(card.label)}</div>
        <div class="metric-value">${card.value}</div>
        <div class="metric-detail">${escapeHtml(card.detail ?? "")}</div>
      </article>`,
    )
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
          <span class="session-ref">${escapeHtml(incident.sessionId)}</span>
        </div>
        <h3>${escapeHtml(incident.summary)}</h3>
        <p>${escapeHtml(incident.evidencePreview ?? "No preview available.")}</p>
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

function renderHtmlReport(
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
    `<style>
      :root {
        --bg: #f7f3ea;
        --panel: #fffdf8;
        --ink: #10263b;
        --muted: #5b6f82;
        --line: #d8e0e8;
        --accent: #0f766e;
        --warn: #f4a259;
        --danger: #d64545;
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
      main { max-width: 1180px; margin: 0 auto; padding: 48px 24px 72px; }
      header { margin-bottom: 32px; }
      h1, h2, h3 { margin: 0; }
      h1 { font-size: 3rem; line-height: 1; letter-spacing: -0.04em; margin-bottom: 12px; }
      h2 { font-size: 1.5rem; margin-bottom: 16px; }
      p, li, td, th { line-height: 1.5; }
      .lede { max-width: 720px; color: var(--muted); font-size: 1.05rem; }
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
      .metric-card, .panel, .incident-card {
        background: var(--panel);
        border: 1px solid rgba(16,38,59,0.08);
        border-radius: 20px;
        box-shadow: 0 16px 40px rgba(16,38,59,0.08);
      }
      .metric-card { padding: 20px; min-height: 144px; }
      .metric-label { color: var(--muted); font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.08em; }
      .metric-value { font-size: 2.6rem; margin-top: 14px; }
      .metric-detail { color: var(--muted); margin-top: 8px; }
      .panel { padding: 18px; overflow-x: auto; }
      .charts-grid {
        display: grid;
        grid-template-columns: 1fr;
        gap: 18px;
      }
      .incident-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        gap: 16px;
      }
      .incident-card { padding: 18px; border-top: 6px solid var(--accent); }
      .incident-card.severity-high { border-top-color: var(--danger); }
      .incident-card.severity-medium { border-top-color: var(--warn); }
      .incident-card.severity-low, .incident-card.severity-info { border-top-color: var(--accent); }
      .incident-meta { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; color: var(--muted); }
      .session-ref { font-size: 0.82rem; }
      .incident-card h3 { font-size: 1.1rem; margin-bottom: 10px; }
      .incident-card p { margin: 0; color: var(--muted); }
      .compliance-table { width: 100%; border-collapse: collapse; }
      .compliance-table th, .compliance-table td { padding: 10px 12px; text-align: left; border-bottom: 1px solid var(--line); }
      .inventory-list { list-style: none; padding: 0; margin: 0; display: grid; gap: 12px; }
      .inventory-list li { display: grid; gap: 6px; padding: 14px 16px; border: 1px solid var(--line); border-radius: 14px; background: rgba(255,255,255,0.7); }
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
      }
    </style>`,
    "</head>",
    "<body>",
    "<main>",
    "<header>",
    "<h1>Codex Evaluator Report</h1>",
    `<p class="lede">A deterministic, transcript-first evaluation summary for Codex session artifacts. Canonical JSONL and JSON outputs remain the source of truth; this HTML layer exists to make results easier to review, share, and embed in public writeups.</p>`,
    `<div class="meta-row">
      <span class="pill">evaluator ${escapeHtml(summary.evaluatorVersion)}</span>
      <span class="pill">schema ${escapeHtml(summary.schemaVersion)}</span>
      <span class="pill">${escapeHtml(summary.generatedAt)}</span>
    </div>`,
    "</header>",
    `<section><div class="metric-grid">${renderSummaryCards(summary)}</div></section>`,
    `<section><h2>Charts</h2><div class="charts-grid">
      <div class="panel wide"><img alt="Label counts chart" src="label-counts.svg" /></div>
      <div class="panel"><img alt="Incident severity chart" src="severity-breakdown.svg" /></div>
      <div class="panel"><img alt="Compliance rule chart" src="compliance-summary.svg" /></div>
    </div></section>`,
    `<section><h2>Top Incidents</h2><div class="incident-grid">${renderIncidentCards(summary)}</div></section>`,
    `<section><h2>Compliance Breakdown</h2><div class="panel">${renderComplianceTable(summary)}</div></section>`,
    `<section><h2>Inventory</h2><ul class="inventory-list">${renderInventoryList(metrics)}</ul></section>`,
    `<p class="footer-note">Incident evidence is redacted and truncated for compact, public-safe reporting. Generated artifacts are derived outputs and can be regenerated from the canonical transcript-first pipeline.</p>`,
    "</main>",
    "</body>",
    "</html>",
  ].join("");
}

export function createPresentationArtifacts(
  metrics: MetricsRecord,
  incidents: readonly IncidentRecord[],
): PresentationArtifacts {
  const summary = buildSummary(metrics, incidents);
  const labelChartSvg = renderBarChart(
    "Label Counts",
    summary.labels.map((entry, index) => ({
      label: entry.label,
      value: entry.count,
      tone:
        ["#0F766E", "#1D8A7A", "#329F8A", "#49B39A"][index % 4] ?? "#0F766E",
    })),
  );
  const severityChartSvg = renderBarChart(
    "Incident Severity",
    summary.severities.map((entry) => ({
      label: entry.severity,
      value: entry.count,
      tone: severityTones[entry.severity],
    })),
  );
  const complianceChartSvg = renderBarChart(
    "Compliance Pass Counts",
    summary.compliance.map((entry) => ({
      label: entry.rule,
      value: entry.passCount,
      tone: "#335C81",
    })),
  );

  return {
    summary,
    reportHtml: renderHtmlReport(summary, metrics),
    labelChartSvg,
    complianceChartSvg,
    severityChartSvg,
  };
}
