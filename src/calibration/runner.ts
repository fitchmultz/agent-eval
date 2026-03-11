/**
 * Purpose: Execute the synthetic calibration corpus and compute deterministic benchmark artifacts.
 * Responsibilities: Parse transcript fixtures, process sessions, compare actual outputs to expectations, and aggregate benchmark metrics.
 * Scope: Standalone methodology validation subsystem outside the runtime evaluation pipeline.
 * Usage: Call `runCalibrationBenchmark()` from the benchmark CLI command or tests.
 * Invariants/Assumptions: The corpus is synthetic, deterministic, and evaluated without external providers or network access.
 */

import { join } from "node:path";
import { writeTextFile } from "../filesystem.js";
import { sanitizeMessageText } from "../sanitization.js";
import { type LabelName, labelTaxonomy } from "../schema.js";
import { processSession } from "../session-processor.js";
import { parseTranscriptFile } from "../transcript/index.js";
import { EVALUATOR_VERSION, SCHEMA_VERSION } from "../version.js";
import { loadCalibrationCorpus } from "./corpus.js";
import { renderBenchmarkReport } from "./report.js";
import {
  type BenchmarkResults,
  benchmarkResultsSchema,
  type CalibrationCase,
  type CalibrationCaseResult,
} from "./types.js";

const BENCHMARK_VERSION = "1";
const BENCHMARK_HOME = "/Users/benchmark";

function safeRate(numerator: number, denominator: number): number {
  if (denominator <= 0) {
    return 0;
  }
  return Number(((numerator / denominator) * 100).toFixed(1));
}

function createEmptyLabelCounts(): Record<
  (typeof labelTaxonomy)[number],
  number
> {
  return Object.fromEntries(labelTaxonomy.map((label) => [label, 0])) as Record<
    (typeof labelTaxonomy)[number],
    number
  >;
}

function countActualLabels(
  processed: Awaited<ReturnType<typeof processSession>>,
): Record<(typeof labelTaxonomy)[number], number> {
  const counts = createEmptyLabelCounts();
  for (const turn of processed.turns) {
    for (const label of turn.labels) {
      counts[label.label] += 1;
    }
  }
  return counts;
}

function normalizeExpectedLabels(
  testCase: CalibrationCase,
): Record<(typeof labelTaxonomy)[number], number> {
  return {
    ...createEmptyLabelCounts(),
    ...testCase.expectedLabelCounts,
  };
}

function normalizeIncidents(
  incidents: readonly {
    turnIndices: readonly number[];
    labels: readonly { label: LabelName }[] | readonly LabelName[];
  }[],
): Array<{ turnIndices: number[]; labels: LabelName[] }> {
  return incidents.map((incident) => ({
    turnIndices: [...incident.turnIndices].sort((left, right) => left - right),
    labels: [...incident.labels]
      .map((label) => (typeof label === "string" ? label : label.label))
      .sort(),
  }));
}

function incidentKey(incident: {
  turnIndices: number[];
  labels: LabelName[];
}): string {
  return `${incident.turnIndices.join(",")}::${incident.labels.join(",")}`;
}

