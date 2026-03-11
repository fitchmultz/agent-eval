/**
 * Purpose: Validate the synthetic calibration benchmark runner and artifact generation.
 * Responsibilities: Ensure corpus fixtures execute, benchmark metrics are emitted, and sanitization checks are measured.
 * Scope: Calibration subsystem contract coverage for the benchmark CLI and local methodology validation.
 * Usage: Executed by Vitest via `pnpm test`.
 * Invariants/Assumptions: Calibration corpus remains synthetic and deterministic.
 */

import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runCalibrationBenchmark } from "../src/calibration/index.js";

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

  it("produces deterministic benchmark artifacts and report output", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "agent-eval-benchmark-"));
    tempDirs.push(outputDir);

    const { results, report } = await runCalibrationBenchmark(outputDir);

    expect(results.caseCount).toBeGreaterThan(0);
    expect(results.terminalVerificationMetrics.endedVerifiedAccuracy).toBe(100);
    expect(results.incidentMetrics.expectedCount).toBe(1);
    expect(results.sanitizationMetrics.checkCount).toBeGreaterThan(0);
    expect(report).toContain("# Calibration Benchmark");

    const jsonArtifact = JSON.parse(
      await readFile(join(outputDir, "benchmark-results.json"), "utf8"),
    );
    expect(jsonArtifact.caseCount).toBe(results.caseCount);
    expect(
      await readFile(join(outputDir, "benchmark-report.md"), "utf8"),
    ).toContain("Terminal Verification Accuracy");
  });

  it("keeps cue-only sessions out of incident matches", async () => {
    const { results } = await runCalibrationBenchmark();
    const cueOnly = results.cases.find(
      (testCase) => testCase.id === "codex-cue-only",
    );

    expect(cueOnly?.expectedIncidents).toHaveLength(0);
    expect(cueOnly?.actualIncidents).toHaveLength(0);
    expect(cueOnly?.actualLabelCounts.verification_request).toBe(1);
    expect(cueOnly?.actualLabelCounts.context_reinjection).toBe(1);
    expect(cueOnly?.actualLabelCounts.praise).toBe(1);
  });
});
