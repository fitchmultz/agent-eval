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
import { ENGINE_VERSION, SCHEMA_VERSION } from "../version.js";
import { loadCalibrationCorpus } from "./corpus.js";
import { renderBenchmarkReport } from "./report.js";
import {
  type BenchmarkResults,
  benchmarkResultsSchema,
  type CalibrationCase,
  type CalibrationCaseResult,
} from "./types.js";

const BENCHMARK_VERSION = "2";
const BENCHMARK_HOME = "/Users/benchmark";

function safeRate(numerator: number, denominator: number): number {
  if (denominator <= 0) {
    return 0;
  }
  return Number(((numerator / denominator) * 100).toFixed(1));
}

function normalizeLabelInstances(
  instances: readonly { turnIndex: number; label: LabelName }[],
): Array<{ turnIndex: number; label: LabelName }> {
  return [...instances].sort(
    (left, right) =>
      left.turnIndex - right.turnIndex || left.label.localeCompare(right.label),
  );
}

function collectActualLabelInstances(
  processed: Awaited<ReturnType<typeof processSession>>,
): Array<{ turnIndex: number; label: LabelName }> {
  return normalizeLabelInstances(
    processed.turns.flatMap((turn) =>
      turn.labels.map((label) => ({
        turnIndex: turn.turnIndex,
        label: label.label,
      })),
    ),
  );
}

function labelInstanceKey(instance: {
  turnIndex: number;
  label: LabelName;
}): string {
  return `${instance.turnIndex}:${instance.label}`;
}

