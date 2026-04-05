/**
 * Purpose: Builds surfaced session wording and deterministic learning-pattern summaries for the v3 report model.
 * Entrypoint: Used by `summary-core.ts` after review and exemplar selection.
 * Notes: Keeps wording and pattern explanation logic separate from ranking and metric aggregation.
 */

import type {
  LearningPattern,
  SummaryArtifact,
  SurfacedSession,
} from "./schema.js";
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

type PatternBucket = keyof SummaryArtifact["learningPatterns"];

type SessionSignal = ReturnType<typeof buildSessionSignals>;

interface LearningPatternDefinition {
  id: string;
  label: string;
  explanation: string;
  bucket: PatternBucket;
  matches: (signal: SessionSignal) => boolean;
}

interface LearningPatternInputs {
  exemplarSessionIds?: ReadonlySet<string>;
  reviewSessionIds?: ReadonlySet<string>;
}

function pluralize(count: number, singular: string, plural?: string): string {
  return `${count} ${count === 1 ? singular : (plural ?? `${singular}s`)}`;
}

function buildTrustFlags(candidate: SessionCandidate): string[] {
  const flags: string[] = [];

  if (candidate.record.metrics.parseWarningCount > 0) {
    flags.push("Parse warnings were present, so this session may be partial.");
  }

  if (candidate.titleSource === "metadata") {
    flags.push(
      "No strong human problem statement was available, so the session title falls back to metadata.",
    );
  }

  if (candidate.titleSource === "assistant") {
    flags.push(
      "Session title fell back to assistant text because no stronger user preview was available.",
    );
  }

  if (candidate.evidenceIssues.includes("missing_evidence")) {
    flags.push(
      "No strong evidence preview was available in summary-only output.",
    );
  }

  if (candidate.evidenceIssues.includes("missing_source_refs")) {
    flags.push("No source references were captured for this session.");
  }

  if (candidate.evidenceIssues.includes("code_like_title")) {
    flags.push(
      "Session title fell back to code-like text; inspect the source refs for full context.",
    );
  }

  if (candidate.evidenceIssues.includes("low_signal_evidence")) {
    flags.push(
      "Evidence previews include lower-signal text, so inspect source refs before acting on them.",
    );
  }

  if (candidate.evidenceIssues.includes("truncated_evidence")) {
    flags.push("Evidence previews were truncated for compact reporting.");
  }

  return flags;
}

function buildPassedRules(candidate: SessionCandidate): string[] {
  return candidate.record.metrics.complianceRules
    .filter((rule) => rule.status === "pass")
    .map((rule) => RULE_LABELS[rule.rule] ?? rule.rule);
}

function buildReviewWhyIncluded(candidate: SessionCandidate): string[] {
  const reasons: string[] = [];

  if (candidate.writeCount > 0 && !candidate.endedVerified) {
    reasons.push(
      "Ended without a passing post-write verification after code changes.",
    );
  }

  if (candidate.failedRules.includes("Verification after code changes")) {
    reasons.push("Failed the verification-after-code-changes rule.");
  }

  if (candidate.failedRules.includes("No unverified ending")) {
    reasons.push("Failed the no-unverified-ending rule.");
  }

  if (candidate.incidentCount > 0) {
    reasons.push(
      `${pluralize(candidate.incidentCount, "labeled incident")} remained after de-templating.`,
    );
  }

  if (candidate.frictionScore > 0) {
    reasons.push(
      `${candidate.frictionScore} friction points were recorded from transcript-visible review signals.`,
    );
  }

  if (candidate.record.attribution.primary !== "unknown") {
    reasons.push(
      `Likely cause: ${candidate.record.attribution.primary.replaceAll("_", " ")}.`,
    );
  }

  return reasons
    .slice(0, 4)
    .concat(
      reasons.length === 0
        ? [
            "Selected for review based on the strongest remaining transcript-visible risk signals.",
          ]
        : [],
    );
}

