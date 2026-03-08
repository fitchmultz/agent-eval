/**
 * Purpose: Clusters message-level labels into incident records using configurable turn-gap heuristics.
 * Entrypoint: `clusterIncidents()` is called by the evaluator after turn labeling.
 * Notes: Clustering is intentionally conservative to preserve precision in evaluator v1.
 */

import type { EvaluatedTurn } from "./evaluator.js";
import { chooseMaxConfidence, chooseMaxSeverity } from "./ranking.js";
import { isLowSignalPreview } from "./sanitization.js";
import type { IncidentRecord, LabelRecord } from "./schema.js";

export interface ClusterOptions {
  maxTurnGap: number;
}

function mergeLabels(labels: readonly LabelRecord[]): LabelRecord[] {
  const merged = new Map<LabelRecord["label"], LabelRecord>();
  for (const label of labels) {
    const existing = merged.get(label.label);
    if (!existing) {
      merged.set(label.label, label);
      continue;
    }

    merged.set(label.label, {
      label: label.label,
      severity: chooseMaxSeverity([existing.severity, label.severity]),
      confidence: chooseMaxConfidence([existing.confidence, label.confidence]),
      rationale: existing.rationale,
    });
  }

  return [...merged.values()];
}

function sharesAnyLabel(
  left: readonly LabelRecord[],
  right: readonly LabelRecord[],
): boolean {
  const leftLabels = new Set(left.map((label) => label.label));
  return right.some((label) => leftLabels.has(label.label));
}

function buildEvidencePreviews(turns: readonly EvaluatedTurn[]): string[] {
  const previews = turns.flatMap((turn) => turn.userMessagePreviews);
  const preferred = previews.filter((preview) => !isLowSignalPreview(preview));
  const selected = preferred.length > 0 ? preferred : previews;
  return selected.slice(0, 3);
}

export function clusterIncidents(
  turns: readonly EvaluatedTurn[],
  options: ClusterOptions,
  evaluatorVersion: string,
  schemaVersion: string,
): IncidentRecord[] {
  const incidents: IncidentRecord[] = [];
  let currentCluster: EvaluatedTurn[] = [];

  function flushCluster(): void {
    if (currentCluster.length === 0) {
      return;
    }

    const first = currentCluster[0];
    if (!first) {
      currentCluster = [];
      return;
    }
    const labels = mergeLabels(currentCluster.flatMap((turn) => turn.labels));
    const sourceRefs = currentCluster.flatMap((turn) => turn.sourceRefs);
    const severity = chooseMaxSeverity(labels.map((label) => label.severity));
    const confidence = chooseMaxConfidence(
      labels.map((label) => label.confidence),
    );
    const summary = `${labels.map((label) => label.label).join(", ")} across ${currentCluster.length} turn(s)`;
    const evidencePreviews = buildEvidencePreviews(currentCluster);
    const turnIds = currentCluster
      .map((turn) => turn.turnId)
      .filter((turnId): turnId is string => typeof turnId === "string");

    incidents.push({
      evaluatorVersion,
      schemaVersion,
      incidentId: `${first.sessionId}:incident:${incidents.length}`,
      sessionId: first.sessionId,
      turnIds,
      turnIndices: currentCluster.map((turn) => turn.turnIndex),
      labels,
      summary,
      evidencePreviews,
      severity,
      confidence,
      firstSeenAt: first.startedAt,
      lastSeenAt: currentCluster[currentCluster.length - 1]?.startedAt,
      sourceRefs,
    });

    currentCluster = [];
  }

  for (const turn of turns) {
    if (turn.labels.length === 0) {
      flushCluster();
      continue;
    }

    const previous = currentCluster[currentCluster.length - 1];
    if (!previous) {
      currentCluster.push(turn);
      continue;
    }

    const sameSession = previous.sessionId === turn.sessionId;
    const closeEnough =
      turn.turnIndex - previous.turnIndex <= options.maxTurnGap;
    const overlappingLabels = sharesAnyLabel(previous.labels, turn.labels);

    if (sameSession && closeEnough && overlappingLabels) {
      currentCluster.push(turn);
      continue;
    }

    flushCluster();
    currentCluster.push(turn);
  }

  flushCluster();
  return incidents;
}
