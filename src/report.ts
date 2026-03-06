/**
 * Purpose: Converts evaluator metrics and incidents into a concise markdown report suitable for blog prep.
 * Entrypoint: `renderReport()` is used by the `report` and `eval` commands.
 * Notes: The report prefers aggregate findings and short incident summaries over raw transcript dumps.
 */
import type { IncidentRecord, MetricsRecord } from "./schema.js";

function renderIncidentLines(incidents: readonly IncidentRecord[]): string {
  if (incidents.length === 0) {
    return "- No labeled incidents detected.\n";
  }

  return incidents
    .slice(0, 10)
    .map(
      (incident) =>
        `- \`${incident.severity}\` / \`${incident.confidence}\` ${incident.summary} (${incident.sessionId})`,
    )
    .join("\n");
}

export function renderReport(
  metrics: MetricsRecord,
  incidents: readonly IncidentRecord[],
): string {
  const sessionLines = metrics.sessions
    .map(
      (session) =>
        `- ${session.sessionId}: score ${session.complianceScore}, incidents ${session.incidentCount}, writes ${session.writeCount}, verifications ${session.verificationPassedCount}/${session.verificationCount}`,
    )
    .join("\n");

  const labelLines = Object.entries(metrics.labelCounts)
    .map(([label, count]) => `- ${label}: ${count}`)
    .join("\n");

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
    labelLines.length > 0 ? labelLines : "- No labels were detected.",
    "",
    "## Session Compliance",
    "",
    sessionLines.length > 0 ? sessionLines : "- No sessions parsed.",
    "",
    "## Top Incidents",
    "",
    renderIncidentLines(incidents),
    "",
    "## Inventory",
    "",
    ...metrics.inventory.map(
      (record) =>
        `- ${record.kind}: ${record.discovered ? "present" : "missing"} at \`${record.path}\``,
    ),
    "",
  ].join("\n");
}