function buildExemplarWhyIncluded(candidate: SessionCandidate): string[] {
  const reasons: string[] = [];
  const templateShare = candidate.record.template.textSharePct ?? 0;

  if (candidate.writeCount > 0 && candidate.endedVerified) {
    reasons.push(
      "Ended with a passing post-write verification signal after code changes.",
    );
  }

  if (candidate.verificationPassedCount > 0) {
    reasons.push(
      candidate.verificationPassedCount === 1
        ? "1 passing verification check was captured in the transcript."
        : `${candidate.verificationPassedCount} passing verification checks were captured in the transcript.`,
    );
  }

  if (candidate.failedRules.length === 0) {
    reasons.push("No failed compliance rules were recorded.");
  }

  if (candidate.incidentCount === 0) {
    reasons.push("No incidents survived de-templating for this session.");
  }

  if (
    templateShare < 20 &&
    !candidate.record.template.flags.includes("template_heavy")
  ) {
    reasons.push(
      "Template artifact pressure stayed low enough for direct learning use.",
    );
  }

  return reasons
    .slice(0, 4)
    .concat(
      reasons.length === 0
        ? [
            "Selected as a clean, inspectable exemplar from the selected corpus.",
          ]
        : [],
    );
}

function buildReviewReasonTags(candidate: SessionCandidate): string[] {
  const tags = [
    candidate.record.attribution.primary,
    ...candidate.failedRules,
    ...candidate.dominantLabels,
  ].filter((value) => value.length > 0);

  return [...new Set(tags)].slice(0, 4);
}

function buildExemplarReasonTags(candidate: SessionCandidate): string[] {
  const tags = [
    candidate.archetypeLabel,
    ...buildPassedRules(candidate),
    candidate.record.attribution.primary === "unknown"
      ? "transcript_visible_success"
      : candidate.record.attribution.primary,
  ].filter((value) => value.length > 0);

  return [...new Set(tags)].slice(0, 4);
}

export function buildSurfacedSession(
  kind: "review" | "exemplar",
  candidate: SessionCandidate,
): SurfacedSession {
  return {
    sessionId: candidate.record.sessionId,
    shortId: candidate.shortId,
    title: candidate.title,
    timestampLabel: candidate.timestampLabel || null,
    projectLabel: candidate.projectLabel || null,
    provider: candidate.record.metrics.provider,
    harness: candidate.record.metrics.harness,
    metrics: {
      turnCount: candidate.record.metrics.turnCount,
      writeCount: candidate.writeCount,
      incidentCount: candidate.incidentCount,
      complianceScore: candidate.complianceScore,
      endedVerified: candidate.endedVerified,
    },
    attribution: candidate.record.attribution,
    reasonTags:
      kind === "review"
        ? buildReviewReasonTags(candidate)
        : buildExemplarReasonTags(candidate),
    whyIncluded:
      kind === "review"
        ? buildReviewWhyIncluded(candidate)
        : buildExemplarWhyIncluded(candidate),
    evidencePreviews: candidate.record.context?.evidencePreviews ?? [],
    sourceRefs: candidate.record.context?.sourceRefs ?? [],
    provenance: {
      titleSource: candidate.titleSource,
      titleConfidence: candidate.titleConfidence,
      evidenceSource: candidate.evidenceSource,
      evidenceConfidence: candidate.evidenceConfidence,
      issues: candidate.evidenceIssues,
      trustFlags: buildTrustFlags(candidate),
    },
  };
}

function hasRuleStatus(
  record: SummarySessionRecord,
  ruleName: string,
  status: "pass" | "fail",
): boolean {
  return record.metrics.complianceRules.some(
    (rule) => rule.rule === ruleName && rule.status === status,
  );
}

