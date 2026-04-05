/**
 * Purpose: Aggregates canonical session metrics into corpus-level metrics.json sections.
 * Entrypoint: `aggregateMetrics()` for building MetricsRecord from processed sessions.
 * Notes: Session metrics are the single quantitative source of truth for dashboard, session-facts, and summary wiring.
 */
import type {
  InventoryRecord,
  LabelCountRecord,
  LabelName,
  MetricsRecord,
  SessionMetrics,
} from "./schema.js";
import { labelTaxonomy } from "./schema.js";
import {
  createEmptyProcessedSessionAnalysis,
  type ProcessedSession,
} from "./session-processor.js";
import { safeRate } from "./summary/index.js";
import type { TemplateLabelSummary } from "./template-analysis.js";
import { aggregateComplianceSummary } from "./utils/compliance-aggregation.js";
import { getValidatedHomeDirectory } from "./utils/environment.js";
import { redactPath } from "./utils/path-redaction.js";
import { ENGINE_VERSION, SCHEMA_VERSION } from "./version.js";

function isValidLabel(label: string): label is LabelName {
  return (labelTaxonomy as readonly string[]).includes(label);
}

function incrementLabelCount(counts: LabelCountRecord, label: string): void {
  if (!isValidLabel(label)) {
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
    const analysis = session.analysis;
    if (analysis) {
      for (const [label, count] of Object.entries(
        analysis.deTemplatedLabelCounts,
      )) {
        if (typeof count !== "number") {
          continue;
        }
        counts[label as LabelName] = (counts[label as LabelName] ?? 0) + count;
      }
      continue;
    }

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

function roundAverage(total: number, count: number): number | null {
  if (count <= 0) {
    return null;
  }

  return Number((total / count).toFixed(1));
}

function coverageStats(
  coveredSessionCount: number,
  totalSessionCount: number,
): MetricsRecord["tokenStats"]["coverage"] {
  return {
    coveredSessionCount,
    totalSessionCount,
    coveragePct:
      totalSessionCount > 0
        ? safeRate(coveredSessionCount, totalSessionCount)
        : null,
  };
}

function toDistributionEntries(
  counts: Map<string, number>,
  total: number,
): MetricsRecord["providerDistribution"] {
  return [...counts.entries()]
    .sort(
      (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
    )
    .map(([key, count]) => ({
      key,
      label: key,
      count,
      pct: total > 0 ? safeRate(count, total) : null,
    }));
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[middle] ?? null;
  }

  const left = sorted[middle - 1];
  const right = sorted[middle];
  if (typeof left !== "number" || typeof right !== "number") {
    return null;
  }

  return Number(((left + right) / 2).toFixed(1));
}

function bucketKey(
  timestamp: string,
  bucket: MetricsRecord["temporalBuckets"]["bucket"],
): string {
  const date = new Date(timestamp);
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${date.getUTCDate()}`.padStart(2, "0");

  if (bucket === "day") {
    return `${year}-${month}-${day}`;
  }

  if (bucket === "month") {
    return `${year}-${month}`;
  }

  const utcDate = new Date(
    Date.UTC(year, date.getUTCMonth(), date.getUTCDate()),
  );
  const weekday = utcDate.getUTCDay();
  const diffToMonday = weekday === 0 ? -6 : 1 - weekday;
  utcDate.setUTCDate(utcDate.getUTCDate() + diffToMonday);
  return utcDate.toISOString().slice(0, 10);
}

function buildTemporalBuckets(
  sessions: readonly SessionMetrics[],
  bucket: MetricsRecord["temporalBuckets"]["bucket"],
): MetricsRecord["temporalBuckets"] {
  const counts = new Map<
    string,
    {
      sessionCount: number;
      writeSessionCount: number;
      endedVerifiedCount: number;
      incidentCount: number;
    }
  >();

  for (const session of sessions) {
    if (!session.startedAt) {
      continue;
    }

    const key = bucketKey(session.startedAt, bucket);
    const current = counts.get(key) ?? {
      sessionCount: 0,
      writeSessionCount: 0,
      endedVerifiedCount: 0,
      incidentCount: 0,
    };
    current.sessionCount += 1;
    if (session.writeCount > 0) {
      current.writeSessionCount += 1;
    }
    if (session.endedVerified) {
      current.endedVerifiedCount += 1;
    }
    current.incidentCount += session.incidentCount;
    counts.set(key, current);
  }

  return {
    bucket,
    values: [...counts.entries()]
      .sort((left, right) => left[0].localeCompare(right[0]))
      .map(([key, value]) => ({
        key,
        label: key,
        sessionCount: value.sessionCount,
        writeSessionCount: value.writeSessionCount,
        endedVerifiedCount: value.endedVerifiedCount,
        incidentCount: value.incidentCount,
      })),
  };
}

function buildCoverageWarnings(metrics: MetricsRecord): string[] {
  const warnings: string[] = [];

  if (metrics.parseWarningCount > 0) {
    warnings.push(
      `Parse warnings were recorded in ${metrics.parseWarningCount} turn fragments; affected sessions may be partial.`,
    );
  }
  if (metrics.modelDistribution.coverage.coveredSessionCount === 0) {
    warnings.push(
      "Model coverage is unavailable for the selected corpus, so model distribution values are omitted rather than filled with false zeros.",
    );
  }
  if (metrics.tokenStats.coverage.coveredSessionCount === 0) {
    warnings.push(
      "Token coverage is unavailable for the selected corpus, so token averages are null rather than false zeros.",
    );
  }
  if (metrics.compactionStats.coverage.coveredSessionCount === 0) {
    warnings.push(
      "Compaction coverage is unavailable for the selected corpus, so compaction metrics remain null.",
    );
  }
  if (metrics.appliedFilters.undatedExcludedCount > 0) {
    warnings.push(
      `${metrics.appliedFilters.undatedExcludedCount} sessions were excluded because date filtering was active and no stable session timestamp was available.`,
    );
  }

  return warnings;
}

function pluralizeCount(
  count: number,
  singular: string,
  plural?: string,
): string {
  return `${count} ${count === 1 ? singular : (plural ?? `${singular}s`)}`;
}

function buildSampleWarnings(metrics: MetricsRecord): string[] {
  const warnings: string[] = [];
  const writeSessions = metrics.sessions.filter(
    (session) => session.writeCount > 0,
  ).length;
  const sessionCount = metrics.sessionCount;
  const isWindowedSelection =
    metrics.corpusScope.selection === "most_recent_window" ||
    metrics.corpusScope.selection === "date_filtered_window";

  if (sessionCount < 25) {
    warnings.push(
      isWindowedSelection
        ? `Only ${pluralizeCount(sessionCount, "session")} ${sessionCount === 1 ? "is" : "are"} shown in this windowed run, so broad product conclusions should be treated as low sample.`
        : `Only ${pluralizeCount(sessionCount, "session")} ${sessionCount === 1 ? "was" : "were"} available in the selected corpus, so broad product conclusions should be treated as low sample.`,
    );
  }
  if (writeSessions === 0) {
    warnings.push(
      "No write sessions were observed in the selected corpus, so delivery-focused comparisons are unavailable.",
    );
  } else if (writeSessions < 10) {
    warnings.push(
      isWindowedSelection
        ? `Only ${pluralizeCount(writeSessions, "write session")} ${writeSessions === 1 ? "appears" : "appear"} in this windowed run, so delivery-focused comparisons are low confidence.`
        : `Only ${pluralizeCount(writeSessions, "write session")} ${writeSessions === 1 ? "was" : "were"} available, so delivery-focused comparisons are low confidence.`,
    );
  }

  return warnings;
}

function buildAttributionSummary(
  sessions: readonly ProcessedSession[],
): MetricsRecord["attributionSummary"] {
  return sessions.reduce<MetricsRecord["attributionSummary"]>(
    (counts, session) => {
      const analysis =
        session.analysis ?? createEmptyProcessedSessionAnalysis();
      counts[analysis.attribution.primary] += 1;
      return counts;
    },
    {
      user_scope: 0,
      agent_behavior: 0,
      template_artifact: 0,
      mixed: 0,
      unknown: 0,
    },
  );
}

function buildTemplateSubstrate(
  sessions: readonly ProcessedSession[],
  labelSummaries: readonly TemplateLabelSummary[],
): MetricsRecord["templateSubstrate"] {
  const measuredShares = sessions
    .map(
      (session) =>
        (session.analysis ?? createEmptyProcessedSessionAnalysis()).template
          .textSharePct,
    )
    .filter((value): value is number => typeof value === "number");
  const affectedSessions = sessions.filter(
    (session) =>
      (session.analysis ?? createEmptyProcessedSessionAnalysis()).template
        .hasTemplateContent,
  );

  return {
    affectedSessionCount: affectedSessions.length,
    affectedSessionPct:
      sessions.length > 0
        ? safeRate(affectedSessions.length, sessions.length)
        : null,
    estimatedTemplateTextSharePct:
      measuredShares.length > 0
        ? roundAverage(
            measuredShares.reduce((total, value) => total + value, 0),
            measuredShares.length,
          )
        : null,
    topFamilies: [...labelSummaries],
  };
}

export interface MetricsRecordParts {
  sessionMetrics: MetricsRecord["sessions"];
  labelCounts: LabelCountRecord;
  turnCount: number;
  incidentCount: number;
  parseWarningCount: number;
  attributionSummary: MetricsRecord["attributionSummary"];
  templateSubstrate: MetricsRecord["templateSubstrate"];
}

export interface BuildMetricsOptions {
  corpusScope?: MetricsRecord["corpusScope"];
  appliedFilters?: MetricsRecord["appliedFilters"];
  templateLabelSummaries?: readonly TemplateLabelSummary[];
}

export function buildMetricsRecord(
  parts: MetricsRecordParts,
  inventory: InventoryRecord[],
  options: BuildMetricsOptions = {},
): MetricsRecord {
  const sessionMetrics = parts.sessionMetrics;
  const sessionCount = sessionMetrics.length;
  const corpusScope = options.corpusScope ?? {
    selection: "all_discovered",
    discoveredSessionCount: sessionCount,
    eligibleSessionCount: sessionCount,
    appliedSessionLimit: null,
    startDate: null,
    endDate: null,
    timeBucket: "week",
    undatedExcludedCount: 0,
  };
  const appliedFilters = options.appliedFilters ?? {
    startDate: corpusScope.startDate ?? null,
    endDate: corpusScope.endDate ?? null,
    sessionLimit: corpusScope.appliedSessionLimit,
    timeBucket: corpusScope.timeBucket ?? "week",
    discoveredSessionCount: corpusScope.discoveredSessionCount,
    eligibleSessionCount: corpusScope.eligibleSessionCount ?? sessionCount,
    undatedExcludedCount: corpusScope.undatedExcludedCount ?? 0,
  };

  const providerCounts = new Map<string, number>();
  const harnessCounts = new Map<string, number>();
  const modelCounts = new Map<string, number>();
  const topToolCounts = new Map<string, number>();
  const toolFamilyCounts = new Map<string, number>();
  const mcpServerCounts = new Map<string, number>();

  let totalUserMessages = 0;
  let totalAssistantMessages = 0;
  let totalToolCallCount = 0;
  let totalWriteToolCallCount = 0;
  let totalVerificationToolCallCount = 0;
  let totalMcpToolCallCount = 0;
  let sessionCountWithMcp = 0;
  let harnessCoveredCount = 0;
  let modelCoveredCount = 0;
  let tokenCoveredCount = 0;
  let durationCoveredCount = 0;
  let compactionCoveredCount = 0;
  let tokenInputTotal = 0;
  let tokenOutputTotal = 0;
  let tokenTotal = 0;
  let durationTotal = 0;
  let compactionTotal = 0;
  const durationValues: number[] = [];

  for (const session of sessionMetrics) {
    providerCounts.set(
      session.provider,
      (providerCounts.get(session.provider) ?? 0) + 1,
    );

    if (session.harness) {
      harnessCoveredCount += 1;
      harnessCounts.set(
        session.harness,
        (harnessCounts.get(session.harness) ?? 0) + 1,
      );
    }

    if (session.model) {
      modelCoveredCount += 1;
      const modelKey = session.modelProvider
        ? `${session.modelProvider}/${session.model}`
        : session.model;
      modelCounts.set(modelKey, (modelCounts.get(modelKey) ?? 0) + 1);
    }

    totalUserMessages += session.userMessageCount;
    totalAssistantMessages += session.assistantMessageCount;
    totalToolCallCount += session.toolCallCount;
    totalWriteToolCallCount += session.writeToolCallCount;
    totalVerificationToolCallCount += session.verificationToolCallCount;
    totalMcpToolCallCount += session.mcpToolCallCount;

    if (session.mcpToolCallCount > 0) {
      sessionCountWithMcp += 1;
    }

    for (const topTool of session.topTools) {
      topToolCounts.set(
        topTool.toolName,
        (topToolCounts.get(topTool.toolName) ?? 0) + topTool.count,
      );
    }

    for (const toolFamily of session.toolFamilies) {
      toolFamilyCounts.set(
        toolFamily.family,
        (toolFamilyCounts.get(toolFamily.family) ?? 0) + toolFamily.count,
      );
    }

    for (const server of session.mcpServers) {
      mcpServerCounts.set(
        server.server,
        (mcpServerCounts.get(server.server) ?? 0) + server.toolCallCount,
      );
    }

    if (
      typeof session.inputTokens === "number" ||
      typeof session.outputTokens === "number" ||
      typeof session.totalTokens === "number"
    ) {
      tokenCoveredCount += 1;
      tokenInputTotal += session.inputTokens ?? 0;
      tokenOutputTotal += session.outputTokens ?? 0;
      tokenTotal += session.totalTokens ?? 0;
    }

    if (typeof session.durationMs === "number") {
      durationCoveredCount += 1;
      durationTotal += session.durationMs;
      durationValues.push(session.durationMs);
    }

    if (typeof session.compactionCount === "number") {
      compactionCoveredCount += 1;
      compactionTotal += session.compactionCount;
    }
  }

  const metrics: MetricsRecord = {
    engineVersion: ENGINE_VERSION,
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    sessionCount,
    corpusScope,
    appliedFilters,
    turnCount: parts.turnCount,
    incidentCount: parts.incidentCount,
    parseWarningCount: parts.parseWarningCount,
    labelCounts: parts.labelCounts,
    complianceSummary: aggregateComplianceSummary(sessionMetrics),
    providerDistribution: toDistributionEntries(providerCounts, sessionCount),
    harnessDistribution: {
      values: toDistributionEntries(harnessCounts, harnessCoveredCount),
      coverage: coverageStats(harnessCoveredCount, sessionCount),
    },
    modelDistribution: {
      values: toDistributionEntries(modelCounts, modelCoveredCount),
      coverage: coverageStats(modelCoveredCount, sessionCount),
    },
    messageStats: {
      totalUserMessages,
      totalAssistantMessages,
      avgUserMessagesPerSession: roundAverage(totalUserMessages, sessionCount),
      avgAssistantMessagesPerSession: roundAverage(
        totalAssistantMessages,
        sessionCount,
      ),
    },
    toolStats: {
      totalToolCallCount,
      totalWriteToolCallCount,
      totalVerificationToolCallCount,
      avgToolCallsPerSession: roundAverage(totalToolCallCount, sessionCount),
      avgWriteToolCallsPerSession: roundAverage(
        totalWriteToolCallCount,
        sessionCount,
      ),
      avgVerificationToolCallsPerSession: roundAverage(
        totalVerificationToolCallCount,
        sessionCount,
      ),
      topTools: toDistributionEntries(topToolCounts, totalToolCallCount),
      toolFamilyDistribution: toDistributionEntries(
        toolFamilyCounts,
        totalToolCallCount,
      ),
    },
    mcpStats: {
      sessionCountWithMcp,
      sessionSharePct:
        sessionCount > 0 ? safeRate(sessionCountWithMcp, sessionCount) : null,
      totalToolCallCount: totalMcpToolCallCount,
      serverDistribution: toDistributionEntries(
        mcpServerCounts,
        totalMcpToolCallCount,
      ),
    },
    tokenStats: {
      coverage: coverageStats(tokenCoveredCount, sessionCount),
      inputTokensAvg:
        tokenCoveredCount > 0
          ? roundAverage(tokenInputTotal, tokenCoveredCount)
          : null,
      outputTokensAvg:
        tokenCoveredCount > 0
          ? roundAverage(tokenOutputTotal, tokenCoveredCount)
          : null,
      totalTokensAvg:
        tokenCoveredCount > 0
          ? roundAverage(tokenTotal, tokenCoveredCount)
          : null,
    },
    durationStats: {
      coverage: coverageStats(durationCoveredCount, sessionCount),
      avgDurationMs:
        durationCoveredCount > 0
          ? roundAverage(durationTotal, durationCoveredCount)
          : null,
      medianDurationMs: median(durationValues),
    },
    compactionStats: {
      coverage: coverageStats(compactionCoveredCount, sessionCount),
      avgCompactionCount:
        compactionCoveredCount > 0
          ? roundAverage(compactionTotal, compactionCoveredCount)
          : null,
      sessionCountWithCompaction: sessionMetrics.filter(
        (session) => (session.compactionCount ?? 0) > 0,
      ).length,
      sessionSharePct:
        sessionCount > 0
          ? safeRate(
              sessionMetrics.filter(
                (session) => (session.compactionCount ?? 0) > 0,
              ).length,
              sessionCount,
            )
          : null,
    },
    attributionSummary: parts.attributionSummary,
    templateSubstrate: parts.templateSubstrate,
    temporalBuckets: buildTemporalBuckets(
      sessionMetrics,
      appliedFilters.timeBucket,
    ),
    coverageWarnings: [],
    sampleWarnings: [],
    sessions: sessionMetrics,
    inventory: redactInventory(inventory),
  };

  metrics.coverageWarnings = buildCoverageWarnings(metrics);
  metrics.sampleWarnings = buildSampleWarnings(metrics);

  return metrics;
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
  options: BuildMetricsOptions = {},
): MetricsRecord {
  const labelCounts = aggregateLabelCounts(sessions);
  const sessionMetrics = sessions.map((session) => session.metrics);

  return buildMetricsRecord(
    {
      sessionMetrics,
      labelCounts,
      turnCount: sessions.reduce(
        (sum, session) => sum + session.turns.length,
        0,
      ),
      incidentCount: sessions.reduce(
        (sum, session) => sum + session.incidents.length,
        0,
      ),
      parseWarningCount: sessionMetrics.reduce(
        (sum, session) => sum + session.parseWarningCount,
        0,
      ),
      attributionSummary: buildAttributionSummary(sessions),
      templateSubstrate: buildTemplateSubstrate(
        sessions,
        options.templateLabelSummaries ?? [],
      ),
    },
    inventory,
    options,
  );
}

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
          turnSum +
          turn.labels.filter((label) => label.label === labelName).length,
        0,
      ),
    0,
  );
}

export function countWriteTurns(sessions: readonly ProcessedSession[]): number {
  return sessions.reduce(
    (sum, session) =>
      sum +
      session.turns.filter((turn) =>
        turn.toolCalls.some((toolCall) => toolCall.writeLike),
      ).length,
    0,
  );
}

export function extractAllIncidents(
  sessions: readonly ProcessedSession[],
): import("./schema.js").IncidentRecord[] {
  return sessions.flatMap((session) => session.incidents);
}

export function extractAllTurns(
  sessions: readonly ProcessedSession[],
): import("./schema.js").RawTurnRecord[] {
  return sessions.flatMap((session) => session.turns);
}
