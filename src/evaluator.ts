/**
 * Purpose: Runs the end-to-end evaluation pipeline from discovery through output generation.
 * Entrypoint: `evaluateArtifacts()` powers the parse, eval, and report CLI commands.
 * Notes: v1 uses transcript JSONL as canonical input and inventories enrichment sources without requiring them.
 */
import { join } from "node:path";
import { clusterIncidents } from "./clustering.js";
import { scoreCompliance } from "./compliance.js";
import { discoverArtifacts } from "./discovery.js";
import { writeJsonLinesFile, writeTextFile } from "./filesystem.js";
import {
  buildSummaryArtifact,
  createEmptySessionLabelMap,
  createEmptySeverityCounts,
  insertTopIncident,
  type SummaryInputs,
} from "./insights.js";
import { labelTurn } from "./labels.js";
import {
  createPresentationArtifacts,
  createPresentationArtifactsFromSummary,
} from "./presentation.js";
import { renderReport, renderSummaryReport } from "./report.js";
import { createMessagePreviews } from "./sanitization.js";
import type {
  ComplianceAggregate,
  ComplianceRuleName,
  ComplianceStatus,
  IncidentRecord,
  LabelCountRecord,
  MetricsRecord,
  RawTurnRecord,
  SessionMetrics,
  SummaryArtifact,
  ToolCallSummary,
} from "./schema.js";
import { complianceRuleValues, labelTaxonomy } from "./schema.js";
import { categorizeToolCall } from "./tool-classification.js";
import { parseTranscriptFile } from "./transcript.js";
import { mapWithConcurrency } from "./utils/concurrency.js";
import { EVALUATOR_VERSION, SCHEMA_VERSION } from "./version.js";

export interface EvaluatedTurn extends RawTurnRecord {}

export interface EvaluationResult {
  rawTurns: RawTurnRecord[];
  incidents: IncidentRecord[];
  metrics: MetricsRecord;
  report: string;
}

export interface EvaluateOptions {
  codexHome: string;
  outputDir: string;
  sessionLimit?: number;
}

export interface SummaryOnlyEvaluationResult {
  metrics: MetricsRecord;
  summary: SummaryArtifact;
  report: string;
}

interface SessionSummaryComputation {
  sessionId: string;
  sessionMetrics: SessionMetrics;
  localLabelCounts: ReturnType<typeof createEmptySessionLabelMap>;
  localIncidents: IncidentRecord[];
  rawTurns: RawTurnRecord[];
  turnCount: number;
  writeTurnCount: number;
}

interface SharedEvaluationAggregate {
  discoveredInventory: MetricsRecord["inventory"];
  sessionSummaries: SessionSummaryComputation[];
  labelCounts: LabelCountRecord;
  complianceSummary: ComplianceAggregate[];
  sessionLabelCounts: Map<
    string,
    ReturnType<typeof createEmptySessionLabelMap>
  >;
  severityCounts: Record<
    SummaryArtifact["severities"][number]["severity"],
    number
  >;
  topIncidents: SummaryArtifact["topIncidents"];
  turnCount: number;
  incidentCount: number;
  writeTurnCount: number;
}

const FULL_EVALUATION_CONCURRENCY = 4;
const SUMMARY_EVALUATION_CONCURRENCY = 8;

function summarizeToolCall(
  toolName: string,
  argumentsText?: string,
): ToolCallSummary {
  const commandText = argumentsText?.includes('"cmd"')
    ? argumentsText
    : undefined;
  const categorization = categorizeToolCall(toolName, commandText);

  return {
    toolName,
    category: categorization.category,
    commandText,
    writeLike: categorization.writeLike,
    verificationLike: categorization.verificationLike,
    status: "unknown",
  };
}

function createEmptyLabelCounts(): LabelCountRecord {
  return {};
}

function getHomeDirectory(): string | undefined {
  const homeEnvironmentKey = "HOME";
  return process.env[homeEnvironmentKey];
}

