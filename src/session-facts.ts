/**
 * Purpose: Builds public-safe per-session fact records for the v3 artifact contract.
 * Entrypoint: Used by the evaluator before artifact serialization.
 * Notes: Derives canonical session facts from evaluator projections and the v3 summary surface; the artifact writer remains serialization-only.
 */

import {
  isLowSignalPreview,
  normalizePublicPreviewCandidate,
} from "./sanitization.js";
import type {
  LabelCountRecord,
  SessionFactRecord,
  SummaryArtifact,
  SummaryFilter,
} from "./schema.js";
import { ENGINE_VERSION, SCHEMA_VERSION } from "./version.js";

export interface SessionFactProjection {
  sessionId: string;
  provider: SessionFactRecord["provider"];
  harness: string | null;
  modelProvider: string | null;
  model: string | null;
  startedAt: string | null;
  endedAt: string | null;
  durationMs: number | null;
  turnCount: number;
  userMessageCount: number;
  assistantMessageCount: number;
  toolCallCount: number;
  writeToolCallCount: number;
  verificationToolCallCount: number;
  mcpToolCallCount: number;
  writeCount: number;
  verificationCount: number;
  endedVerified: boolean;
  complianceScore: number;
  failedRules: string[];
  topTools: Array<{ toolName: string; count: number }>;
  mcpServers: SessionFactRecord["mcpServers"];
  rawLabelCounts: LabelCountRecord;
  deTemplatedLabelCounts: LabelCountRecord;
  template: SessionFactRecord["template"] & {
    dominantFamilyId?: string | null;
  };
  attribution: SessionFactRecord["attribution"];
  title?: string | undefined;
  evidencePreviews: string[];
  sourceRefs: SessionFactRecord["sourceRefs"];
}

const UNSURFACED_EVIDENCE_FALLBACK =
  "No durable public-safe evidence preview survived extraction for this session.";

function previewWordCount(preview: string): number {
  return preview.split(/\s+/).filter((token) => token.length > 0).length;
}

function isThinProceduralEvidencePreview(preview: string): boolean {
  const normalized = normalizePublicPreviewCandidate(preview);
  const wordCount = previewWordCount(normalized);
  if (wordCount === 0) {
    return true;
  }

  return (
    wordCount <= 1 ||
    (wordCount <= 6 &&
      /^(?:exact\s+)?(?:command|commands?|run|rerun|retry|repeat|step)\b/i.test(
        normalized,
      )) ||
    (wordCount <= 12 &&
      /\b(?:first|then|next|after(?:\s+that)?)\b/i.test(normalized) &&
      /\b(?:run|rerun|retry|repeat|step)\s+\d+\b/i.test(normalized))
  );
}

function isScaffoldDominatedFallbackCandidate(
  projection: SessionFactProjection,
): boolean {
  return (
    !projection.title &&
    projection.template.flags.includes("instruction_scaffold") &&
    (projection.template.artifactScore ?? 0) >= 80
  );
}

function canonicalizeUnsurfacedEvidencePreviews(
  projection: SessionFactProjection,
): string[] {
  const normalized = [
    ...new Set(
      projection.evidencePreviews
        .map((preview) => normalizePublicPreviewCandidate(preview))
        .filter((preview) => preview.length > 0),
    ),
  ];

  const cleaned = normalized.filter(
    (preview) =>
      !isLowSignalPreview(preview) && !isThinProceduralEvidencePreview(preview),
  );

  if (cleaned.length > 0 && !isScaffoldDominatedFallbackCandidate(projection)) {
    return cleaned;
  }

  return [UNSURFACED_EVIDENCE_FALLBACK];
}

function defaultAttributionReason(
  appliedFilters: readonly SummaryFilter[],
): string {
  if (appliedFilters.length === 0) {
    return "Transcript-visible evidence was insufficient.";
  }

  return `Transcript-visible evidence was insufficient for the selected ${appliedFilters
    .map((filter) => filter.label.toLowerCase())
    .join(", ")}.`;
}

function labelCountsToArray(
  labelCounts: LabelCountRecord,
): SessionFactRecord["rawLabelCounts"] {
  const rows = Object.entries(labelCounts)
    .filter(
      (entry): entry is [keyof LabelCountRecord & string, number] =>
        typeof entry[1] === "number",
    )
    .filter(([, count]) => count > 0)
    .sort(
      (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
    )
    .map(([label, count]) => ({
      label,
      count,
    }));

  return rows.length > 0 ? rows : null;
}

/**
 * Builds canonical session-fact rows in metrics.sessions order.
 */
export function buildSessionFacts(
  projections: readonly SessionFactProjection[],
  summary: SummaryArtifact,
): SessionFactRecord[] {
  const reviewQueueById = new Map(
    summary.reviewQueue.map((session) => [session.sessionId, session]),
  );
  const exemplarById = new Map(
    summary.exemplarSessions.map((session) => [session.sessionId, session]),
  );
  const attributionReason = defaultAttributionReason(
    summary.overview.appliedFilters,
  );
  for (const sessionId of exemplarById.keys()) {
    if (reviewQueueById.has(sessionId)) {
      throw new Error(
        `Summary surfaces must stay disjoint before session-facts emission, but ${sessionId} appeared in both exemplarSessions and reviewQueue.`,
      );
    }
  }

  return projections.map((projection) => {
    const reviewSurface = reviewQueueById.get(projection.sessionId);
    const exemplarSurface = exemplarById.get(projection.sessionId);
    const surface = exemplarSurface ?? reviewSurface;
    const evidencePreviews = surface?.evidencePreviews
      ? surface.evidencePreviews
      : canonicalizeUnsurfacedEvidencePreviews(projection);

    return {
      engineVersion: ENGINE_VERSION,
      schemaVersion: SCHEMA_VERSION,
      sessionId: projection.sessionId,
      shortId:
        surface?.shortId ??
        (projection.sessionId.slice(-8) || projection.sessionId),
      provider: projection.provider,
      harness: projection.harness,
      modelProvider: projection.modelProvider,
      model: projection.model,
      startedAt: projection.startedAt,
      endedAt: projection.endedAt,
      durationMs: projection.durationMs,
      metrics: {
        turnCount: projection.turnCount,
        userMessageCount: projection.userMessageCount,
        assistantMessageCount: projection.assistantMessageCount,
        toolCallCount: projection.toolCallCount,
        writeToolCallCount: projection.writeToolCallCount,
        verificationToolCallCount: projection.verificationToolCallCount,
        mcpToolCallCount: projection.mcpToolCallCount,
        writeCount: projection.writeCount,
        verificationCount: projection.verificationCount,
        endedVerified: projection.endedVerified,
        complianceScore: projection.complianceScore,
        failedRules: projection.failedRules,
      },
      topTools: projection.topTools,
      mcpServers: projection.mcpServers,
      rawLabelCounts: labelCountsToArray(projection.rawLabelCounts),
      deTemplatedLabelCounts: labelCountsToArray(
        projection.deTemplatedLabelCounts,
      ),
      template: {
        artifactScore: projection.template.artifactScore,
        textSharePct: projection.template.textSharePct,
        flags: projection.template.flags,
      },
      attribution: projection.attribution ?? {
        primary: "unknown",
        confidence: "low",
        reasons: [attributionReason],
      },
      title: surface?.title ?? projection.title ?? null,
      evidencePreviews,
      sourceRefs: surface?.sourceRefs ?? projection.sourceRefs,
      surfacedIn: {
        exemplar: exemplarById.has(projection.sessionId),
        reviewQueue: reviewQueueById.has(projection.sessionId),
      },
    };
  });
}
