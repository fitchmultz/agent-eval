/**
 * Purpose: Unit tests for session-filters module.
 * Entrypoint: Run with `pnpm test tests/session-filters.test.ts`
 * Notes: Tests session filtering utilities for write sessions, verified sessions, and quiet sessions.
 */

import { describe, expect, it } from "vitest";
import type { SessionMetrics } from "../src/schema.js";
import {
  filterEndedVerifiedWriteSessions,
  filterQuietSessions,
  filterWriteSessions,
} from "../src/session-filters.js";

function createSessionMetrics(
  overrides: Partial<SessionMetrics> = {},
): SessionMetrics {
  return {
    sessionId: "test-session",
    provider: "codex",
    harness: "codex",
    modelProvider: null,
    model: null,
    startedAt: "2026-04-03T20:00:00.000Z",
    endedAt: "2026-04-03T20:05:00.000Z",
    durationMs: 300000,
    turnCount: 10,
    labeledTurnCount: 2,
    incidentCount: 0,
    parseWarningCount: 0,
    userMessageCount: 3,
    assistantMessageCount: 4,
    toolCallCount: 2,
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
    ...overrides,
  };
}

describe("filterWriteSessions", () => {
  it("should return only sessions with writeCount > 0", () => {
    const sessions: SessionMetrics[] = [
      createSessionMetrics({ sessionId: "s1", writeCount: 5 }),
      createSessionMetrics({ sessionId: "s2", writeCount: 0 }),
      createSessionMetrics({ sessionId: "s3", writeCount: 3 }),
    ];

    const result = filterWriteSessions(sessions);
    expect(result).toHaveLength(2);
    expect(result.map((s) => s.sessionId)).toContain("s1");
    expect(result.map((s) => s.sessionId)).toContain("s3");
  });

  it("should return empty array when no sessions have writes", () => {
    const sessions: SessionMetrics[] = [
      createSessionMetrics({ sessionId: "s1", writeCount: 0 }),
      createSessionMetrics({ sessionId: "s2", writeCount: 0 }),
    ];

    expect(filterWriteSessions(sessions)).toHaveLength(0);
  });

  it("should return all sessions when all have writes", () => {
    const sessions: SessionMetrics[] = [
      createSessionMetrics({ sessionId: "s1", writeCount: 1 }),
      createSessionMetrics({ sessionId: "s2", writeCount: 5 }),
    ];

    expect(filterWriteSessions(sessions)).toHaveLength(2);
  });

  it("should handle empty input", () => {
    expect(filterWriteSessions([])).toHaveLength(0);
  });
});

describe("filterEndedVerifiedWriteSessions", () => {
  it("should return only write sessions that ended verified", () => {
    const sessions: SessionMetrics[] = [
      createSessionMetrics({
        sessionId: "s1",
        writeCount: 5,
        verificationPassedCount: 2,
        endedVerified: true,
      }),
      createSessionMetrics({
        sessionId: "s2",
        writeCount: 5,
        verificationPassedCount: 0,
      }),
      createSessionMetrics({
        sessionId: "s3",
        writeCount: 0,
        verificationPassedCount: 1,
      }), // No writes
      createSessionMetrics({
        sessionId: "s4",
        writeCount: 3,
        verificationPassedCount: 1,
        endedVerified: true,
      }),
    ];

    const result = filterEndedVerifiedWriteSessions(sessions);
    expect(result).toHaveLength(2);
    expect(result.map((s) => s.sessionId)).toContain("s1");
    expect(result.map((s) => s.sessionId)).toContain("s4");
  });

  it("should exclude sessions without writes even if they have verifications", () => {
    const sessions: SessionMetrics[] = [
      createSessionMetrics({
        sessionId: "s1",
        writeCount: 0,
        verificationPassedCount: 2,
        endedVerified: true,
      }),
    ];

    expect(filterEndedVerifiedWriteSessions(sessions)).toHaveLength(0);
  });

  it("should return empty array when no sessions match", () => {
    const sessions: SessionMetrics[] = [
      createSessionMetrics({
        sessionId: "s1",
        writeCount: 5,
        verificationPassedCount: 0,
      }),
      createSessionMetrics({
        sessionId: "s2",
        writeCount: 0,
        verificationPassedCount: 0,
      }),
    ];

    expect(filterEndedVerifiedWriteSessions(sessions)).toHaveLength(0);
  });

  it("should handle empty input", () => {
    expect(filterEndedVerifiedWriteSessions([])).toHaveLength(0);
  });
});

describe("filterQuietSessions", () => {
  it("should return only sessions with incidentCount === 0", () => {
    const sessions: SessionMetrics[] = [
      createSessionMetrics({ sessionId: "s1", incidentCount: 0 }),
      createSessionMetrics({ sessionId: "s2", incidentCount: 3 }),
      createSessionMetrics({ sessionId: "s3", incidentCount: 0 }),
    ];

    const result = filterQuietSessions(sessions);
    expect(result).toHaveLength(2);
    expect(result.map((s) => s.sessionId)).toContain("s1");
    expect(result.map((s) => s.sessionId)).toContain("s3");
  });

  it("should return empty array when all sessions have incidents", () => {
    const sessions: SessionMetrics[] = [
      createSessionMetrics({ sessionId: "s1", incidentCount: 1 }),
      createSessionMetrics({ sessionId: "s2", incidentCount: 5 }),
    ];

    expect(filterQuietSessions(sessions)).toHaveLength(0);
  });

  it("should return all sessions when none have incidents", () => {
    const sessions: SessionMetrics[] = [
      createSessionMetrics({ sessionId: "s1", incidentCount: 0 }),
      createSessionMetrics({ sessionId: "s2", incidentCount: 0 }),
    ];

    expect(filterQuietSessions(sessions)).toHaveLength(2);
  });

  it("should handle empty input", () => {
    expect(filterQuietSessions([])).toHaveLength(0);
  });
});

describe("filter composition", () => {
  it("should work correctly when chaining filters", () => {
    const sessions: SessionMetrics[] = [
      createSessionMetrics({
        sessionId: "s1",
        writeCount: 5,
        verificationPassedCount: 2,
        endedVerified: true,
        incidentCount: 0,
      }),
      createSessionMetrics({
        sessionId: "s2",
        writeCount: 5,
        verificationPassedCount: 0,
        incidentCount: 3,
      }),
      createSessionMetrics({
        sessionId: "s3",
        writeCount: 0,
        verificationPassedCount: 0,
        incidentCount: 0,
      }),
    ];

    // First filter to write sessions, then to verified
    const writeSessions = filterWriteSessions(sessions);
    const sessionsEndingVerified = filterEndedVerifiedWriteSessions(sessions);
    const quietSessions = filterQuietSessions(sessions);

    expect(writeSessions).toHaveLength(2);
    expect(sessionsEndingVerified).toHaveLength(1);
    expect(sessionsEndingVerified[0]?.sessionId).toBe("s1");
    expect(quietSessions).toHaveLength(2);
  });
});
