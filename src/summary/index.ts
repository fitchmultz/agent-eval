/**
 * Purpose: Public exports for the summary module.
 * Entrypoint: Use functions from scoring and aggregation modules.
 * Notes: Centralized exports for summary-related functionality.
 */

// Scoring functions
export {
  safeRate,
  toneForScore,
  countLabel,
  createEmptySessionLabelMap,
  createEmptySeverityCounts,
  buildScoreSnapshot,
} from "./scoring.js";

// Aggregation functions
export {
  collectSessionLabelCounts,
  countWriteTurns,
  buildSummaryInputsFromArtifacts,
  aggregateDeliveryMetrics,
} from "./aggregation.js";

// Types
export type {
  SummaryInputs,
  SummaryCoreData,
  SessionInsightRow,
  ScoreSnapshot,
} from "./types.js";
