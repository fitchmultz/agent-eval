/**
 * Purpose: Converts evaluator metrics and incidents into a concise markdown report suitable for blog prep.
 * Entrypoint: `renderReport()` is used by the `report` and `eval` commands.
 * Notes: The report prefers aggregate findings and short incident summaries over raw transcript dumps.
 */
import type { IncidentRecord, MetricsRecord } from "./schema.js";

function renderLabelLines(metrics: MetricsRecord): string {
  const populated = Object.entries(metrics.labelCounts)
    .filter((entry): entry is [string, number] => typeof entry[1] === "number")
    .sort(
      (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
    );

  if (populated.length === 0) {
    return "- No labels were detected.";
  }

  return populated.map(([label, count]) => `- ${label}: ${count}`).join("\n");
}

function renderComplianceLines(metrics: MetricsRecord): string {
  return metrics.complianceSummary
    .map(
      (rule) =>
        `- ${rule.rule}: pass ${rule.passCount}, fail ${rule.failCount}, n/a ${rule.notApplicableCount}, unknown ${rule.unknownCount}`,
    )
    .join("\n");
}

function renderSessionLines(metrics: MetricsRecord): string {
  const rankedSessions = [...metrics.sessions].sort(
    (left, right) =>
      right.incidentCount - left.incidentCount ||
      left.complianceScore - right.complianceScore ||
      left.sessionId.localeCompare(right.sessionId),
  );

  if (rankedSessions.length === 0) {
    return "- No sessions parsed.";
  }

  return rankedSessions
    .slice(0, 10)
    .map(
      (session) =>
        `- ${session.sessionId}: score ${session.complianceScore}, incidents ${session.incidentCount}, labeled turns ${session.labeledTurnCount}, writes ${session.writeCount}, verifications ${session.verificationPassedCount}/${session.verificationCount}`,
    )
    .join("\n");
}

function renderIncidentLines(incidents: readonly IncidentRecord[]): string {
  if (incidents.length === 0) {
    return "- No labeled incidents detected.\n";
  }

  const rankedIncidents = [...incidents].sort(
    (left, right) =>
      right.turnIndices.length - left.turnIndices.length ||
      left.summary.localeCompare(right.summary),
  );

  return rankedIncidents
    .slice(0, 10)
    .map((incident) => {
      const evidence = incident.evidencePreviews[0];
      const suffix = evidence ? ` | evidence: "${evidence}"` : "";
      return `- \`${incident.severity}\` / \`${incident.confidence}\` ${incident.summary} (${incident.sessionId})${suffix}`;
    })
    .join("\n");
}

function renderInventoryLines(metrics: MetricsRecord): string {
  const required = metrics.inventory.filter((record) => record.required);
  const optional = metrics.inventory.filter((record) => record.optional);

  const requiredLines = required.map(
    (record) =>
      `- required ${record.kind}: ${record.discovered ? "present" : "missing"} at \`${record.path}\``,
  );
  const optionalLines = optional.map(
    (record) =>
      `- optional ${record.kind}: ${record.discovered ? "present" : "missing"} at \`${record.path}\``,
  );

  return [...requiredLines, ...optionalLines].join("\n");
}

export function renderReport(
  metrics: MetricsRecord,
  incidents: readonly IncidentRecord[],
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
    "## Label Counts",
    "",
    renderLabelLines(metrics),
    "",
    "## Compliance Summary",
    "",
    renderComplianceLines(metrics),
    "",
    "## Session Highlights",
    "",
    renderSessionLines(metrics),
    "",
    "## Top Incidents",
    "",
    renderIncidentLines(incidents),
    "",
    "## Inventory",
    "",
    renderInventoryLines(metrics),
    "",
    "_Incident evidence is redacted and truncated for compact, public-safe reporting._",
    "",
  ].join("\n");
}
