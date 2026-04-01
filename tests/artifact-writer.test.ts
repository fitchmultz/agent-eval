/**
 * Purpose: Verify parse and evaluation artifacts are written consistently from the canonical result shape.
 * Responsibilities: Cover parse-only emission, full bundle emission, and summary-only omission of raw data files.
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
import type {
  IncidentRecord,
  MetricsRecord,
  RawTurnRecord,
  SummaryArtifact,
} from "../src/schema.js";

function createRawTurns(): RawTurnRecord[] {
  return [
    {
      engineVersion: "1.0.0",
      schemaVersion: "2",
      sessionId: "session-1",
      turnId: "turn-1",
      turnIndex: 0,
      userMessageCount: 1,
      assistantMessageCount: 1,
      userMessagePreviews: ["test"],
      assistantMessagePreviews: ["done"],
      toolCalls: [],
      labels: [],
      sourceRefs: [
        {
          provider: "codex",
          kind: "session_jsonl",
          path: "/test.jsonl",
          line: 1,
        },
      ],
    },
  ];
}

function createIncidents(): IncidentRecord[] {
  return [
    {
      engineVersion: "1.0.0",
      schemaVersion: "2",
      incidentId: "session-1:incident:0",
      sessionId: "session-1",
      turnIds: ["turn-1"],
      turnIndices: [0],
      labels: [
        {
          label: "interrupt",
          family: "cue",
          severity: "medium",
          confidence: "high",
          rationale: "test",
        },
      ],
      summary: "Test incident",
      evidencePreviews: ["test"],
      severity: "medium",
      confidence: "high",
      sourceRefs: [
        {
          provider: "codex",
          kind: "session_jsonl",
          path: "/test.jsonl",
          line: 1,
        },
      ],
    },
  ];
}

function createMetrics(): MetricsRecord {
  return {
    engineVersion: "1.0.0",
    schemaVersion: "2",
    generatedAt: "2026-03-10T00:00:00.000Z",
    sessionCount: 1,
    corpusScope: {
      selection: "all_discovered",
      discoveredSessionCount: 1,
      appliedSessionLimit: null,
    },
    turnCount: 1,
    incidentCount: 1,
    parseWarningCount: 0,
    labelCounts: { interrupt: 1 },
    complianceSummary: [],
    sessions: [
      {
        sessionId: "session-1",
        provider: "codex",
        turnCount: 1,
        labeledTurnCount: 1,
        incidentCount: 1,
        parseWarningCount: 0,
        writeCount: 0,
        verificationCount: 0,
        verificationPassedCount: 0,
        verificationFailedCount: 0,
        postWriteVerificationAttempted: false,
        postWriteVerificationPassed: false,
        endedVerified: false,
        complianceScore: 100,
        complianceRules: [],
      },
    ],
    inventory: [
      {
        provider: "codex",
        kind: "session_jsonl",
        path: "/test.jsonl",
        discovered: true,
        required: true,
        optional: false,
      },
    ],
  };
}

function createSummary(): SummaryArtifact {
  return {
    engineVersion: "1.0.0",
    schemaVersion: "2",
    generatedAt: "2026-03-10T00:00:00.000Z",
    sessions: 1,
    turns: 1,
    incidents: 1,
    parseWarningCount: 0,
    labels: [{ label: "interrupt", count: 1 }],
    severities: [{ severity: "medium", count: 1 }],
    compliance: [],
    rates: {
      incidentsPer100Turns: 100,
      writesPer100Turns: 0,
      verificationRequestsPer100Turns: 0,
      interruptionsPer100Turns: 100,
      reinjectionsPer100Turns: 0,
      praisePer100Turns: 0,
    },
    delivery: {
      sessionsWithWrites: 0,
      sessionsEndingVerified: 0,
      writeSessionVerificationRate: 0,
    },
    comparativeSlices: [],
    topSessions: [],
    topIncidents: [],
    executiveSummary: {
      problem: "No write sessions were observed.",
      change: "No recent change summary is available.",
      action: "Start with inventory review.",
    },
    operatorMetrics: [],
    metricGlossary: [],
    scoreCards: [],
    highlightCards: [],
    recognitions: [],
    endedVerifiedDeliverySpotlights: [],
    opportunities: [],
  };
}

function createEvaluationArtifacts(
  overrides: Partial<EvaluationArtifacts> = {},
): EvaluationArtifacts {
  return {
    metrics: createMetrics(),
    summary: createSummary(),
    report: "# Test Report\n",
    presentation: {
      reportHtml: "<html><body>report</body></html>",
      faviconIco: new Uint8Array([0, 1, 2, 3]),
      faviconSvg: "<svg>favicon</svg>",
      labelChartSvg: "<svg>labels</svg>",
      complianceChartSvg: "<svg>compliance</svg>",
      severityChartSvg: "<svg>severity</svg>",
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

    const rawTurnsPath = join(tempDir, "raw-turns.jsonl");
    expect(existsSync(rawTurnsPath)).toBe(true);
    expect(readFileSync(rawTurnsPath, "utf-8")).toContain(
      '"sessionId":"session-1"',
    );
    expect(
      JSON.parse(readFileSync(join(tempDir, "parse-metrics.json"), "utf-8"))
        .parseWarningCount,
    ).toBe(2);
    expect(existsSync(join(tempDir, "summary.json"))).toBe(false);
  });

  it("writes the full canonical evaluation bundle", async () => {
    await writeArtifacts(createEvaluationArtifacts(), tempDir);

    expect(readFileSync(join(tempDir, "raw-turns.jsonl"), "utf-8")).toContain(
      '"sessionId":"session-1"',
    );
    expect(readFileSync(join(tempDir, "incidents.jsonl"), "utf-8")).toContain(
      "Test incident",
    );
    expect(
      JSON.parse(readFileSync(join(tempDir, "metrics.json"), "utf-8"))
        .sessionCount,
    ).toBe(1);
    expect(
      JSON.parse(readFileSync(join(tempDir, "summary.json"), "utf-8"))
        .incidents,
    ).toBe(1);
    expect(readFileSync(join(tempDir, "report.md"), "utf-8")).toContain(
      "# Test Report",
    );
    expect(readFileSync(join(tempDir, "report.html"), "utf-8")).toContain(
      "<html>",
    );
    expect(existsSync(join(tempDir, "favicon.ico"))).toBe(true);
    expect(readFileSync(join(tempDir, "favicon.svg"), "utf-8")).toContain(
      "<svg>",
    );
    expect(readFileSync(join(tempDir, "label-counts.svg"), "utf-8")).toContain(
      "<svg>",
    );
    expect(
      readFileSync(join(tempDir, "compliance-summary.svg"), "utf-8"),
    ).toContain("<svg>");
    expect(
      readFileSync(join(tempDir, "severity-breakdown.svg"), "utf-8"),
    ).toContain("<svg>");
  });

  it("omits raw-turn and incident files in summary-only bundles", async () => {
    await writeArtifacts(
      createEvaluationArtifacts({
        rawTurns: undefined,
        incidents: undefined,
      }),
      tempDir,
    );

    expect(existsSync(join(tempDir, "raw-turns.jsonl"))).toBe(false);
    expect(existsSync(join(tempDir, "incidents.jsonl"))).toBe(false);
    expect(existsSync(join(tempDir, "summary.json"))).toBe(true);
    expect(readFileSync(join(tempDir, "report.md"), "utf-8")).toContain(
      "# Test Report",
    );
  });
});