function redactPath(path: string): string {
  const homeDirectory = getHomeDirectory();
  return homeDirectory ? path.replace(homeDirectory, "~") : path;
}

function createEmptyComplianceSummary(): ComplianceAggregate[] {
  return complianceRuleValues.map((rule) => ({
    rule,
    passCount: 0,
    failCount: 0,
    notApplicableCount: 0,
    unknownCount: 0,
  }));
}

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

async function summarizeSession(
  sessionPath: string,
  homeDirectory: string | undefined,
): Promise<SessionSummaryComputation> {
  const session = await parseTranscriptFile(sessionPath);
  const compliance = scoreCompliance(session);
  let labeledTurnCount = 0;
  let writeTurnCount = 0;
  const localLabelCounts = createEmptySessionLabelMap();
  const localTurns: RawTurnRecord[] = [];

  for (const turn of session.turns) {
    const labels = labelTurn(turn);
    if (labels.length > 0) {
      labeledTurnCount += 1;
      for (const label of labels) {
        localLabelCounts[label.label] += 1;
      }
    }

    const toolCalls = turn.toolCalls.map((toolCall) => ({
      ...summarizeToolCall(toolCall.toolName, toolCall.argumentsText),
      status: toolCall.status,
    }));
    if (toolCalls.some((toolCall) => toolCall.writeLike)) {
      writeTurnCount += 1;
    }

    localTurns.push({
      evaluatorVersion: EVALUATOR_VERSION,
      schemaVersion: SCHEMA_VERSION,
      sessionId: session.sessionId,
      parentSessionId: session.parentSessionId,
      turnId: turn.turnId,
      turnIndex: turn.turnIndex,
      startedAt: turn.startedAt,
      cwd: turn.cwd ? redactPath(turn.cwd) : undefined,
      userMessageCount: turn.userMessages.length,
      assistantMessageCount: turn.assistantMessages.length,
      userMessagePreviews: createMessagePreviews(turn.userMessages, {
        homeDirectory,
        maxItems: 2,
        maxLength: 220,
      }),
      assistantMessagePreviews: createMessagePreviews(turn.assistantMessages, {
        homeDirectory,
        maxItems: 2,
        maxLength: 220,
      }),
      toolCalls,
      labels,
      sourceRefs: turn.sourceRefs.map((sourceRef) => ({
        ...sourceRef,
        path: redactPath(sourceRef.path),
      })),
    });
  }

  const localIncidents = clusterIncidents(
    localTurns.filter((turn) => turn.labels.length > 0),
    { maxTurnGap: 2 },
    EVALUATOR_VERSION,
    SCHEMA_VERSION,
  );

  return {
    sessionId: session.sessionId,
    sessionMetrics: {
      sessionId: session.sessionId,
      turnCount: session.turns.length,
      labeledTurnCount,
      incidentCount: localIncidents.length,
      writeCount: compliance.writeCount,
      verificationCount: compliance.verificationCount,
      verificationPassedCount: compliance.verificationPassedCount,
      verificationFailedCount: compliance.verificationFailedCount,
      complianceScore: compliance.score,
      complianceRules: compliance.rules,
    },
    localLabelCounts,
    localIncidents,
    rawTurns: localTurns,
    turnCount: session.turns.length,
    writeTurnCount,
  };
}

function selectSessionPaths(
  sessionFiles: readonly string[],
  sessionLimit?: number,
): readonly string[] {
  return typeof sessionLimit === "number"
    ? sessionFiles.slice(-sessionLimit)
    : sessionFiles;
}

function redactInventory(
  inventory: MetricsRecord["inventory"],
): MetricsRecord["inventory"] {
  return inventory.map((record) => ({
    ...record,
    path: redactPath(record.path),
  }));
}

