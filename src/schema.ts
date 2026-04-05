/**
 * Purpose: Defines the strict typed schema shared by discovery, parsing, clustering, scoring, and artifact output.
 * Entrypoint: Exported Zod schemas and inferred types are consumed by runtime modules and tests.
 * Notes: Transcript JSONL is canonical input; all non-transcript sources are optional enrichment only.
 */
import { z } from "zod";
import { sourceProviderValues } from "./sources.js";
import { SCHEMA_VERSION } from "./version.js";

export const labelTaxonomy = [
  "context_drift",
  "test_build_lint_failure_complaint",
  "interrupt",
  "regression_report",
  "praise",
  "context_reinjection",
  "verification_request",
  "stalled_or_guessing",
] as const;

export const severityValues = ["info", "low", "medium", "high"] as const;
export const confidenceValues = ["low", "medium", "high"] as const;
export const labelFamilyValues = ["incident", "cue", "positive"] as const;
export const sessionArchetypeValues = [
  "verified_delivery",
  "unverified_delivery",
  "high_friction_verified_delivery",
  "analysis_only",
] as const;
export { sourceProviderValues };
export const sourceKindValues = [
  "session_jsonl",
  "state_sqlite",
  "history_jsonl",
  "tui_log",
  "codex_dev_db",
  "shell_snapshot",
  "session_env",
] as const;
export const toolCategoryValues = ["write", "verification", "other"] as const;
export const toolFamilyValues = [
  "write",
  "verification",
  "shell",
  "read",
  "search",
  "mcp",
  "other",
] as const;
export const timeBucketValues = ["day", "week", "month"] as const;
export const complianceRuleValues = [
  "scope_confirmed_before_major_write",
  "cwd_or_repo_echoed_before_write",
  "short_plan_before_large_change",
  "verification_after_code_changes",
  "no_unverified_ending",
] as const;
export const complianceStatusValues = [
  "pass",
  "fail",
  "not_applicable",
  "unknown",
] as const;
export const summaryConfidenceValues = ["strong", "medium", "weak"] as const;
export const sessionTitleSourceValues = [
  "user",
  "assistant",
  "metadata",
] as const;
export const evidenceSourceValues = [
  "user",
  "assistant",
  "mixed",
  "none",
] as const;
export const incidentTitleSourceValues = [
  "label_summary",
  "incident_summary",
] as const;
export const incidentEvidenceSourceValues = [
  "incident_preview",
  "session_user_preview",
  "session_assistant_preview",
  "session_mixed_preview",
  "none",
] as const;
export const evidenceIssueValues = [
  "missing_evidence",
  "missing_source_refs",
  "metadata_fallback_title",
  "assistant_fallback_title",
  "code_like_title",
  "truncated_evidence",
  "low_signal_evidence",
] as const;
export const incidentIssueValues = [
  "missing_evidence",
  "missing_source_refs",
  "summary_fallback_title",
  "session_fallback_evidence",
  "truncated_evidence",
  "low_signal_evidence",
] as const;
export const attributionPrimaryValues = [
  "user_scope",
  "agent_behavior",
  "template_artifact",
  "mixed",
  "unknown",
] as const;
export const summaryNoteLevelValues = ["info", "warning"] as const;
export const comparativeSliceKindValues = [
  "selected_corpus",
  "time_window",
  "provider",
  "harness",
  "workload",
  "template_band",
] as const;

export type LabelName = (typeof labelTaxonomy)[number];
export type Severity = (typeof severityValues)[number];
export type Confidence = (typeof confidenceValues)[number];
export type LabelFamily = (typeof labelFamilyValues)[number];
export type SessionArchetype = (typeof sessionArchetypeValues)[number];
export type SourceProvider = (typeof sourceProviderValues)[number];
export type SourceKind = (typeof sourceKindValues)[number];
export type ToolCategory = (typeof toolCategoryValues)[number];
export type ToolFamily = (typeof toolFamilyValues)[number];
export type TimeBucket = (typeof timeBucketValues)[number];
export type ComplianceRuleName = (typeof complianceRuleValues)[number];
export type ComplianceStatus = (typeof complianceStatusValues)[number];
export type SummaryConfidence = (typeof summaryConfidenceValues)[number];
export type SessionTitleSource = (typeof sessionTitleSourceValues)[number];
export type IncidentTitleSource = (typeof incidentTitleSourceValues)[number];
export type EvidenceSource = (typeof evidenceSourceValues)[number];
export type IncidentEvidenceSource =
  (typeof incidentEvidenceSourceValues)[number];
