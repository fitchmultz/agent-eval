/**
 * Purpose: Clusters message-level labels into incident records using configurable turn-gap heuristics.
 * Entrypoint: `clusterIncidents()` is called by the evaluator after turn labeling.
 * Notes: Clustering is intentionally conservative to preserve precision in analytics-engine v1.
 */

import { getConfig } from "./config/index.js";
import { chooseMaxConfidence, chooseMaxSeverity } from "./ranking.js";
import { isLowSignalPreview, selectBestPreviews } from "./sanitization.js";
import type { IncidentRecord, LabelRecord, RawTurnRecord } from "./schema.js";

/**
 * Options for incident clustering.
 */
export interface ClusterOptions {
  /** Maximum number of turns between labeled turns to consider them part of the same incident */
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
      family: label.family,
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

function buildEvidencePreviews(turns: readonly RawTurnRecord[]): string[] {
  const previews = turns.flatMap((turn) => turn.userMessagePreviews);
  const preferred = previews.filter((preview) => !isLowSignalPreview(preview));
  return selectBestPreviews(
    preferred.length > 0 ? preferred : previews,
    getConfig().previews.maxIncidentEvidence,
  );
}

/**
 * Clusters labeled turns into incident records using turn-gap heuristics.
 *
 * This function groups consecutive labeled turns that share overlapping labels
 * into incidents. Turns are clustered when:
 * - They are from the same session
 * - They are within maxTurnGap of each other
 * - They share at least one label
 *
 * The clustering is intentionally conservative to preserve precision.
 *
 * @param turns - All labeled turns from the evaluation (unlabeled turns are skipped)
 * @param options - Clustering options including maxTurnGap
 * @param engineVersion - Version string for the analytics engine (stored in incident records)
 * @param schemaVersion - Version string for the schema (stored in incident records)
 * @returns Array of incident records with merged labels and evidence previews
 *
 * @example
 * ```typescript
 * const incidents = clusterIncidents(
 *   labeledTurns,
 *   { maxTurnGap: 3 },
 *   "1.0.0",
 *   "1.0.0"
 * );
 * console.log(`Found ${incidents.length} incidents`);
 * ```
 */
export function clusterIncidents(
  turns: readonly RawTurnRecord[],
  options: ClusterOptions,
  engineVersion: string,
  schemaVersion: IncidentRecord["schemaVersion"],
): IncidentRecord[] {
  const incidents: IncidentRecord[] = [];
  let currentCluster: RawTurnRecord[] = [];

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
      engineVersion,
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
