/**
 * Purpose: Aggregates session-level metrics into corpus-level summaries.
 * Entrypoint: `aggregateMetrics()` for building MetricsRecord.
 */
import type {
  InventoryRecord,
  LabelCountRecord,
  LabelName,
  MetricsRecord,
} from "./schema.js";
import type { ProcessedSession } from "./session-processor.js";
import { aggregateComplianceSummary } from "./utils/compliance-aggregation.js";
import { getHomeDirectory } from "./utils/environment.js";
import { redactPath } from "./utils/path-redaction.js";
import { EVALUATOR_VERSION, SCHEMA_VERSION } from "./version.js";

function aggregateLabelCounts(
  sessions: readonly ProcessedSession[],
): LabelCountRecord {
  const counts: LabelCountRecord = {};

  for (const session of sessions) {
    for (const turn of session.turns) {
      for (const label of turn.labels) {
        counts[label.label] = (counts[label.label] ?? 0) + 1;
      }
    }
  }

  return counts;
}

function redactInventory(inventory: InventoryRecord[]): InventoryRecord[] {
  const homeDirectory = getHomeDirectory();
  return inventory.map((record) => ({
    ...record,
    path: redactPath(record.path, homeDirectory),
  }));
}

/**
 * Aggregates metrics from processed sessions into a MetricsRecord.
 * @param sessions - Array of processed sessions
 * @param inventory - Inventory records from discovery
 * @returns Complete metrics record
 */
export function aggregateMetrics(
  sessions: readonly ProcessedSession[],
  inventory: InventoryRecord[],
): MetricsRecord {
  const labelCounts = aggregateLabelCounts(sessions);
  const sessionMetrics = sessions.map((s) => s.metrics);
  const complianceSummary = aggregateComplianceSummary(sessionMetrics);

  return {
    evaluatorVersion: EVALUATOR_VERSION,
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    sessionCount: sessions.length,
    turnCount: sessions.reduce((sum, s) => sum + s.turns.length, 0),
    incidentCount: sessions.reduce((sum, s) => sum + s.incidents.length, 0),
    labelCounts,
    complianceSummary,
    sessions: sessionMetrics,
    inventory: redactInventory(inventory),
  };
}

/**
 * Counts occurrences of a specific label in sessions.
 */
export function countLabel(
  sessions: readonly ProcessedSession[],
  labelName: LabelName,
): number {
  return sessions.reduce(
    (sum, session) =>
      sum +
      session.turns.reduce(
        (turnSum, turn) =>
          turnSum + turn.labels.filter((l) => l.label === labelName).length,
        0,
      ),
    0,
  );
}

/**
 * Counts write-like turns across sessions.
 */
export function countWriteTurns(sessions: readonly ProcessedSession[]): number {
  return sessions.reduce(
    (sum, session) =>
      sum +
      session.turns.filter((turn) => turn.toolCalls.some((tc) => tc.writeLike))
        .length,
    0,
  );
}

/**
 * Extracts all incidents from processed sessions.
 */
export function extractAllIncidents(
  sessions: readonly ProcessedSession[],
): import("./schema.js").IncidentRecord[] {
  return sessions.flatMap((s) => s.incidents);
}

/**
 * Extracts all turns from processed sessions.
 */
export function extractAllTurns(
  sessions: readonly ProcessedSession[],
): import("./schema.js").RawTurnRecord[] {
  return sessions.flatMap((s) => s.turns);
}
