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
        `- ${session.sessionId}: ${session.archetypeLabel} (${session.archetype}), friction ${session.frictionScore}, score ${session.complianceScore}, dominant labels ${session.dominantLabels.join(", ") || "none"}`,
    )
    .join("\n");
}

function renderVictoryLapLines(
  summary: ReturnType<typeof buildSummaryArtifact>,
): string {
  if (summary.victoryLaps.length === 0) {
    return "- No clean verified delivery sessions were available in this slice.";
  }

  return summary.victoryLaps
    .map(
      (session) =>
        `- ${session.sessionId}: ${session.archetypeLabel}, score ${session.complianceScore}, verifications ${session.verificationPassedCount}, incidents ${session.incidentCount}`,
    )
    .join("\n");
}

function renderMomentumLines(
  summary: ReturnType<typeof buildSummaryArtifact>,
): string {
  if (summary.momentumCards.length === 0) {
    return "- Not enough sessions in this slice for recent-vs-corpus momentum comparisons yet.";
  }

  return summary.momentumCards
    .map((card) => `- ${card.title}: ${card.value} (${card.detail})`)
    .join("\n");
}

function renderComparativeSliceLines(
  summary: ReturnType<typeof buildSummaryArtifact>,
): string {
  return summary.comparativeSlices
    .map(
      (slice) =>
        `- ${slice.label}: sessions ${slice.sessionCount}, proof ${slice.proofScore}, flow ${slice.flowScore}, discipline ${slice.disciplineScore}, write verification ${slice.writeVerificationRate}%, incidents/100 turns ${slice.incidentsPer100Turns}`,
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
      return `- \`${incident.severity}\` / \`${incident.confidence}\` ${incident.summary} (${incident.sessionId}, span ${incident.turnSpan})${suffix}`;
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
    "## Show-Off Stats",
    "",
    ...summary.bragCards.map(
      (card) => `- ${card.title}: ${card.value} (${card.detail})`,
    ),
    "",
    "## Shareable Scoreboard",
    "",
    ...summary.scoreCards.map(
      (card) => `- ${card.title}: ${card.score}/100 (${card.detail})`,
    ),
    "",
    "## Recent Momentum",
    "",
    renderMomentumLines(summary),
    "",
    "## Badges",
    "",
    summary.achievementBadges.length > 0
      ? summary.achievementBadges.map((badge) => `- ${badge}`).join("\n")
      : "- No badges earned for this slice yet.",
    "",
    "## Operational Rates",
    "",
    renderRateLines(summary),
    "",
    "## Comparative Slices",
    "",
    renderComparativeSliceLines(summary),
    "",
    "## Label Counts",
    "",
    renderLabelLines(summary),
    "",
    "## Sessions To Review First",
    "",
    renderSessionLines(summary),
    "",
    "## Victory Lap Sessions",
    "",
    renderVictoryLapLines(summary),
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
