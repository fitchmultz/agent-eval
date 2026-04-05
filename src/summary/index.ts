/**
 * Purpose: Public exports for the v3 summary module.
 * Entrypoint: Used by evaluator, report generation, and focused tests.
 * Notes: Centralized exports keep the canonical summary surface narrow during the cutover.
 */

export {
  buildSummaryInputsFromArtifacts,
  buildSummaryInputsFromSessions,
  collectSessionLabelCounts,
  countWriteTurns,
} from "./aggregation.js";
export {
  countLabel,
  createEmptySessionLabelMap,
  createEmptySeverityCounts,
  safeRate,
} from "./scoring.js";
export type {
  ComparativeSliceDraft,
  SessionCandidate,
  SessionContext,
  SummaryAggregateStats,
  SummaryCoreData,
  SummaryInputs,
  SummarySessionRecord,
} from "./types.js";
