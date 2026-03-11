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
import { labelTaxonomy } from "./schema.js";
import type { ProcessedSession } from "./session-processor.js";
import { aggregateComplianceSummary } from "./utils/compliance-aggregation.js";
import { getValidatedHomeDirectory } from "./utils/environment.js";
import { redactPath } from "./utils/path-redaction.js";
import { EVALUATOR_VERSION, SCHEMA_VERSION } from "./version.js";

/**
 * Validates that a label is in the taxonomy.
 * @param label - The label to validate
 * @returns True if the label is valid
 */
function isValidLabel(label: string): label is LabelName {
  return (labelTaxonomy as readonly string[]).includes(label);
}

/**
 * Safely increments a label count in the record.
 * Validates the label before incrementing to prevent invalid keys.
 *
 * @param counts - The label count record to update
 * @param label - The label to increment
 */
function incrementLabelCount(counts: LabelCountRecord, label: string): void {
  if (!isValidLabel(label)) {
    // Skip invalid labels - this could log a warning in debug mode
    // biome-ignore lint/complexity/useLiteralKeys: Environment access uses index signatures in Node typings.
    if (process.env["DEBUG"]) {
      process.stderr.write(
        `[metrics-aggregation] Skipping invalid label: ${label}\n`,
      );
    }
    return;
  }

  counts[label] = (counts[label] ?? 0) + 1;
}

function aggregateLabelCounts(
  sessions: readonly ProcessedSession[],
): LabelCountRecord {
  const counts: LabelCountRecord = {};

  for (const session of sessions) {
    for (const turn of session.turns) {
      for (const label of turn.labels) {
        incrementLabelCount(counts, label.label);
      }
    }
  }

  return counts;
}

function redactInventory(inventory: InventoryRecord[]): InventoryRecord[] {
  const homeDirectory = getValidatedHomeDirectory();
  return inventory.map((record) => ({
    ...record,
    path: redactPath(record.path, homeDirectory),
  }));
}

export interface MetricsRecordParts {
  sessionMetrics: MetricsRecord["sessions"];
  labelCounts: LabelCountRecord;
  turnCount: number;
  incidentCount: number;
  parseWarningCount: number;
}

export function buildMetricsRecord(
  parts: MetricsRecordParts,
  inventory: InventoryRecord[],
): MetricsRecord {
  return {
    evaluatorVersion: EVALUATOR_VERSION,
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    sessionCount: parts.sessionMetrics.length,
    turnCount: parts.turnCount,
    incidentCount: parts.incidentCount,
    parseWarningCount: parts.parseWarningCount,
    labelCounts: parts.labelCounts,
    complianceSummary: aggregateComplianceSummary(parts.sessionMetrics),
    sessions: parts.sessionMetrics,
    inventory: redactInventory(inventory),
  };
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

  return buildMetricsRecord(
    {
      sessionMetrics,
      labelCounts,
      turnCount: sessions.reduce((sum, s) => sum + s.turns.length, 0),
      incidentCount: sessions.reduce((sum, s) => sum + s.incidents.length, 0),
      parseWarningCount: sessionMetrics.reduce(
        (sum, session) => sum + session.parseWarningCount,
        0,
      ),
    },
    inventory,
  );
}

/**
 * Counts occurrences of a specific label in sessions.
 * Validates that the label is in the taxonomy before counting.
 *
 * @param sessions - Array of processed sessions
 * @param labelName - The label name to count
 * @returns The count of occurrences
 * @throws Error if the label is not in the taxonomy
 */
export function countLabel(
  sessions: readonly ProcessedSession[],
  labelName: LabelName,
): number {
  if (!isValidLabel(labelName)) {
    throw new Error(
      `Invalid label: ${labelName}. Expected one of: ${labelTaxonomy.join(", ")}`,
    );
  }

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
