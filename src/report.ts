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

function renderLines<T>(
  items: readonly T[],
  emptyMessage: string,
  renderItem: (item: T) => string,
): string {
  if (items.length === 0) {
    return emptyMessage;
  }

  return items.map(renderItem).join("\n");
}

function renderLabelLines(
  summary: ReturnType<typeof buildSummaryArtifact>,
): string {
  return renderLines(
    summary.labels,
    "- No labels were detected.",
    (entry) => `- ${entry.label}: ${entry.count}`,
  );
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
  return renderLines(
    summary.topSessions,
    "- No session insights were available.",
    (session) =>
      `- ${session.sessionId}: ${session.archetypeLabel} (${session.archetype}), friction ${session.frictionScore}, score ${session.complianceScore}, dominant labels ${session.dominantLabels.join(", ") || "none"}`,
  );
}

function renderVictoryLapLines(
  summary: ReturnType<typeof buildSummaryArtifact>,
): string {
  return renderLines(
    summary.victoryLaps,
    "- No clean verified delivery sessions were available in this slice.",
    (session) =>
      `- ${session.sessionId}: ${session.archetypeLabel}, score ${session.complianceScore}, verifications ${session.verificationPassedCount}, incidents ${session.incidentCount}`,
  );
}

function renderMomentumLines(
  summary: ReturnType<typeof buildSummaryArtifact>,
): string {
  return renderLines(
    summary.momentumCards,
    "- Not enough sessions in this slice for recent-vs-corpus momentum comparisons yet.",
    (card) => `- ${card.title}: ${card.value} (${card.detail})`,
  );
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
  return renderLines(
    summary.opportunities,
    "- No deterministic improvement opportunities were identified.",
    (opportunity) => `- ${opportunity.title}: ${opportunity.rationale}`,
  );
}

function renderIncidentLines(
  summary: ReturnType<typeof buildSummaryArtifact>,
): string {
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
