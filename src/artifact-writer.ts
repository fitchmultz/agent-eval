/**
 * Purpose: Persist canonical parse and evaluation artifacts to the filesystem.
 * Responsibilities: Write normalized raw turns, incidents, metrics, summary data, markdown, HTML, and SVG outputs.
 * Scope: Final output stage for parse, eval, and report CLI commands.
 * Usage: Call `writeParseArtifacts()` for parse-only runs or `writeArtifacts()` for full evaluation bundles.
 * Invariants/Assumptions: Artifact content is fully computed before this module runs; this module only serializes and writes files.
 */

import { join } from "node:path";

import { writeJsonLinesFile, writeTextFile } from "./filesystem.js";
import type { PresentationArtifacts } from "./presentation.js";
import type {
  IncidentRecord,
  MetricsRecord,
  RawTurnRecord,
  SummaryArtifact,
} from "./schema.js";

/**
 * Canonical evaluation result used by the CLI and artifact writer.
 */
export interface EvaluationArtifacts {
  metrics: MetricsRecord;
  summary: SummaryArtifact;
  report: string;
  presentation: PresentationArtifacts;
  rawTurns?: RawTurnRecord[] | undefined;
  incidents?: IncidentRecord[] | undefined;
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
  if (result.rawTurns) {
    await writeJsonLinesFile(
      join(outputDir, "raw-turns.jsonl"),
      result.rawTurns,
    );
  }

  if (result.incidents) {
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
  await writeTextFile(join(outputDir, "report.md"), result.report);
  await writeTextFile(
    join(outputDir, "report.html"),
    result.presentation.reportHtml,
  );
  await writeTextFile(
    join(outputDir, "favicon.svg"),
    result.presentation.faviconSvg,
  );
  await writeTextFile(
    join(outputDir, "label-counts.svg"),
    result.presentation.labelChartSvg,
  );
  await writeTextFile(
    join(outputDir, "compliance-summary.svg"),
    result.presentation.complianceChartSvg,
  );
  await writeTextFile(
    join(outputDir, "severity-breakdown.svg"),
    result.presentation.severityChartSvg,
  );
}
