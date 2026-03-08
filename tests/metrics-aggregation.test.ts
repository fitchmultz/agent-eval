import { describe, expect, it } from "vitest";
import {
  aggregateMetrics,
  countLabel,
  countWriteTurns,
  extractAllIncidents,
  extractAllTurns,
} from "../src/metrics-aggregation.js";
import type { InventoryRecord, LabelName } from "../src/schema.js";
import type {
  ProcessedSession,
  SessionMetrics,
} from "../src/session-processor.js";

describe("aggregateMetrics", () => {
  const createMockSession = (
    id: string,
    labelCount: number = 0,
  ): ProcessedSession => ({
    sessionId: id,
    turns: [
      {
        evaluatorVersion: "1.0.0",
        schemaVersion: "1.0.0",
        sessionId: id,
        turnIndex: 0,
        userMessageCount: 1,
        assistantMessageCount: 1,
        userMessagePreviews: ["test message"],
        assistantMessagePreviews: ["test response"],
        toolCalls: [],
        labels:
          labelCount > 0
            ? [
                {
                  label: "interrupt" as LabelName,
                  severity: "medium",
                  confidence: "high",
                  rationale: "test",
                },
              ]
            : [],
        sourceRefs: [{ kind: "session_jsonl", path: "/test.jsonl", line: 1 }],
      },
    ],
    incidents:
      labelCount > 0
        ? [
            {
              evaluatorVersion: "1.0.0",
              schemaVersion: "1.0.0",
              incidentId: `${id}:incident:0`,
              sessionId: id,
              turnIds: ["turn-1"],
              turnIndices: [0],
              labels: [
                {
                  label: "interrupt" as LabelName,
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
                { kind: "session_jsonl", path: "/test.jsonl", line: 1 },
              ],
            },
          ]
        : [],
    metrics: {
      sessionId: id,
      turnCount: 1,
      labeledTurnCount: labelCount > 0 ? 1 : 0,
      incidentCount: labelCount > 0 ? 1 : 0,
      writeCount: 0,
      verificationCount: 0,
      verificationPassedCount: 0,
      verificationFailedCount: 0,
      complianceScore: 50,
      complianceRules: [],
    },
  });

  const mockInventory: InventoryRecord[] = [
    {
      kind: "session_jsonl",
      path: "/test/session.jsonl",
      discovered: true,
      required: true,
      optional: false,
    },
  ];

  it("should aggregate metrics from multiple sessions", () => {
    const sessions = [
      createMockSession("session-1", 1),
      createMockSession("session-2"),
    ];

    const metrics = aggregateMetrics(sessions, mockInventory);

    expect(metrics.sessionCount).toBe(2);
    expect(metrics.turnCount).toBe(2);
    expect(metrics.incidentCount).toBe(1);
  });

  it("should count labels correctly", () => {
    const sessions = [
      createMockSession("session-1", 1),
      createMockSession("session-2", 1),
    ];

    const metrics = aggregateMetrics(sessions, mockInventory);

    expect(metrics.labelCounts.interrupt).toBe(2);
  });

  it("should aggregate compliance summaries", () => {
    const sessions: ProcessedSession[] = [
      {
        ...createMockSession("session-1"),
        metrics: {
          ...createMockSession("session-1").metrics,
          complianceRules: [
            {
              rule: "scope_confirmed_before_major_write",
              status: "pass",
              rationale: "test",
            },
          ],
        },
      },
    ];

    const metrics = aggregateMetrics(sessions, mockInventory);

    expect(metrics.complianceSummary).toBeInstanceOf(Array);
    expect(metrics.complianceSummary.length).toBeGreaterThan(0);
    const rule = metrics.complianceSummary.find(
      (r) => r.rule === "scope_confirmed_before_major_write",
    );
    expect(rule?.passCount).toBe(1);
  });

  it("should include inventory in metrics", () => {
    const sessions = [createMockSession("session-1")];

    const metrics = aggregateMetrics(sessions, mockInventory);

    expect(metrics.inventory).toEqual(mockInventory);
  });

  it("should set metadata fields", () => {
    const sessions = [createMockSession("session-1")];

    const metrics = aggregateMetrics(sessions, mockInventory);

    expect(metrics.evaluatorVersion).toBeDefined();
    expect(metrics.schemaVersion).toBeDefined();
    expect(metrics.generatedAt).toBeDefined();
    expect(new Date(metrics.generatedAt).getTime()).not.toBeNaN();
  });

  it("should handle empty sessions array", () => {
    const metrics = aggregateMetrics([], []);

    expect(metrics.sessionCount).toBe(0);
    expect(metrics.turnCount).toBe(0);
    expect(metrics.incidentCount).toBe(0);
    expect(metrics.sessions).toHaveLength(0);
  });
});

describe("countLabel", () => {
  const createSessionWithLabel = (
    label: LabelName,
    count: number,
  ): ProcessedSession => ({
    sessionId: "test",
    turns: Array.from({ length: count }, (_, i) => ({
      evaluatorVersion: "1.0.0",
      schemaVersion: "1.0.0",
      sessionId: "test",
      turnIndex: i,
      userMessageCount: 1,
      assistantMessageCount: 1,
      userMessagePreviews: ["test"],
      assistantMessagePreviews: ["test"],
      toolCalls: [],
      labels: [
        { label, severity: "medium", confidence: "high", rationale: "test" },
      ],
      sourceRefs: [{ kind: "session_jsonl", path: "/test.jsonl", line: 1 }],
    })),
    incidents: [],
    metrics: {
      sessionId: "test",
      turnCount: count,
      labeledTurnCount: count,
      incidentCount: 0,
      writeCount: 0,
      verificationCount: 0,
      verificationPassedCount: 0,
      verificationFailedCount: 0,
      complianceScore: 50,
      complianceRules: [],
    },
  });

  it("should count specific labels across sessions", () => {
    const sessions = [
      createSessionWithLabel("interrupt", 2),
      createSessionWithLabel("interrupt", 3),
    ];

    expect(countLabel(sessions, "interrupt")).toBe(5);
  });

  it("should return 0 for labels that don't exist", () => {
    const sessions = [createSessionWithLabel("praise", 1)];

    expect(countLabel(sessions, "interrupt")).toBe(0);
  });
});

describe("countWriteTurns", () => {
  const createSessionWithWriteTurns = (
    writeTurnCount: number,
  ): ProcessedSession => ({
    sessionId: "test",
    turns: Array.from({ length: writeTurnCount }, (_, i) => ({
      evaluatorVersion: "1.0.0",
      schemaVersion: "1.0.0",
      sessionId: "test",
      turnIndex: i,
      userMessageCount: 1,
      assistantMessageCount: 1,
      userMessagePreviews: ["test"],
      assistantMessagePreviews: ["test"],
      toolCalls: [
        {
          toolName: "apply_patch",
          category: "write",
          writeLike: true,
          verificationLike: false,
          status: "completed",
        },
      ],
      labels: [],
      sourceRefs: [{ kind: "session_jsonl", path: "/test.jsonl", line: 1 }],
    })),
    incidents: [],
    metrics: {
      sessionId: "test",
      turnCount: writeTurnCount,
      labeledTurnCount: 0,
      incidentCount: 0,
      writeCount: writeTurnCount,
      verificationCount: 0,
      verificationPassedCount: 0,
      verificationFailedCount: 0,
      complianceScore: 50,
      complianceRules: [],
    },
  });

  it("should count write turns across sessions", () => {
    const sessions = [
      createSessionWithWriteTurns(2),
      createSessionWithWriteTurns(3),
    ];

    expect(countWriteTurns(sessions)).toBe(5);
  });

  it("should return 0 for sessions without write turns", () => {
    const sessions: ProcessedSession[] = [
      {
        sessionId: "test",
        turns: [
          {
            evaluatorVersion: "1.0.0",
            schemaVersion: "1.0.0",
            sessionId: "test",
            turnIndex: 0,
            userMessageCount: 1,
            assistantMessageCount: 1,
            userMessagePreviews: ["test"],
            assistantMessagePreviews: ["test"],
            toolCalls: [
              {
                toolName: "shell",
                category: "other",
                writeLike: false,
                verificationLike: false,
                status: "completed",
              },
            ],
            labels: [],
            sourceRefs: [
              { kind: "session_jsonl", path: "/test.jsonl", line: 1 },
            ],
          },
        ],
        incidents: [],
        metrics: {
          sessionId: "test",
          turnCount: 1,
          labeledTurnCount: 0,
          incidentCount: 0,
          writeCount: 0,
          verificationCount: 0,
          verificationPassedCount: 0,
          verificationFailedCount: 0,
          complianceScore: 50,
          complianceRules: [],
        },
      },
    ];

    expect(countWriteTurns(sessions)).toBe(0);
  });
});

describe("extractAllTurns", () => {
  it("should extract all turns from all sessions", () => {
    const sessions: ProcessedSession[] = [
      {
        sessionId: "s1",
        turns: [{}, {}] as ProcessedSession["turns"],
        incidents: [],
        metrics: {} as SessionMetrics,
      },
      {
        sessionId: "s2",
        turns: [{}] as ProcessedSession["turns"],
        incidents: [],
        metrics: {} as SessionMetrics,
      },
    ];

    const turns = extractAllTurns(sessions);

    expect(turns).toHaveLength(3);
  });
});

describe("extractAllIncidents", () => {
  it("should extract all incidents from all sessions", () => {
    const sessions = [
      {
        sessionId: "s1",
        turns: [],
        incidents: [
          { incidentId: "i1" },
          { incidentId: "i2" },
        ] as ProcessedSession["incidents"],
        metrics: {} as SessionMetrics,
      },
      {
        sessionId: "s2",
        turns: [],
        incidents: [{ incidentId: "i3" }] as ProcessedSession["incidents"],
        metrics: {} as SessionMetrics,
      },
    ];

    const incidents = extractAllIncidents(sessions);

    expect(incidents).toHaveLength(3);
  });
});