function accumulateSharedEvaluation(
  sessionSummaries: readonly SessionSummaryComputation[],
): Omit<SharedEvaluationAggregate, "discoveredInventory"> {
  let labelCounts = createEmptyLabelCounts();
  let complianceSummary = createEmptyComplianceSummary();
  const sessionLabelCounts = new Map<
    string,
    ReturnType<typeof createEmptySessionLabelMap>
  >();
  const severityCounts = createEmptySeverityCounts();
  let topIncidents: SummaryArtifact["topIncidents"] = [];
  let turnCount = 0;
  let incidentCount = 0;
  let writeTurnCount = 0;

  for (const entry of sessionSummaries) {
    sessionLabelCounts.set(entry.sessionId, entry.localLabelCounts);
    turnCount += entry.turnCount;
    incidentCount += entry.localIncidents.length;
    writeTurnCount += entry.writeTurnCount;

    for (const rule of entry.sessionMetrics.complianceRules) {
      complianceSummary = incrementComplianceSummary(
        complianceSummary,
        rule.rule,
        rule.status,
      );
    }

    for (const label of labelTaxonomy) {
      const count = entry.localLabelCounts[label];
      if (count <= 0) {
        continue;
      }

      labelCounts = {
        ...labelCounts,
        [label]: (labelCounts[label] ?? 0) + count,
      };
    }

    for (const incident of entry.localIncidents) {
      severityCounts[incident.severity] += 1;
      topIncidents = insertTopIncident(
        topIncidents,
        {
          incidentId: incident.incidentId,
          sessionId: incident.sessionId,
          summary: incident.summary,
          severity: incident.severity,
          confidence: incident.confidence,
          turnSpan: incident.turnIndices.length,
          evidencePreview: incident.evidencePreviews[0],
        },
        8,
      );
    }
  }

  return {
    sessionSummaries: [...sessionSummaries],
    labelCounts,
    complianceSummary,
    sessionLabelCounts,
    severityCounts,
    topIncidents,
    turnCount,
    incidentCount,
    writeTurnCount,
  };
}

async function buildSharedEvaluationAggregate(
  options: EvaluateOptions,
  concurrency: number,
): Promise<SharedEvaluationAggregate> {
  const discoveredArtifacts = await discoverArtifacts(options.codexHome);
  const sessionPaths = selectSessionPaths(
    discoveredArtifacts.sessionFiles,
    options.sessionLimit,
  );
  const homeDirectory = getHomeDirectory();
  const sessionSummaries = await mapWithConcurrency(
    sessionPaths,
    concurrency,
    async (sessionPath) => summarizeSession(sessionPath, homeDirectory),
  );

  return {
    discoveredInventory: redactInventory(discoveredArtifacts.inventory),
    ...accumulateSharedEvaluation(sessionSummaries),
  };
}

function buildMetricsRecord(
  aggregate: SharedEvaluationAggregate,
  sessionCount: number,
  sessionMetrics: readonly SessionMetrics[],
  incidentCount: number,
  turnCount: number,
): MetricsRecord {
  return {
    evaluatorVersion: EVALUATOR_VERSION,
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    sessionCount,
    turnCount,
    incidentCount,
    labelCounts: aggregate.labelCounts,
    complianceSummary: aggregate.complianceSummary,
    sessions: [...sessionMetrics],
    inventory: aggregate.discoveredInventory,
  };
}

