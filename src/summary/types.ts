/**
 * Purpose: Type definitions for summary module.
 * Entrypoint: Used by scoring and aggregation modules.
 * Notes: Shared types to avoid circular dependencies.
 */

import type {
  LabelName,
  SessionArchetype,
  Severity,
  SummaryArtifact,
} from "../schema.js";

// Re-export for convenience
export type { LabelName, SessionArchetype };

export interface SummaryInputs {
  sessionLabelCounts: Map<string, Record<LabelName, number>>;
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
}

export interface SessionInsightRow {
  sessionId: string;
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
  note: string;
}

export interface ScoreSnapshot {
  verificationProxyScore: number | null;
  flowProxyScore: number | null;
  workflowProxyScore: number | null;
  writeSessionVerificationRate: number | null;
  incidentsPer100Turns: number;
}
