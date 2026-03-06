/**
 * Purpose: Converts evaluator metrics and incidents into a concise markdown report suitable for blog prep.
 * Entrypoint: `renderReport()` is used by the `report` and `eval` commands.
 * Notes: The report now emphasizes deterministic insight summaries over raw metric dumps.
 */
import {
  buildSummaryArtifact,
  buildSummaryInputsFromArtifacts,
} from "./insights.js";
import type { IncidentRecord, MetricsRecord, RawTurnRecord } from "./schema.js";

function renderLabelLines(
  summary: ReturnType<typeof buildSummaryArtifact>,
): string {
  if (summary.labels.length === 0) {
    return "- No labels were detected.";
  }

  return summary.labels
    .map((entry) => `- ${entry.label}: ${entry.count}`)
    .join("\n");
}

function renderRateLines(
  summary: ReturnType<typeof buildSummaryArtifact>,
): string {
  return [
    `- Incidents / 100 turns: ${summary.rates.incidentsPer100Turns}`,
    `- Writes / 100 turns: ${summary.rates.writesPer100Turns}`,
    `- Verification requests / 100 turns: ${summary.rates.verificationRequestsPer100Turns}`,
    `- Interruptions / 100 turns: ${summary.rates.interruptionsPer100Turns}`,
    `- Reinjections / 100 turns: ${summary.rates.reinjectionsPer100Turns}`,
    `- Praise / 100 turns: ${summary.rates.praisePer100Turns}`,
  ].join("\n");
}

function renderComplianceLines(metrics: MetricsRecord): string {
  return metrics.complianceSummary
    .map(
      (rule) =>
        `- ${rule.rule}: pass ${rule.passCount}, fail ${rule.failCount}, n/a ${rule.notApplicableCount}, unknown ${rule.unknownCount}`,
    )
    .join("\n");
}

function renderSessionLines(
  summary: ReturnType<typeof buildSummaryArtifact>,
): string {
  if (summary.topSessions.length === 0) {
    return "- No session insights were available.";
  }

  return summary.topSessions
    .map(
      (session) =>
        `- ${session.sessionId}: archetype ${session.archetype}, friction ${session.frictionScore}, score ${session.complianceScore}, dominant labels ${session.dominantLabels.join(", ") || "none"}`,
    )
    .join("\n");
}

function renderOpportunityLines(
  summary: ReturnType<typeof buildSummaryArtifact>,
): string {
  if (summary.opportunities.length === 0) {
    return "- No deterministic improvement opportunities were identified.";
  }

  return summary.opportunities
    .map((opportunity) => `- ${opportunity.title}: ${opportunity.rationale}`)
    .join("\n");
}

function renderIncidentLines(
  summary: ReturnType<typeof buildSummaryArtifact>,
): string {
  if (summary.topIncidents.length === 0) {
    return "- No labeled incidents detected.";
  }

  return summary.topIncidents
    .map((incident) => {
      const suffix = incident.evidencePreview
        ? ` | evidence: "${incident.evidencePreview}"`
        : "";
      return `- \`${incident.severity}\` / \`${incident.confidence}\` ${incident.summary} (${incident.sessionId})${suffix}`;
    })
    .join("\n");
}

function renderInventoryLines(metrics: MetricsRecord): string {
  return metrics.inventory
    .map(
      (record) =>
        `- ${record.required ? "required" : "optional"} ${record.kind}: ${record.discovered ? "present" : "missing"} at \`${record.path}\``,
    )
    .join("\n");
}

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

export function renderSummaryReport(
  metrics: MetricsRecord,
  summary: ReturnType<typeof buildSummaryArtifact>,
): string {
  return [
    "# Codex Evaluator Report",
    "",
    `- Evaluator version: \`${metrics.evaluatorVersion}\``,
    `- Schema version: \`${metrics.schemaVersion}\``,
    `- Generated at: \`${metrics.generatedAt}\``,
    `- Sessions: \`${metrics.sessionCount}\``,
    `- Turns: \`${metrics.turnCount}\``,
    `- Incidents: \`${metrics.incidentCount}\``,
    "",
    "## Headline Insights",
    "",
    ...summary.insightCards.map(
      (card) => `- ${card.title}: ${card.value} (${card.detail})`,
    ),
    "",
    "## Operational Rates",
    "",
    renderRateLines(summary),
    "",
    "## Label Counts",
    "",
    renderLabelLines(summary),
    "",
    "## Sessions To Review First",
    "",
    renderSessionLines(summary),
    "",
    "## Deterministic Opportunities",
    "",
    renderOpportunityLines(summary),
    "",
    "## Compliance Summary",
    "",
    renderComplianceLines(metrics),
    "",
    "## Top Incidents",
    "",
    renderIncidentLines(summary),
    "",
    "## Inventory",
    "",
    renderInventoryLines(metrics),
    "",
    "_Incident evidence is redacted and truncated for compact, public-safe reporting._",
    "",
  ].join("\n");
}
