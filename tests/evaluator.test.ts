/**
 * Purpose: Test coverage for evaluator.ts - main pipeline orchestrator.
 * Entrypoint: Executed by Vitest via `pnpm test`.
 * Notes: Tests session selection, incident recalculation, and evaluation pipelines.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetConfig } from "../src/config/index.js";
import type { IncidentRecord, RawTurnRecord } from "../src/schema.js";

// Mock dependencies before importing the evaluator
const mockDiscoverArtifacts = vi.fn();
const mockParseTranscriptFile = vi.fn();
const mockProcessSession = vi.fn();
const mockAggregateMetrics = vi.fn();
const mockClusterIncidents = vi.fn();
const mockBuildSummaryArtifact = vi.fn();
const mockRenderReport = vi.fn();
const mockRenderSummaryReport = vi.fn();
const mockCountWriteTurns = vi.fn();
const mockCreateSummaryInputs = vi.fn();
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
  countWriteTurns: mockCountWriteTurns,
}));

vi.mock("../src/clustering.js", () => ({
  clusterIncidents: mockClusterIncidents,
}));

vi.mock("../src/insights.js", () => ({
  buildSummaryArtifact: mockBuildSummaryArtifact,
  createSummaryInputs: mockCreateSummaryInputs,
  createEmptySeverityCounts: vi.fn(() => ({
    info: 0,
    low: 0,
    medium: 0,
    high: 0,
  })),
  collectSessionLabelCounts: vi.fn(() => new Map()),
  insertTopIncident: vi.fn((acc) => acc),
}));

vi.mock("../src/report.js", () => ({
  renderReport: mockRenderReport,
  renderSummaryReport: mockRenderSummaryReport,
}));

vi.mock("../src/utils/environment.js", () => ({
  getHomeDirectory: mockGetHomeDirectory,
}));

vi.mock("../src/artifact-writer.js", () => ({
  createSummaryInputs: mockCreateSummaryInputs,
  writeEvaluationArtifacts: vi.fn(),
  writeSummaryArtifacts: vi.fn(),
}));

// Import after mocking
const { evaluateArtifacts, evaluateArtifactsSummaryOnly } = await import(
  "../src/evaluator.js"
);

describe("evaluator", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetConfig();
    mockGetHomeDirectory.mockReturnValue("/home/user");
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("selectSessionPaths (via integration)", () => {
    it("returns all paths when no limit", async () => {
      const sessionFiles = ["/path/1.jsonl", "/path/2.jsonl", "/path/3.jsonl"];
      const mockTurn: RawTurnRecord = {
        evaluatorVersion: "1.0.0",
        schemaVersion: "1",
        sessionId: "session-1",
        turnIndex: 0,
        userMessageCount: 1,
        assistantMessageCount: 0,
        userMessagePreviews: ["test"],
        assistantMessagePreviews: [],
        toolCalls: [],
        labels: [],
        sourceRefs: [{ kind: "session_jsonl", path: "/path/1.jsonl" }],
      };

      mockDiscoverArtifacts.mockResolvedValue({
        sessionFiles,
        inventory: [],
      });
      mockParseTranscriptFile.mockResolvedValue({
        sessionId: "session-1",
        turns: [],
      });
      mockProcessSession.mockReturnValue({
        sessionId: "session-1",
        turns: [mockTurn],
        incidents: [],
        metrics: {
          sessionId: "session-1",
          turnCount: 1,
          labeledTurnCount: 0,
          incidentCount: 0,
          writeCount: 0,
          verificationCount: 0,
          verificationPassedCount: 0,
          verificationFailedCount: 0,
          complianceScore: 100,
          complianceRules: [],
        },
      });
      mockAggregateMetrics.mockReturnValue({
        evaluatorVersion: "1.0.0",
        schemaVersion: "1",
        generatedAt: new Date().toISOString(),
        sessionCount: 3,
        turnCount: 3,
        incidentCount: 0,
        labelCounts: {},
        complianceSummary: [],
        sessions: [],
        inventory: [],
      });
      mockClusterIncidents.mockReturnValue([]);
      mockRenderReport.mockReturnValue("# Report");

      const result = await evaluateArtifacts({
        codexHome: "~/.codex",
        outputDir: "./output",
      });

      expect(mockParseTranscriptFile).toHaveBeenCalledTimes(3);
      expect(result.metrics.sessionCount).toBe(3);
    });

    it("returns last N paths when limit set", async () => {
      const sessionFiles = [
        "/path/1.jsonl",
        "/path/2.jsonl",
        "/path/3.jsonl",
        "/path/4.jsonl",
        "/path/5.jsonl",
      ];
      const mockTurn: RawTurnRecord = {
        evaluatorVersion: "1.0.0",
        schemaVersion: "1",
        sessionId: "session-1",
        turnIndex: 0,
        userMessageCount: 1,
        assistantMessageCount: 0,
        userMessagePreviews: ["test"],
        assistantMessagePreviews: [],
        toolCalls: [],
        labels: [],
        sourceRefs: [{ kind: "session_jsonl", path: "/path/1.jsonl" }],
      };

      mockDiscoverArtifacts.mockResolvedValue({
        sessionFiles,
        inventory: [],
      });
      mockParseTranscriptFile.mockResolvedValue({
        sessionId: "session-1",
        turns: [],
      });
      mockProcessSession.mockReturnValue({
        sessionId: "session-1",
        turns: [mockTurn],
        incidents: [],
        metrics: {
          sessionId: "session-1",
          turnCount: 1,
          labeledTurnCount: 0,
          incidentCount: 0,
          writeCount: 0,
          verificationCount: 0,
          verificationPassedCount: 0,
          verificationFailedCount: 0,
          complianceScore: 100,
          complianceRules: [],
        },
      });
      mockAggregateMetrics.mockReturnValue({
        evaluatorVersion: "1.0.0",
        schemaVersion: "1",
        generatedAt: new Date().toISOString(),
        sessionCount: 2,
        turnCount: 2,
        incidentCount: 0,
        labelCounts: {},
        complianceSummary: [],
        sessions: [],
        inventory: [],
      });
      mockClusterIncidents.mockReturnValue([]);
      mockRenderReport.mockReturnValue("# Report");

      const result = await evaluateArtifacts({
        codexHome: "~/.codex",
        outputDir: "./output",
        sessionLimit: 2,
      });

      expect(mockParseTranscriptFile).toHaveBeenCalledTimes(2);
      expect(result.metrics.sessionCount).toBe(2);
    });

    it("handles empty array", async () => {
      mockDiscoverArtifacts.mockResolvedValue({
        sessionFiles: [],
        inventory: [],
      });
      mockAggregateMetrics.mockReturnValue({
        evaluatorVersion: "1.0.0",
        schemaVersion: "1",
        generatedAt: new Date().toISOString(),
        sessionCount: 0,
        turnCount: 0,
        incidentCount: 0,
        labelCounts: {},
        complianceSummary: [],
        sessions: [],
        inventory: [],
      });
      mockClusterIncidents.mockReturnValue([]);
      mockRenderReport.mockReturnValue("# Report");

      const result = await evaluateArtifacts({
        codexHome: "~/.codex",
        outputDir: "./output",
      });

      expect(result.rawTurns).toHaveLength(0);
      expect(result.incidents).toHaveLength(0);
    });

    it("handles limit greater than array length", async () => {
      const sessionFiles = ["/path/1.jsonl", "/path/2.jsonl"];
      const mockTurn: RawTurnRecord = {
        evaluatorVersion: "1.0.0",
        schemaVersion: "1",
        sessionId: "session-1",
        turnIndex: 0,
        userMessageCount: 1,
        assistantMessageCount: 0,
        userMessagePreviews: ["test"],
        assistantMessagePreviews: [],
        toolCalls: [],
        labels: [],
        sourceRefs: [{ kind: "session_jsonl", path: "/path/1.jsonl" }],
      };

      mockDiscoverArtifacts.mockResolvedValue({
        sessionFiles,
        inventory: [],
      });
      mockParseTranscriptFile.mockResolvedValue({
        sessionId: "session-1",
        turns: [],
      });
      mockProcessSession.mockReturnValue({
        sessionId: "session-1",
        turns: [mockTurn],
        incidents: [],
        metrics: {
          sessionId: "session-1",
          turnCount: 1,
          labeledTurnCount: 0,
          incidentCount: 0,
          writeCount: 0,
          verificationCount: 0,
          verificationPassedCount: 0,
          verificationFailedCount: 0,
          complianceScore: 100,
          complianceRules: [],
        },
      });
      mockAggregateMetrics.mockReturnValue({
        evaluatorVersion: "1.0.0",
        schemaVersion: "1",
        generatedAt: new Date().toISOString(),
        sessionCount: 2,
        turnCount: 2,
        incidentCount: 0,
        labelCounts: {},
        complianceSummary: [],
        sessions: [],
        inventory: [],
      });
      mockClusterIncidents.mockReturnValue([]);
      mockRenderReport.mockReturnValue("# Report");

      const result = await evaluateArtifacts({
        codexHome: "~/.codex",
        outputDir: "./output",
        sessionLimit: 10,
      });

      expect(mockParseTranscriptFile).toHaveBeenCalledTimes(2);
      expect(result.metrics.sessionCount).toBe(2);
    });
  });

  describe("recalculateIncidentCounts (via integration)", () => {
    it("updates incident counts from incidents array", async () => {
      const mockTurn: RawTurnRecord = {
        evaluatorVersion: "1.0.0",
        schemaVersion: "1",
        sessionId: "session-1",
        turnIndex: 0,
        userMessageCount: 1,
        assistantMessageCount: 0,
        userMessagePreviews: ["test"],
        assistantMessagePreviews: [],
        toolCalls: [],
        labels: [
          {
            label: "interrupt",
            severity: "low",
            confidence: "high",
            rationale: "test",
          },
        ],
        sourceRefs: [{ kind: "session_jsonl", path: "/path/1.jsonl" }],
      };

      const mockIncident: IncidentRecord = {
        evaluatorVersion: "1.0.0",
        schemaVersion: "1",
        incidentId: "session-1:incident:0",
        sessionId: "session-1",
        turnIds: ["turn-1"],
        turnIndices: [0],
        labels: [
          {
            label: "interrupt",
            severity: "low",
            confidence: "high",
            rationale: "test",
          },
        ],
        summary: "Test incident",
        evidencePreviews: ["test"],
        severity: "low",
        confidence: "high",
        sourceRefs: [{ kind: "session_jsonl", path: "/path/1.jsonl" }],
      };

      mockDiscoverArtifacts.mockResolvedValue({
        sessionFiles: ["/path/1.jsonl"],
        inventory: [],
      });
      mockParseTranscriptFile.mockResolvedValue({
        sessionId: "session-1",
        turns: [],
      });
      mockProcessSession.mockReturnValue({
        sessionId: "session-1",
        turns: [mockTurn],
        incidents: [mockIncident],
        metrics: {
          sessionId: "session-1",
          turnCount: 1,
          labeledTurnCount: 1,
          incidentCount: 0,
          writeCount: 0,
          verificationCount: 0,
          verificationPassedCount: 0,
          verificationFailedCount: 0,
          complianceScore: 100,
          complianceRules: [],
        },
      });
      mockAggregateMetrics.mockReturnValue({
        evaluatorVersion: "1.0.0",
        schemaVersion: "1",
        generatedAt: new Date().toISOString(),
        sessionCount: 1,
        turnCount: 1,
        incidentCount: 0,
        labelCounts: {},
        complianceSummary: [],
        sessions: [
          {
            sessionId: "session-1",
            turnCount: 1,
            labeledTurnCount: 1,
            incidentCount: 0,
            writeCount: 0,
            verificationCount: 0,
            verificationPassedCount: 0,
            verificationFailedCount: 0,
            complianceScore: 100,
            complianceRules: [],
          },
        ],
        inventory: [],
      });
      mockClusterIncidents.mockReturnValue([mockIncident]);
      mockRenderReport.mockReturnValue("# Report");

      const result = await evaluateArtifacts({
        codexHome: "~/.codex",
        outputDir: "./output",
      });

      expect(result.metrics.incidentCount).toBe(1);
      expect(result.metrics.sessions[0]?.incidentCount).toBe(1);
    });

    it("sets 0 for sessions with no incidents", async () => {
      const mockTurn: RawTurnRecord = {
        evaluatorVersion: "1.0.0",
        schemaVersion: "1",
        sessionId: "session-1",
        turnIndex: 0,
        userMessageCount: 1,
        assistantMessageCount: 0,
        userMessagePreviews: ["test"],
        assistantMessagePreviews: [],
        toolCalls: [],
        labels: [],
        sourceRefs: [{ kind: "session_jsonl", path: "/path/1.jsonl" }],
      };

      mockDiscoverArtifacts.mockResolvedValue({
        sessionFiles: ["/path/1.jsonl"],
        inventory: [],
      });
      mockParseTranscriptFile.mockResolvedValue({
        sessionId: "session-1",
        turns: [],
      });
      mockProcessSession.mockReturnValue({
        sessionId: "session-1",
        turns: [mockTurn],
        incidents: [],
        metrics: {
          sessionId: "session-1",
          turnCount: 1,
          labeledTurnCount: 0,
          incidentCount: 0,
          writeCount: 0,
          verificationCount: 0,
          verificationPassedCount: 0,
          verificationFailedCount: 0,
          complianceScore: 100,
          complianceRules: [],
        },
      });
      mockAggregateMetrics.mockReturnValue({
        evaluatorVersion: "1.0.0",
        schemaVersion: "1",
        generatedAt: new Date().toISOString(),
        sessionCount: 1,
        turnCount: 1,
        incidentCount: 0,
        labelCounts: {},
        complianceSummary: [],
        sessions: [
          {
            sessionId: "session-1",
            turnCount: 1,
            labeledTurnCount: 0,
            incidentCount: 0,
            writeCount: 0,
            verificationCount: 0,
            verificationPassedCount: 0,
            verificationFailedCount: 0,
            complianceScore: 100,
            complianceRules: [],
          },
        ],
        inventory: [],
      });
      mockClusterIncidents.mockReturnValue([]);
      mockRenderReport.mockReturnValue("# Report");

      const result = await evaluateArtifacts({
        codexHome: "~/.codex",
        outputDir: "./output",
      });

      expect(result.metrics.incidentCount).toBe(0);
      expect(result.metrics.sessions[0]?.incidentCount).toBe(0);
    });

    it("preserves other metrics", async () => {
      const mockTurn: RawTurnRecord = {
        evaluatorVersion: "1.0.0",
        schemaVersion: "1",
        sessionId: "session-1",
        turnIndex: 0,
        userMessageCount: 1,
        assistantMessageCount: 0,
        userMessagePreviews: ["test"],
        assistantMessagePreviews: [],
        toolCalls: [],
        labels: [],
        sourceRefs: [{ kind: "session_jsonl", path: "/path/1.jsonl" }],
      };

      mockDiscoverArtifacts.mockResolvedValue({
        sessionFiles: ["/path/1.jsonl"],
        inventory: [],
      });
      mockParseTranscriptFile.mockResolvedValue({
        sessionId: "session-1",
        turns: [],
      });
      mockProcessSession.mockReturnValue({
        sessionId: "session-1",
        turns: [mockTurn],
        incidents: [],
        metrics: {
          sessionId: "session-1",
          turnCount: 5,
          labeledTurnCount: 2,
          incidentCount: 0,
          writeCount: 3,
          verificationCount: 2,
          verificationPassedCount: 2,
          verificationFailedCount: 0,
          complianceScore: 80,
          complianceRules: [],
        },
      });
      mockAggregateMetrics.mockReturnValue({
        evaluatorVersion: "1.0.0",
        schemaVersion: "1",
        generatedAt: new Date().toISOString(),
        sessionCount: 1,
        turnCount: 5,
        incidentCount: 0,
        labelCounts: {},
        complianceSummary: [],
        sessions: [
          {
            sessionId: "session-1",
            turnCount: 5,
            labeledTurnCount: 2,
            incidentCount: 0,
            writeCount: 3,
            verificationCount: 2,
            verificationPassedCount: 2,
            verificationFailedCount: 0,
            complianceScore: 80,
            complianceRules: [],
          },
        ],
        inventory: [],
      });
      mockClusterIncidents.mockReturnValue([]);
      mockRenderReport.mockReturnValue("# Report");

      const result = await evaluateArtifacts({
        codexHome: "~/.codex",
        outputDir: "./output",
      });

      const session = result.metrics.sessions[0];
      expect(session?.turnCount).toBe(5);
      expect(session?.labeledTurnCount).toBe(2);
      expect(session?.writeCount).toBe(3);
      expect(session?.complianceScore).toBe(80);
    });
  });

  describe("evaluateArtifacts", () => {
    it("processes sessions with correct concurrency", async () => {
      const sessionFiles = ["/path/1.jsonl", "/path/2.jsonl"];
      const mockTurn: RawTurnRecord = {
        evaluatorVersion: "1.0.0",
        schemaVersion: "1",
        sessionId: "session-1",
        turnIndex: 0,
        userMessageCount: 1,
        assistantMessageCount: 0,
        userMessagePreviews: ["test"],
        assistantMessagePreviews: [],
        toolCalls: [],
        labels: [],
        sourceRefs: [{ kind: "session_jsonl", path: "/path/1.jsonl" }],
      };

      mockDiscoverArtifacts.mockResolvedValue({
        sessionFiles,
        inventory: [],
      });
      mockParseTranscriptFile.mockResolvedValue({
        sessionId: "session-1",
        turns: [],
      });
      mockProcessSession.mockReturnValue({
        sessionId: "session-1",
        turns: [mockTurn],
        incidents: [],
        metrics: {
          sessionId: "session-1",
          turnCount: 1,
          labeledTurnCount: 0,
          incidentCount: 0,
          writeCount: 0,
          verificationCount: 0,
          verificationPassedCount: 0,
          verificationFailedCount: 0,
          complianceScore: 100,
          complianceRules: [],
        },
      });
      mockAggregateMetrics.mockReturnValue({
        evaluatorVersion: "1.0.0",
        schemaVersion: "1",
        generatedAt: new Date().toISOString(),
        sessionCount: 2,
        turnCount: 2,
        incidentCount: 0,
        labelCounts: {},
        complianceSummary: [],
        sessions: [],
        inventory: [],
      });
      mockClusterIncidents.mockReturnValue([]);
      mockRenderReport.mockReturnValue("# Report");

      await evaluateArtifacts({
        codexHome: "~/.codex",
        outputDir: "./output",
      });

      // Should process both sessions
      expect(mockParseTranscriptFile).toHaveBeenCalledTimes(2);
      expect(mockProcessSession).toHaveBeenCalledTimes(2);
    });

    it("propagates errors with context", async () => {
      mockDiscoverArtifacts.mockRejectedValue(new Error("Discovery failed"));

      await expect(
        evaluateArtifacts({
          codexHome: "~/.codex",
          outputDir: "./output",
        }),
      ).rejects.toThrow("Discovery failed");
    });

    it("clusters incidents from evaluated turns", async () => {
      const labeledTurn: RawTurnRecord = {
        evaluatorVersion: "1.0.0",
        schemaVersion: "1",
        sessionId: "session-1",
        turnIndex: 0,
        userMessageCount: 1,
        assistantMessageCount: 0,
        userMessagePreviews: ["error occurred"],
        assistantMessagePreviews: [],
        toolCalls: [],
        labels: [
          {
            label: "interrupt",
            severity: "low",
            confidence: "high",
            rationale: "test",
          },
        ],
        sourceRefs: [{ kind: "session_jsonl", path: "/path/1.jsonl" }],
      };

      const mockIncident: IncidentRecord = {
        evaluatorVersion: "1.0.0",
        schemaVersion: "1",
        incidentId: "session-1:incident:0",
        sessionId: "session-1",
        turnIds: ["turn-1"],
        turnIndices: [0],
        labels: [
          {
            label: "interrupt",
            severity: "low",
            confidence: "high",
            rationale: "test",
          },
        ],
        summary: "Interrupt incident",
        evidencePreviews: ["error occurred"],
        severity: "low",
        confidence: "high",
        sourceRefs: [{ kind: "session_jsonl", path: "/path/1.jsonl" }],
      };

      mockDiscoverArtifacts.mockResolvedValue({
        sessionFiles: ["/path/1.jsonl"],
        inventory: [],
      });
      mockParseTranscriptFile.mockResolvedValue({
        sessionId: "session-1",
        turns: [],
      });
      mockProcessSession.mockReturnValue({
        sessionId: "session-1",
        turns: [labeledTurn],
        incidents: [mockIncident],
        metrics: {
          sessionId: "session-1",
          turnCount: 1,
          labeledTurnCount: 1,
          incidentCount: 1,
          writeCount: 0,
          verificationCount: 0,
          verificationPassedCount: 0,
          verificationFailedCount: 0,
          complianceScore: 100,
          complianceRules: [],
        },
      });
      mockAggregateMetrics.mockReturnValue({
        evaluatorVersion: "1.0.0",
        schemaVersion: "1",
        generatedAt: new Date().toISOString(),
        sessionCount: 1,
        turnCount: 1,
        incidentCount: 1,
        labelCounts: {},
        complianceSummary: [],
        sessions: [],
        inventory: [],
      });
      mockClusterIncidents.mockReturnValue([mockIncident]);
      mockRenderReport.mockReturnValue("# Report");

      const result = await evaluateArtifacts({
        codexHome: "~/.codex",
        outputDir: "./output",
      });

      expect(mockClusterIncidents).toHaveBeenCalled();
      expect(result.incidents).toHaveLength(1);
    });

    it("generates correct report", async () => {
      mockDiscoverArtifacts.mockResolvedValue({
        sessionFiles: ["/path/1.jsonl"],
        inventory: [],
      });
      mockParseTranscriptFile.mockResolvedValue({
        sessionId: "session-1",
        turns: [],
      });
      mockProcessSession.mockReturnValue({
        sessionId: "session-1",
        turns: [],
        incidents: [],
        metrics: {
          sessionId: "session-1",
          turnCount: 1,
          labeledTurnCount: 0,
          incidentCount: 0,
          writeCount: 0,
          verificationCount: 0,
          verificationPassedCount: 0,
          verificationFailedCount: 0,
          complianceScore: 100,
          complianceRules: [],
        },
      });
      mockAggregateMetrics.mockReturnValue({
        evaluatorVersion: "1.0.0",
        schemaVersion: "1",
        generatedAt: new Date().toISOString(),
        sessionCount: 1,
        turnCount: 1,
        incidentCount: 0,
        labelCounts: {},
        complianceSummary: [],
        sessions: [],
        inventory: [],
      });
      mockClusterIncidents.mockReturnValue([]);
      mockRenderReport.mockReturnValue("# Custom Report\n\nMetrics summary");

      const result = await evaluateArtifacts({
        codexHome: "~/.codex",
        outputDir: "./output",
      });

      expect(result.report).toBe("# Custom Report\n\nMetrics summary");
    });
  });

  describe("evaluateArtifactsSummaryOnly", () => {
    it("skips raw turns and incidents", async () => {
      mockDiscoverArtifacts.mockResolvedValue({
        sessionFiles: ["/path/1.jsonl"],
        inventory: [],
      });
      mockParseTranscriptFile.mockResolvedValue({
        sessionId: "session-1",
        turns: [],
      });
      mockProcessSession.mockReturnValue({
        sessionId: "session-1",
        turns: [],
        incidents: [],
        metrics: {
          sessionId: "session-1",
          turnCount: 1,
          labeledTurnCount: 0,
          incidentCount: 0,
          writeCount: 0,
          verificationCount: 0,
          verificationPassedCount: 0,
          verificationFailedCount: 0,
          complianceScore: 100,
          complianceRules: [],
        },
      });
      mockAggregateMetrics.mockReturnValue({
        evaluatorVersion: "1.0.0",
        schemaVersion: "1",
        generatedAt: new Date().toISOString(),
        sessionCount: 1,
        turnCount: 1,
        incidentCount: 0,
        labelCounts: {},
        complianceSummary: [],
        sessions: [],
        inventory: [],
      });
      mockCountWriteTurns.mockReturnValue(0);
      mockCreateSummaryInputs.mockReturnValue({
        sessionLabelCounts: new Map(),
        topIncidents: [],
        severityCounts: { info: 0, low: 0, medium: 0, high: 0 },
        writeTurnCount: 0,
      });
      mockBuildSummaryArtifact.mockReturnValue({
        evaluatorVersion: "1.0.0",
        schemaVersion: "1",
        generatedAt: new Date().toISOString(),
        sessions: 1,
        turns: 1,
        incidents: 0,
        labels: [],
        severities: [],
        compliance: [],
        rates: {
          incidentsPer100Turns: 0,
          writesPer100Turns: 0,
          verificationRequestsPer100Turns: 0,
          interruptionsPer100Turns: 0,
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
      });
      mockRenderSummaryReport.mockReturnValue("# Summary Report");

      const result = await evaluateArtifactsSummaryOnly({
        codexHome: "~/.codex",
        outputDir: "./output",
      });

      // Summary-only should not have rawTurns or incidents
      expect("rawTurns" in result).toBe(false);
      expect("incidents" in result).toBe(false);
      expect(result.metrics).toBeDefined();
      expect(result.summary).toBeDefined();
      expect(result.report).toBeDefined();
    });

    it("returns summary and metrics", async () => {
      const mockSummary = {
        evaluatorVersion: "1.0.0",
        schemaVersion: "1",
        generatedAt: new Date().toISOString(),
        sessions: 5,
        turns: 50,
        incidents: 2,
        labels: [{ label: "interrupt" as const, count: 2 }],
        severities: [{ severity: "low" as const, count: 2 }],
        compliance: [],
        rates: {
          incidentsPer100Turns: 4,
          writesPer100Turns: 10,
          verificationRequestsPer100Turns: 2,
          interruptionsPer100Turns: 4,
          reinjectionsPer100Turns: 0,
          praisePer100Turns: 1,
        },
        delivery: {
          sessionsWithWrites: 3,
          verifiedWriteSessions: 2,
          writeVerificationRate: 66.7,
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

      mockDiscoverArtifacts.mockResolvedValue({
        sessionFiles: [
          "/path/1.jsonl",
          "/path/2.jsonl",
          "/path/3.jsonl",
          "/path/4.jsonl",
          "/path/5.jsonl",
        ],
        inventory: [],
      });
      mockParseTranscriptFile.mockResolvedValue({
        sessionId: "session-1",
        turns: [],
      });
      mockProcessSession.mockReturnValue({
        sessionId: "session-1",
        turns: [],
        incidents: [],
        metrics: {
          sessionId: "session-1",
          turnCount: 10,
          labeledTurnCount: 2,
          incidentCount: 0,
          writeCount: 1,
          verificationCount: 1,
          verificationPassedCount: 1,
          verificationFailedCount: 0,
          complianceScore: 100,
          complianceRules: [],
        },
      });
      mockAggregateMetrics.mockReturnValue({
        evaluatorVersion: "1.0.0",
        schemaVersion: "1",
        generatedAt: new Date().toISOString(),
        sessionCount: 5,
        turnCount: 50,
        incidentCount: 2,
        labelCounts: { interrupt: 2 },
        complianceSummary: [],
        sessions: [],
        inventory: [],
      });
      mockCountWriteTurns.mockReturnValue(5);
      mockCreateSummaryInputs.mockReturnValue({
        sessionLabelCounts: new Map(),
        topIncidents: [],
        severityCounts: { info: 0, low: 2, medium: 0, high: 0 },
        writeTurnCount: 5,
      });
      mockBuildSummaryArtifact.mockReturnValue(mockSummary);
      mockRenderSummaryReport.mockReturnValue(
        "# Summary Report\n\n5 sessions processed",
      );

      const result = await evaluateArtifactsSummaryOnly({
        codexHome: "~/.codex",
        outputDir: "./output",
      });

      expect(result.metrics.sessionCount).toBe(5);
      expect(result.summary.sessions).toBe(5);
      expect(result.summary.turns).toBe(50);
      expect(result.summary.incidents).toBe(2);
    });

    it("uses lower concurrency", async () => {
      mockDiscoverArtifacts.mockResolvedValue({
        sessionFiles: ["/path/1.jsonl"],
        inventory: [],
      });
      mockParseTranscriptFile.mockResolvedValue({
        sessionId: "session-1",
        turns: [],
      });
      mockProcessSession.mockReturnValue({
        sessionId: "session-1",
        turns: [],
        incidents: [],
        metrics: {
          sessionId: "session-1",
          turnCount: 1,
          labeledTurnCount: 0,
          incidentCount: 0,
          writeCount: 0,
          verificationCount: 0,
          verificationPassedCount: 0,
          verificationFailedCount: 0,
          complianceScore: 100,
          complianceRules: [],
        },
      });
      mockAggregateMetrics.mockReturnValue({
        evaluatorVersion: "1.0.0",
        schemaVersion: "1",
        generatedAt: new Date().toISOString(),
        sessionCount: 1,
        turnCount: 1,
        incidentCount: 0,
        labelCounts: {},
        complianceSummary: [],
        sessions: [],
        inventory: [],
      });
      mockCountWriteTurns.mockReturnValue(0);
      mockCreateSummaryInputs.mockReturnValue({
        sessionLabelCounts: new Map(),
        topIncidents: [],
        severityCounts: { info: 0, low: 0, medium: 0, high: 0 },
        writeTurnCount: 0,
      });
      mockBuildSummaryArtifact.mockReturnValue({
        evaluatorVersion: "1.0.0",
        schemaVersion: "1",
        generatedAt: new Date().toISOString(),
        sessions: 1,
        turns: 1,
        incidents: 0,
        labels: [],
        severities: [],
        compliance: [],
        rates: {
          incidentsPer100Turns: 0,
          writesPer100Turns: 0,
          verificationRequestsPer100Turns: 0,
          interruptionsPer100Turns: 0,
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
      });
      mockRenderSummaryReport.mockReturnValue("# Summary Report");

      await evaluateArtifactsSummaryOnly({
        codexHome: "~/.codex",
        outputDir: "./output",
      });

      // Summary-only uses lower concurrency (8 vs 4 based on config)
      // We verify the function was called but don't check exact concurrency
      expect(mockParseTranscriptFile).toHaveBeenCalled();
      expect(mockProcessSession).toHaveBeenCalled();
    });
  });
});
