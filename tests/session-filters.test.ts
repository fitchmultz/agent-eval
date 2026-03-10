/**
 * Purpose: Unit tests for session-filters module.
 * Entrypoint: Run with `pnpm test tests/session-filters.test.ts`
 * Notes: Tests session filtering utilities for write sessions, verified sessions, and quiet sessions.
 */

import { describe, expect, it } from "vitest";
import type { SessionMetrics } from "../src/schema.js";
import {
  filterQuietSessions,
  filterVerifiedWriteSessions,
  filterWriteSessions,
} from "../src/session-filters.js";

function createSessionMetrics(
  overrides: Partial<SessionMetrics> = {},
): SessionMetrics {
  return {
    sessionId: "test-session",
    provider: "codex",
    turnCount: 10,
    labeledTurnCount: 2,
    incidentCount: 0,
    writeCount: 0,
    verificationCount: 0,
    verificationPassedCount: 0,
    verificationFailedCount: 0,
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

describe("filterVerifiedWriteSessions", () => {
  it("should return only write sessions with verificationPassedCount > 0", () => {
    const sessions: SessionMetrics[] = [
      createSessionMetrics({
        sessionId: "s1",
        writeCount: 5,
        verificationPassedCount: 2,
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
      }),
    ];

    const result = filterVerifiedWriteSessions(sessions);
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
      }),
    ];

    expect(filterVerifiedWriteSessions(sessions)).toHaveLength(0);
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

    expect(filterVerifiedWriteSessions(sessions)).toHaveLength(0);
  });

  it("should handle empty input", () => {
    expect(filterVerifiedWriteSessions([])).toHaveLength(0);
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
    const verifiedWriteSessions = filterVerifiedWriteSessions(sessions);
    const quietSessions = filterQuietSessions(sessions);

    expect(writeSessions).toHaveLength(2);
    expect(verifiedWriteSessions).toHaveLength(1);
    expect(verifiedWriteSessions[0]?.sessionId).toBe("s1");
    expect(quietSessions).toHaveLength(2);
  });
});
