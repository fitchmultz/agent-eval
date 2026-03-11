/**
 * Purpose: Defines the strict typed schema shared by discovery, parsing, clustering, scoring, and artifact output.
 * Entrypoint: Exported Zod schemas and inferred types are consumed by runtime modules and tests.
 * Notes: Transcript JSONL is canonical input; all non-transcript sources are optional enrichment only.
 */
import { z } from "zod";
import { sourceProviderValues } from "./sources.js";

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

export type LabelName = (typeof labelTaxonomy)[number];
export type Severity = (typeof severityValues)[number];
export type Confidence = (typeof confidenceValues)[number];
export type LabelFamily = (typeof labelFamilyValues)[number];
export type SessionArchetype = (typeof sessionArchetypeValues)[number];
export type SourceProvider = (typeof sourceProviderValues)[number];
export type SourceKind = (typeof sourceKindValues)[number];
export type ToolCategory = (typeof toolCategoryValues)[number];
export type ComplianceRuleName = (typeof complianceRuleValues)[number];
export type ComplianceStatus = (typeof complianceStatusValues)[number];

export const sourceRefSchema = z.object({
  provider: z.enum(sourceProviderValues),
  kind: z.enum(sourceKindValues),
  path: z.string().min(1),
  line: z.int().positive().optional(),
  table: z.string().min(1).optional(),
  rowId: z.union([z.string().min(1), z.int().positive()]).optional(),
});

export const labelRecordSchema = z.object({
  label: z.enum(labelTaxonomy),
  family: z.enum(labelFamilyValues),
  severity: z.enum(severityValues),
  confidence: z.enum(confidenceValues),
  rationale: z.string().min(1),
});

export const toolCallSummarySchema = z.object({
  toolName: z.string().min(1),
  category: z.enum(toolCategoryValues),
  commandText: z.string().optional(),
  writeLike: z.boolean(),
  verificationLike: z.boolean(),
  status: z.enum(["completed", "errored", "unknown"]),
});

export const rawTurnSchema = z.object({
  engineVersion: z.string().min(1),
  schemaVersion: z.string().min(1),
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
});

export const incidentSchema = z.object({
  engineVersion: z.string().min(1),
  schemaVersion: z.string().min(1),
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
});

export const complianceRuleResultSchema = z.object({
  rule: z.enum(complianceRuleValues),
  status: z.enum(complianceStatusValues),
  rationale: z.string().min(1),
});

export const sessionMetricsSchema = z.object({
  sessionId: z.string().min(1),
  provider: z.enum(sourceProviderValues),
  turnCount: z.int().nonnegative(),
  labeledTurnCount: z.int().nonnegative(),
  incidentCount: z.int().nonnegative(),
  parseWarningCount: z.int().nonnegative(),
  writeCount: z.int().nonnegative(),
  verificationCount: z.int().nonnegative(),
  verificationPassedCount: z.int().nonnegative(),
  verificationFailedCount: z.int().nonnegative(),
  postWriteVerificationAttempted: z.boolean(),
  postWriteVerificationPassed: z.boolean(),
  endedVerified: z.boolean(),
  complianceScore: z.int().min(0).max(100),
  complianceRules: z.array(complianceRuleResultSchema),
});

export const inventoryRecordSchema = z.object({
  provider: z.enum(sourceProviderValues),
  kind: z.enum(sourceKindValues),
  path: z.string().min(1),
  discovered: z.boolean(),
  required: z.boolean(),
  optional: z.boolean(),
});

export const complianceAggregateSchema = z.object({
  rule: z.enum(complianceRuleValues),
  passCount: z.int().nonnegative(),
  failCount: z.int().nonnegative(),
  notApplicableCount: z.int().nonnegative(),
  unknownCount: z.int().nonnegative(),
});

export const labelCountSchema = z.object({
  context_drift: z.int().nonnegative().optional(),
  test_build_lint_failure_complaint: z.int().nonnegative().optional(),
  interrupt: z.int().nonnegative().optional(),
  regression_report: z.int().nonnegative().optional(),
  praise: z.int().nonnegative().optional(),
  context_reinjection: z.int().nonnegative().optional(),
  verification_request: z.int().nonnegative().optional(),
  stalled_or_guessing: z.int().nonnegative().optional(),
});

