/**
 * Purpose: Public exports for the summary module.
 * Entrypoint: Use functions from scoring and aggregation modules.
 * Notes: Centralized exports for summary-related functionality.
 */

// Aggregation functions
export {
  aggregateDeliveryMetrics,
  buildSummaryInputsFromArtifacts,
  collectSessionLabelCounts,
  countWriteTurns,
} from "./aggregation.js";
// Scoring functions
export {
  buildScoreSnapshot,
  countLabel,
  createEmptySessionLabelMap,
  createEmptySeverityCounts,
  safeRate,
  toneForScore,
} from "./scoring.js";

// Types
export type {
  ScoreSnapshot,
  SessionInsightRow,
  SummaryCoreData,
  SummaryInputs,
} from "./types.js";
