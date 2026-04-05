/**
 * Purpose: Builds deterministic review and exemplar session selections from the canonical v3 summary substrate.
 * Entrypoint: `selectReviewQueue()` and `selectExemplars()` for independent ranked surfaces.
 * Notes: Selections are de-templated, public-safe, and intentionally keep review versus learning surfaces disjoint.
 */

import { getConfig } from "./config/index.js";
import { SCORING } from "./constants/index.js";
import {
  calculateFrictionScore,
  dominantLabelsForSession,
} from "./friction-scoring.js";
import type {
  EvidenceIssue,
  SessionTitleSource,
  SummaryConfidence,
} from "./schema.js";
import { archetypeLabel, determineArchetype } from "./session-archetype.js";
import {
  deriveSessionDisplayLabel,
  deriveSessionProjectLabel,
  deriveSessionShortId,
  deriveSessionTimestampLabel,
  isTruncatedPreview,
} from "./summary/session-display.js";
import type {
  SessionCandidate,
  SummarySessionRecord,
} from "./summary/types.js";

const RULE_LABELS: Record<string, string> = {
  scope_confirmed_before_major_write: "Scope confirmed before major write",
  cwd_or_repo_echoed_before_write: "Repo or cwd confirmed before write",
  short_plan_before_large_change: "Short plan before large change",
  verification_after_code_changes: "Verification after code changes",
  no_unverified_ending: "No unverified ending",
};

const NEGATIVE_LABELS = new Set([
  "context_drift",
  "stalled_or_guessing",
  "regression_report",
  "test_build_lint_failure_complaint",
  "interrupt",
  "context_reinjection",
  "verification_request",
]);

function buildFailedRules(record: SummarySessionRecord): string[] {
  return record.metrics.complianceRules
    .filter((rule) => rule.status === "fail")
    .map((rule) => RULE_LABELS[rule.rule] ?? rule.rule);
}

function deriveTitleSource(record: SummarySessionRecord): SessionTitleSource {
  if (!record.context?.leadPreview) {
    return "metadata";
  }

  return record.context.leadPreviewSource === "assistant"
    ? "assistant"
    : "user";
}

function deriveTitleConfidence(
  record: SummarySessionRecord,
): SummaryConfidence {
  const titleSource = deriveTitleSource(record);
  if (titleSource === "metadata") {
    return "weak";
  }

  if (record.context?.leadPreviewIsCodeLike) {
    return "weak";
  }

  return (
    record.context?.leadPreviewConfidence ??
    (titleSource === "assistant" ? "medium" : "strong")
  );
}

function deriveEvidenceIssues(record: SummarySessionRecord): EvidenceIssue[] {
  const issues = new Set<EvidenceIssue>(record.context?.evidenceIssues ?? []);

  if (!record.context || record.context.evidencePreviews.length === 0) {
    issues.add("missing_evidence");
  }
  if (!record.context || record.context.sourceRefs.length === 0) {
    issues.add("missing_source_refs");
  }
  if (!record.context?.leadPreview) {
    issues.add("metadata_fallback_title");
  }
  if (record.context?.leadPreviewSource === "assistant") {
    issues.add("assistant_fallback_title");
  }
  if (record.context?.leadPreviewIsCodeLike) {
    issues.add("code_like_title");
  }
  if ((record.context?.evidencePreviews ?? []).some(isTruncatedPreview)) {
    issues.add("truncated_evidence");
  }

  return [...issues];
}

function buildMetadataFallbackTitle(
  record: SummarySessionRecord,
  projectLabel: string,
): string {
  const projectSuffix =
    projectLabel !== "project unknown" ? ` in ${projectLabel}` : "";

  if (record.metrics.writeCount > 0 && record.metrics.endedVerified) {
    return `Ended-verified delivery${projectSuffix}`;
  }

  if (record.metrics.writeCount > 0) {
    return `Unverified write session${projectSuffix}`;
  }

  if (record.metrics.incidentCount > 0) {
    return `Analysis session needing review${projectSuffix}`;
  }

  return `Analysis session${projectSuffix}`;
}

