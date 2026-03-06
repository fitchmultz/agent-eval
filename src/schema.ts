/**
 * Purpose: Defines the strict typed schema shared by discovery, parsing, clustering, scoring, and artifact output.
 * Entrypoint: Exported Zod schemas and inferred types are consumed by runtime modules and tests.
 * Notes: Transcript JSONL is canonical input; all non-transcript sources are optional enrichment only.
 */
import { z } from "zod";

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
export const sessionArchetypeValues = [
  "verified_delivery",
  "unverified_delivery",
  "high_friction_recovery",
  "interrupted_non_write",
  "analysis_only",
] as const;
export const sourceKindValues = [
  "session_jsonl",
  "state_sqlite",
  "history_jsonl",
  "tui_log",
  "codex_dev_db",
  "shell_snapshot",
] as const;
export const toolCategoryValues = [
  "read",
  "write",
  "verification",
  "search",
  "planning",
  "delegation",
  "other",
] as const;
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
export type SessionArchetype = (typeof sessionArchetypeValues)[number];
export type SourceKind = (typeof sourceKindValues)[number];
export type ToolCategory = (typeof toolCategoryValues)[number];
export type ComplianceRuleName = (typeof complianceRuleValues)[number];
export type ComplianceStatus = (typeof complianceStatusValues)[number];

export const sourceRefSchema = z.object({
  kind: z.enum(sourceKindValues),
  path: z.string().min(1),
  line: z.int().positive().optional(),
  table: z.string().min(1).optional(),
  rowId: z.union([z.string().min(1), z.int().positive()]).optional(),
});

export const labelRecordSchema = z.object({
  label: z.enum(labelTaxonomy),
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
  evaluatorVersion: z.string().min(1),
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
  evaluatorVersion: z.string().min(1),
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
  turnCount: z.int().nonnegative(),
  labeledTurnCount: z.int().nonnegative(),
  incidentCount: z.int().nonnegative(),
  writeCount: z.int().nonnegative(),
  verificationCount: z.int().nonnegative(),
  verificationPassedCount: z.int().nonnegative(),
  verificationFailedCount: z.int().nonnegative(),
  complianceScore: z.int().min(0).max(100),
  complianceRules: z.array(complianceRuleResultSchema),
});

export const inventoryRecordSchema = z.object({
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
  evaluatorVersion: z.string().min(1),
  schemaVersion: z.string().min(1),
  generatedAt: z.string().min(1),
  sessionCount: z.int().nonnegative(),
  turnCount: z.int().nonnegative(),
  incidentCount: z.int().nonnegative(),
  labelCounts: labelCountSchema,
  complianceSummary: z.array(complianceAggregateSchema),
  sessions: z.array(sessionMetricsSchema),
  inventory: z.array(inventoryRecordSchema),
});

export const summaryArtifactSchema = z.object({
  evaluatorVersion: z.string().min(1),
  schemaVersion: z.string().min(1),
  generatedAt: z.string().min(1),
  sessions: z.int().nonnegative(),
  turns: z.int().nonnegative(),
  incidents: z.int().nonnegative(),
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
    verifiedWriteSessions: z.int().nonnegative(),
    writeVerificationRate: z.number().nonnegative(),
  }),
  comparativeSlices: z.array(
    z.object({
      key: z.string().min(1),
      label: z.string().min(1),
      sessionCount: z.int().nonnegative(),
      turnCount: z.int().nonnegative(),
      incidentCount: z.int().nonnegative(),
      proofScore: z.int().min(0).max(100),
      flowScore: z.int().min(0).max(100),
      disciplineScore: z.int().min(0).max(100),
      writeVerificationRate: z.number().nonnegative(),
      incidentsPer100Turns: z.number().nonnegative(),
    }),
  ),
  momentumCards: z.array(
    z.object({
      title: z.string().min(1),
      value: z.string().min(1),
      detail: z.string().min(1),
      tone: z.enum(["neutral", "good", "warn", "danger"]),
    }),
  ),
  scoreCards: z.array(
    z.object({
      title: z.string().min(1),
      score: z.int().min(0).max(100),
      detail: z.string().min(1),
      tone: z.enum(["neutral", "good", "warn", "danger"]),
    }),
  ),
  bragCards: z.array(
    z.object({
      title: z.string().min(1),
      value: z.string().min(1),
      detail: z.string().min(1),
      tone: z.enum(["neutral", "good", "warn", "danger"]),
    }),
  ),
  achievementBadges: z.array(z.string().min(1)),
  insightCards: z.array(
    z.object({
      title: z.string().min(1),
      value: z.string().min(1),
      detail: z.string().min(1),
      tone: z.enum(["neutral", "good", "warn", "danger"]),
    }),
  ),
  topSessions: z.array(
    z.object({
      sessionId: z.string().min(1),
      archetype: z.enum(sessionArchetypeValues),
      archetypeLabel: z.string().min(1),
      frictionScore: z.number().nonnegative(),
      complianceScore: z.int().min(0).max(100),
      incidentCount: z.int().nonnegative(),
      labeledTurnCount: z.int().nonnegative(),
      writeCount: z.int().nonnegative(),
      verificationPassedCount: z.int().nonnegative(),
      dominantLabels: z.array(z.enum(labelTaxonomy)),
      note: z.string().min(1),
    }),
  ),
  victoryLaps: z.array(
    z.object({
      sessionId: z.string().min(1),
      archetype: z.enum(sessionArchetypeValues),
      archetypeLabel: z.string().min(1),
      frictionScore: z.number().nonnegative(),
      complianceScore: z.int().min(0).max(100),
      incidentCount: z.int().nonnegative(),
      labeledTurnCount: z.int().nonnegative(),
      writeCount: z.int().nonnegative(),
      verificationPassedCount: z.int().nonnegative(),
      dominantLabels: z.array(z.enum(labelTaxonomy)),
      note: z.string().min(1),
    }),
  ),
  opportunities: z.array(
    z.object({
      title: z.string().min(1),
      rationale: z.string().min(1),
    }),
  ),
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