export type EvidenceIssue = (typeof evidenceIssueValues)[number];
export type IncidentIssue = (typeof incidentIssueValues)[number];
export type AttributionPrimary = (typeof attributionPrimaryValues)[number];
export type SummaryNoteLevel = (typeof summaryNoteLevelValues)[number];
export type ComparativeSliceKind = (typeof comparativeSliceKindValues)[number];

export const sourceRefSchema = z
  .object({
    provider: z.enum(sourceProviderValues),
    kind: z.enum(sourceKindValues),
    path: z.string().min(1),
    line: z.int().positive().optional(),
    table: z.string().min(1).optional(),
    rowId: z.union([z.string().min(1), z.int().positive()]).optional(),
  })
  .strict();

export const labelRecordSchema = z
  .object({
    label: z.enum(labelTaxonomy),
    family: z.enum(labelFamilyValues),
    severity: z.enum(severityValues),
    confidence: z.enum(confidenceValues),
    rationale: z.string().min(1),
  })
  .strict();

export const toolCallSummarySchema = z
  .object({
    toolName: z.string().min(1),
    normalizedToolName: z.string().min(1).optional(),
    toolFamily: z.enum(toolFamilyValues).optional(),
    isMcp: z.boolean().optional(),
    mcpServer: z.string().min(1).optional(),
    mcpToolName: z.string().min(1).optional(),
    category: z.enum(toolCategoryValues),
    commandText: z.string().optional(),
    writeLike: z.boolean(),
    verificationLike: z.boolean(),
    status: z.enum(["completed", "errored", "unknown"]),
  })
  .strict();

const schemaVersionSchema = z.literal(SCHEMA_VERSION);

export const rawTurnSchema = z
  .object({
    engineVersion: z.string().min(1),
    schemaVersion: schemaVersionSchema,
    sessionId: z.string().min(1),
    parentSessionId: z.string().min(1).optional(),
    turnId: z.string().min(1).optional(),
    turnIndex: z.int().nonnegative(),
    startedAt: z.string().min(1).optional(),
    cwd: z.string().min(1).optional(),
    userMessageCount: z.int().nonnegative(),
    assistantMessageCount: z.int().nonnegative(),
    userMessagePreviews: z.array(z.string()),
    assistantMessagePreviews: z.array(z.string()),
    toolCalls: z.array(toolCallSummarySchema),
    labels: z.array(labelRecordSchema),
    sourceRefs: z.array(sourceRefSchema).min(1),
  })
  .strict();

export const incidentSchema = z
  .object({
    engineVersion: z.string().min(1),
    schemaVersion: schemaVersionSchema,
    incidentId: z.string().min(1),
    sessionId: z.string().min(1),
    turnIds: z.array(z.string().min(1)),
    turnIndices: z.array(z.int().nonnegative()),
    labels: z.array(labelRecordSchema).min(1),
    summary: z.string().min(1),
    evidencePreviews: z.array(z.string()),
    severity: z.enum(severityValues),
    confidence: z.enum(confidenceValues),
    firstSeenAt: z.string().min(1).optional(),
    lastSeenAt: z.string().min(1).optional(),
    sourceRefs: z.array(sourceRefSchema).min(1),
  })
  .strict();

export const complianceRuleResultSchema = z
  .object({
    rule: z.enum(complianceRuleValues),
    status: z.enum(complianceStatusValues),
    rationale: z.string().min(1),
  })
  .strict();

const countedToolSchema = z
  .object({
    toolName: z.string().min(1),
    count: z.int().nonnegative(),
  })
  .strict();

const toolFamilyCountSchema = z
  .object({
    family: z.enum(toolFamilyValues),
    count: z.int().nonnegative(),
  })
  .strict();

const mcpServerCountSchema = z
  .object({
    server: z.string().min(1),
    toolCallCount: z.int().nonnegative(),
  })
  .strict();