function buildCandidate(record: SummarySessionRecord): SessionCandidate {
  const failedRules = buildFailedRules(record);
  const titleSource = deriveTitleSource(record);
  const titleConfidence = deriveTitleConfidence(record);
  const evidenceIssues = deriveEvidenceIssues(record);
  const frictionScore = calculateFrictionScore(
    record.labels,
    record.metrics.complianceScore,
  );
  const dominantLabels = dominantLabelsForSession(record.labels);
  const archetype = determineArchetype(
    record.metrics.writeCount,
    record.metrics.endedVerified,
    frictionScore,
  );
  const timestampLabel = deriveSessionTimestampLabel(record.context?.startedAt);
  const projectLabel = deriveSessionProjectLabel(
    record.context?.cwd,
    record.context?.sourceRefs,
  );
  const displayLabel = deriveSessionDisplayLabel(
    record.sessionId,
    record.context ?? undefined,
  );

  return {
    record,
    shortId: deriveSessionShortId(record.sessionId),
    title:
      titleSource === "metadata"
        ? buildMetadataFallbackTitle(record, projectLabel)
        : displayLabel,
    timestampLabel,
    projectLabel,
    archetype,
    archetypeLabel: archetypeLabel(archetype),
    frictionScore,
    complianceScore: record.metrics.complianceScore,
    incidentCount: record.metrics.incidentCount,
    labeledTurnCount: record.metrics.labeledTurnCount,
    writeCount: record.metrics.writeCount,
    verificationPassedCount: record.metrics.verificationPassedCount,
    endedVerified: record.metrics.endedVerified,
    failedRules,
    dominantLabels,
    titleSource,
    titleConfidence,
    evidenceSource: record.context?.evidenceSource ?? "none",
    evidenceConfidence: record.context?.evidenceConfidence ?? "weak",
    evidenceIssues,
  };
}

function hasOnlyWeakMetadataIdentity(candidate: SessionCandidate): boolean {
  return (
    candidate.titleSource === "metadata" &&
    (candidate.record.context?.evidencePreviews.length ?? 0) === 0 &&
    candidate.evidenceConfidence === "weak" &&
    (candidate.record.context?.sourceRefs.length ?? 0) > 0
  );
}

function hasOpaqueUnknownProjectIdentity(candidate: SessionCandidate): boolean {
  return (
    (candidate.record.context?.sourceRefs.length ?? 0) > 0 &&
    candidate.projectLabel === "project unknown" &&
    candidate.titleSource === "metadata" &&
    candidate.evidenceConfidence !== "strong"
  );
}

function isTemplateHeavy(candidate: SessionCandidate): boolean {
  return (
    candidate.record.template.flags.includes("template_heavy") ||
    (candidate.record.template.textSharePct ?? 0) >= 40
  );
}

function evidenceConfidenceBucket(candidate: SessionCandidate): number {
  switch (candidate.evidenceConfidence) {
    case "strong":
      return 0;
    case "medium":
      return 1;
    default:
      return 2;
  }
}

function titleConfidenceBucket(candidate: SessionCandidate): number {
  switch (candidate.titleConfidence) {
    case "strong":
      return 0;
    case "medium":
      return 1;
    default:
      return 2;
  }
}

function attributionConfidenceBucket(candidate: SessionCandidate): number {
  switch (candidate.record.attribution.confidence) {
    case "high":
      return 0;
    case "medium":
      return 1;
    default:
      return 2;
  }
}

function activeDeliveryRiskBucket(candidate: SessionCandidate): number {
  if (
    candidate.writeCount > 0 &&
    (!candidate.endedVerified || candidate.failedRules.length > 0)
  ) {
    return 0;
  }

  if (candidate.failedRules.length > 0 || candidate.incidentCount > 0) {
    return 1;
  }

  return 2;
}