export const metricsSchema = z.object({
  engineVersion: z.string().min(1),
  schemaVersion: z.string().min(1),
  generatedAt: z.string().min(1),
  sessionCount: z.int().nonnegative(),
  turnCount: z.int().nonnegative(),
  incidentCount: z.int().nonnegative(),
  parseWarningCount: z.int().nonnegative(),
  labelCounts: labelCountSchema,
  complianceSummary: z.array(complianceAggregateSchema),
  sessions: z.array(sessionMetricsSchema),
  inventory: z.array(inventoryRecordSchema),
});

const summaryCardToneSchema = z.enum(["neutral", "good", "warn", "danger"]);

const valueCardSchema = z.object({
  title: z.string().min(1),
  value: z.string().min(1),
  detail: z.string().min(1),
  tone: summaryCardToneSchema,
});

const sessionHighlightSchema = z.object({
  sessionId: z.string().min(1),
  archetype: z.enum(sessionArchetypeValues),
  archetypeLabel: z.string().min(1),
  frictionScore: z.number().nonnegative(),
  complianceScore: z.int().min(0).max(100),
  incidentCount: z.int().nonnegative(),
  labeledTurnCount: z.int().nonnegative(),
  writeCount: z.int().nonnegative(),
  endedVerified: z.boolean(),
  verificationPassedCount: z.int().nonnegative(),
  dominantLabels: z.array(z.enum(labelTaxonomy)),
  note: z.string().min(1),
});

const summaryCoreSchema = z.object({
  engineVersion: z.string().min(1),
  schemaVersion: z.string().min(1),
  generatedAt: z.string().min(1),
  sessions: z.int().nonnegative(),
  turns: z.int().nonnegative(),
  incidents: z.int().nonnegative(),
  parseWarningCount: z.int().nonnegative(),
  labels: z.array(
    z.object({
      label: z.enum(labelTaxonomy),
      count: z.int().nonnegative(),
    }),
  ),
  severities: z.array(
    z.object({
      severity: z.enum(severityValues),
      count: z.int().nonnegative(),
    }),
  ),
  compliance: z.array(complianceAggregateSchema),
  rates: z.object({
    incidentsPer100Turns: z.number().nonnegative(),
    writesPer100Turns: z.number().nonnegative(),
    verificationRequestsPer100Turns: z.number().nonnegative(),
    interruptionsPer100Turns: z.number().nonnegative(),
    reinjectionsPer100Turns: z.number().nonnegative(),
    praisePer100Turns: z.number().nonnegative(),
  }),
  delivery: z.object({
    sessionsWithWrites: z.int().nonnegative(),
    sessionsEndingVerified: z.int().nonnegative(),
    writeSessionVerificationRate: z.number().nonnegative(),
  }),
  comparativeSlices: z.array(
    z.object({
      key: z.string().min(1),
      label: z.string().min(1),
      sessionCount: z.int().nonnegative(),
      turnCount: z.int().nonnegative(),
      incidentCount: z.int().nonnegative(),
      verificationProxyScore: z.int().min(0).max(100),
      flowProxyScore: z.int().min(0).max(100),
      workflowProxyScore: z.int().min(0).max(100),
      writeSessionVerificationRate: z.number().nonnegative(),
      incidentsPer100Turns: z.number().nonnegative(),
    }),
  ),
  topSessions: z.array(sessionHighlightSchema),
  topIncidents: z.array(
    z.object({
      incidentId: z.string().min(1),
      sessionId: z.string().min(1),
      summary: z.string().min(1),
      severity: z.enum(severityValues),
      confidence: z.enum(confidenceValues),
      turnSpan: z.int().positive(),
      evidencePreview: z.string().min(1).optional(),
    }),
  ),
});

const summaryPresentationSchema = z.object({
  scoreCards: z.array(
    z.object({
      title: z.string().min(1),
      score: z.int().min(0).max(100),
      detail: z.string().min(1),
      tone: summaryCardToneSchema,
    }),
  ),
  highlightCards: z.array(valueCardSchema),
  recognitions: z.array(z.string().min(1)),
  endedVerifiedDeliverySpotlights: z.array(sessionHighlightSchema),
  opportunities: z.array(
    z.object({
      title: z.string().min(1),
      rationale: z.string().min(1),
    }),
  ),
});

export const summaryArtifactSchema = summaryCoreSchema.merge(
  summaryPresentationSchema,
);

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
export type SummaryArtifact = z.infer<typeof summaryArtifactSchema>;
