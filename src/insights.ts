/**
 * Purpose: Composes deterministic core summary data with optional presentation-oriented decorations.
 * Entrypoint: `buildSummaryArtifact()` is the public summary facade consumed by the evaluator and renderers.
 * Notes: Core math lives in summary-core.ts and focused modules; UI-friendly extras live in summary-decorations.ts.
 */
import type { MetricsRecord, SummaryArtifact } from "./schema.js";
import {
  collectSessionLabelCounts,
  countLabel,
  countWriteTurns,
  createEmptySessionLabelMap,
  createEmptySeverityCounts,
  safeRate,
} from "./summary/index.js";
import type { SummaryInputs } from "./summary/types.js";
import {
  buildSummaryCore,
  buildSummaryInputsFromArtifacts,
} from "./summary-core.js";
import { buildSummaryDecorations } from "./summary-decorations.js";

export {
  buildComparativeSlices,
  buildScoreSnapshot,
} from "./comparative-slices.js";
export {
  calculateFrictionScore,
  dominantLabelsForSession,
  getLabelWeight,
} from "./friction-scoring.js";
export { insertTopIncident } from "./incident-selection.js";
// Re-export from focused modules
export {
  archetypeLabel,
  createArchetypeNote,
  determineArchetype,
} from "./session-archetype.js";
export { buildTopSessions, buildVictoryLaps } from "./session-ranking.js";

// Re-export types from summary/types.ts
export type {
  ScoreSnapshot,
  SessionInsightRow,
  SummaryCoreData,
  SummaryInputs,
} from "./summary/types.js";

// Re-export utilities from summary-core
export {
  buildSummaryInputsFromArtifacts,
  collectSessionLabelCounts,
  countLabel,
  countWriteTurns,
  createEmptySessionLabelMap,
  createEmptySeverityCounts,
  safeRate,
};

/**
 * Builds a complete summary artifact from metrics and turn/incident data.
 *
 * This is the main entrypoint for summary generation. It composes:
 * - Core deterministic metrics (rates, counts, compliance)
 * - Presentation decorations (badges, brag cards, score cards, opportunities)
 * - Session rankings and top incidents
 *
 * @param metrics - Aggregated metrics record from the evaluation
 * @param inputs - Summary inputs containing session label counts, top incidents, severity counts, and write turn count
 * @returns A complete SummaryArtifact suitable for JSON serialization and report generation
 *
 * @example
 * ```typescript
 * const inputs = buildSummaryInputsFromArtifacts(rawTurns, incidents);
 * const summary = buildSummaryArtifact(metrics, inputs);
 * console.log(`Verification rate: ${summary.delivery.writeVerificationRate}%`);
 * ```
 */
export function buildSummaryArtifact(
  metrics: MetricsRecord,
  inputs: SummaryInputs,
): SummaryArtifact {
  const core = buildSummaryCore(metrics, inputs);
  const decorations = buildSummaryDecorations(metrics, core.topSessions);

  return {
    evaluatorVersion: metrics.evaluatorVersion,
    schemaVersion: metrics.schemaVersion,
    generatedAt: metrics.generatedAt,
    sessions: metrics.sessionCount,
    turns: metrics.turnCount,
    incidents: metrics.incidentCount,
    ...core,
    ...decorations,
  };
}
