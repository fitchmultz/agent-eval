import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  EvaluationResult,
  SummaryOnlyEvaluationResult,
} from "../src/artifact-writer.js";
import {
  createSummaryInputs,
  writeEvaluationArtifacts,
  writeSummaryArtifacts,
} from "../src/artifact-writer.js";
import type {
  IncidentRecord,
  MetricsRecord,
  RawTurnRecord,
  SummaryArtifact,
} from "../src/schema.js";
import type { ProcessedSession } from "../src/session-processor.js";

describe("artifact-writer", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "artifact-writer-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  const createMockEvaluationResult = (): EvaluationResult => ({
    rawTurns: [
      {
        evaluatorVersion: "1.0.0",
        schemaVersion: "1.0.0",
        sessionId: "session-1",
        turnIndex: 0,
        userMessageCount: 1,
        assistantMessageCount: 1,
        userMessagePreviews: ["test"],
        assistantMessagePreviews: ["test"],
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
    ] as RawTurnRecord[],
    incidents: [
      {
        evaluatorVersion: "1.0.0",
        schemaVersion: "1.0.0",
        incidentId: "session-1:incident:0",
        sessionId: "session-1",
        turnIds: ["turn-1"],
        turnIndices: [0],
        labels: [
          {
            label: "interrupt",
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
    ] as IncidentRecord[],
    metrics: {
      evaluatorVersion: "1.0.0",
      schemaVersion: "1.0.0",
      generatedAt: new Date().toISOString(),
      sessionCount: 1,
      turnCount: 1,
      incidentCount: 1,
      labelCounts: { interrupt: 1 },
      complianceSummary: [],
      sessions: [],
      inventory: [],
    } as MetricsRecord,
    report: "# Test Report",
  });

  describe("writeEvaluationArtifacts", () => {
    it("should write raw-turns.jsonl", async () => {
      const result = createMockEvaluationResult();

      await writeEvaluationArtifacts(result, tempDir);

      const rawTurnsPath = join(tempDir, "raw-turns.jsonl");
      expect(existsSync(rawTurnsPath)).toBe(true);
      const content = readFileSync(rawTurnsPath, "utf-8");
      expect(content).toContain("session-1");
    });

    it("should write incidents.jsonl", async () => {
      const result = createMockEvaluationResult();

      await writeEvaluationArtifacts(result, tempDir);

      const incidentsPath = join(tempDir, "incidents.jsonl");
      expect(existsSync(incidentsPath)).toBe(true);
      const content = readFileSync(incidentsPath, "utf-8");
      expect(content).toContain("Test incident");
    });

    it("should write metrics.json", async () => {
      const result = createMockEvaluationResult();

      await writeEvaluationArtifacts(result, tempDir);

      const metricsPath = join(tempDir, "metrics.json");
      expect(existsSync(metricsPath)).toBe(true);
      const content = readFileSync(metricsPath, "utf-8");
      const parsed = JSON.parse(content);
      expect(parsed.sessionCount).toBe(1);
    });

    it("should write report.md", async () => {
      const result = createMockEvaluationResult();

      await writeEvaluationArtifacts(result, tempDir);

      const reportPath = join(tempDir, "report.md");
      expect(existsSync(reportPath)).toBe(true);
      const content = readFileSync(reportPath, "utf-8");
      expect(content).toContain("# Test Report");
    });

    it("should write HTML and SVG files", async () => {
      const result = createMockEvaluationResult();

      await writeEvaluationArtifacts(result, tempDir);

      expect(existsSync(join(tempDir, "report.html"))).toBe(true);
      expect(existsSync(join(tempDir, "label-counts.svg"))).toBe(true);
      expect(existsSync(join(tempDir, "compliance-summary.svg"))).toBe(true);
      expect(existsSync(join(tempDir, "severity-breakdown.svg"))).toBe(true);
    });
  });

  describe("writeSummaryArtifacts", () => {
    const createMockSummaryResult = (): SummaryOnlyEvaluationResult => ({
      metrics: {
        evaluatorVersion: "1.0.0",
        schemaVersion: "1.0.0",
        generatedAt: new Date().toISOString(),
        sessionCount: 1,
        turnCount: 1,
        incidentCount: 0,
        labelCounts: {},
        complianceSummary: [],
        sessions: [],
        inventory: [],
      } as MetricsRecord,
      summary: {
        evaluatorVersion: "1.0.0",
        schemaVersion: "1.0.0",
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
      } as SummaryArtifact,
      report: "# Summary Report",
    });

    it("should write metrics.json", async () => {
      const result = createMockSummaryResult();

      await writeSummaryArtifacts(result, tempDir);

      expect(existsSync(join(tempDir, "metrics.json"))).toBe(true);
    });

    it("should write summary.json", async () => {
      const result = createMockSummaryResult();

      await writeSummaryArtifacts(result, tempDir);

      const summaryPath = join(tempDir, "summary.json");
      expect(existsSync(summaryPath)).toBe(true);
      const content = readFileSync(summaryPath, "utf-8");
      const parsed = JSON.parse(content);
      expect(parsed.sessions).toBe(1);
    });

    it("should write report.md", async () => {
      const result = createMockSummaryResult();

      await writeSummaryArtifacts(result, tempDir);

      const reportPath = join(tempDir, "report.md");
      expect(existsSync(reportPath)).toBe(true);
      const content = readFileSync(reportPath, "utf-8");
      expect(content).toContain("# Summary Report");
    });

    it("should not write raw-turns.jsonl or incidents.jsonl", async () => {
      const result = createMockSummaryResult();

      await writeSummaryArtifacts(result, tempDir);

      expect(existsSync(join(tempDir, "raw-turns.jsonl"))).toBe(false);
      expect(existsSync(join(tempDir, "incidents.jsonl"))).toBe(false);
    });
  });

  describe("createSummaryInputs", () => {
    const createMockProcessedSessions = (): ProcessedSession[] => [
      {
        sessionId: "session-1",
        turns: [
          {
            evaluatorVersion: "1.0.0",
            schemaVersion: "1.0.0",
            sessionId: "session-1",
            turnIndex: 0,
            userMessageCount: 1,
            assistantMessageCount: 1,
            userMessagePreviews: ["test"],
            assistantMessagePreviews: ["test"],
            toolCalls: [],
            labels: [
              {
                label: "interrupt",
                severity: "medium",
                confidence: "high",
                rationale: "test",
              },
            ],
            sourceRefs: [
              {
                provider: "codex",
                kind: "session_jsonl",
                path: "/test.jsonl",
                line: 1,
              },
            ],
          },
        ],
        incidents: [
          {
            evaluatorVersion: "1.0.0",
            schemaVersion: "1.0.0",
            incidentId: "session-1:incident:0",
            sessionId: "session-1",
            turnIds: ["turn-1"],
            turnIndices: [0],
            labels: [
              {
                label: "interrupt",
                severity: "medium",
                confidence: "high",
                rationale: "test",
              },
            ],
            summary: "Test incident",
            evidencePreviews: ["test evidence"],
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
        ],
        metrics: {
          sessionId: "session-1",
          provider: "codex",
          turnCount: 1,
          labeledTurnCount: 1,
          incidentCount: 1,
          writeCount: 0,
          verificationCount: 0,
          verificationPassedCount: 0,
          verificationFailedCount: 0,
          complianceScore: 50,
          complianceRules: [],
        },
      },
    ];

    it("should create summary inputs from processed sessions", () => {
      const sessions = createMockProcessedSessions();

      const inputs = createSummaryInputs(sessions, 5);

      expect(inputs.sessionLabelCounts).toBeInstanceOf(Map);
      expect(inputs.topIncidents).toBeInstanceOf(Array);
      expect(inputs.severityCounts).toBeDefined();
      expect(inputs.writeTurnCount).toBe(5);
    });

    it("should count labels per session", () => {
      const sessions = createMockProcessedSessions();

      const inputs = createSummaryInputs(sessions, 0);

      const sessionCounts = inputs.sessionLabelCounts.get("session-1");
      expect(sessionCounts?.interrupt).toBe(1);
    });

    it("should populate top incidents", () => {
      const sessions = createMockProcessedSessions();

      const inputs = createSummaryInputs(sessions, 0);

      expect(inputs.topIncidents.length).toBeGreaterThan(0);
      expect(inputs.topIncidents[0]?.incidentId).toBe("session-1:incident:0");
    });

    it("should count severities", () => {
      const sessions = createMockProcessedSessions();

      const inputs = createSummaryInputs(sessions, 0);

      expect(inputs.severityCounts.medium).toBe(1);
    });
  });
});
