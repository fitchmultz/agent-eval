/**
 * Purpose: Defines the strict typed schema shared by parsing, clustering, scoring, and output writers.
 * Entrypoint: Exported types and Zod schemas are consumed by runtime modules and tests.
 * Notes: The transcript JSONL is canonical; all optional enrichment attaches via source references.
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
export const sourceKindValues = [
  "session_jsonl",
  "state_sqlite",
  "history_jsonl",
  "tui_log",
  "codex_dev_db",
  "shell_snapshot",
] as const;

export type LabelName = (typeof labelTaxonomy)[number];
export type Severity = (typeof severityValues)[number];
export type Confidence = (typeof confidenceValues)[number];
export type SourceKind = (typeof sourceKindValues)[number];

export const sourceRefSchema = z.object({
  kind: z.enum(sourceKindValues),
  path: z.string().min(1),
  line: z.int().positive().optional(),
  table: z.string().min(1).optional(),
  rowId: z.union([z.string().min(1), z.int()]).optional(),
});

export const labelRecordSchema = z.object({
  label: z.enum(labelTaxonomy),
  severity: z.enum(severityValues),
  confidence: z.enum(confidenceValues),
  rationale: z.string().min(1),
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

export const rawTurnSchema = z.object({
  evaluatorVersion: z.string().min(1),
  schemaVersion: z.string().min(1),
  sessionId: z.string().min(1),
  turnId: z.string().min(1).optional(),
  startedAt: z.string().min(1).optional(),
  cwd: z.string().min(1).optional(),
  role: z.enum(["user", "assistant", "system", "unknown"]),
  text: z.string(),
  labels: z.array(labelRecordSchema),
  sourceRefs: z.array(sourceRefSchema).min(1),
});

export const incidentSchema = z.object({
  evaluatorVersion: z.string().min(1),
  schemaVersion: z.string().min(1),
  incidentId: z.string().min(1),
  sessionId: z.string().min(1),
  turnIds: z.array(z.string().min(1)),
  labels: z.array(labelRecordSchema).min(1),
  summary: z.string().min(1),
  sourceRefs: z.array(sourceRefSchema).min(1),
});

export const metricsSchema = z.object({
  evaluatorVersion: z.string().min(1),
  schemaVersion: z.string().min(1),
  sessionCount: z.int().nonnegative(),
  turnCount: z.int().nonnegative(),
  incidentCount: z.int().nonnegative(),
  labelCounts: labelCountSchema,
  generatedAt: z.string().min(1),
});

export type SourceRef = z.infer<typeof sourceRefSchema>;
export type LabelRecord = z.infer<typeof labelRecordSchema>;
export type LabelCountRecord = z.infer<typeof labelCountSchema>;
export type RawTurnRecord = z.infer<typeof rawTurnSchema>;
export type IncidentRecord = z.infer<typeof incidentSchema>;
export type MetricsRecord = z.infer<typeof metricsSchema>;