const coverageStatsSchema = z
  .object({
    coveredSessionCount: z.int().nonnegative(),
    totalSessionCount: z.int().nonnegative(),
    coveragePct: z.number().nonnegative().nullable(),
  })
  .strict();

const metricsDistributionEntrySchema = z
  .object({
    key: z.string().min(1),
    label: z.string().min(1),
    count: z.int().nonnegative(),
    pct: z.number().nonnegative().nullable(),
  })
  .strict();

const metricsDistributionWithCoverageSchema = z
  .object({
    values: z.array(metricsDistributionEntrySchema),
    coverage: coverageStatsSchema,
  })
  .strict();

const temporalBucketEntrySchema = z
  .object({
    key: z.string().min(1),
    label: z.string().min(1),
    sessionCount: z.int().nonnegative(),
    writeSessionCount: z.int().nonnegative(),
    endedVerifiedCount: z.int().nonnegative(),
    incidentCount: z.int().nonnegative(),
  })
  .strict();

const metricsAppliedFiltersSchema = z
  .object({
    startDate: z.string().min(1).nullable(),
    endDate: z.string().min(1).nullable(),
    sessionLimit: z.int().positive().nullable(),
    timeBucket: z.enum(timeBucketValues),
    discoveredSessionCount: z.int().nonnegative(),
    eligibleSessionCount: z.int().nonnegative(),
    undatedExcludedCount: z.int().nonnegative(),
  })
  .strict();

export const sessionMetricsSchema = z
  .object({
    sessionId: z.string().min(1),
    provider: z.enum(sourceProviderValues),
    harness: z.string().min(1).nullable(),
    modelProvider: z.string().min(1).nullable(),
    model: z.string().min(1).nullable(),
    startedAt: z.string().min(1).nullable(),
    endedAt: z.string().min(1).nullable(),
    durationMs: z.number().nonnegative().nullable(),
    turnCount: z.int().nonnegative(),
    labeledTurnCount: z.int().nonnegative(),
    incidentCount: z.int().nonnegative(),
    parseWarningCount: z.int().nonnegative(),
    userMessageCount: z.int().nonnegative(),
    assistantMessageCount: z.int().nonnegative(),
    toolCallCount: z.int().nonnegative(),
    writeToolCallCount: z.int().nonnegative(),
    verificationToolCallCount: z.int().nonnegative(),
    mcpToolCallCount: z.int().nonnegative(),
    topTools: z.array(countedToolSchema),
    toolFamilies: z.array(toolFamilyCountSchema),
    mcpServers: z.array(mcpServerCountSchema),
    inputTokens: z.number().nonnegative().nullable(),
    outputTokens: z.number().nonnegative().nullable(),
    totalTokens: z.number().nonnegative().nullable(),
    compactionCount: z.int().nonnegative().nullable(),
    writeCount: z.int().nonnegative(),
    verificationCount: z.int().nonnegative(),
    verificationPassedCount: z.int().nonnegative(),
    verificationFailedCount: z.int().nonnegative(),
    postWriteVerificationAttempted: z.boolean(),
    postWriteVerificationPassed: z.boolean(),
    endedVerified: z.boolean(),
    complianceScore: z.int().min(0).max(100),
    complianceRules: z.array(complianceRuleResultSchema),
  })
  .strict();

export const inventoryRecordSchema = z
  .object({
    provider: z.enum(sourceProviderValues),
    kind: z.enum(sourceKindValues),
    path: z.string().min(1),
    discovered: z.boolean(),
    required: z.boolean(),
    optional: z.boolean(),
  })
  .strict();

export const complianceAggregateSchema = z
  .object({
    rule: z.enum(complianceRuleValues),
    passCount: z.int().nonnegative(),
    failCount: z.int().nonnegative(),
    notApplicableCount: z.int().nonnegative(),
    unknownCount: z.int().nonnegative(),
  })
  .strict();

export const summaryComplianceAggregateSchema = complianceAggregateSchema
  .extend({
    passRate: z.number().nonnegative(),
    affectedSessionCount: z.int().nonnegative(),
  })
  .strict();

