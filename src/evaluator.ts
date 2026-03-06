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
import { parseTranscriptFile } from "./transcript.js";
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
  turnCount: number;
  writeTurnCount: number;
}

function summarizeToolCall(
  toolName: string,
  argumentsText?: string,
): ToolCallSummary {
  const commandText = argumentsText?.includes('"cmd"')
    ? argumentsText
    : undefined;
  const writeLike = [
    "apply_patch",
    "mcp__RepoPrompt__apply_edits",
    "mcp__RepoPrompt__file_actions",
  ].includes(toolName);
  const verificationLike =
    typeof commandText === "string" &&
    /\b(test|vitest|lint|typecheck|build|make ci)\b/i.test(commandText);

  return {
    toolName,
    category: writeLike ? "write" : verificationLike ? "verification" : "other",
    commandText,
    writeLike,
    verificationLike,
    status: "unknown",
  };
}

function incrementLabelCount(
  counts: LabelCountRecord,
  label: keyof LabelCountRecord,
): LabelCountRecord {
  return {
    ...counts,
    [label]: (counts[label] ?? 0) + 1,
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

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function runWorker(): Promise<void> {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      const item = items[currentIndex];
      if (item === undefined) {
        return;
      }

      results[currentIndex] = await worker(item, currentIndex);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () =>
      runWorker(),
    ),
  );

  return results;
}

async function summarizeSessionForSummaryOnly(
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
    turnCount: session.turns.length,
    writeTurnCount,
  };
}

export async function evaluateArtifacts(
  options: EvaluateOptions,
): Promise<EvaluationResult> {
  const discoveredArtifacts = await discoverArtifacts(options.codexHome);
  const sessionPaths =
    typeof options.sessionLimit === "number"
      ? discoveredArtifacts.sessionFiles.slice(-options.sessionLimit)
      : discoveredArtifacts.sessionFiles;
  const parsedSessions = [];
  for (const sessionPath of sessionPaths) {
    parsedSessions.push(await parseTranscriptFile(sessionPath));
  }

  const rawTurns: RawTurnRecord[] = [];
  const sessionMetrics: SessionMetrics[] = [];
  let labelCounts = createEmptyLabelCounts();
  let complianceSummary = createEmptyComplianceSummary();
  const homeDirectory = getHomeDirectory();

  for (const session of parsedSessions) {
    const compliance = scoreCompliance(session);
    for (const rule of compliance.rules) {
      complianceSummary = incrementComplianceSummary(
        complianceSummary,
        rule.rule,
        rule.status,
      );
    }
    let labeledTurnCount = 0;

    for (const turn of session.turns) {
      const labels = labelTurn(turn);
      if (labels.length > 0) {
        labeledTurnCount += 1;
        for (const label of labels) {
          labelCounts = incrementLabelCount(labelCounts, label.label);
        }
      }

      rawTurns.push({
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
        assistantMessagePreviews: createMessagePreviews(
          turn.assistantMessages,
          {
            homeDirectory,
            maxItems: 2,
            maxLength: 220,
          },
        ),
        toolCalls: turn.toolCalls.map((toolCall) => ({
          ...summarizeToolCall(toolCall.toolName, toolCall.argumentsText),
          status: toolCall.status,
        })),
        labels,
        sourceRefs: turn.sourceRefs.map((sourceRef) => ({
          ...sourceRef,
          path: redactPath(sourceRef.path),
        })),
      });
    }

    sessionMetrics.push({
      sessionId: session.sessionId,
      turnCount: session.turns.length,
      labeledTurnCount,
      incidentCount: 0,
      writeCount: compliance.writeCount,
      verificationCount: compliance.verificationCount,
      verificationPassedCount: compliance.verificationPassedCount,
      verificationFailedCount: compliance.verificationFailedCount,
      complianceScore: compliance.score,
      complianceRules: compliance.rules,
    });
  }

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

  const metrics: MetricsRecord = {
    evaluatorVersion: EVALUATOR_VERSION,
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    sessionCount: parsedSessions.length,
    turnCount: rawTurns.length,
    incidentCount: incidents.length,
    labelCounts,
    complianceSummary,
    sessions: sessionMetrics.map((session) => ({
      ...session,
      incidentCount: incidentCountBySession.get(session.sessionId) ?? 0,
    })),
    inventory: discoveredArtifacts.inventory.map((record) => ({
      ...record,
      path: redactPath(record.path),
    })),
  };

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
  const discoveredArtifacts = await discoverArtifacts(options.codexHome);
  const sessionPaths =
    typeof options.sessionLimit === "number"
      ? discoveredArtifacts.sessionFiles.slice(-options.sessionLimit)
      : discoveredArtifacts.sessionFiles;
  let labelCounts = createEmptyLabelCounts();
  let complianceSummary = createEmptyComplianceSummary();
  const sessionLabelCounts = new Map<
    string,
    ReturnType<typeof createEmptySessionLabelMap>
  >();
  const severityCounts = createEmptySeverityCounts();
  let topIncidents: SummaryArtifact["topIncidents"] = [];
  let totalTurnCount = 0;
  let totalIncidentCount = 0;
  let writeTurnCount = 0;
  const homeDirectory = getHomeDirectory();
  const sessionSummaries = await mapWithConcurrency(
    sessionPaths,
    8,
    async (sessionPath) =>
      summarizeSessionForSummaryOnly(sessionPath, homeDirectory),
  );
  const sessionMetrics = sessionSummaries.map((entry) => entry.sessionMetrics);

  for (const entry of sessionSummaries) {
    sessionLabelCounts.set(entry.sessionId, entry.localLabelCounts);
    totalTurnCount += entry.turnCount;
    totalIncidentCount += entry.localIncidents.length;
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

  const metrics: MetricsRecord = {
    evaluatorVersion: EVALUATOR_VERSION,
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    sessionCount: sessionPaths.length,
    turnCount: totalTurnCount,
    incidentCount: totalIncidentCount,
    labelCounts,
    complianceSummary,
    sessions: sessionMetrics,
    inventory: discoveredArtifacts.inventory.map((record) => ({
      ...record,
      path: redactPath(record.path),
    })),
  };
  const summaryInputs: SummaryInputs = {
    sessionLabelCounts,
    topIncidents,
    severityCounts,
    writeTurnCount,
  };
  const summary = buildSummaryArtifact(metrics, summaryInputs);
  const report = renderSummaryReport(metrics, summary);

  return {
    metrics,
    summary,
    report,
  };
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
  await writeTextFile(
    join(outputDir, "metrics.json"),
    `${JSON.stringify(result.metrics, null, 2)}\n`,
  );
  await writeTextFile(join(outputDir, "report.md"), result.report);
  const presentation = createPresentationArtifacts(
    result.metrics,
    result.incidents,
    result.rawTurns,
  );
  await writeTextFile(
    join(outputDir, "summary.json"),
    `${JSON.stringify(presentation.summary, null, 2)}\n`,
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

export async function writeSummaryArtifacts(
  result: SummaryOnlyEvaluationResult,
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
