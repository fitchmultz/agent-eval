/**
 * Purpose: Converts evaluator metrics and summary data into a concise markdown report for operators or showcase audiences.
 * Responsibilities: Build deterministic report sections from metrics and summary artifacts without recomputing evaluator logic.
 * Scope: Used by the `report` and `eval` commands for all supported sources.
 * Usage: Call `renderSummaryReport()` with a summary artifact, or `renderReport()` as a convenience wrapper.
 * Invariants/Assumptions: Incident evidence stays redacted and truncated, and score labels are presented as heuristic proxies rather than correctness claims.
 */

import { getConfig } from "./config/index.js";
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
import { buildSummarySections } from "./summary-sections.js";

function renderLines<T>(
  items: readonly T[],
  emptyMessage: string,
  renderItem: (item: T) => string,
): string[] {
  return items.length > 0 ? items.map(renderItem) : [emptyMessage];
}

function renderLabelLines(summary: SummaryArtifact): string[] {
  return renderLines(
    summary.labels,
    "- No labels were detected.",
    (entry) => `- ${entry.label}: ${entry.count}`,
  );
}

function renderRateLines(summary: SummaryArtifact): string[] {
  return [
    `- Incidents / 100 turns: ${summary.rates.incidentsPer100Turns}`,
    `- Writes / 100 turns: ${summary.rates.writesPer100Turns}`,
    `- Verification requests / 100 turns: ${summary.rates.verificationRequestsPer100Turns}`,
    `- Interruptions / 100 turns: ${summary.rates.interruptionsPer100Turns}`,
    `- Reinjections / 100 turns: ${summary.rates.reinjectionsPer100Turns}`,
    `- Praise / 100 turns: ${summary.rates.praisePer100Turns}`,
  ];
}

function renderComplianceLines(metrics: MetricsRecord): string[] {
  return metrics.complianceSummary.map(
    (rule) =>
      `- ${rule.rule}: pass ${rule.passCount}, fail ${rule.failCount}, n/a ${rule.notApplicableCount}, unknown ${rule.unknownCount}`,
  );
}

function renderSessionLines(summary: SummaryArtifact): string[] {
  return renderLines(
    summary.topSessions,
    "- No session insights were available.",
    (session) =>
      `- ${session.sessionId}: ${session.archetypeLabel}, friction ${session.frictionScore}, proxy score ${session.complianceScore}, dominant labels ${session.dominantLabels.join(", ") || "none"}`,
  );
}

function hasApplicableDiscipline(summary: SummaryArtifact): boolean {
  return summary.compliance.some(
    (rule) =>
      rule.rule !== "no_unverified_ending" &&
      rule.passCount + rule.failCount > 0,
  );
}

function renderScoreCardLine(
  summary: SummaryArtifact,
  card: SummaryArtifact["scoreCards"][number],
): string {
  if (
    card.title === "Verification Proxy Score" &&
    summary.delivery.sessionsWithWrites === 0
  ) {
    return `- ${card.title}: N/A (No write sessions were observed in this slice.)`;
  }

  if (
    card.title === "Workflow Proxy Score" &&
    !hasApplicableDiscipline(summary)
  ) {
    return `- ${card.title}: N/A (No write-related compliance rules were exercised in this slice.)`;
  }

  return `- ${card.title}: ${card.score}/100 (${card.detail})`;
}

function formatComparativeSliceValue(
  summary: SummaryArtifact,
  slice: SummaryArtifact["comparativeSlices"][number],
  field:
    | "verificationProxyScore"
    | "workflowProxyScore"
    | "writeSessionVerificationRate",
): string {
  if (slice.key !== "selected_corpus") {
    return field === "writeSessionVerificationRate"
      ? `${slice[field]}%`
      : `${slice[field]}`;
  }

  if (
    field === "writeSessionVerificationRate" &&
    summary.delivery.sessionsWithWrites === 0
  ) {
    return "N/A";
  }

  if (
    field === "verificationProxyScore" &&
    summary.delivery.sessionsWithWrites === 0
  ) {
    return "N/A";
  }

  if (field === "workflowProxyScore" && !hasApplicableDiscipline(summary)) {
    return "N/A";
  }

  return field === "writeSessionVerificationRate"
    ? `${slice[field]}%`
    : `${slice[field]}`;
}

function renderComparativeSliceLines(summary: SummaryArtifact): string[] {
  return summary.comparativeSlices.map(
    (slice) =>
      `- ${slice.label}: sessions ${slice.sessionCount}, verification proxy ${formatComparativeSliceValue(summary, slice, "verificationProxyScore")}, flow proxy ${slice.flowProxyScore}, workflow proxy ${formatComparativeSliceValue(summary, slice, "workflowProxyScore")}, write-session verification ${formatComparativeSliceValue(summary, slice, "writeSessionVerificationRate")}, incidents/100 turns ${slice.incidentsPer100Turns}`,
  );
}

function renderOpportunityLines(summary: SummaryArtifact): string[] {
  return renderLines(
    summary.opportunities,
    "- No deterministic improvement opportunities were identified.",
    (opportunity) => `- ${opportunity.title}: ${opportunity.rationale}`,
  );
}

function renderIncidentLines(summary: SummaryArtifact): string[] {
  return renderLines(
    summary.topIncidents,
    "- No labeled incidents detected.",
    (incident) => {
      const suffix = incident.evidencePreview
        ? ` | evidence: "${incident.evidencePreview}"`
        : "";
      return `- \`${incident.severity}\` / \`${incident.confidence}\` ${incident.summary} (${incident.sessionId}, span ${incident.turnSpan})${suffix}`;
    },
  );
}

