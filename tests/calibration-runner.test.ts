/**
 * Purpose: Validate the synthetic calibration benchmark runner and artifact generation against the canonical evaluator path.
 * Responsibilities: Ensure benchmark fixtures execute, provider coverage includes pi, and new attribution/surfaced metrics are emitted deterministically.
 * Scope: Calibration subsystem contract coverage for the benchmark CLI and local methodology validation.
 * Usage: Executed by Vitest via `pnpm test`.
 * Invariants/Assumptions: Calibration corpus remains synthetic and deterministic.
 */

import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const tempDirs: string[] = [];

describe("runCalibrationBenchmark", () => {
  afterEach(async () => {
    await Promise.all(
      tempDirs.map(async (dir) => {
        const { rm } = await import("node:fs/promises");
        await rm(dir, { recursive: true, force: true });
      }),
    );
    tempDirs.length = 0;
  });

  it("produces deterministic benchmark artifacts and report output through the canonical evaluator", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "agent-eval-benchmark-"));
    tempDirs.push(outputDir);

    const { runCalibrationBenchmark } = await import(
      "../src/calibration/index.js"
    );
    const { results, report } = await runCalibrationBenchmark(outputDir);

    expect(results.caseCount).toBeGreaterThan(0);
    expect(results.terminalVerificationMetrics.endedVerifiedAccuracy).toBe(100);
    expect(results.parseWarningMetrics.expectedCount).toBe(1);
    expect(results.parseWarningMetrics.actualCount).toBe(1);
    expect(results.attributionMetrics.expectedCaseCount).toBeGreaterThan(0);
    expect(results.attributionMetrics.accuracy).toBe(100);
    expect(results.surfacedMetrics.expectedCaseCount).toBeGreaterThan(0);
    expect(results.surfacedMetrics.accuracy).toBe(100);
    expect(results.cases.some((testCase) => testCase.provider === "pi")).toBe(
      true,
    );
    expect(report).toContain("# Calibration Benchmark");
    expect(report).toContain("Attribution Accuracy");
    expect(report).toContain("Surfaced Session Accuracy");

    const jsonArtifact = JSON.parse(
      await readFile(join(outputDir, "benchmark-results.json"), "utf8"),
    );
    expect(jsonArtifact.caseCount).toBe(results.caseCount);
    expect(jsonArtifact.attributionMetrics.expectedCaseCount).toBe(
      results.attributionMetrics.expectedCaseCount,
    );
    expect(
      await readFile(join(outputDir, "benchmark-report.md"), "utf8"),
    ).toContain("Terminal Verification Accuracy");
  });

  it("captures expected attribution and surfaced-session outcomes for targeted cases", async () => {
    const { runCalibrationBenchmark } = await import(
      "../src/calibration/runner.js"
    );
    const { results } = await runCalibrationBenchmark();

    const userScope = results.cases.find(
      (testCase) => testCase.id === "codex-user-scope",
    );
    expect(userScope?.actualAttribution).toBe("user_scope");

    const piExemplar = results.cases.find(
      (testCase) => testCase.id === "pi-ended-verified",
    );
    expect(piExemplar?.actualSurfacedIn).toEqual({
      exemplar: true,
      reviewQueue: false,
    });

    const piReview = results.cases.find(
      (testCase) => testCase.id === "pi-review-unverified",
    );
    expect(piReview?.actualSurfacedIn).toEqual({
      exemplar: false,
      reviewQueue: true,
    });
  });
});
