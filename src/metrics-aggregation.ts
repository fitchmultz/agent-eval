/**
 * Purpose: Aggregates session-level metrics into corpus-level summaries.
 * Entrypoint: `aggregateMetrics()` for building MetricsRecord.
 */
import type {
  ComplianceAggregate,
  ComplianceRuleName,
  ComplianceStatus,
  InventoryRecord,
  LabelCountRecord,
  LabelName,
  MetricsRecord,
} from "./schema.js";
import { complianceRuleValues } from "./schema.js";
import type { ProcessedSession } from "./session-processor.js";
import { EVALUATOR_VERSION, SCHEMA_VERSION } from "./version.js";

/**
 * Creates empty label counts record.
 */
function createEmptyLabelCounts(): LabelCountRecord {
  return {};
}

/**
 * Creates empty compliance summary with all rules initialized to zero.
 */
function createEmptyComplianceSummary(): ComplianceAggregate[] {
  return complianceRuleValues.map((rule) => ({
    rule,
    passCount: 0,
    failCount: 0,
    notApplicableCount: 0,
    unknownCount: 0,
  }));
}

/**
 * Increments compliance summary counter for a specific rule and status.
 */
function incrementComplianceSummary(
  summary: readonly ComplianceAggregate[],
  rule: ComplianceRuleName,
  status: ComplianceStatus,
): ComplianceAggregate[] {
  return summary.map((entry) => {
    if (entry.rule !== rule) {
      return entry;
    }

    if (status === "pass") {
      return { ...entry, passCount: entry.passCount + 1 };
    }
    if (status === "fail") {
      return { ...entry, failCount: entry.failCount + 1 };
    }
    if (status === "not_applicable") {
      return { ...entry, notApplicableCount: entry.notApplicableCount + 1 };
    }

    return { ...entry, unknownCount: entry.unknownCount + 1 };
  });
}

/**
 * Aggregates label counts across all sessions.
 */
function aggregateLabelCounts(
  sessions: readonly ProcessedSession[],
): LabelCountRecord {
  let labelCounts = createEmptyLabelCounts();

  for (const session of sessions) {
    // Count labels from turns
    for (const turn of session.turns) {
      for (const label of turn.labels) {
        labelCounts = {
          ...labelCounts,
          [label.label]: (labelCounts[label.label] ?? 0) + 1,
        };
      }
    }
  }

  return labelCounts;
}

/**
 * Aggregates compliance summary across all sessions.
 */
function aggregateComplianceSummary(
  sessions: readonly ProcessedSession[],
): ComplianceAggregate[] {
  let complianceSummary = createEmptyComplianceSummary();

  for (const session of sessions) {
    for (const rule of session.metrics.complianceRules) {
      complianceSummary = incrementComplianceSummary(
        complianceSummary,
        rule.rule,
        rule.status,
      );
    }
  }

  return complianceSummary;
}

/**
 * Gets the home directory from environment.
 */
function getHomeDirectory(): string | undefined {
  const homeEnvironmentKey = "HOME";
  return process.env[homeEnvironmentKey];
}

/**
 * Redacts the home directory from a path.
 */
function redactPath(path: string): string {
  const homeDirectory = getHomeDirectory();
  return homeDirectory ? path.replace(homeDirectory, "~") : path;
}

/**
 * Redacts inventory paths.
 */
function redactInventory(inventory: InventoryRecord[]): InventoryRecord[] {
  return inventory.map((record) => ({
    ...record,
    path: redactPath(record.path),
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
  const complianceSummary = aggregateComplianceSummary(sessions);

  return {
    evaluatorVersion: EVALUATOR_VERSION,
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    sessionCount: sessions.length,
    turnCount: sessions.reduce((sum, s) => sum + s.turns.length, 0),
    incidentCount: sessions.reduce((sum, s) => sum + s.incidents.length, 0),
    labelCounts,
    complianceSummary,
    sessions: sessions.map((s) => s.metrics),
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