function hasNegativeLabel(candidate: SessionCandidate): boolean {
  return candidate.dominantLabels.some((label) => NEGATIVE_LABELS.has(label));
}

function isReviewEligible(candidate: SessionCandidate): boolean {
  if (
    hasOnlyWeakMetadataIdentity(candidate) ||
    hasOpaqueUnknownProjectIdentity(candidate)
  ) {
    return false;
  }

  if (
    candidate.titleSource === "metadata" &&
    candidate.incidentCount === 0 &&
    candidate.failedRules.length === 0 &&
    candidate.evidenceConfidence !== "strong"
  ) {
    return false;
  }

  if (
    candidate.record.attribution.primary === "template_artifact" &&
    candidate.failedRules.length === 0 &&
    candidate.incidentCount === 0 &&
    candidate.frictionScore < SCORING.FRICTION_THRESHOLD
  ) {
    return false;
  }

  return (
    activeDeliveryRiskBucket(candidate) <= 1 ||
    candidate.incidentCount > 0 ||
    candidate.failedRules.length > 0 ||
    candidate.frictionScore >= SCORING.FRICTION_THRESHOLD ||
    hasNegativeLabel(candidate)
  );
}

function isExemplarEligible(candidate: SessionCandidate): boolean {
  const hasInspectableIdentity =
    candidate.titleSource !== "metadata" ||
    (candidate.evidenceConfidence === "strong" &&
      !candidate.evidenceIssues.includes("low_signal_evidence") &&
      !candidate.evidenceIssues.includes("truncated_evidence"));
  const cleanWriteSession =
    candidate.writeCount > 0 &&
    candidate.endedVerified &&
    candidate.failedRules.length === 0 &&
    candidate.incidentCount === 0;
  const cleanAnalysisSession =
    candidate.writeCount === 0 &&
    candidate.incidentCount === 0 &&
    candidate.frictionScore === 0 &&
    candidate.failedRules.length === 0 &&
    candidate.evidenceConfidence === "strong" &&
    candidate.titleSource !== "metadata" &&
    !candidate.evidenceIssues.includes("low_signal_evidence") &&
    !candidate.evidenceIssues.includes("truncated_evidence");

  return (
    hasInspectableIdentity &&
    !isTemplateHeavy(candidate) &&
    (cleanWriteSession || cleanAnalysisSession)
  );
}

function compareReviewCandidates(
  left: SessionCandidate,
  right: SessionCandidate,
): number {
  return (
    activeDeliveryRiskBucket(left) - activeDeliveryRiskBucket(right) ||
    evidenceConfidenceBucket(left) - evidenceConfidenceBucket(right) ||
    attributionConfidenceBucket(left) - attributionConfidenceBucket(right) ||
    left.complianceScore - right.complianceScore ||
    right.incidentCount - left.incidentCount ||
    right.frictionScore - left.frictionScore ||
    titleConfidenceBucket(left) - titleConfidenceBucket(right) ||
    left.title.localeCompare(right.title) ||
    left.record.sessionId.localeCompare(right.record.sessionId)
  );
}

function compareExemplarCandidates(
  left: SessionCandidate,
  right: SessionCandidate,
): number {
  const leftTemplateShare = left.record.template.textSharePct ?? 0;
  const rightTemplateShare = right.record.template.textSharePct ?? 0;

  return (
    (left.writeCount > 0 ? 0 : 1) - (right.writeCount > 0 ? 0 : 1) ||
    right.verificationPassedCount - left.verificationPassedCount ||
    right.complianceScore - left.complianceScore ||
    left.incidentCount - right.incidentCount ||
    left.frictionScore - right.frictionScore ||
    evidenceConfidenceBucket(left) - evidenceConfidenceBucket(right) ||
    titleConfidenceBucket(left) - titleConfidenceBucket(right) ||
    leftTemplateShare - rightTemplateShare ||
    left.title.localeCompare(right.title) ||
    left.record.sessionId.localeCompare(right.record.sessionId)
  );
}

