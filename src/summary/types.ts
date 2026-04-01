/**
 * Purpose: Type definitions for summary module.
 * Entrypoint: Used by scoring and aggregation modules.
 * Notes: Shared types to avoid circular dependencies and keep operator-facing summary data explicit.
 */

import type {
  LabelName,
  MetricsRecord,
  SessionArchetype,
  Severity,
  SourceRef,
  SummaryArtifact,
} from "../schema.js";

// Re-export for convenience
export type { LabelName, SessionArchetype };

export interface SessionContext {
  sessionId: string;
  startedAt?: string;
  cwd?: string;
  leadUserPreview?: string;
  evidencePreviews: string[];
  sourceRefs: SourceRef[];
}

export interface SummaryInputs {
  sessionLabelCounts: Map<string, Record<LabelName, number>>;
  sessionContexts?: Map<string, SessionContext>;
  topIncidents: SummaryArtifact["topIncidents"];
  severityCounts: Record<Severity, number>;
  writeTurnCount: number;
}

export interface SummaryCoreData {
  labels: Array<{ label: LabelName; count: number }>;
  severities: Array<{ severity: Severity; count: number }>;
  compliance: SummaryArtifact["compliance"];
  parseWarningCount: SummaryArtifact["parseWarningCount"];
  rates: SummaryArtifact["rates"];
  delivery: SummaryArtifact["delivery"];
  comparativeSlices: SummaryArtifact["comparativeSlices"];
  topSessions: SummaryArtifact["topSessions"];
  endedVerifiedDeliverySpotlights: SummaryArtifact["endedVerifiedDeliverySpotlights"];
  topIncidents: SummaryArtifact["topIncidents"];
  executiveSummary: SummaryArtifact["executiveSummary"];
  operatorMetrics: SummaryArtifact["operatorMetrics"];
  metricGlossary: SummaryArtifact["metricGlossary"];
}

export interface SessionInsightRow {
  sessionId: string;
  sessionShortId: string;
  sessionDisplayLabel: string;
  sessionTimestampLabel: string;
  sessionProjectLabel: string;
  archetype: SessionArchetype;
  archetypeLabel: string;
  frictionScore: number;
  complianceScore: number;
  incidentCount: number;
  labeledTurnCount: number;
  writeCount: number;
  endedVerified: boolean;
  verificationPassedCount: number;
  dominantLabels: LabelName[];
  whySelected: string[];
  failedRules: string[];
  evidencePreviews: string[];
  sourceRefs: SourceRef[];
  trustFlags: string[];
  note: string;
}

export interface ScoreSnapshot {
  verificationProxyScore: number | null;
  flowProxyScore: number | null;
  workflowProxyScore: number | null;
  writeSessionVerificationRate: number | null;
  incidentsPer100Turns: number;
}

export interface OperatorExecutiveSummary {
  problem: string;
  change: string;
  action: string;
}

export interface OperatorMetricCard {
  label: string;
  value: string;
  detail: string;
  tone: "neutral" | "good" | "warn" | "danger";
}

export interface MetricGlossaryEntry {
  key: string;
  label: string;
  plainLanguage: string;
  caveat: string;
}

export type SessionMetricRecord = MetricsRecord["sessions"][number];
