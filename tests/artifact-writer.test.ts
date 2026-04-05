/**
 * Purpose: Verify parse and evaluation artifacts are written consistently from the canonical v3 result shape.
 * Responsibilities: Cover parse-only emission, full bundle emission, session-facts emission, and strict schema rejection at write time.
 * Scope: Filesystem contract for artifact serialization.
 * Usage: Executed by Vitest via `pnpm test`.
 * Invariants/Assumptions: Synthetic artifact payloads are enough because this module only writes already-computed outputs.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { EvaluationArtifacts } from "../src/artifact-writer.js";
import { writeArtifacts, writeParseArtifacts } from "../src/artifact-writer.js";
import {
  createIncidents,
  createRawTurns,
  createSessionFacts,
  createV3Metrics,
  createV3Summary,
} from "./support/v3-fixtures.js";

function createEvaluationArtifacts(
  overrides: Partial<EvaluationArtifacts> = {},
): EvaluationArtifacts {
  return {
    metrics: createV3Metrics(),
    summary: createV3Summary(),
    sessionFacts: createSessionFacts(),
    releaseManifest: {
      engineVersion: "0.1.0",
      schemaVersion: "3",
      generatedAt: "2026-04-04T00:00:00.000Z",
      git: {
        commit: "abc123def456",
        branch: "main",
        dirty: true,
      },
      configFingerprint: "deadbeefcafebabe",
      evaluation: {
        source: "codex",
        outputMode: "full",
        sessionLimit: 10,
        startDate: null,
        endDate: null,
        timeBucket: "week",
        parseTimeoutMs: 30000,
      },
      corpusScope: createV3Metrics().corpusScope,
      appliedFilters: createV3Metrics().appliedFilters,
      counts: {
        sessions: 2,
        turns: 4,
        incidents: 1,
        sessionFacts: 2,
        exemplarSessions: 1,
        reviewQueueSessions: 1,
      },
      artifactFiles: ["metrics.json", "summary.json", "session-facts.jsonl"],
    },
    report: "# Test Report\n",
    presentation: {
      reportHtml: "<html><body>report</body></html>",
      faviconIco: new Uint8Array([0, 1, 2, 3]),
      faviconSvg: "<svg>favicon</svg>",
      sessionsOverTimeChartSvg: "<svg>time</svg>",
      providerShareChartSvg: "<svg>provider</svg>",
      harnessShareChartSvg: "<svg>harness</svg>",
      toolFamilyShareChartSvg: "<svg>tools</svg>",
      attributionMixChartSvg: "<svg>attribution</svg>",
    },
    rawTurns: createRawTurns(),
    incidents: createIncidents(),
    ...overrides,
  };
}

describe("artifact-writer", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "artifact-writer-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("writes parse-only raw turn artifacts", async () => {
    await writeParseArtifacts(
      {
        rawTurns: createRawTurns(),
        sessionCount: 1,
        parseWarningCount: 2,
      },
      tempDir,
    );

    expect(readFileSync(join(tempDir, "raw-turns.jsonl"), "utf-8")).toContain(
      '"sessionId":"session-1"',
    );
    expect(
      JSON.parse(readFileSync(join(tempDir, "parse-metrics.json"), "utf-8"))
        .parseWarningCount,
    ).toBe(2);
    expect(existsSync(join(tempDir, "summary.json"))).toBe(false);
  });

  it("writes the full canonical evaluation bundle including session facts", async () => {
    await writeArtifacts(createEvaluationArtifacts(), tempDir);

    expect(readFileSync(join(tempDir, "metrics.json"), "utf-8")).toContain(
      '"schemaVersion": "3"',
    );
    expect(readFileSync(join(tempDir, "summary.json"), "utf-8")).toContain(
      '"reviewQueue"',
    );
    expect(
      readFileSync(join(tempDir, "session-facts.jsonl"), "utf-8"),
    ).toContain('"sessionId":"session-1"');
    expect(
      readFileSync(join(tempDir, "release-manifest.json"), "utf-8"),
    ).toContain('"configFingerprint": "deadbeefcafebabe"');
    expect(readFileSync(join(tempDir, "raw-turns.jsonl"), "utf-8")).toContain(
      '"turnId":"turn-1"',
    );
    expect(readFileSync(join(tempDir, "incidents.jsonl"), "utf-8")).toContain(
      '"incidentId":"incident-1"',
    );
    expect(readFileSync(join(tempDir, "report.md"), "utf-8")).toContain(
      "# Test Report",
    );
    expect(readFileSync(join(tempDir, "report.html"), "utf-8")).toContain(
      "<html>",
    );
    expect(existsSync(join(tempDir, "sessions-over-time.svg"))).toBe(true);
    expect(existsSync(join(tempDir, "provider-share.svg"))).toBe(true);
    expect(existsSync(join(tempDir, "harness-share.svg"))).toBe(true);
    expect(existsSync(join(tempDir, "tool-family-share.svg"))).toBe(true);
    expect(existsSync(join(tempDir, "attribution-mix.svg"))).toBe(true);
  });

  it("writes summary-only compatible bundles without raw turns or incidents", async () => {
    const result = createEvaluationArtifacts({
      rawTurns: undefined,
      incidents: undefined,
    });

    await writeArtifacts(result, tempDir);

    expect(existsSync(join(tempDir, "raw-turns.jsonl"))).toBe(false);
    expect(existsSync(join(tempDir, "incidents.jsonl"))).toBe(false);
    expect(existsSync(join(tempDir, "session-facts.jsonl"))).toBe(true);
    expect(existsSync(join(tempDir, "release-manifest.json"))).toBe(true);
  });

  it("rejects stale v2-style summary keys at write time", async () => {
    const result = createEvaluationArtifacts({
      summary: {
        ...createV3Summary(),
        topSessions: [],
      } as unknown as EvaluationArtifacts["summary"],
    });

    await expect(writeArtifacts(result, tempDir)).rejects.toThrow();
  });

  it("rejects invalid release-manifest payloads at write time", async () => {
    const result = createEvaluationArtifacts({
      releaseManifest: {
        ...createEvaluationArtifacts().releaseManifest,
        configFingerprint: "short",
      } as unknown as EvaluationArtifacts["releaseManifest"],
    });

    await expect(writeArtifacts(result, tempDir)).rejects.toThrow();
  });
});
