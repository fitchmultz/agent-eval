/**
 * Purpose: Execute the synthetic calibration corpus through the canonical evaluator and compute deterministic benchmark artifacts.
 * Responsibilities: Materialize provider-shaped synthetic homes, run the real v3 pipeline, compare actual outputs to expectations, and aggregate benchmark metrics.
 * Scope: Standalone methodology validation subsystem outside the runtime evaluation CLI flow.
 * Usage: Call `runCalibrationBenchmark()` from the benchmark CLI command or tests.
 * Invariants/Assumptions: The corpus is synthetic, deterministic, and validated through the canonical evaluator path.
 */

import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { evaluateArtifacts } from "../evaluator.js";
import { writeTextFile } from "../filesystem.js";
import { sanitizeMessageText } from "../sanitization.js";
import { type LabelName, labelTaxonomy } from "../schema.js";
import { ENGINE_VERSION, SCHEMA_VERSION } from "../version.js";
import { loadCalibrationCorpus } from "./corpus.js";
import { renderBenchmarkReport } from "./report.js";
import {
  type BenchmarkResults,
  benchmarkResultsSchema,
  type CalibrationCase,
  type CalibrationCaseResult,
} from "./types.js";

const BENCHMARK_VERSION = "3";
const BENCHMARK_HOME = "/tmp/benchmark-home";

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
  return testCase.sanitizationChecks.map((check, index) => {
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
      checkId: `${testCase.id}:sanitization_${index + 1}`,
      passed:
        mustContainMisses.length === 0 && mustNotContainViolations.length === 0,
      mustContainMisses,
      mustNotContainViolations,
    };
  });
}

async function materializeCalibrationHome(
  testCase: ReturnType<typeof loadCalibrationCorpus>[number],
): Promise<string> {
  const root = await mkdtemp(
    join(tmpdir(), `agent-eval-calibration-${testCase.id}-`),
  );
  const fixtureContent = await readFile(testCase.fixturePath, "utf8");

  if (testCase.provider === "codex") {
    const fixturePath = join(root, "sessions", "2026", "03", testCase.fixture);
    await mkdir(join(root, "sessions", "2026", "03"), { recursive: true });
    await writeFile(fixturePath, fixtureContent, "utf8");
    return root;
  }

  if (testCase.provider === "claude") {
    const fixturePath = join(
      root,
      "projects",
      "benchmark-project-root",
      testCase.fixture,
    );
    await mkdir(join(root, "projects", "benchmark-project-root"), {
      recursive: true,
    });
    await writeFile(fixturePath, fixtureContent, "utf8");
    return root;
  }

  const fixturePath = join(
    root,
    "agent",
    "sessions",
    "--benchmark-project-root--",
    testCase.fixture,
  );
  await mkdir(join(root, "agent", "sessions", "--benchmark-project-root--"), {
    recursive: true,
  });
  await writeFile(fixturePath, fixtureContent, "utf8");
  return root;
}

export async function runCalibrationBenchmark(outputDir?: string): Promise<{
  results: BenchmarkResults;
  report: string;
}> {
  const corpus = loadCalibrationCorpus();
  const caseResults: CalibrationCaseResult[] = [];

  for (const testCase of corpus) {
    const homeDir = await materializeCalibrationHome(testCase);

    try {
      const result = await evaluateArtifacts({
        source: testCase.provider,
        home: homeDir,
        outputMode: "full",
      });
      const expectedLabelInstances = normalizeLabelInstances(
        testCase.expectedLabelInstances,
      );
      const actualLabelInstances = normalizeLabelInstances(
        (result.rawTurns ?? []).flatMap((turn) =>
          turn.labels.map((label) => ({
            turnIndex: turn.turnIndex,
            label: label.label,
          })),
        ),
      );
      const expectedIncidents = normalizeIncidents(testCase.expectedIncidents);
      const actualIncidents = normalizeIncidents(result.incidents ?? []);
      const sessionFact = result.sessionFacts[0];

      caseResults.push({
        id: testCase.id,
        provider: testCase.provider,
        fixture: testCase.fixture,
        parseWarnings: {
          expectedCount: testCase.expectedParseWarningCount,
          actualCount: result.metrics.parseWarningCount,
          passed:
            testCase.expectedParseWarningCount ===
            result.metrics.parseWarningCount,
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
            result.metrics.sessions[0]?.postWriteVerificationAttempted ?? false,
          postWriteVerificationPassed:
            result.metrics.sessions[0]?.postWriteVerificationPassed ?? false,
          endedVerified: result.metrics.sessions[0]?.endedVerified ?? false,
        },
        expectedAttribution: testCase.expectedAttribution ?? null,
        actualAttribution: sessionFact?.attribution.primary ?? "unknown",
        expectedSurfacedIn: testCase.expectedSurfacedIn ?? null,
        actualSurfacedIn: sessionFact?.surfacedIn ?? {
          exemplar: false,
          reviewQueue: false,
        },
        sanitizationChecks: evaluateSanitizationChecks(testCase),
      });
    } finally {
      await rm(homeDir, { recursive: true, force: true });
    }
  }

  const sanitizationResults = caseResults.flatMap(
    (testCase) => testCase.sanitizationChecks,
  );
  const attributionCases = caseResults.filter(
    (testCase) => testCase.expectedAttribution !== null,
  );
  const surfacedCases = caseResults.filter(
    (testCase) => testCase.expectedSurfacedIn !== null,
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
    attributionMetrics: {
      caseCount: caseResults.length,
      expectedCaseCount: attributionCases.length,
      matchedCaseCount: attributionCases.filter(
        (testCase) =>
          testCase.expectedAttribution === testCase.actualAttribution,
      ).length,
      accuracy: safeRate(
        attributionCases.filter(
          (testCase) =>
            testCase.expectedAttribution === testCase.actualAttribution,
        ).length,
        attributionCases.length,
      ),
    },
    surfacedMetrics: {
      caseCount: caseResults.length,
      expectedCaseCount: surfacedCases.length,
      matchedCaseCount: surfacedCases.filter(
        (testCase) =>
          testCase.expectedSurfacedIn?.exemplar ===
            testCase.actualSurfacedIn.exemplar &&
          testCase.expectedSurfacedIn?.reviewQueue ===
            testCase.actualSurfacedIn.reviewQueue,
      ).length,
      accuracy: safeRate(
        surfacedCases.filter(
          (testCase) =>
            testCase.expectedSurfacedIn?.exemplar ===
              testCase.actualSurfacedIn.exemplar &&
            testCase.expectedSurfacedIn?.reviewQueue ===
              testCase.actualSurfacedIn.reviewQueue,
        ).length,
        surfacedCases.length,
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
        .map((check) => check.checkId),
      falseNegativeExamples: sanitizationResults
        .filter((check) => check.mustNotContainViolations.length > 0)
        .map((check) => check.checkId),
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
