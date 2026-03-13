/**
 * Purpose: Selects and ranks top incidents for summary display.
 * Entrypoint: `insertTopIncident()` for maintaining bounded incident list.
 * Notes: Deduplicates incidents and prioritizes by severity and signal quality.
 */

import { severityRank } from "./ranking.js";
import {
  isLowSignalPreview,
  isUnsafePreview,
  selectBestPreviews,
} from "./sanitization.js";
import type {
  IncidentRecord,
  RawTurnRecord,
  SummaryArtifact,
} from "./schema.js";

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
  const leftUnsafe = left.evidencePreview
    ? isUnsafePreview(left.evidencePreview)
    : true;
  const rightUnsafe = right.evidencePreview
    ? isUnsafePreview(right.evidencePreview)
    : true;

  return (
    (severityRank.get(right.severity) ?? 0) -
      (severityRank.get(left.severity) ?? 0) ||
    Number(leftUnsafe) - Number(rightUnsafe) ||
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

function orderTurnsByIncidentRelevance(
  turns: readonly RawTurnRecord[],
  incidentTurnIndices: readonly number[],
): RawTurnRecord[] {
  const incidentTurnSet = new Set(incidentTurnIndices);

  return [...turns].sort((left, right) => {
    const leftInIncident = incidentTurnSet.has(left.turnIndex);
    const rightInIncident = incidentTurnSet.has(right.turnIndex);
    if (leftInIncident !== rightInIncident) {
      return Number(rightInIncident) - Number(leftInIncident);
    }

    const leftDistance = Math.min(
      ...incidentTurnIndices.map((turnIndex) =>
        Math.abs(left.turnIndex - turnIndex),
      ),
    );
    const rightDistance = Math.min(
      ...incidentTurnIndices.map((turnIndex) =>
        Math.abs(right.turnIndex - turnIndex),
      ),
    );

    return leftDistance - rightDistance || left.turnIndex - right.turnIndex;
  });
}

function pickBestPreview(previews: readonly string[]): string | undefined {
  return selectBestPreviews(previews, 1)[0];
}

export function chooseIncidentEvidencePreview(
  incident: IncidentRecord,
  sessionTurns: readonly RawTurnRecord[],
): string | undefined {
  const orderedTurns = orderTurnsByIncidentRelevance(
    sessionTurns.filter((turn) => turn.sessionId === incident.sessionId),
    incident.turnIndices,
  );
  const orderedSessionPreviews = orderedTurns.flatMap(
    (turn) => turn.userMessagePreviews,
  );
  const incidentHighSignal = incident.evidencePreviews.filter(
    (preview) => !isLowSignalPreview(preview) && !isUnsafePreview(preview),
  );
  if (incidentHighSignal.length > 0) {
    return pickBestPreview(incidentHighSignal);
  }

  const sessionHighSignal = orderedSessionPreviews.filter(
    (preview) => !isLowSignalPreview(preview) && !isUnsafePreview(preview),
  );
  if (sessionHighSignal.length > 0) {
    return pickBestPreview(sessionHighSignal);
  }

  const incidentSafe = incident.evidencePreviews.filter(
    (preview) => !isUnsafePreview(preview),
  );
  if (incidentSafe.length > 0) {
    return pickBestPreview(incidentSafe);
  }

  const sessionSafe = orderedSessionPreviews.filter(
    (preview) => !isUnsafePreview(preview),
  );
  if (sessionSafe.length > 0) {
    return pickBestPreview(sessionSafe);
  }

  return (
    pickBestPreview(incident.evidencePreviews) ??
    pickBestPreview(orderedSessionPreviews)
  );
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