function applyTemplateDiversityGuard(
  candidates: readonly SessionCandidate[],
  options: { projectDiversity?: boolean } = {},
): SessionCandidate[] {
  const guarded: SessionCandidate[] = [];
  const deferred: SessionCandidate[] = [];
  const familyCounts = new Map<string, number>();
  const projectCounts = new Map<string, number>();
  const weakEvidenceCounts = new Map<string, number>();

  for (const candidate of candidates) {
    const familyId = candidate.record.template.dominantFamilyId;
    const projectKey =
      candidate.projectLabel !== "project unknown"
        ? candidate.projectLabel.toLowerCase()
        : null;
    const primaryEvidence = candidate.record.context?.evidencePreviews[0]
      ?.trim()
      .toLowerCase();
    const exceedsFamilyCap =
      familyId && guarded.length < 10 && (familyCounts.get(familyId) ?? 0) >= 2;
    const exceedsProjectCap =
      options.projectDiversity &&
      projectKey &&
      guarded.length < 10 &&
      (projectCounts.get(projectKey) ?? 0) >= 2;
    const exceedsWeakEvidenceCap =
      candidate.titleConfidence === "weak" &&
      primaryEvidence &&
      guarded.length < 10 &&
      (weakEvidenceCounts.get(primaryEvidence) ?? 0) >= 1;

    if (exceedsFamilyCap || exceedsProjectCap || exceedsWeakEvidenceCap) {
      deferred.push(candidate);
      continue;
    }

    guarded.push(candidate);
    if (familyId) {
      familyCounts.set(familyId, (familyCounts.get(familyId) ?? 0) + 1);
    }
    if (projectKey) {
      projectCounts.set(projectKey, (projectCounts.get(projectKey) ?? 0) + 1);
    }
    if (candidate.titleConfidence === "weak" && primaryEvidence) {
      weakEvidenceCounts.set(
        primaryEvidence,
        (weakEvidenceCounts.get(primaryEvidence) ?? 0) + 1,
      );
    }
  }

  return [...guarded, ...deferred];
}

function dedupeCandidates(
  candidates: readonly SessionCandidate[],
): SessionCandidate[] {
  const unique: SessionCandidate[] = [];
  const seen = new Set<string>();

  for (const candidate of candidates) {
    if (seen.has(candidate.record.sessionId)) {
      continue;
    }

    seen.add(candidate.record.sessionId);
    unique.push(candidate);
  }

  return unique;
}

function buildCandidates(
  records: readonly SummarySessionRecord[],
): SessionCandidate[] {
  return records.map(buildCandidate);
}

export function selectReviewQueue(
  records: readonly SummarySessionRecord[],
  options: {
    excludeSessionIds?: ReadonlySet<string>;
    maxItems?: number;
  } = {},
): SessionCandidate[] {
  const excludeSessionIds = options.excludeSessionIds ?? new Set<string>();

  return dedupeCandidates(
    applyTemplateDiversityGuard(
      buildCandidates(records)
        .filter(
          (candidate) => !excludeSessionIds.has(candidate.record.sessionId),
        )
        .filter(isReviewEligible)
        .sort(compareReviewCandidates),
      { projectDiversity: true },
    ),
  ).slice(0, options.maxItems ?? getConfig().previews.maxReviewQueueSessions);
}

export function selectExemplars(
  records: readonly SummarySessionRecord[],
  options: { maxItems?: number } = {},
): SessionCandidate[] {
  return dedupeCandidates(
    applyTemplateDiversityGuard(
      buildCandidates(records)
        .filter(isExemplarEligible)
        .sort(compareExemplarCandidates),
    ),
  ).slice(0, options.maxItems ?? getConfig().previews.maxExemplarSessions);
}
