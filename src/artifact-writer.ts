/**
 * Purpose: Persist canonical parse and evaluation artifacts to the filesystem.
 * Responsibilities: Write normalized raw turns, incidents, metrics, summary data, markdown, HTML, and SVG outputs.
 * Scope: Final output stage for parse, eval, and report CLI commands.
 * Usage: Call `writeParseArtifacts()` for parse-only runs or `writeArtifacts()` for full evaluation bundles.
 * Invariants/Assumptions: Artifact content is fully computed before this module runs; this module only serializes and writes files.
 */

import { join } from "node:path";

import {
  writeBinaryFile,
  writeJsonLinesFile,
  writeTextFile,
} from "./filesystem.js";
import type { PresentationArtifacts } from "./presentation.js";
import {
  type ReleaseManifest,
  releaseManifestSchema,
} from "./release-manifest.js";
import type {
  IncidentRecord,
  MetricsRecord,
  RawTurnRecord,
  SessionFactRecord,
  SummaryArtifact,
} from "./schema.js";
import {
  incidentSchema,
  metricsSchema,
  rawTurnSchema,
  sessionFactSchema,
  summaryArtifactSchema,
} from "./schema.js";

/**
 * Canonical evaluation result used by the CLI and artifact writer.
 */
export interface EvaluationArtifacts {
  metrics: MetricsRecord;
  summary: SummaryArtifact;
  sessionFacts: SessionFactRecord[];
  releaseManifest: ReleaseManifest;
  report: string;
  presentation: PresentationArtifacts;
  rawTurns?: RawTurnRecord[] | undefined;
  incidents?: IncidentRecord[] | undefined;
}

function plannedArtifactFiles(result: EvaluationArtifacts): string[] {
  return [
    ...(result.rawTurns ? ["raw-turns.jsonl"] : []),
    ...(result.incidents ? ["incidents.jsonl"] : []),
    "metrics.json",
    "summary.json",
    "session-facts.jsonl",
    "release-manifest.json",
    "report.md",
    "report.html",
    "favicon.ico",
    "favicon.svg",
    "sessions-over-time.svg",
    "provider-share.svg",
    "harness-share.svg",
    "tool-family-share.svg",
    "attribution-mix.svg",
  ].sort();
}

function assertReleaseManifestArtifactInventory(
  result: EvaluationArtifacts,
): void {
  const expected = plannedArtifactFiles(result);
  const actual = [...result.releaseManifest.artifactFiles].sort();
  if (
    expected.length !== actual.length ||
    expected.some((file, index) => file !== actual[index])
  ) {
    throw new Error(
      `release-manifest artifactFiles mismatch: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`,
    );
  }
}

/**
 * Writes parse-only artifacts.
 */
export async function writeParseArtifacts(
  result: {
    rawTurns: readonly RawTurnRecord[];
    sessionCount: number;
    parseWarningCount: number;
  },
  outputDir: string,
): Promise<void> {
  for (const turn of result.rawTurns) {
    rawTurnSchema.parse(turn);
  }
  await writeJsonLinesFile(join(outputDir, "raw-turns.jsonl"), result.rawTurns);
  await writeTextFile(
    join(outputDir, "parse-metrics.json"),
    `${JSON.stringify(
      {
        sessionCount: result.sessionCount,
        rawTurnCount: result.rawTurns.length,
        parseWarningCount: result.parseWarningCount,
      },
      null,
      2,
    )}\n`,
  );
}

/**
 * Writes evaluation artifacts, including shared presentation outputs and optional raw data.
 */
export async function writeArtifacts(
  result: EvaluationArtifacts,
  outputDir: string,
): Promise<void> {
  metricsSchema.parse(result.metrics);
  summaryArtifactSchema.parse(result.summary);
  for (const sessionFact of result.sessionFacts) {
    sessionFactSchema.parse(sessionFact);
  }
  releaseManifestSchema.parse(result.releaseManifest);
  assertReleaseManifestArtifactInventory(result);

  if (result.rawTurns) {
    for (const turn of result.rawTurns) {
      rawTurnSchema.parse(turn);
    }
    await writeJsonLinesFile(
      join(outputDir, "raw-turns.jsonl"),
      result.rawTurns,
    );
  }

  if (result.incidents) {
    for (const incident of result.incidents) {
      incidentSchema.parse(incident);
    }
    await writeJsonLinesFile(
      join(outputDir, "incidents.jsonl"),
      result.incidents,
    );
  }

  await writeTextFile(
    join(outputDir, "metrics.json"),
    `${JSON.stringify(result.metrics, null, 2)}\n`,
  );
  await writeTextFile(
    join(outputDir, "summary.json"),
    `${JSON.stringify(result.summary, null, 2)}\n`,
  );
  await writeJsonLinesFile(
    join(outputDir, "session-facts.jsonl"),
    result.sessionFacts,
  );
  await writeTextFile(
    join(outputDir, "release-manifest.json"),
    `${JSON.stringify(result.releaseManifest, null, 2)}\n`,
  );
  await writeTextFile(join(outputDir, "report.md"), result.report);
  await writeTextFile(
    join(outputDir, "report.html"),
    result.presentation.reportHtml,
  );
  await writeBinaryFile(
    join(outputDir, "favicon.ico"),
    result.presentation.faviconIco,
  );
  await writeTextFile(
    join(outputDir, "favicon.svg"),
    result.presentation.faviconSvg,
  );
  await writeTextFile(
    join(outputDir, "sessions-over-time.svg"),
    result.presentation.sessionsOverTimeChartSvg,
  );
  await writeTextFile(
    join(outputDir, "provider-share.svg"),
    result.presentation.providerShareChartSvg,
  );
  await writeTextFile(
    join(outputDir, "harness-share.svg"),
    result.presentation.harnessShareChartSvg,
  );
  await writeTextFile(
    join(outputDir, "tool-family-share.svg"),
    result.presentation.toolFamilyShareChartSvg,
  );
  await writeTextFile(
    join(outputDir, "attribution-mix.svg"),
    result.presentation.attributionMixChartSvg,
  );
}
