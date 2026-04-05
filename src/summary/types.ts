/**
 * Purpose: Type definitions for the v3 summary module.
 * Entrypoint: Used by evaluator, ranking, summary builders, and presentation helpers.
 * Notes: Keeps the canonical summary contract separate from renderer-specific concerns.
 */

import type {
  AttributionPrimary,
  Confidence,
  EvidenceIssue,
  EvidenceSource,
  LabelName,
  MetricsRecord,
  SessionArchetype,
  SessionTitleSource,
  Severity,
  SourceRef,
  SummaryArtifact,
  SummaryConfidence,
  SurfacedSession,
} from "../schema.js";

// Re-export for convenience
export type { LabelName, SessionArchetype };

export interface SessionContext {
  sessionId: string;
  startedAt?: string;
  cwd?: string;
  leadPreview?: string;
  leadPreviewSource?: "user" | "assistant";
  leadPreviewConfidence?: SummaryConfidence;
  leadPreviewIsCodeLike?: boolean;
  evidencePreviews: string[];
  evidenceSource: EvidenceSource;
  evidenceConfidence: SummaryConfidence;
  evidenceIssues: EvidenceIssue[];
  sourceRefs: SourceRef[];
}

export interface SummaryAggregateStats {
  totalUserMessages: number;
  totalAssistantMessages: number;
  totalToolCalls: number;
  totalWriteToolCalls: number;
  totalVerificationToolCalls: number;
}

export interface SessionTemplateInfo {
  artifactScore: number | null;
  textSharePct: number | null;
  hasTemplateContent: boolean;
  flags: string[];
  dominantFamilyId: string | null;
  dominantFamilyLabel: string | null;
}

export interface SurfaceAttribution {
  primary: AttributionPrimary;
  confidence: Confidence;
  reasons: string[];
}

export type SessionMetricRecord = MetricsRecord["sessions"][number];

export interface SummarySessionRecord {
  sessionId: string;
  metrics: SessionMetricRecord;
  labels: Record<LabelName, number>;
  rawLabels: Record<LabelName, number>;
  context: SessionContext | null;
  attribution: SurfaceAttribution;
  template: SessionTemplateInfo;
}

export interface SummaryInputs {
  sessions: SummarySessionRecord[];
  severityCounts: Record<Severity, number>;
  aggregateStats: SummaryAggregateStats;
}

export interface SessionCandidate {
  record: SummarySessionRecord;
  shortId: string;
  title: string;
  timestampLabel: string;
  projectLabel: string;
  archetype: SessionArchetype;
  archetypeLabel: string;
  frictionScore: number;
  complianceScore: number;
  incidentCount: number;
  labeledTurnCount: number;
  writeCount: number;
  verificationPassedCount: number;
  endedVerified: boolean;
  failedRules: string[];
  dominantLabels: LabelName[];
  titleSource: SessionTitleSource;
  titleConfidence: SummaryConfidence;
  evidenceSource: EvidenceSource;
  evidenceConfidence: SummaryConfidence;
  evidenceIssues: EvidenceIssue[];
}

export interface SurfaceSessionDraft {
  sessionId: string;
  shortId: string;
  title: string;
  timestampLabel: string | null;
  projectLabel: string | null;
  provider: MetricsRecord["sessions"][number]["provider"] | null;
  harness: string | null;
  metrics: SurfacedSession["metrics"];
  attribution: SurfaceAttribution;
  reasonTags: string[];
  whyIncluded: string[];
  evidencePreviews: string[];
  sourceRefs: SourceRef[];
  provenance: SurfacedSession["provenance"];
}

export interface SummaryCoreData {
  overview: SummaryArtifact["overview"];
  usageDashboard: SummaryArtifact["usageDashboard"];
  exemplarSessions: SummaryArtifact["exemplarSessions"];
  reviewQueue: SummaryArtifact["reviewQueue"];
  attributionSummary: SummaryArtifact["attributionSummary"];
  templateSubstrate: SummaryArtifact["templateSubstrate"];
  learningPatterns: SummaryArtifact["learningPatterns"];
  comparativeSlices: SummaryArtifact["comparativeSlices"];
}

export interface ComparativeSliceDraft {
  key: string;
  label: string;
  kind: SummaryArtifact["comparativeSlices"][number]["kind"];
  filters: SummaryArtifact["comparativeSlices"][number]["filters"];
  metrics: SummaryArtifact["comparativeSlices"][number]["metrics"];
  notes: SummaryArtifact["comparativeSlices"][number]["notes"];
}