export const labelCountSchema = z
  .object({
    context_drift: z.int().nonnegative().optional(),
    test_build_lint_failure_complaint: z.int().nonnegative().optional(),
    interrupt: z.int().nonnegative().optional(),
    regression_report: z.int().nonnegative().optional(),
    praise: z.int().nonnegative().optional(),
    context_reinjection: z.int().nonnegative().optional(),
    verification_request: z.int().nonnegative().optional(),
    stalled_or_guessing: z.int().nonnegative().optional(),
  })
  .strict();

export const metricsSchema = z
  .object({
    engineVersion: z.string().min(1),
    schemaVersion: schemaVersionSchema,
    generatedAt: z.string().min(1),
    sessionCount: z.int().nonnegative(),
    corpusScope: z
      .object({
        selection: z.enum([
          "all_discovered",
          "date_filtered",
          "most_recent_window",
          "date_filtered_window",
        ]),
        discoveredSessionCount: z.int().nonnegative(),
        eligibleSessionCount: z.int().nonnegative().optional(),
        appliedSessionLimit: z.int().positive().nullable(),
        startDate: z.string().min(1).nullable().optional(),
        endDate: z.string().min(1).nullable().optional(),
        timeBucket: z.enum(timeBucketValues).optional(),
        undatedExcludedCount: z.int().nonnegative().optional(),
      })
      .strict(),
    appliedFilters: metricsAppliedFiltersSchema,
    turnCount: z.int().nonnegative(),
    incidentCount: z.int().nonnegative(),
    parseWarningCount: z.int().nonnegative(),
    labelCounts: labelCountSchema,
    complianceSummary: z.array(complianceAggregateSchema),
    providerDistribution: z.array(metricsDistributionEntrySchema),
    harnessDistribution: metricsDistributionWithCoverageSchema,
    modelDistribution: metricsDistributionWithCoverageSchema,
    messageStats: z
      .object({
        totalUserMessages: z.int().nonnegative(),
        totalAssistantMessages: z.int().nonnegative(),
        avgUserMessagesPerSession: z.number().nonnegative().nullable(),
        avgAssistantMessagesPerSession: z.number().nonnegative().nullable(),
      })
      .strict(),
    toolStats: z
      .object({
        totalToolCallCount: z.int().nonnegative(),
        totalWriteToolCallCount: z.int().nonnegative(),
        totalVerificationToolCallCount: z.int().nonnegative(),
        avgToolCallsPerSession: z.number().nonnegative().nullable(),
        avgWriteToolCallsPerSession: z.number().nonnegative().nullable(),
        avgVerificationToolCallsPerSession: z.number().nonnegative().nullable(),
        topTools: z.array(metricsDistributionEntrySchema),
        toolFamilyDistribution: z.array(metricsDistributionEntrySchema),
      })
      .strict(),
    mcpStats: z
      .object({
        sessionCountWithMcp: z.int().nonnegative(),
        sessionSharePct: z.number().nonnegative().nullable(),
        totalToolCallCount: z.int().nonnegative(),
        serverDistribution: z.array(metricsDistributionEntrySchema),
      })
      .strict(),
    tokenStats: z
      .object({
        coverage: coverageStatsSchema,
        inputTokensAvg: z.number().nonnegative().nullable(),
        outputTokensAvg: z.number().nonnegative().nullable(),
        totalTokensAvg: z.number().nonnegative().nullable(),
      })
      .strict(),
    durationStats: z
      .object({
        coverage: coverageStatsSchema,
        avgDurationMs: z.number().nonnegative().nullable(),
        medianDurationMs: z.number().nonnegative().nullable(),
      })
      .strict(),
    compactionStats: z
      .object({
        coverage: coverageStatsSchema,
        avgCompactionCount: z.number().nonnegative().nullable(),
        sessionCountWithCompaction: z.int().nonnegative(),
        sessionSharePct: z.number().nonnegative().nullable(),
      })
      .strict(),
    attributionSummary: z
      .object({
        user_scope: z.int().nonnegative(),
        agent_behavior: z.int().nonnegative(),
        template_artifact: z.int().nonnegative(),
        mixed: z.int().nonnegative(),
        unknown: z.int().nonnegative(),
      })
      .strict(),
    templateSubstrate: z
      .object({
        affectedSessionCount: z.int().nonnegative().nullable(),
        affectedSessionPct: z.number().nonnegative().nullable(),
        estimatedTemplateTextSharePct: z.number().nonnegative().nullable(),
        topFamilies: z.array(
          z
            .object({
              familyId: z.string().min(1),
              label: z.string().min(1),
              affectedSessionCount: z.int().nonnegative(),
              estimatedTextSharePct: z.number().nonnegative().nullable(),
            })
            .strict(),
        ),
      })
      .strict(),
    temporalBuckets: z
      .object({
        bucket: z.enum(timeBucketValues),
        values: z.array(temporalBucketEntrySchema),
      })
      .strict(),
    coverageWarnings: z.array(z.string().min(1)),
    sampleWarnings: z.array(z.string().min(1)),
    sessions: z.array(sessionMetricsSchema),
    inventory: z.array(inventoryRecordSchema),
  })
  .strict();

