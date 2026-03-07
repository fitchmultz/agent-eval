/**
 * Purpose: Composes deterministic core summary data with optional presentation-oriented decorations.
 * Entrypoint: `buildSummaryArtifact()` is the public summary facade consumed by the evaluator and renderers.
 * Notes: Core math lives in summary-core.ts; UI-friendly extras live in summary-decorations.ts.
 */
import type { MetricsRecord, SummaryArtifact } from "./schema.js";
import {
  buildSummaryCore,
  buildSummaryInputsFromArtifacts,
  collectSessionLabelCounts,
  countLabel,
  countWriteTurns,
  createEmptySessionLabelMap,
  createEmptySeverityCounts,
  insertTopIncident,
  type ScoreSnapshot,
  type SessionInsightRow,
  type SummaryCoreData,
  type SummaryInputs,
  safeRate,
} from "./summary-core.js";
import { buildSummaryDecorations } from "./summary-decorations.js";

export {
  buildSummaryInputsFromArtifacts,
  collectSessionLabelCounts,
  countLabel,
  countWriteTurns,
  createEmptySessionLabelMap,
  createEmptySeverityCounts,
  insertTopIncident,
  safeRate,
  type ScoreSnapshot,
  type SessionInsightRow,
  type SummaryCoreData,
  type SummaryInputs,
};

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
