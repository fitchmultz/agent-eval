/**
 * Purpose: Shared type definitions used across summary-related modules.
 * Entrypoint: Import types from here to avoid circular dependencies between summary modules.
 * Notes: These types were extracted from summary-core.ts to enable module splitting.
 */

import type { LabelName, Severity, SummaryArtifact } from "./schema.js";

/**
 * Inputs required for building summary data from artifacts.
 */
export interface SummaryInputs {
  sessionLabelCounts: Map<string, Record<LabelName, number>>;
  topIncidents: SummaryArtifact["topIncidents"];
  severityCounts: Record<Severity, number>;
  writeTurnCount: number;
}

/**
 * A row in the session insights table, representing a session's classification
 * and scoring metrics.
 */
export interface SessionInsightRow {
  sessionId: string;
  archetype: import("./schema.js").SessionArchetype;
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

/**
 * Snapshot of calculated scores for a corpus slice.
 */
export interface ScoreSnapshot {
  proofScore: number;
  flowScore: number;
  disciplineScore: number;
  writeVerificationRate: number;
  incidentsPer100Turns: number;
}

/**
 * Core summary data structure containing all deterministic metrics.
 */
export interface SummaryCoreData {
  labels: SummaryArtifact["labels"];
  severities: SummaryArtifact["severities"];
  compliance: SummaryArtifact["compliance"];
  rates: SummaryArtifact["rates"];
  delivery: SummaryArtifact["delivery"];
  comparativeSlices: SummaryArtifact["comparativeSlices"];
  topSessions: SummaryArtifact["topSessions"];
  victoryLaps: SummaryArtifact["victoryLaps"];
  topIncidents: SummaryArtifact["topIncidents"];
}