const summaryNoteSchema = z
  .object({
    code: z.string().min(1),
    level: z.enum(summaryNoteLevelValues),
    message: z.string().min(1),
  })
  .strict();

const summaryFilterSchema = z
  .object({
    key: z.string().min(1),
    label: z.string().min(1),
    value: z.string().min(1),
  })
  .strict();

const distributionEntrySchema = z
  .object({
    key: z.string().min(1),
    label: z.string().min(1),
    count: z.int().nonnegative(),
    pct: z.number().nonnegative().nullable(),
  })
  .strict();

const surfacedSessionMetricsSchema = z
  .object({
    turnCount: z.int().nonnegative().nullable(),
    writeCount: z.int().nonnegative().nullable(),
    incidentCount: z.int().nonnegative().nullable(),
    complianceScore: z.number().nonnegative().nullable(),
    endedVerified: z.boolean().nullable(),
  })
  .strict();

const surfacedSessionAttributionSchema = z
  .object({
    primary: z.enum(attributionPrimaryValues),
    confidence: z.enum(confidenceValues),
    reasons: z.array(z.string().min(1)),
  })
  .strict();

const surfacedSessionProvenanceSchema = z
  .object({
    titleSource: z.enum(sessionTitleSourceValues),
    titleConfidence: z.enum(summaryConfidenceValues),
    evidenceSource: z.enum(evidenceSourceValues),
    evidenceConfidence: z.enum(summaryConfidenceValues),
    issues: z.array(z.string().min(1)),
    trustFlags: z.array(z.string().min(1)),
  })
  .strict();

const surfacedSessionSchema = z
  .object({
    sessionId: z.string().min(1),
    shortId: z.string().min(1),
    title: z.string().min(1),
    timestampLabel: z.string().min(1).nullable(),
    projectLabel: z.string().min(1).nullable(),
    provider: z.enum(sourceProviderValues).nullable(),
    harness: z.string().min(1).nullable(),
    metrics: surfacedSessionMetricsSchema,
    attribution: surfacedSessionAttributionSchema,
    reasonTags: z.array(z.string().min(1)),
    whyIncluded: z.array(z.string().min(1)),
    evidencePreviews: z.array(z.string().min(1)),
    sourceRefs: z.array(sourceRefSchema),
    provenance: surfacedSessionProvenanceSchema,
  })
  .strict();

const learningPatternSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    explanation: z.string().min(1),
    sessionCount: z.int().nonnegative().nullable(),
    sourceSessionIds: z.array(z.string().min(1)),
  })
  .strict();

const comparativeSliceSchema = z
  .object({
    key: z.string().min(1),
    label: z.string().min(1),
    kind: z.enum(comparativeSliceKindValues),
    filters: z.array(summaryFilterSchema),
    metrics: z
      .object({
        sessionCount: z.int().nonnegative(),
        turnCount: z.int().nonnegative(),
        incidentCount: z.int().nonnegative(),
        writeSessionCount: z.int().nonnegative().nullable(),
        endedVerifiedCount: z.int().nonnegative().nullable(),
        endedUnverifiedCount: z.int().nonnegative().nullable(),
        incidentsPer100Turns: z.number().nonnegative().nullable(),
        interruptRatePer100Turns: z.number().nonnegative().nullable(),
      })
      .strict(),
    notes: z.array(summaryNoteSchema),
  })
  .strict();

