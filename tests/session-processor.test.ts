import { describe, expect, it } from "vitest";
import {
  processSession,
  type SessionMetrics,
} from "../src/session-processor.js";
import type { ParsedSession } from "../src/transcript/index.js";

describe("processSession", () => {
  const mockSession: ParsedSession = {
    sessionId: "test-session-123",
    parentSessionId: "parent-456",
    path: "/test/path.jsonl",
    startedAt: "2024-01-01T00:00:00Z",
    cwd: "/test/workspace",
    turns: [
      {
        turnId: "turn-1",
        turnIndex: 0,
        startedAt: "2024-01-01T00:00:00Z",
        cwd: "/test/workspace",
        userMessages: ["Can you help me fix this bug?"],
        assistantMessages: [
          "I'll help you fix that bug. Let me look at the code.",
        ],
        toolCalls: [
          {
            callId: "call-1",
            toolName: "shell",
            categoryHint: "function_call",
            argumentsText: '{"cmd": "cat file.ts"}',
            status: "completed",
          },
        ],
        sourceRefs: [
          { kind: "session_jsonl", path: "/test/path.jsonl", line: 1 },
        ],
      },
      {
        turnId: "turn-2",
        turnIndex: 1,
        startedAt: "2024-01-01T00:01:00Z",
        cwd: "/test/workspace",
        userMessages: ["The tests are still failing."],
        assistantMessages: ["Let me check what's wrong with the tests."],
        toolCalls: [
          {
            callId: "call-2",
            toolName: "apply_patch",
            categoryHint: "function_call",
            argumentsText: '{"patch": "diff content"}',
            status: "completed",
          },
        ],
        sourceRefs: [
          { kind: "session_jsonl", path: "/test/path.jsonl", line: 10 },
        ],
      },
    ],
  };

  it("should process a session and return structured data", async () => {
    const result = await processSession(mockSession, "/home/user");

    expect(result.sessionId).toBe("test-session-123");
    expect(result.turns).toHaveLength(2);
    expect(result.metrics.turnCount).toBe(2);
  });

  it("should label turns based on user messages", async () => {
    const sessionWithLabels: ParsedSession = {
      ...mockSession,
      turns: [
        {
          turnId: "turn-1",
          turnIndex: 0,
          startedAt: "2024-01-01T00:00:00Z",
          cwd: "/test/workspace",
          userMessages: ["You broke the build! The tests are still failing."],
          assistantMessages: [],
          toolCalls: [],
          sourceRefs: [
            { kind: "session_jsonl", path: "/test/path.jsonl", line: 1 },
          ],
        },
      ],
    };

    const result = await processSession(sessionWithLabels);

    expect(result.turns[0]?.labels.length).toBeGreaterThan(0);
    expect(
      result.turns[0]?.labels.some(
        (l) => l.label === "test_build_lint_failure_complaint",
      ),
    ).toBe(true);
    expect(result.metrics.labeledTurnCount).toBe(1);
  });

  it("should calculate compliance metrics", async () => {
    const result = await processSession(mockSession);

    expect(result.metrics.complianceScore).toBeDefined();
    expect(result.metrics.complianceRules).toBeInstanceOf(Array);
    expect(result.metrics.writeCount).toBeGreaterThan(0);
  });

  it("should cluster incidents from labeled turns", async () => {
    const sessionWithInterruption: ParsedSession = {
      ...mockSession,
      turns: [
        {
          turnId: "turn-1",
          turnIndex: 0,
          startedAt: "2024-01-01T00:00:00Z",
          cwd: "/test/workspace",
          userMessages: ["Stop! Wait, I need to check something."],
          assistantMessages: [],
          toolCalls: [],
          sourceRefs: [
            { kind: "session_jsonl", path: "/test/path.jsonl", line: 1 },
          ],
        },
        {
          turnId: "turn-2",
          turnIndex: 1,
          startedAt: "2024-01-01T00:01:00Z",
          cwd: "/test/workspace",
          userMessages: ["Actually, nevermind."],
          assistantMessages: [],
          toolCalls: [],
          sourceRefs: [
            { kind: "session_jsonl", path: "/test/path.jsonl", line: 2 },
          ],
        },
      ],
    };

    const result = await processSession(sessionWithInterruption);

    expect(result.incidents).toBeInstanceOf(Array);
    expect(result.metrics.incidentCount).toBeDefined();
  });

  it("should redact paths when home directory is provided", async () => {
    const result = await processSession(mockSession, "/test");

    expect(result.turns[0]?.cwd).toBe("~/workspace");
    expect(result.turns[0]?.sourceRefs[0]?.path).toBe("~/path.jsonl");
  });

  it("should create proper session metrics", async () => {
    const result = await processSession(mockSession);

    expect(result.metrics).toMatchObject<Partial<SessionMetrics>>({
      sessionId: "test-session-123",
      turnCount: 2,
      labeledTurnCount: expect.any(Number),
      incidentCount: expect.any(Number),
      writeCount: expect.any(Number),
      verificationCount: expect.any(Number),
      complianceScore: expect.any(Number),
    });
  });

  it("should handle empty sessions", async () => {
    const emptySession: ParsedSession = {
      sessionId: "empty-session",
      path: "/test/empty.jsonl",
      turns: [],
    };

    const result = await processSession(emptySession);

    expect(result.turns).toHaveLength(0);
    expect(result.incidents).toHaveLength(0);
    expect(result.metrics.turnCount).toBe(0);
    expect(result.metrics.labeledTurnCount).toBe(0);
  });

  it("should categorize tool calls correctly", async () => {
    const result = await processSession(mockSession);

    expect(result.turns[0]?.toolCalls[0]?.toolName).toBe("shell");
    expect(result.turns[0]?.toolCalls[0]?.category).toBeDefined();
  });

  it("should create message previews", async () => {
    const result = await processSession(mockSession);

    expect(result.turns[0]?.userMessagePreviews).toBeInstanceOf(Array);
    expect(result.turns[0]?.assistantMessagePreviews).toBeInstanceOf(Array);
    expect(result.turns[0]?.userMessageCount).toBe(1);
    expect(result.turns[0]?.assistantMessageCount).toBe(1);
  });
});
