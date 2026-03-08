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
  rates: SummaryArtifact["rates"];
  delivery: SummaryArtifact["delivery"];
  comparativeSlices: SummaryArtifact["comparativeSlices"];
  topSessions: SummaryArtifact["topSessions"];
  victoryLaps: SummaryArtifact["victoryLaps"];
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
  verificationPassedCount: number;
  dominantLabels: LabelName[];
  note: string;
}

export interface ScoreSnapshot {
  proofScore: number;
  flowScore: number;
  disciplineScore: number;
  writeVerificationRate: number;
  incidentsPer100Turns: number;
}