function buildSessionSignals(record: SummarySessionRecord) {
  return {
    sessionId: record.sessionId,
    attribution: record.attribution.primary,
    endedVerifiedAfterWrite:
      record.metrics.writeCount > 0 && record.metrics.endedVerified,
    verificationPassedAfterWrite:
      record.metrics.writeCount > 0 &&
      record.metrics.verificationPassedCount > 0,
    scopeConfirmedBeforeMajorWrite: hasRuleStatus(
      record,
      "scope_confirmed_before_major_write",
      "pass",
    ),
    cwdOrRepoEchoedBeforeWrite: hasRuleStatus(
      record,
      "cwd_or_repo_echoed_before_write",
      "pass",
    ),
    shortPlanBeforeLargeChange: hasRuleStatus(
      record,
      "short_plan_before_large_change",
      "pass",
    ),
    endedUnverifiedAfterWrite:
      record.metrics.writeCount > 0 && !record.metrics.endedVerified,
    contextReinjection: (record.labels.context_reinjection ?? 0) > 0,
    interrupt: (record.labels.interrupt ?? 0) > 0,
    contextDrift: (record.labels.context_drift ?? 0) > 0,
    stalledOrGuessing: (record.labels.stalled_or_guessing ?? 0) > 0,
    regressionOrBuildBreakage:
      (record.labels.regression_report ?? 0) > 0 ||
      (record.labels.test_build_lint_failure_complaint ?? 0) > 0,
    templateHeavy:
      record.template.flags.includes("template_heavy") ||
      (record.template.textSharePct ?? 0) >= 40,
    strongUserTaskTitle:
      record.context?.leadPreviewSource === "user" &&
      record.context?.leadPreviewConfidence === "strong",
    strongEvidence:
      (record.context?.evidencePreviews.length ?? 0) > 0 &&
      record.context?.evidenceConfidence !== "weak",
  };
}

const LEARNING_PATTERN_DEFINITIONS: LearningPatternDefinition[] = [
  {
    id: "verify_after_write_before_close",
    label: "Verify after write before close",
    explanation:
      "Successful delivery sessions usually captured a passing verification after the main write work rather than stopping at the code change.",
    bucket: "whatToCopy",
    matches: (signal) =>
      signal.endedVerifiedAfterWrite && signal.verificationPassedAfterWrite,
  },
  {
    id: "confirm_scope_before_major_write",
    label: "Confirm scope before major write",
    explanation:
      "Successful sessions often included an explicit scope confirmation before the main implementation turn.",
    bucket: "whatToCopy",
    matches: (signal) => signal.scopeConfirmedBeforeMajorWrite,
  },
  {
    id: "echo_repo_or_cwd_before_write",
    label: "Echo repo or cwd before write",
    explanation:
      "Successful sessions commonly anchored work to the correct repo or cwd before editing or running project-specific commands.",
    bucket: "whatToCopy",
    matches: (signal) => signal.cwdOrRepoEchoedBeforeWrite,
  },
  {
    id: "plan_before_large_change",
    label: "Plan briefly before larger changes",
    explanation:
      "A short plan before broader edits correlated with cleaner delivery and easier verification.",
    bucket: "whatToCopy",
    matches: (signal) => signal.shortPlanBeforeLargeChange,
  },
  {
    id: "ended_unverified_after_write",
    label: "Write work ended unverified",
    explanation:
      "A repeated failure pattern was ending after edits without a visible passing verification signal.",
    bucket: "whatToAvoid",
    matches: (signal) => signal.endedUnverifiedAfterWrite,
  },
  {
    id: "scope_reinjection_or_interrupt_churn",
    label: "Scope reinjection or interrupt churn",
    explanation:
      "Repeated user redirects or scope restatements often coincided with lower-confidence execution and more review pressure.",
    bucket: "whatToAvoid",
    matches: (signal) => signal.contextReinjection || signal.interrupt,
  },
  {
    id: "agent_drift_or_guessing",
    label: "Agent drift or guessing",
    explanation:
      "Context drift and guessing behavior remained one of the clearest recurring negative execution patterns.",
    bucket: "whatToAvoid",
    matches: (signal) => signal.contextDrift || signal.stalledOrGuessing,
  },
  {
    id: "regression_or_build_breakage",
    label: "Regression or build breakage",
    explanation:
      "Regression and build-breakage complaints stayed a high-value signal for sessions that still need inspection.",
    bucket: "whatToAvoid",
    matches: (signal) => signal.regressionOrBuildBreakage,
  },
  {
    id: "user_interrupts_or_redirects",
    label: "User interrupts or redirects",
    explanation:
      "User-side interrupts or redirects frequently explained why otherwise healthy work had to be restarted or reframed.",
    bucket: "userScopePatterns",
    matches: (signal) =>
      signal.attribution === "user_scope" && signal.interrupt,
  },
  {
    id: "user_restates_constraints",
    label: "User restates constraints",
    explanation:
      "Repeated constraint restatement is a reliable user-scope signal after de-templating.",
    bucket: "userScopePatterns",
    matches: (signal) =>
      signal.attribution === "user_scope" && signal.contextReinjection,
  },
  {
    id: "agent_context_drift",
    label: "Agent loses context",
    explanation:
      "Agent-behavior attributions were often tied to visible context drift in the transcript.",
    bucket: "agentBehaviorPatterns",
    matches: (signal) =>
      signal.attribution === "agent_behavior" && signal.contextDrift,
  },
  {
    id: "agent_breakage_after_write",
    label: "Agent introduces breakage after write",
    explanation:
      "Agent-behavior sessions often combined write activity with unverified endings or explicit regression complaints.",
    bucket: "agentBehaviorPatterns",
    matches: (signal) =>
      signal.attribution === "agent_behavior" &&
      (signal.endedUnverifiedAfterWrite || signal.regressionOrBuildBreakage),
  },
  {
    id: "multi_cause_sessions",
    label: "Multiple causes stay in play",
    explanation:
      "Some sessions still showed both user-scope and agent-behavior evidence, so mixed attribution remained the most honest summary.",
    bucket: "mixedPatterns",
    matches: (signal) => signal.attribution === "mixed",
  },
  {
    id: "insufficient_transcript_visible_evidence",
    label: "Transcript-visible evidence stays inconclusive",
    explanation:
      "Unknown attribution remains appropriate when the surviving public-safe transcript surface cannot support a stronger causal claim.",
    bucket: "unknownPatterns",
    matches: (signal) => signal.attribution === "unknown",
  },
];

