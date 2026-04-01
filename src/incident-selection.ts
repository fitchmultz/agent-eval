/**
 * Purpose: Selects, humanizes, and ranks top incidents for operator-facing summary display.
 * Entrypoint: `insertTopIncident()` and `buildTopIncidentSummary()` for maintaining bounded incident lists.
 * Notes: Deduplicates incidents and prioritizes severity, signal quality, and breadth while keeping titles consequence-oriented.
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
import {
  deriveSessionDisplayLabel,
  deriveSessionShortId,
  isTruncatedPreview,
} from "./summary/session-display.js";
import type { SessionContext } from "./summary/types.js";

const LABEL_SUMMARIES: Record<string, string> = {
  context_drift: "Scope or context drift was reported",
  test_build_lint_failure_complaint:
    "Build, test, or lint failure pressure surfaced",
  interrupt: "The session showed interruption or churn pressure",
  regression_report: "A possible regression was reported",
  praise: "Positive user feedback appeared alongside the session",
  context_reinjection: "The user had to restate context or goals",
  verification_request: "The user had to ask for verification explicitly",
  stalled_or_guessing: "The session appeared stalled or speculative",
};

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
    (left.humanSummary ?? left.summary).localeCompare(
      right.humanSummary ?? right.summary,
    )
  );
}

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

function humanizeIncidentSummary(incident: IncidentRecord): string {
  const leadLabel = incident.labels[0]?.label;
  const leadSummary = leadLabel ? LABEL_SUMMARIES[leadLabel] : undefined;
  const turnSpan = incident.turnIndices.length;
  return leadSummary
    ? `${leadSummary} across ${turnSpan} turn${turnSpan === 1 ? "" : "s"}.`
    : incident.summary;
}

function buildIncidentWhySelected(
  incident: IncidentRecord,
  evidencePreview?: string,
): string[] {
  const reasons: string[] = [];

  if (incident.severity === "high") {
    reasons.push("High-severity incident signal.");
  } else if (incident.severity === "medium") {
    reasons.push("Medium-severity incident signal worth review.");
  }

  if (incident.turnIndices.length >= 3) {
    reasons.push(
      `Persisted across ${incident.turnIndices.length} turns instead of a one-off spike.`,
    );
  }

  if (incident.confidence === "high") {
    reasons.push("Classifier confidence is high.");
  }

  if (evidencePreview) {
    reasons.push(
      "A usable evidence preview is available in the summary report.",
    );
  }

  return reasons.slice(0, 3);
}

function buildIncidentTrustFlags(
  incident: IncidentRecord,
  evidencePreview?: string,
): string[] {
  const flags: string[] = [];

  if (!evidencePreview) {
    flags.push("No safe evidence preview was available.");
  }
  if (evidencePreview && isLowSignalPreview(evidencePreview)) {
    flags.push(
      "Incident evidence fell back to a lower-signal preview, so inspect source refs before acting on it.",
    );
  }
  if (evidencePreview && isTruncatedPreview(evidencePreview)) {
    flags.push(
      "Incident evidence preview was truncated for compact reporting.",
    );
  }
  if (incident.sourceRefs.length === 0) {
    flags.push("No source references were captured for this incident.");
  }

  return flags;
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

export function buildTopIncidentSummary(
  incident: IncidentRecord,
  sessionTurns: readonly RawTurnRecord[],
  sessionContext?: SessionContext,
): SummaryArtifact["topIncidents"][number] {
  const evidencePreview = chooseIncidentEvidencePreview(incident, sessionTurns);
  const sessionDisplayLabel = deriveSessionDisplayLabel(
    incident.sessionId,
    sessionContext,
  );

  return {
    incidentId: incident.incidentId,
    sessionId: incident.sessionId,
    sessionDisplayLabel,
    sessionShortId: deriveSessionShortId(incident.sessionId),
    summary: incident.summary,
    humanSummary: humanizeIncidentSummary(incident),
    severity: incident.severity,
    confidence: incident.confidence,
    turnSpan: incident.turnIndices.length,
    ...(evidencePreview ? { evidencePreview } : {}),
    whySelected: buildIncidentWhySelected(incident, evidencePreview),
    sourceRefs: incident.sourceRefs,
    trustFlags: buildIncidentTrustFlags(incident, evidencePreview),
  };
}

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