export async function runCalibrationBenchmark(outputDir?: string): Promise<{
  results: BenchmarkResults;
  report: string;
}> {
  const corpus = loadCalibrationCorpus();
  const caseResults: CalibrationCaseResult[] = [];

  for (const testCase of corpus) {
    const parsed = await parseTranscriptFile(testCase.fixturePath, {
      sourceProvider: testCase.provider,
      strict: false,
    });
    const processed = await processSession(parsed, BENCHMARK_HOME);
    const actualLabelCounts = countActualLabels(processed);
    const actualIncidents = normalizeIncidents(processed.incidents);
    const expectedIncidents = normalizeIncidents(testCase.expectedIncidents);
    const sanitizationChecks = testCase.sanitizationChecks.map((check) => {
      const sanitized = sanitizeMessageText(check.input, {
        homeDirectory: BENCHMARK_HOME,
        maxLength: 240,
      });
      const mustContainMisses = check.mustContain.filter(
        (needle) => !sanitized.includes(needle),
      );
      const mustNotContainViolations = check.mustNotContain.filter((needle) =>
        sanitized.includes(needle),
      );
      return {
        input: check.input,
        passed:
          mustContainMisses.length === 0 &&
          mustNotContainViolations.length === 0,
        mustContainMisses,
        mustNotContainViolations,
        sanitized,
      };
    });

    caseResults.push({
      id: testCase.id,
      provider: testCase.provider,
      fixture: testCase.fixture,
      parseWarningCount: processed.metrics.parseWarningCount,
      expectedLabelCounts: normalizeExpectedLabels(testCase),
      actualLabelCounts,
      expectedIncidents,
      actualIncidents,
      expectedTerminalVerification: testCase.expectedTerminalVerification,
      actualTerminalVerification: {
        postWriteVerificationAttempted:
          processed.metrics.postWriteVerificationAttempted,
        postWriteVerificationPassed:
          processed.metrics.postWriteVerificationPassed,
        endedVerified: processed.metrics.endedVerified,
      },
      sanitizationChecks,
    });
  }

  const labelMetrics = labelTaxonomy.map((label) => {
    const expectedCount = caseResults.reduce(
      (total, testCase) => total + (testCase.expectedLabelCounts[label] ?? 0),
      0,
    );
    const actualCount = caseResults.reduce(
      (total, testCase) => total + (testCase.actualLabelCounts[label] ?? 0),
      0,
    );
    const truePositive = Math.min(expectedCount, actualCount);
    const falsePositive = Math.max(0, actualCount - expectedCount);
    const falseNegative = Math.max(0, expectedCount - actualCount);
    return {
      label,
      expectedCount,
      actualCount,
      truePositive,
      falsePositive,
      falseNegative,
      precision: safeRate(truePositive, truePositive + falsePositive),
      recall: safeRate(truePositive, truePositive + falseNegative),
    };
  });

  const expectedIncidentKeys = new Set(
    caseResults.flatMap((testCase) =>
      testCase.expectedIncidents.map((incident) =>
        incidentKey({
          turnIndices: incident.turnIndices,
          labels: incident.labels,
        }),
      ),
    ),
  );
  const actualIncidentKeys = new Set(
    caseResults.flatMap((testCase) =>
      testCase.actualIncidents.map((incident) =>
        incidentKey({
          turnIndices: incident.turnIndices,
          labels: incident.labels,
        }),
      ),
    ),
  );
  const matchedIncidentCount = [...expectedIncidentKeys].filter((key) =>
    actualIncidentKeys.has(key),
  ).length;

  const sanitizationResults = caseResults.flatMap(
    (testCase) => testCase.sanitizationChecks,
  );

  const results = benchmarkResultsSchema.parse({
    benchmarkVersion: BENCHMARK_VERSION,
    evaluatorVersion: EVALUATOR_VERSION,
    schemaVersion: SCHEMA_VERSION,
    caseCount: caseResults.length,
    labelMetrics,
    incidentMetrics: {
      expectedCount: expectedIncidentKeys.size,
      actualCount: actualIncidentKeys.size,
      matchedCount: matchedIncidentCount,
      precision: safeRate(matchedIncidentCount, actualIncidentKeys.size),
      recall: safeRate(matchedIncidentCount, expectedIncidentKeys.size),
    },
    terminalVerificationMetrics: {
      caseCount: caseResults.length,
      endedVerifiedAccuracy: safeRate(
        caseResults.filter(
          (testCase) =>
            testCase.expectedTerminalVerification.endedVerified ===
            testCase.actualTerminalVerification.endedVerified,
        ).length,
        caseResults.length,
      ),
      postWriteVerificationAttemptedAccuracy: safeRate(
        caseResults.filter(
          (testCase) =>
            testCase.expectedTerminalVerification
              .postWriteVerificationAttempted ===
            testCase.actualTerminalVerification.postWriteVerificationAttempted,
        ).length,
        caseResults.length,
      ),
      postWriteVerificationPassedAccuracy: safeRate(
        caseResults.filter(
          (testCase) =>
            testCase.expectedTerminalVerification
              .postWriteVerificationPassed ===
            testCase.actualTerminalVerification.postWriteVerificationPassed,
        ).length,
        caseResults.length,
      ),
    },
    sanitizationMetrics: {
      checkCount: sanitizationResults.length,
      passedCount: sanitizationResults.filter((check) => check.passed).length,
      falsePositiveExamples: sanitizationResults
        .filter((check) => check.mustContainMisses.length > 0)
        .map((check) => check.input),
      falseNegativeExamples: sanitizationResults
        .filter((check) => check.mustNotContainViolations.length > 0)
        .map((check) => check.input),
    },
    cases: caseResults,
  });

  const report = renderBenchmarkReport(results);

  if (outputDir) {
    await writeTextFile(
      join(outputDir, "benchmark-results.json"),
      `${JSON.stringify(results, null, 2)}\n`,
    );
    await writeTextFile(join(outputDir, "benchmark-report.md"), report);
  }

  return { results, report };
}