function buildPattern(
  definition: LearningPatternDefinition,
  records: readonly SummarySessionRecord[],
  inputs: LearningPatternInputs,
): LearningPattern | null {
  const scopedRecords =
    definition.bucket === "whatToCopy" && inputs.exemplarSessionIds
      ? records.filter((record) =>
          inputs.exemplarSessionIds?.has(record.sessionId),
        )
      : definition.bucket === "whatToAvoid" && inputs.reviewSessionIds
        ? records.filter((record) =>
            inputs.reviewSessionIds?.has(record.sessionId),
          )
        : records;

  const matching = scopedRecords.filter((record) =>
    definition.matches(buildSessionSignals(record)),
  );
  if (matching.length === 0) {
    return null;
  }

  return {
    id: definition.id,
    label: definition.label,
    explanation: definition.explanation,
    sessionCount: matching.length,
    sourceSessionIds: matching.map((record) => record.sessionId).slice(0, 3),
  };
}

export function buildLearningPatterns(
  records: readonly SummarySessionRecord[],
  inputs: LearningPatternInputs = {},
): SummaryArtifact["learningPatterns"] {
  const empty: SummaryArtifact["learningPatterns"] = {
    whatToCopy: [],
    whatToAvoid: [],
    userScopePatterns: [],
    agentBehaviorPatterns: [],
    mixedPatterns: [],
    unknownPatterns: [],
  };

  for (const definition of LEARNING_PATTERN_DEFINITIONS) {
    const pattern = buildPattern(definition, records, inputs);
    if (!pattern) {
      continue;
    }

    empty[definition.bucket].push(pattern);
  }

  for (const bucket of Object.keys(empty) as PatternBucket[]) {
    empty[bucket].sort(
      (left, right) =>
        (right.sessionCount ?? 0) - (left.sessionCount ?? 0) ||
        left.id.localeCompare(right.id),
    );
  }

  return empty;
}