function renderInventoryLines(metrics: MetricsRecord): string[] {
  return metrics.inventory
    .filter((record) => record.discovered || record.required)
    .map(
      (record) =>
        `- ${record.provider} ${record.required ? "required" : "optional"} ${record.kind}: ${record.discovered ? "present" : "missing"} at \`${record.path}\``,
    );
}

function renderMethodologyLines(metrics: MetricsRecord): string[] {
  const lines = [
    "- This report is a deterministic transcript analytics summary with heuristic policy proxies, not a rigorous correctness evaluator.",
    "- Labels are transcript-visible heuristics and should be treated as operator-friction signals, not ground-truth task outcomes.",
    "- Compliance scores are proxies based on observed transcript events and do not prove actual repository correctness.",
    "- Calibration, benchmark validation, and optional enrichment joins are intentionally deferred beyond this hardening release.",
  ];

  if (metrics.parseWarningCount > 0) {
    lines.push(
      `- Parse warnings: ${metrics.parseWarningCount}. Some malformed transcript lines were skipped, so results should be treated as partial for affected sessions.`,
    );
  }

  return lines;
}

/**
 * Convenience wrapper that derives the summary artifact from raw turns and incidents
 * before delegating to the canonical summary-based renderer.
 */
export function renderReport(
  metrics: MetricsRecord,
  incidents: readonly IncidentRecord[],
  rawTurns: readonly RawTurnRecord[],
): string {
  const summary = buildSummaryArtifact(
    metrics,
    buildSummaryInputsFromArtifacts(rawTurns, incidents),
  );
  return renderSummaryReport(metrics, summary);
}

/**
 * Renders a markdown report from a pre-built summary artifact.
 */
export function renderSummaryReport(
  metrics: MetricsRecord,
  summary: SummaryArtifact,
): string {
  const sections = buildSummarySections(summary);
  const providers = [
    ...new Set(metrics.inventory.map((record) => record.provider)),
  ];
  const skin = getConfig().reporting.skin;
  const title =
    skin === "showcase"
      ? "# Transcript Analytics Engine Report"
      : "# Transcript Analytics Report";

  const lines = [
    title,
    "",
    `- Evaluator version: \`${metrics.evaluatorVersion}\``,
    `- Schema version: \`${metrics.schemaVersion}\``,
    `- Generated at: \`${metrics.generatedAt}\``,
    `- Sources: \`${providers.join(", ")}\``,
    `- Sessions: \`${metrics.sessionCount}\``,
    `- Turns: \`${metrics.turnCount}\``,
    `- Incidents: \`${metrics.incidentCount}\``,
    `- Parse warnings: \`${metrics.parseWarningCount}\``,
    "",
    "## Headline Insights",
    "",
    ...sections.headlineInsights.map(
      (card) => `- ${card.title}: ${card.value} (${card.detail})`,
    ),
    "",
    skin === "showcase" ? "## Shareable Scoreboard" : "## Heuristic Scorecards",
    "",
    ...summary.scoreCards.map((card) => renderScoreCardLine(summary, card)),
    "",
    "## Recent Momentum",
    "",
    ...renderLines(
      sections.recentMomentum,
      "- Not enough sessions in this slice for recent-vs-corpus momentum comparisons yet.",
      (card) => `- ${card.title}: ${card.value} (${card.detail})`,
    ),
    "",
  ];

  if (skin === "showcase") {
    lines.push(
      "## Showcase Highlights",
      "",
      ...summary.highlightCards.map(
        (card) => `- ${card.title}: ${card.value} (${card.detail})`,
      ),
      "",
      "## Recognitions",
      "",
      ...(summary.recognitions.length > 0
        ? summary.recognitions.map((recognition) => `- ${recognition}`)
        : ["- No recognitions earned for this slice yet."]),
      "",
    );
  }

  lines.push(
    "## Operational Rates",
    "",
    ...renderRateLines(summary),
    "",
    "## Comparative Slices",
    "",
    ...renderComparativeSliceLines(summary),
    "",
    "## Label Counts",
    "",
    ...renderLabelLines(summary),
    "",
    "## Sessions To Review First",
    "",
    ...renderSessionLines(summary),
    "",
  );

  if (skin === "showcase") {
    lines.push(
      "## Verified Delivery Spotlights",
      "",
      ...renderLines(
        summary.verifiedDeliverySpotlights,
        "- No clean verified delivery sessions were available in this slice.",
        (session) =>
          `- ${session.sessionId}: ${session.archetypeLabel}, score ${session.complianceScore}, verifications ${session.verificationPassedCount}, incidents ${session.incidentCount}`,
      ),
      "",
    );
  }

  lines.push(
    "## Deterministic Opportunities",
    "",
    ...renderOpportunityLines(summary),
    "",
    "## Compliance Summary",
    "",
    ...renderComplianceLines(metrics),
    "",
    "## Top Incidents",
    "",
    ...renderIncidentLines(summary),
    "",
    "## Methodology And Limitations",
    "",
    ...renderMethodologyLines(metrics),
    "",
    "## Inventory",
    "",
    ...renderInventoryLines(metrics),
    "",
    "_Incident evidence is redacted and truncated for compact reporting. Preview sanitization reduces common sensitive data exposure but is not a guarantee of full anonymization._",
    "",
  );

  return lines.join("\n");
}
