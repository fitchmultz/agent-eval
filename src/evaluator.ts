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
import { labelTurn } from "./labels.js";
import { renderReport } from "./report.js";
import type {
  IncidentRecord,
  LabelCountRecord,
  MetricsRecord,
  RawTurnRecord,
  SessionMetrics,
  ToolCallSummary,
} from "./schema.js";
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

function redactPath(path: string): string {
  const homeEnvironmentKey = "HOME";
  const homeDirectory = process.env[homeEnvironmentKey];
  return homeDirectory ? path.replace(homeDirectory, "~") : path;
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

  for (const session of parsedSessions) {
    const compliance = scoreCompliance(session);
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
        userMessages: turn.userMessages,
        assistantMessages: turn.assistantMessages,
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
    sessions: sessionMetrics.map((session) => ({
      ...session,
      incidentCount: incidentCountBySession.get(session.sessionId) ?? 0,
    })),
    inventory: discoveredArtifacts.inventory.map((record) => ({
      ...record,
      path: redactPath(record.path),
    })),
  };

  const report = renderReport(metrics, incidents);
  return {
    rawTurns,
    incidents,
    metrics,
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
}
