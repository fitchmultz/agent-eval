/**
 * Purpose: Verify the canonical evaluation pipeline orchestrates discovery, parsing, metrics, summary generation, and session-facts emission.
 * Responsibilities: Cover summary/full output behavior and parse-only normalization at the evaluator boundary.
 * Scope: Main evaluator orchestration contract for supported transcript sources.
 * Usage: Executed by Vitest via `pnpm test`.
 * Invariants/Assumptions: Full and summary-only evaluations share one pipeline and differ only in retained raw artifact payloads.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetConfig } from "../src/config/index.js";
import type {
  IncidentRecord,
  InventoryRecord,
  MetricsRecord,
  RawTurnRecord,
} from "../src/schema.js";
import type { ParsedSession } from "../src/transcript/types.js";
import {
  createSessionFacts,
  createV3Metrics,
  createV3Summary,
} from "./support/v3-fixtures.js";

const mockDiscoverArtifacts = vi.fn();
const mockParseTranscriptFile = vi.fn();
const mockProcessSession = vi.fn();
const mockAggregateMetrics = vi.fn();
const mockBuildMetricsRecord = vi.fn();
const mockBuildSummaryArtifact = vi.fn();
const mockBuildPresentationArtifacts = vi.fn();
const mockRenderSummaryReport = vi.fn();
const mockGetHomeDirectory = vi.fn();
const mockProbeSessionOrder = vi.fn();
const mockBuildSessionFacts = vi.fn();

vi.mock("../src/discovery.js", () => ({
  discoverArtifacts: mockDiscoverArtifacts,
}));

vi.mock("../src/transcript/index.js", () => ({
  parseTranscriptFile: mockParseTranscriptFile,
}));

vi.mock("../src/session-processor.js", () => ({
  processSession: mockProcessSession,
  createEmptyProcessedSessionAnalysis: () => ({
    rawLabelCounts: {},
    deTemplatedLabelCounts: {},
    template: {
      artifactScore: 0,
      textSharePct: 0,
      hasTemplateContent: false,
      flags: [],
      dominantFamilyId: null,
      dominantFamilyLabel: null,
    },
    attribution: {
      primary: "unknown",
      confidence: "low",
      reasons: ["Transcript-visible evidence was insufficient."],
    },
  }),
}));

vi.mock("../src/metrics-aggregation.js", () => ({
  aggregateMetrics: mockAggregateMetrics,
  buildMetricsRecord: mockBuildMetricsRecord,
}));

vi.mock("../src/summary-core.js", () => ({
  buildSummaryArtifact: mockBuildSummaryArtifact,
}));

vi.mock("../src/presentation.js", () => ({
  buildPresentationArtifacts: mockBuildPresentationArtifacts,
}));

vi.mock("../src/report.js", () => ({
  renderSummaryReport: mockRenderSummaryReport,
}));

vi.mock("../src/session-facts.js", () => ({
  buildSessionFacts: mockBuildSessionFacts,
}));

vi.mock("../src/utils/environment.js", () => ({
  getValidatedHomeDirectory: mockGetHomeDirectory,
}));

vi.mock("../src/transcript/session-order.js", () => ({
  probeSessionOrder: mockProbeSessionOrder,
  probeFallsInDateRange: () => ({ matches: true, undated: false }),
  resolveProbeTimeValue: (probe: {
    mtimeMs: number;
    startedAt?: string;
    earliestTimestamp?: string;
  }) => {
    const value = probe.startedAt ?? probe.earliestTimestamp;
    return value ? Date.parse(value) : probe.mtimeMs;
  },
}));

const { evaluateArtifacts, parseArtifacts } = await import(
  "../src/evaluator.js"
);

function createInventory(): InventoryRecord[] {
  return [
    {
      provider: "codex",
      kind: "session_jsonl",
      path: "/path/session.jsonl",
      discovered: true,
      required: true,
      optional: false,
    },
  ];
}

function createRawTurn(sessionId: string, turnIndex = 0): RawTurnRecord {
  return {
    engineVersion: "1.0.0",
    schemaVersion: "3",
    sessionId,
    turnId: `${sessionId}:turn:${turnIndex}`,
    turnIndex,
    userMessageCount: 1,
    assistantMessageCount: 1,
    userMessagePreviews: [`${sessionId}-user`],
    assistantMessagePreviews: [`${sessionId}-assistant`],
    toolCalls: [],
    labels: [],
    sourceRefs: [
      {
        provider: "codex",
        kind: "session_jsonl",
        path: `/path/${sessionId}.jsonl`,
      },
    ],
  };
}

function createIncident(sessionId: string): IncidentRecord {
  return {
    engineVersion: "1.0.0",
    schemaVersion: "3",
    incidentId: `${sessionId}:incident:0`,
    sessionId,
    turnIds: [`${sessionId}:turn:0`],
    turnIndices: [0],
    labels: [
      {
        label: "interrupt",
        family: "cue",
        severity: "low",
        confidence: "high",
        rationale: "test",
      },
    ],
    summary: `${sessionId} incident`,
    evidencePreviews: ["evidence"],
    severity: "low",
    confidence: "high",
    sourceRefs: [
      {
        provider: "codex",
        kind: "session_jsonl",
        path: `/path/${sessionId}.jsonl`,
      },
    ],
  };
}

function createMetrics(sessionIds: string[]): MetricsRecord {
  return createV3Metrics({
    sessionCount: sessionIds.length,
    turnCount: sessionIds.length,
    incidentCount: 0,
    sessions: sessionIds.map((sessionId) => ({
      sessionId,
      provider: "codex" as const,
      harness: "codex",
      modelProvider: null,
      model: null,
      startedAt: "2026-04-03T20:00:00.000Z",
      endedAt: "2026-04-03T20:01:00.000Z",
      durationMs: 60000,
      turnCount: 1,
      labeledTurnCount: 0,
      incidentCount: 0,
      parseWarningCount: 0,
      userMessageCount: 1,
      assistantMessageCount: 1,
      toolCallCount: 0,
      writeToolCallCount: 0,
      verificationToolCallCount: 0,
      mcpToolCallCount: 0,
      topTools: [],
      toolFamilies: [],
      mcpServers: [],
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
      compactionCount: null,
      writeCount: 0,
      verificationCount: 0,
      verificationPassedCount: 0,
      verificationFailedCount: 0,
      postWriteVerificationAttempted: false,
      postWriteVerificationPassed: false,
      endedVerified: false,
      complianceScore: 100,
      complianceRules: [],
    })),
    inventory: createInventory(),
  });
}

function createParsedSession(sessionId: string): ParsedSession {
  return {
    sessionId,
    provider: "codex",
    path: `/path/${sessionId}.jsonl`,
    turns: [
      {
        turnId: `${sessionId}:turn:0`,
        turnIndex: 0,
        userMessages: ["user"],
        assistantMessages: ["assistant"],
        toolCalls: [],
        sourceRefs: [
          {
            provider: "codex",
            kind: "session_jsonl",
            path: `/path/${sessionId}.jsonl`,
          },
        ],
      },
    ],
    parseWarningCount: 0,
  };
}

describe("evaluateArtifacts", () => {
  beforeEach(() => {
    resetConfig();
    mockGetHomeDirectory.mockReturnValue("/home/test");
    mockDiscoverArtifacts.mockResolvedValue({
      inventory: createInventory(),
      sessionFiles: ["/path/session-a.jsonl"],
      sessionDirectoryExists: true,
    });
    mockProbeSessionOrder.mockResolvedValue({
      path: "/path/session-a.jsonl",
      mtimeMs: 1,
      startedAt: "2026-04-03T20:00:00.000Z",
      earliestTimestamp: "2026-04-03T20:00:00.000Z",
    });
    mockParseTranscriptFile.mockResolvedValue(createParsedSession("session-a"));
    mockProcessSession.mockResolvedValue({
      sessionId: "session-a",
      turns: [createRawTurn("session-a")],
      incidents: [createIncident("session-a")],
      metrics: createMetrics(["session-a"]).sessions[0],
    });
    mockAggregateMetrics.mockReturnValue(createMetrics(["session-a"]));
    mockBuildMetricsRecord.mockReturnValue(createMetrics(["session-a"]));
    mockBuildSummaryArtifact.mockReturnValue(createV3Summary());
    mockBuildSessionFacts.mockReturnValue(createSessionFacts());
    mockRenderSummaryReport.mockReturnValue("# report\n");
    mockBuildPresentationArtifacts.mockReturnValue({
      reportHtml: "<html>report</html>",
      faviconIco: new Uint8Array([0]),
      faviconSvg: "<svg />",
      sessionsOverTimeChartSvg: "<svg />",
      providerShareChartSvg: "<svg />",
      harnessShareChartSvg: "<svg />",
      toolFamilyShareChartSvg: "<svg />",
      attributionMixChartSvg: "<svg />",
    });
  });

  afterEach(() => {
    resetConfig();
    vi.clearAllMocks();
  });

  it("returns summary-only artifacts with session facts and without raw payloads", async () => {
    const result = await evaluateArtifacts({
      source: "codex",
      home: "/home/test/.codex",
      outputMode: "summary",
    });

    expect(result.summary.reviewQueue).toBeDefined();
    expect(result.sessionFacts).toEqual(createSessionFacts());
    expect(result.rawTurns).toBeUndefined();
    expect(result.incidents).toBeUndefined();
  });

  it("returns full artifacts with raw payloads and session facts", async () => {
    const result = await evaluateArtifacts({
      source: "codex",
      home: "/home/test/.codex",
      outputMode: "full",
    });

    expect(result.rawTurns).toHaveLength(1);
    expect(result.incidents).toHaveLength(1);
    expect(result.sessionFacts).toEqual(createSessionFacts());
  });
});

describe("parseArtifacts", () => {
  beforeEach(() => {
    mockDiscoverArtifacts.mockResolvedValue({
      inventory: createInventory(),
      sessionFiles: ["/path/session-a.jsonl"],
      sessionDirectoryExists: true,
    });
    mockProbeSessionOrder.mockResolvedValue({
      path: "/path/session-a.jsonl",
      mtimeMs: 1,
      startedAt: "2026-04-03T20:00:00.000Z",
      earliestTimestamp: "2026-04-03T20:00:00.000Z",
    });
    mockParseTranscriptFile.mockResolvedValue(createParsedSession("session-a"));
    mockProcessSession.mockResolvedValue({
      sessionId: "session-a",
      turns: [createRawTurn("session-a")],
      incidents: [createIncident("session-a")],
      metrics: createMetrics(["session-a"]).sessions[0],
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("parses raw turns without generating evaluation artifacts", async () => {
    const result = await parseArtifacts({
      source: "codex",
      home: "/home/test/.codex",
    });

    expect(result.sessionCount).toBe(1);
    expect(result.rawTurns).toHaveLength(1);
    expect(result.rawTurns[0]?.sessionId).toBe("session-a");
  });
});
