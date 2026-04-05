/**
 * Purpose: Render benchmark results into a concise markdown summary for calibration review.
 * Responsibilities: Convert deterministic benchmark artifacts into a readable methodology report.
 * Scope: Used by the benchmark CLI command after running the synthetic corpus.
 * Usage: Call `renderBenchmarkReport(results)` after `runCalibrationBenchmark()`.
 * Invariants/Assumptions: Report content reflects deterministic benchmark artifacts without recomputing metrics.
 */

import type { BenchmarkResults } from "./types.js";

export function renderBenchmarkReport(results: BenchmarkResults): string {
  const lines = [
    "# Calibration Benchmark",
    "",
    `- Benchmark version: \`${results.benchmarkVersion}\``,
    `- Analytics engine version: \`${results.engineVersion}\``,
    `- Schema version: \`${results.schemaVersion}\``,
    `- Cases: \`${results.caseCount}\``,
    "",
    "## Terminal Verification Accuracy",
    "",
    `- Ended verified accuracy: ${results.terminalVerificationMetrics.endedVerifiedAccuracy}%`,
    `- Post-write verification attempted accuracy: ${results.terminalVerificationMetrics.postWriteVerificationAttemptedAccuracy}%`,
    `- Post-write verification passed accuracy: ${results.terminalVerificationMetrics.postWriteVerificationPassedAccuracy}%`,
    "",
    "## Attribution Accuracy",
    "",
    `- Cases with attribution expectations: ${results.attributionMetrics.expectedCaseCount}`,
    `- Matched attribution cases: ${results.attributionMetrics.matchedCaseCount}`,
    `- Accuracy: ${results.attributionMetrics.accuracy}%`,
    "",
    "## Surfaced Session Accuracy",
    "",
    `- Cases with surfaced-session expectations: ${results.surfacedMetrics.expectedCaseCount}`,
    `- Matched surfaced-session cases: ${results.surfacedMetrics.matchedCaseCount}`,
    `- Accuracy: ${results.surfacedMetrics.accuracy}%`,
    "",
    "## Parse Warning Accuracy",
    "",
    `- Expected parse warnings: ${results.parseWarningMetrics.expectedCount}`,
    `- Actual parse warnings: ${results.parseWarningMetrics.actualCount}`,
    `- Case accuracy: ${results.parseWarningMetrics.accuracy}%`,
    "",
    "## Incident Matching",
    "",
    `- Expected incidents: ${results.incidentMetrics.expectedCount}`,
    `- Actual incidents: ${results.incidentMetrics.actualCount}`,
    `- Matched incidents: ${results.incidentMetrics.matchedCount}`,
    `- Precision: ${results.incidentMetrics.precision}%`,
    `- Recall: ${results.incidentMetrics.recall}%`,
    "",
    "## Label Precision And Recall",
    "",
    ...results.labelMetrics.map(
      (metric) =>
        `- ${metric.label}: expected ${metric.expectedCount}, actual ${metric.actualCount}, precision ${metric.precision}%, recall ${metric.recall}%`,
    ),
    "",
    "## Sanitization Checks",
    "",
    `- Checks: ${results.sanitizationMetrics.checkCount}`,
    `- Passed: ${results.sanitizationMetrics.passedCount}`,
    `- False positive examples: ${results.sanitizationMetrics.falsePositiveExamples.length > 0 ? results.sanitizationMetrics.falsePositiveExamples.join(" | ") : "none"}`,
    `- False negative examples: ${results.sanitizationMetrics.falseNegativeExamples.length > 0 ? results.sanitizationMetrics.falseNegativeExamples.join(" | ") : "none"}`,
    "",
    "## Case Summaries",
    "",
    ...results.cases.map(
      (testCase) =>
        `- ${testCase.id}: parse warnings expected ${testCase.parseWarnings.expectedCount} actual ${testCase.parseWarnings.actualCount}, ended verified expected ${testCase.expectedTerminalVerification.endedVerified} actual ${testCase.actualTerminalVerification.endedVerified}, attribution expected ${testCase.expectedAttribution ?? "n/a"} actual ${testCase.actualAttribution}, surfaced expected ${testCase.expectedSurfacedIn ? `${testCase.expectedSurfacedIn.exemplar ? "exemplar" : "no exemplar"}/${testCase.expectedSurfacedIn.reviewQueue ? "review" : "no review"}` : "n/a"} actual ${testCase.actualSurfacedIn.exemplar ? "exemplar" : "no exemplar"}/${testCase.actualSurfacedIn.reviewQueue ? "review" : "no review"}, incidents expected ${testCase.incidentMetrics.expectedCount} actual ${testCase.incidentMetrics.actualCount}`,
    ),
    "",
  ];

  return lines.join("\n");
}