export const summaryArtifactSchema = z
  .object({
    engineVersion: z.string().min(1),
    schemaVersion: schemaVersionSchema,
    generatedAt: z.string().min(1),
    overview: z
      .object({
        title: z.string().min(1),
        corpusContext: z.string().min(1),
        appliedFilters: z.array(summaryFilterSchema),
        coverageNotes: z.array(summaryNoteSchema),
        sampleNotes: z.array(summaryNoteSchema),
        highlights: z.array(z.string().min(1)),
      })
      .strict(),
    usageDashboard: z
      .object({
        headlineMetrics: z
          .object({
            sessions: z.int().nonnegative(),
            writeSessions: z.int().nonnegative(),
            endedVerified: z.int().nonnegative(),
            endedUnverified: z.int().nonnegative(),
            avgUserMessagesPerSession: z.number().nonnegative().nullable(),
            avgAssistantMessagesPerSession: z.number().nonnegative().nullable(),
            avgToolCallsPerSession: z.number().nonnegative().nullable(),
            mcpSessionShare: z.number().nonnegative().nullable(),
            interruptRatePer100Turns: z.number().nonnegative().nullable(),
            compactionRate: z.number().nonnegative().nullable(),
          })
          .strict(),
        distributions: z
          .object({
            providers: z.array(distributionEntrySchema),
            harnesses: z.array(distributionEntrySchema),
            models: z.array(distributionEntrySchema),
            toolFamilies: z.array(distributionEntrySchema),
            attribution: z.array(distributionEntrySchema),
          })
          .strict(),
        tokenCoverage: z
          .object({
            coveredSessionCount: z.int().nonnegative(),
            totalSessionCount: z.int().nonnegative(),
            coveragePct: z.number().nonnegative().nullable(),
          })
          .strict()
          .nullable(),
        tokenStats: z
          .object({
            inputTokensAvg: z.number().nonnegative().nullable(),
            outputTokensAvg: z.number().nonnegative().nullable(),
            totalTokensAvg: z.number().nonnegative().nullable(),
          })
          .strict()
          .nullable(),
        diagnostics: z
          .object({
            labelCounts: z.array(
              z
                .object({
                  label: z.enum(labelTaxonomy),
                  count: z.int().nonnegative(),
                })
                .strict(),
            ),
            incidentSeverities: z.array(
              z
                .object({
                  severity: z.enum(severityValues),
                  count: z.int().nonnegative(),
                })
                .strict(),
            ),
            compliance: z.array(summaryComplianceAggregateSchema),
          })
          .strict(),
        notes: z.array(summaryNoteSchema),
      })
      .strict(),
    exemplarSessions: z.array(surfacedSessionSchema),
    reviewQueue: z.array(surfacedSessionSchema),
    attributionSummary: z
      .object({
        counts: z
          .object({
            user_scope: z.int().nonnegative(),
            agent_behavior: z.int().nonnegative(),
            template_artifact: z.int().nonnegative(),
            mixed: z.int().nonnegative(),
            unknown: z.int().nonnegative(),
          })
          .strict(),
        notes: z.array(summaryNoteSchema),
      })
      .strict(),
    templateSubstrate: z
      .object({
        affectedSessionCount: z.int().nonnegative().nullable(),
        affectedSessionPct: z.number().nonnegative().nullable(),
        estimatedTemplateTextSharePct: z.number().nonnegative().nullable(),
        topFamilies: z.array(
          z
            .object({
              familyId: z.string().min(1),
              label: z.string().min(1),
              affectedSessionCount: z.int().nonnegative(),
              estimatedTextSharePct: z.number().nonnegative().nullable(),
            })
            .strict(),
        ),
        notes: z.array(summaryNoteSchema),
      })
      .strict(),
    learningPatterns: z
      .object({
        whatToCopy: z.array(learningPatternSchema),
        whatToAvoid: z.array(learningPatternSchema),
        userScopePatterns: z.array(learningPatternSchema),
        agentBehaviorPatterns: z.array(learningPatternSchema),
        mixedPatterns: z.array(learningPatternSchema),
        unknownPatterns: z.array(learningPatternSchema),
      })
      .strict(),
    comparativeSlices: z.array(comparativeSliceSchema),
  })
  .strict();

