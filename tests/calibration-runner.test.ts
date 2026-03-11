/**
 * Purpose: Validate the synthetic calibration benchmark runner and artifact generation.
 * Responsibilities: Ensure corpus fixtures execute, case-scoped metrics are emitted, and benchmark matching stays localized per case.
 * Scope: Calibration subsystem contract coverage for the benchmark CLI and local methodology validation.
 * Usage: Executed by Vitest via `pnpm test`.
 * Invariants/Assumptions: Calibration corpus remains synthetic and deterministic.
 */

import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

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
    vi.resetModules();
    vi.restoreAllMocks();
    vi.unmock("../src/calibration/corpus.js");
    vi.unmock("../src/transcript/index.js");
    vi.unmock("../src/session-processor.js");
  });

  it("produces deterministic benchmark artifacts and report output", async () => {
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
    expect(results.sanitizationMetrics.checkCount).toBeGreaterThan(0);
    expect(report).toContain("# Calibration Benchmark");
    expect(report).toContain("Parse Warning Accuracy");

    const cueOnly = results.cases.find(
      (testCase) => testCase.id === "codex-cue-only",
    );
    expect(cueOnly?.expectedIncidents).toHaveLength(0);
    expect(cueOnly?.actualIncidents).toHaveLength(0);
    expect(cueOnly?.actualLabelInstances).toEqual([
      { turnIndex: 0, label: "context_reinjection" },
      { turnIndex: 0, label: "praise" },
      { turnIndex: 0, label: "verification_request" },
    ]);

    const jsonArtifact = JSON.parse(
      await readFile(join(outputDir, "benchmark-results.json"), "utf8"),
    );
    expect(jsonArtifact.caseCount).toBe(results.caseCount);
    expect(jsonArtifact.parseWarningMetrics.expectedCount).toBe(1);
    expect(
      await readFile(join(outputDir, "benchmark-report.md"), "utf8"),
    ).toContain("Terminal Verification Accuracy");
  });

  it("keeps label precision and recall case-scoped instead of count-only", async () => {
    vi.doMock("../src/calibration/corpus.js", () => ({
      loadCalibrationCorpus: () => [
        {
          id: "case-a",
          provider: "codex",
          fixture: "case-a.jsonl",
          fixturePath: "/tmp/case-a.jsonl",
          expectedLabelInstances: [{ turnIndex: 0, label: "context_drift" }],
          expectedIncidents: [],
          expectedTerminalVerification: {
            postWriteVerificationAttempted: false,
            postWriteVerificationPassed: false,
            endedVerified: false,
          },
          expectedParseWarningCount: 0,
          sanitizationChecks: [],
        },
        {
          id: "case-b",
          provider: "codex",
          fixture: "case-b.jsonl",
          fixturePath: "/tmp/case-b.jsonl",
          expectedLabelInstances: [],
          expectedIncidents: [],
          expectedTerminalVerification: {
            postWriteVerificationAttempted: false,
            postWriteVerificationPassed: false,
            endedVerified: false,
          },
          expectedParseWarningCount: 0,
          sanitizationChecks: [],
        },
      ],
    }));
    vi.doMock("../src/transcript/index.js", () => ({
      parseTranscriptFile: async (path: string) => ({ sessionId: path }),
    }));
    vi.doMock("../src/session-processor.js", () => ({
      processSession: async (parsed: { sessionId: string }) =>
        parsed.sessionId.includes("case-a")
          ? {
              turns: [],
              incidents: [],
              metrics: {
                parseWarningCount: 0,
                postWriteVerificationAttempted: false,
                postWriteVerificationPassed: false,
                endedVerified: false,
              },
            }
          : {
              turns: [
                {
                  turnIndex: 0,
                  labels: [
                    {
                      label: "context_drift",
                    },
                  ],
                },
              ],
              incidents: [],
              metrics: {
                parseWarningCount: 0,
                postWriteVerificationAttempted: false,
                postWriteVerificationPassed: false,
                endedVerified: false,
              },
            },
    }));

    const { runCalibrationBenchmark } = await import(
      "../src/calibration/runner.js"
    );
    const { results } = await runCalibrationBenchmark();
    const metric = results.labelMetrics.find(
      (entry) => entry.label === "context_drift",
    );

    expect(metric).toMatchObject({
      expectedCount: 1,
      actualCount: 1,
      truePositive: 0,
      falsePositive: 1,
      falseNegative: 1,
      precision: 0,
      recall: 0,
    });
  });

  it("scopes incident matching by case id to avoid collisions", async () => {
    vi.doMock("../src/calibration/corpus.js", () => ({
      loadCalibrationCorpus: () => [
        {
          id: "case-a",
          provider: "codex",
          fixture: "case-a.jsonl",
          fixturePath: "/tmp/case-a.jsonl",
          expectedLabelInstances: [],
          expectedIncidents: [{ turnIndices: [0], labels: ["context_drift"] }],
          expectedTerminalVerification: {
            postWriteVerificationAttempted: false,
            postWriteVerificationPassed: false,
            endedVerified: false,
          },
          expectedParseWarningCount: 0,
          sanitizationChecks: [],
        },
        {
          id: "case-b",
          provider: "codex",
          fixture: "case-b.jsonl",
          fixturePath: "/tmp/case-b.jsonl",
          expectedLabelInstances: [],
          expectedIncidents: [{ turnIndices: [0], labels: ["context_drift"] }],
          expectedTerminalVerification: {
            postWriteVerificationAttempted: false,
            postWriteVerificationPassed: false,
            endedVerified: false,
          },
          expectedParseWarningCount: 0,
          sanitizationChecks: [],
        },
      ],
    }));
    vi.doMock("../src/transcript/index.js", () => ({
      parseTranscriptFile: async (path: string) => ({ sessionId: path }),
    }));
    vi.doMock("../src/session-processor.js", () => ({
      processSession: async (parsed: { sessionId: string }) => ({
        turns: [],
        incidents: parsed.sessionId.includes("case-a")
          ? [{ turnIndices: [0], labels: [{ label: "context_drift" }] }]
          : [],
        metrics: {
          parseWarningCount: 0,
          postWriteVerificationAttempted: false,
          postWriteVerificationPassed: false,
          endedVerified: false,
        },
      }),
    }));

    const { runCalibrationBenchmark } = await import(
      "../src/calibration/runner.js"
    );
    const { results } = await runCalibrationBenchmark();

    expect(results.incidentMetrics).toMatchObject({
      expectedCount: 2,
      actualCount: 1,
      matchedCount: 1,
      precision: 100,
      recall: 50,
    });
  });
});