export async function evaluateArtifacts(
  options: EvaluateOptions,
): Promise<EvaluationResult> {
  const aggregate = await buildSharedEvaluationAggregate(
    options,
    FULL_EVALUATION_CONCURRENCY,
  );
  const rawTurns = aggregate.sessionSummaries.flatMap(
    (entry) => entry.rawTurns,
  );
  const evaluatedTurns = rawTurns.filter((turn) => turn.labels.length > 0);
  const incidents = clusterIncidents(
    evaluatedTurns,
    { maxTurnGap: 2 },
    EVALUATOR_VERSION,
    SCHEMA_VERSION,
  );

  const incidentCountBySession = new Map<string, number>();
  for (const incident of incidents) {
    incidentCountBySession.set(
      incident.sessionId,
      (incidentCountBySession.get(incident.sessionId) ?? 0) + 1,
    );
  }

  const metrics = buildMetricsRecord(
    aggregate,
    aggregate.sessionSummaries.length,
    aggregate.sessionSummaries.map((entry) => ({
      ...entry.sessionMetrics,
      incidentCount:
        incidentCountBySession.get(entry.sessionMetrics.sessionId) ?? 0,
    })),
    incidents.length,
    rawTurns.length,
  );

  const report = renderReport(metrics, incidents, rawTurns);
  return {
    rawTurns,
    incidents,
    metrics,
    report,
  };
}

export async function evaluateArtifactsSummaryOnly(
  options: EvaluateOptions,
): Promise<SummaryOnlyEvaluationResult> {
  const aggregate = await buildSharedEvaluationAggregate(
    options,
    SUMMARY_EVALUATION_CONCURRENCY,
  );
  const metrics = buildMetricsRecord(
    aggregate,
    aggregate.sessionSummaries.length,
    aggregate.sessionSummaries.map((entry) => entry.sessionMetrics),
    aggregate.incidentCount,
    aggregate.turnCount,
  );
  const summaryInputs: SummaryInputs = {
    sessionLabelCounts: aggregate.sessionLabelCounts,
    topIncidents: aggregate.topIncidents,
    severityCounts: aggregate.severityCounts,
    writeTurnCount: aggregate.writeTurnCount,
  };
  const summary = buildSummaryArtifact(metrics, summaryInputs);
  const report = renderSummaryReport(metrics, summary);

  return {
    metrics,
    summary,
    report,
  };
}

interface SharedArtifactWriteResult {
  metrics: MetricsRecord;
  report: string;
  summary: SummaryArtifact;
}

async function writeSharedArtifacts(
  result: SharedArtifactWriteResult,
  outputDir: string,
): Promise<void> {
  await writeTextFile(
    join(outputDir, "metrics.json"),
    `${JSON.stringify(result.metrics, null, 2)}\n`,
  );
  await writeTextFile(
    join(outputDir, "summary.json"),
    `${JSON.stringify(result.summary, null, 2)}\n`,
  );
  await writeTextFile(join(outputDir, "report.md"), result.report);
  const presentation = createPresentationArtifactsFromSummary(
    result.metrics,
    result.summary,
  );
  await writeTextFile(join(outputDir, "report.html"), presentation.reportHtml);
  await writeTextFile(
    join(outputDir, "label-counts.svg"),
    presentation.labelChartSvg,
  );
  await writeTextFile(
    join(outputDir, "compliance-summary.svg"),
    presentation.complianceChartSvg,
  );
  await writeTextFile(
    join(outputDir, "severity-breakdown.svg"),
    presentation.severityChartSvg,
  );
}

export async function writeEvaluationArtifacts(
  result: EvaluationResult,
  outputDir: string,
): Promise<void> {
  await writeJsonLinesFile(join(outputDir, "raw-turns.jsonl"), result.rawTurns);
  await writeJsonLinesFile(
    join(outputDir, "incidents.jsonl"),
    result.incidents,
  );
  const presentation = createPresentationArtifacts(
    result.metrics,
    result.incidents,
    result.rawTurns,
  );
  await writeSharedArtifacts(
    {
      metrics: result.metrics,
      report: result.report,
      summary: presentation.summary,
    },
    outputDir,
  );
}

export async function writeSummaryArtifacts(
  result: SummaryOnlyEvaluationResult,
  outputDir: string,
): Promise<void> {
  await writeSharedArtifacts(
    {
      metrics: result.metrics,
      report: result.report,
      summary: result.summary,
    },
    outputDir,
  );
}