export const sessionFactSchema = z
  .object({
    engineVersion: z.string().min(1),
    schemaVersion: schemaVersionSchema,
    sessionId: z.string().min(1),
    shortId: z.string().min(1),
    provider: z.enum(sourceProviderValues),
    harness: z.string().min(1).nullable(),
    modelProvider: z.string().min(1).nullable(),
    model: z.string().min(1).nullable(),
    startedAt: z.string().min(1).nullable(),
    endedAt: z.string().min(1).nullable(),
    durationMs: z.number().nonnegative().nullable(),
    metrics: z
      .object({
        turnCount: z.int().nonnegative(),
        userMessageCount: z.int().nonnegative().nullable(),
        assistantMessageCount: z.int().nonnegative().nullable(),
        toolCallCount: z.int().nonnegative().nullable(),
        writeToolCallCount: z.int().nonnegative().nullable(),
        verificationToolCallCount: z.int().nonnegative().nullable(),
        mcpToolCallCount: z.int().nonnegative().nullable(),
        writeCount: z.int().nonnegative(),
        verificationCount: z.int().nonnegative(),
        endedVerified: z.boolean(),
        complianceScore: z.int().min(0).max(100),
        failedRules: z.array(z.string().min(1)),
      })
      .strict(),
    topTools: z.array(
      z
        .object({
          toolName: z.string().min(1),
          count: z.int().nonnegative(),
        })
        .strict(),
    ),
    mcpServers: z.array(
      z
        .object({
          server: z.string().min(1),
          toolCallCount: z.int().nonnegative(),
        })
        .strict(),
    ),
    rawLabelCounts: z
      .array(
        z
          .object({
            label: z.enum(labelTaxonomy),
            count: z.int().nonnegative(),
          })
          .strict(),
      )
      .nullable(),
    deTemplatedLabelCounts: z
      .array(
        z
          .object({
            label: z.enum(labelTaxonomy),
            count: z.int().nonnegative(),
          })
          .strict(),
      )
      .nullable(),
    template: z
      .object({
        artifactScore: z.number().nonnegative().nullable(),
        textSharePct: z.number().nonnegative().nullable(),
        flags: z.array(z.string().min(1)),
      })
      .strict(),
    attribution: surfacedSessionAttributionSchema,
    title: z.string().min(1).nullable(),
    evidencePreviews: z.array(z.string().min(1)),
    sourceRefs: z.array(sourceRefSchema),
    surfacedIn: z
      .object({
        exemplar: z.boolean(),
        reviewQueue: z.boolean(),
      })
      .strict(),
  })
  .strict();

export type SourceRef = z.infer<typeof sourceRefSchema>;
export type LabelRecord = z.infer<typeof labelRecordSchema>;
export type ToolCallSummary = z.infer<typeof toolCallSummarySchema>;
export type RawTurnRecord = z.infer<typeof rawTurnSchema>;
export type IncidentRecord = z.infer<typeof incidentSchema>;
export type ComplianceRuleResult = z.infer<typeof complianceRuleResultSchema>;
export type SessionMetrics = z.infer<typeof sessionMetricsSchema>;
export type InventoryRecord = z.infer<typeof inventoryRecordSchema>;
export type ComplianceAggregate = z.infer<typeof complianceAggregateSchema>;
export type LabelCountRecord = z.infer<typeof labelCountSchema>;
export type MetricsRecord = z.infer<typeof metricsSchema>;
export type SummaryNote = z.infer<typeof summaryNoteSchema>;
export type SummaryFilter = z.infer<typeof summaryFilterSchema>;
export type DistributionEntry = z.infer<typeof distributionEntrySchema>;
export type SurfacedSession = z.infer<typeof surfacedSessionSchema>;
export type LearningPattern = z.infer<typeof learningPatternSchema>;
export type ComparativeSlice = z.infer<typeof comparativeSliceSchema>;
export type SummaryArtifact = z.infer<typeof summaryArtifactSchema>;
export type SessionFactRecord = z.infer<typeof sessionFactSchema>;