function buildLabelMetricsForCase(
  expectedInstances: readonly { turnIndex: number; label: LabelName }[],
  actualInstances: readonly { turnIndex: number; label: LabelName }[],
): CalibrationCaseResult["labelMetrics"] {
  const expectedKeys = new Set(expectedInstances.map(labelInstanceKey));
  const actualKeys = new Set(actualInstances.map(labelInstanceKey));

  return labelTaxonomy.map((label) => {
    const expectedCount = expectedInstances.filter(
      (instance) => instance.label === label,
    ).length;
    const actualCount = actualInstances.filter(
      (instance) => instance.label === label,
    ).length;
    const truePositive = actualInstances.filter(
      (instance) =>
        instance.label === label &&
        expectedKeys.has(labelInstanceKey(instance)),
    ).length;
    const falsePositive = actualInstances.filter(
      (instance) =>
        instance.label === label &&
        !expectedKeys.has(labelInstanceKey(instance)),
    ).length;
    const falseNegative = expectedInstances.filter(
      (instance) =>
        instance.label === label && !actualKeys.has(labelInstanceKey(instance)),
    ).length;

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

function incidentKey(
  caseId: string,
  incident: {
    turnIndices: number[];
    labels: LabelName[];
  },
): string {
  return `${caseId}::${incident.turnIndices.join(",")}::${incident.labels.join(",")}`;
}

function buildIncidentMetricsForCase(
  caseId: string,
  expectedIncidents: readonly { turnIndices: number[]; labels: LabelName[] }[],
  actualIncidents: readonly { turnIndices: number[]; labels: LabelName[] }[],
): CalibrationCaseResult["incidentMetrics"] {
  const expectedKeys = new Set(
    expectedIncidents.map((incident) => incidentKey(caseId, incident)),
  );
  const actualKeys = new Set(
    actualIncidents.map((incident) => incidentKey(caseId, incident)),
  );
  const matchedCount = [...expectedKeys].filter((key) =>
    actualKeys.has(key),
  ).length;

  return {
    expectedCount: expectedIncidents.length,
    actualCount: actualIncidents.length,
    matchedCount,
    precision: safeRate(matchedCount, actualIncidents.length),
    recall: safeRate(matchedCount, expectedIncidents.length),
  };
}

function aggregateLabelMetrics(
  caseResults: readonly CalibrationCaseResult[],
): BenchmarkResults["labelMetrics"] {
  return labelTaxonomy.map((label) => {
    const totals = caseResults.reduce(
      (aggregate, testCase) => {
        const metric = testCase.labelMetrics.find(
          (entry) => entry.label === label,
        );
        return {
          expectedCount: aggregate.expectedCount + (metric?.expectedCount ?? 0),
          actualCount: aggregate.actualCount + (metric?.actualCount ?? 0),
          truePositive: aggregate.truePositive + (metric?.truePositive ?? 0),
          falsePositive: aggregate.falsePositive + (metric?.falsePositive ?? 0),
          falseNegative: aggregate.falseNegative + (metric?.falseNegative ?? 0),
        };
      },
      {
        expectedCount: 0,
        actualCount: 0,
        truePositive: 0,
        falsePositive: 0,
        falseNegative: 0,
      },
    );

    return {
      label,
      ...totals,
      precision: safeRate(
        totals.truePositive,
        totals.truePositive + totals.falsePositive,
      ),
      recall: safeRate(
        totals.truePositive,
        totals.truePositive + totals.falseNegative,
      ),
    };
  });
}

function aggregateIncidentMetrics(
  caseResults: readonly CalibrationCaseResult[],
): BenchmarkResults["incidentMetrics"] {
  const expectedCount = caseResults.reduce(
    (total, testCase) => total + testCase.incidentMetrics.expectedCount,
    0,
  );
  const actualCount = caseResults.reduce(
    (total, testCase) => total + testCase.incidentMetrics.actualCount,
    0,
  );
  const matchedCount = caseResults.reduce(
    (total, testCase) => total + testCase.incidentMetrics.matchedCount,
    0,
  );

  return {
    expectedCount,
    actualCount,
    matchedCount,
    precision: safeRate(matchedCount, actualCount),
    recall: safeRate(matchedCount, expectedCount),
  };
}

function evaluateSanitizationChecks(testCase: CalibrationCase) {
  return testCase.sanitizationChecks.map((check) => {
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
        mustContainMisses.length === 0 && mustNotContainViolations.length === 0,
      mustContainMisses,
      mustNotContainViolations,
      sanitized,
    };
  });
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
    const expectedLabelInstances = normalizeLabelInstances(
      testCase.expectedLabelInstances,
    );
    const actualLabelInstances = collectActualLabelInstances(processed);
    const expectedIncidents = normalizeIncidents(testCase.expectedIncidents);
    const actualIncidents = normalizeIncidents(processed.incidents);

    caseResults.push({
      id: testCase.id,
      provider: testCase.provider,
      fixture: testCase.fixture,
      parseWarnings: {
        expectedCount: testCase.expectedParseWarningCount,
        actualCount: processed.metrics.parseWarningCount,
        passed:
          testCase.expectedParseWarningCount ===
          processed.metrics.parseWarningCount,
      },
      expectedLabelInstances,
      actualLabelInstances,
      labelMetrics: buildLabelMetricsForCase(
        expectedLabelInstances,
        actualLabelInstances,
      ),
      expectedIncidents,
      actualIncidents,
      incidentMetrics: buildIncidentMetricsForCase(
        testCase.id,
        expectedIncidents,
        actualIncidents,
      ),
      expectedTerminalVerification: testCase.expectedTerminalVerification,
      actualTerminalVerification: {
        postWriteVerificationAttempted:
          processed.metrics.postWriteVerificationAttempted,
        postWriteVerificationPassed:
          processed.metrics.postWriteVerificationPassed,
        endedVerified: processed.metrics.endedVerified,
      },
      sanitizationChecks: evaluateSanitizationChecks(testCase),
    });
  }

  const sanitizationResults = caseResults.flatMap(
    (testCase) => testCase.sanitizationChecks,
  );

  const results = benchmarkResultsSchema.parse({
    benchmarkVersion: BENCHMARK_VERSION,
    engineVersion: ENGINE_VERSION,
    schemaVersion: SCHEMA_VERSION,
    caseCount: caseResults.length,
    labelMetrics: aggregateLabelMetrics(caseResults),
    incidentMetrics: aggregateIncidentMetrics(caseResults),
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
    parseWarningMetrics: {
      caseCount: caseResults.length,
      expectedCount: caseResults.reduce(
        (total, testCase) => total + testCase.parseWarnings.expectedCount,
        0,
      ),
      actualCount: caseResults.reduce(
        (total, testCase) => total + testCase.parseWarnings.actualCount,
        0,
      ),
      matchedCaseCount: caseResults.filter(
        (testCase) => testCase.parseWarnings.passed,
      ).length,
      accuracy: safeRate(
        caseResults.filter((testCase) => testCase.parseWarnings.passed).length,
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
