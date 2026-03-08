/**
 * Purpose: Selects and ranks top incidents for summary display.
 * Entrypoint: `insertTopIncident()` for maintaining bounded incident list.
 * Notes: Deduplicates incidents and prioritizes by severity and signal quality.
 */

import { severityRank } from "./ranking.js";
import { isLowSignalPreview } from "./sanitization.js";
import type { SummaryArtifact } from "./schema.js";

/**
 * Compares two top incidents for ranking purposes.
 * Higher severity, non-low-signal, and wider turn span are preferred.
 * @param left - First incident to compare
 * @param right - Second incident to compare
 * @returns Negative if left should rank higher, positive if right should rank higher
 */
function compareTopIncidents(
  left: SummaryArtifact["topIncidents"][number],
  right: SummaryArtifact["topIncidents"][number],
): number {
  const leftLowSignal = left.evidencePreview
    ? isLowSignalPreview(left.evidencePreview)
    : true;
  const rightLowSignal = right.evidencePreview
    ? isLowSignalPreview(right.evidencePreview)
    : true;

  return (
    (severityRank.get(right.severity) ?? 0) -
      (severityRank.get(left.severity) ?? 0) ||
    Number(leftLowSignal) - Number(rightLowSignal) ||
    right.turnSpan - left.turnSpan ||
    left.summary.localeCompare(right.summary)
  );
}

/**
 * Creates a deduplication key for an incident based on session and normalized summary.
 * @param incident - The incident to create a key for
 * @returns String key for deduplication
 */
function topIncidentDedupKey(
  incident: SummaryArtifact["topIncidents"][number],
): string {
  const normalizedSummary = incident.summary.replace(
    /\s+across\s+\d+\s+turn\(s\)$/i,
    "",
  );
  return `${incident.sessionId}::${normalizedSummary}`;
}

/**
 * Inserts an incident into the top incidents list, maintaining size limit and deduplication.
 * @param topIncidents - Current list of top incidents
 * @param incident - New incident to insert
 * @param limit - Maximum number of incidents to keep
 * @returns Updated and sorted list of top incidents
 */
export function insertTopIncident(
  topIncidents: SummaryArtifact["topIncidents"],
  incident: SummaryArtifact["topIncidents"][number],
  limit: number,
): SummaryArtifact["topIncidents"] {
  const deduped = new Map<string, SummaryArtifact["topIncidents"][number]>();
  for (const candidate of [...topIncidents, incident]) {
    const key = topIncidentDedupKey(candidate);
    const existing = deduped.get(key);
    if (!existing || compareTopIncidents(candidate, existing) < 0) {
      deduped.set(key, candidate);
    }
  }
  return [...deduped.values()].sort(compareTopIncidents).slice(0, limit);
}
