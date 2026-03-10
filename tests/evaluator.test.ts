/**
 * Purpose: Verify the canonical evaluation pipeline orchestrates discovery, parsing, clustering, and artifact generation consistently.
 * Responsibilities: Cover session selection, incident-count recalculation, and full-vs-summary output policy behavior.
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
  SummaryArtifact,
} from "../src/schema.js";
import type { ParsedSession } from "../src/transcript/types.js";

const mockDiscoverArtifacts = vi.fn();
const mockParseTranscriptFile = vi.fn();
const mockProcessSession = vi.fn();
const mockAggregateMetrics = vi.fn();
const mockClusterIncidents = vi.fn();
const mockBuildSummaryInputsFromArtifacts = vi.fn();
const mockBuildSummaryArtifact = vi.fn();
const mockBuildPresentationArtifacts = vi.fn();
const mockRenderSummaryReport = vi.fn();
const mockGetHomeDirectory = vi.fn();

vi.mock("../src/discovery.js", () => ({
  discoverArtifacts: mockDiscoverArtifacts,
}));

vi.mock("../src/transcript/index.js", () => ({
  parseTranscriptFile: mockParseTranscriptFile,
}));

vi.mock("../src/session-processor.js", () => ({
  processSession: mockProcessSession,
}));

vi.mock("../src/metrics-aggregation.js", () => ({
  aggregateMetrics: mockAggregateMetrics,
}));

vi.mock("../src/clustering.js", () => ({
  clusterIncidents: mockClusterIncidents,
}));

vi.mock("../src/insights.js", () => ({
  buildSummaryArtifact: mockBuildSummaryArtifact,
  buildSummaryInputsFromArtifacts: mockBuildSummaryInputsFromArtifacts,
}));

vi.mock("../src/presentation.js", () => ({
  buildPresentationArtifacts: mockBuildPresentationArtifacts,
}));

vi.mock("../src/report.js", () => ({
  renderSummaryReport: mockRenderSummaryReport,
}));

vi.mock("../src/utils/environment.js", () => ({
  getHomeDirectory: mockGetHomeDirectory,
}));

const { evaluateArtifacts } = await import("../src/evaluator.js");

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
    evaluatorVersion: "1.0.0",
    schemaVersion: "1.0.0",
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
    evaluatorVersion: "1.0.0",
    schemaVersion: "1.0.0",
    incidentId: `${sessionId}:incident:0`,
    sessionId,
    turnIds: [`${sessionId}:turn:0`],
    turnIndices: [0],
    labels: [
      {
        label: "interrupt",
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
  return {
    evaluatorVersion: "1.0.0",
    schemaVersion: "1.0.0",
    generatedAt: "2026-03-10T00:00:00.000Z",
    sessionCount: sessionIds.length,
    turnCount: sessionIds.length,
    incidentCount: 0,
    labelCounts: {},
    complianceSummary: [],
    sessions: sessionIds.map((sessionId) => ({
      sessionId,
      provider: "codex" as const,
      turnCount: 1,
      labeledTurnCount: 0,
      incidentCount: 0,
      writeCount: 0,
      verificationCount: 0,
      verificationPassedCount: 0,
      verificationFailedCount: 0,
      complianceScore: 100,
      complianceRules: [],
    })),
    inventory: createInventory(),
  };
}

function createSummary(): SummaryArtifact {
  return {
    evaluatorVersion: "1.0.0",
    schemaVersion: "1.0.0",
    generatedAt: "2026-03-10T00:00:00.000Z",
    sessions: 1,
    turns: 1,
    incidents: 1,
    labels: [],
    severities: [],
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
      verifiedWriteSessions: 0,
      writeVerificationRate: 0,
    },
    comparativeSlices: [],
    topSessions: [],
    topIncidents: [],
    scoreCards: [],
    bragCards: [],
    achievementBadges: [],
    victoryLaps: [],
    opportunities: [],
  };
}

function createParsedSession(sessionId: string): ParsedSession {
  return {
    sessionId,
    provider: "codex",
    path: `/path/${sessionId}.jsonl`,
    turns: [],
  };
}

describe("evaluator", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetConfig();
    mockGetHomeDirectory.mockReturnValue("/home/user");
    mockBuildSummaryInputsFromArtifacts.mockReturnValue({
      sessionLabelCounts: new Map(),
      topIncidents: [],
      severityCounts: {
        info: 0,
        low: 1,
        medium: 0,
        high: 0,
      },
      writeTurnCount: 0,
    });
    mockBuildSummaryArtifact.mockReturnValue(createSummary());
    mockBuildPresentationArtifacts.mockReturnValue({
      reportHtml: "<html></html>",
      labelChartSvg: "<svg>labels</svg>",
      complianceChartSvg: "<svg>compliance</svg>",
      severityChartSvg: "<svg>severity</svg>",
    });
    mockRenderSummaryReport.mockReturnValue("# Report");
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("processes all discovered sessions when no limit is provided", async () => {
    const sessionFiles = ["/path/1.jsonl", "/path/2.jsonl", "/path/3.jsonl"];
    const processed = sessionFiles.map((_, index) => ({
      sessionId: `session-${index + 1}`,
      turns: [createRawTurn(`session-${index + 1}`)],
      incidents: [],
      metrics: createMetrics([`session-${index + 1}`]).sessions[0],
    }));

    mockDiscoverArtifacts.mockResolvedValue({
      provider: "codex",
      homePath: "/home/user/.codex",
      sessionFiles,
      inventory: createInventory(),
    });
    mockParseTranscriptFile.mockImplementation(async (path: string) =>
      createParsedSession(
        path.split("/").pop()?.replace(".jsonl", "") ?? "session",
      ),
    );
    processed.forEach((session) => {
      mockProcessSession.mockReturnValueOnce(session);
    });
    mockAggregateMetrics.mockReturnValue(
      createMetrics(["session-1", "session-2", "session-3"]),
    );
    mockClusterIncidents.mockReturnValue([]);

    const result = await evaluateArtifacts({
      source: "codex",
      home: "~/.codex",
    });

    expect(mockParseTranscriptFile).toHaveBeenCalledTimes(3);
    expect(result.rawTurns).toHaveLength(3);
    expect(result.metrics.sessionCount).toBe(3);
  });

  it("uses the most recent discovered sessions when a session limit is set", async () => {
    const sessionFiles = [
      "/path/1.jsonl",
      "/path/2.jsonl",
      "/path/3.jsonl",
      "/path/4.jsonl",
    ];

    mockDiscoverArtifacts.mockResolvedValue({
      provider: "codex",
      homePath: "/home/user/.codex",
      sessionFiles,
      inventory: createInventory(),
    });
    mockParseTranscriptFile
      .mockResolvedValueOnce(createParsedSession("session-3"))
      .mockResolvedValueOnce(createParsedSession("session-4"));
    mockProcessSession
      .mockReturnValueOnce({
        sessionId: "session-3",
        turns: [createRawTurn("session-3")],
        incidents: [],
        metrics: createMetrics(["session-3"]).sessions[0],
      })
      .mockReturnValueOnce({
        sessionId: "session-4",
        turns: [createRawTurn("session-4")],
        incidents: [],
        metrics: createMetrics(["session-4"]).sessions[0],
      });
    mockAggregateMetrics.mockReturnValue(
      createMetrics(["session-3", "session-4"]),
    );
    mockClusterIncidents.mockReturnValue([]);

    await evaluateArtifacts({
      source: "codex",
      home: "~/.codex",
      sessionLimit: 2,
    });

    expect(mockParseTranscriptFile.mock.calls).toEqual([
      ["/path/3.jsonl", expect.objectContaining({ sourceProvider: "codex" })],
      ["/path/4.jsonl", expect.objectContaining({ sourceProvider: "codex" })],
    ]);
  });

  it("recalculates incident counts from clustered corpus incidents", async () => {
    const clustered = [
      createIncident("session-1"),
      createIncident("session-1"),
    ];

    mockDiscoverArtifacts.mockResolvedValue({
      provider: "codex",
      homePath: "/home/user/.codex",
      sessionFiles: ["/path/1.jsonl"],
      inventory: createInventory(),
    });
    mockParseTranscriptFile.mockResolvedValue(createParsedSession("session-1"));
    mockProcessSession.mockReturnValue({
      sessionId: "session-1",
      turns: [createRawTurn("session-1")],
      incidents: [],
      metrics: createMetrics(["session-1"]).sessions[0],
    });
    mockAggregateMetrics.mockReturnValue(createMetrics(["session-1"]));
    mockClusterIncidents.mockReturnValue(clustered);

    const result = await evaluateArtifacts({
      source: "codex",
      home: "~/.codex",
    });

    expect(result.metrics.incidentCount).toBe(2);
    expect(result.metrics.sessions[0]?.incidentCount).toBe(2);
    expect(mockBuildSummaryInputsFromArtifacts).toHaveBeenCalledWith(
      result.rawTurns,
      clustered,
    );
  });

  it("uses the same canonical pipeline in summary mode but omits raw artifacts", async () => {
    const clustered = [createIncident("session-1")];

    mockDiscoverArtifacts.mockResolvedValue({
      provider: "codex",
      homePath: "/home/user/.codex",
      sessionFiles: ["/path/1.jsonl"],
      inventory: createInventory(),
    });
    mockParseTranscriptFile.mockResolvedValue(createParsedSession("session-1"));
    mockProcessSession.mockReturnValue({
      sessionId: "session-1",
      turns: [createRawTurn("session-1")],
      incidents: [],
      metrics: createMetrics(["session-1"]).sessions[0],
    });
    mockAggregateMetrics.mockReturnValue(createMetrics(["session-1"]));
    mockClusterIncidents.mockReturnValue(clustered);

    const result = await evaluateArtifacts({
      source: "codex",
      home: "~/.codex",
      outputMode: "summary",
    });

    expect(result.rawTurns).toBeUndefined();
    expect(result.incidents).toBeUndefined();
    expect(result.summary).toEqual(createSummary());
    expect(result.report).toBe("# Report");
    expect(mockBuildPresentationArtifacts).toHaveBeenCalledWith(
      result.metrics,
      result.summary,
    );
  });
});
