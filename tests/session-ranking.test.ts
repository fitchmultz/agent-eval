/**
 * Purpose: Tests for session ranking and victory lap selection.
 * Entrypoint: Executed by Vitest via `pnpm test`.
 * Notes: Verifies session ranking by friction and victory lap selection.
 */
import { describe, expect, it } from "vitest";
import type { LabelName, MetricsRecord } from "../src/schema.js";
import { buildTopSessions, buildVictoryLaps } from "../src/session-ranking.js";
import { createEmptySessionLabelMap } from "../src/summary-core.js";

function createSession(
  sessionId: string,
  overrides: Partial<MetricsRecord["sessions"][number]> = {},
): MetricsRecord["sessions"][number] {
  return {
    sessionId,
    turnCount: 10,
    labeledTurnCount: 2,
    incidentCount: 1,
    writeCount: 3,
    verificationCount: 2,
    verificationPassedCount: 1,
    verificationFailedCount: 1,
    complianceScore: 80,
    complianceRules: [],
    ...overrides,
  };
}

function createPassingRules(): MetricsRecord["sessions"][number]["complianceRules"] {
  return [
    {
      rule: "scope_confirmed_before_major_write",
      status: "pass",
      rationale: "ok",
    },
    {
      rule: "cwd_or_repo_echoed_before_write",
      status: "pass",
      rationale: "ok",
    },
    { rule: "short_plan_before_large_change", status: "pass", rationale: "ok" },
    {
      rule: "verification_after_code_changes",
      status: "pass",
      rationale: "ok",
    },
    { rule: "no_unverified_ending", status: "pass", rationale: "ok" },
  ];
}

describe("buildTopSessions", () => {
  it("returns empty array when no sessions", () => {
    const metrics: MetricsRecord = {
      evaluatorVersion: "0.1.0",
      schemaVersion: "1",
      generatedAt: "2026-03-06T00:00:00.000Z",
      sessionCount: 0,
      turnCount: 0,
      incidentCount: 0,
      labelCounts: {},
      complianceSummary: [],
      sessions: [],
      inventory: [],
    };
    const sessionLabelCounts = new Map<string, Record<LabelName, number>>();

    const result = buildTopSessions(metrics, sessionLabelCounts);
    expect(result).toEqual([]);
  });

  it("ranks sessions by friction score descending", () => {
    const sessions = [
      createSession("low-friction", { complianceScore: 100, incidentCount: 0 }),
      createSession("high-friction", { complianceScore: 50, incidentCount: 5 }),
    ];
    const metrics: MetricsRecord = {
      evaluatorVersion: "0.1.0",
      schemaVersion: "1",
      generatedAt: "2026-03-06T00:00:00.000Z",
      sessionCount: sessions.length,
      turnCount: 20,
      incidentCount: 5,
      labelCounts: {},
      complianceSummary: [],
      sessions,
      inventory: [],
    };
    const sessionLabelCounts = new Map<string, Record<LabelName, number>>();
    for (const session of sessions) {
      sessionLabelCounts.set(session.sessionId, createEmptySessionLabelMap());
    }

    const result = buildTopSessions(metrics, sessionLabelCounts);
    expect(result).toHaveLength(2);
    expect(result[0]!.sessionId).toBe("high-friction");
    expect(result[1]!.sessionId).toBe("low-friction");
    expect(result[0]!.frictionScore).toBeGreaterThan(result[1]!.frictionScore);
  });

  it("includes archetype and archetypeLabel in results", () => {
    const sessions = [
      createSession("verified", {
        writeCount: 5,
        verificationPassedCount: 3,
        complianceScore: 100,
        complianceRules: createPassingRules(),
      }),
    ];
    const metrics: MetricsRecord = {
      evaluatorVersion: "0.1.0",
      schemaVersion: "1",
      generatedAt: "2026-03-06T00:00:00.000Z",
      sessionCount: 1,
      turnCount: 10,
      incidentCount: 0,
      labelCounts: {},
      complianceSummary: [],
      sessions,
      inventory: [],
    };
    const sessionLabelCounts = new Map<string, Record<LabelName, number>>();
    sessionLabelCounts.set("verified", createEmptySessionLabelMap());

    const result = buildTopSessions(metrics, sessionLabelCounts);
    expect(result[0]!.archetype).toBe("verified_delivery");
    expect(result[0]!.archetypeLabel).toBe("Clean Ship");
  });

  it("includes dominant labels in results", () => {
    const sessions = [createSession("with-labels", { complianceScore: 100 })];
    const metrics: MetricsRecord = {
      evaluatorVersion: "0.1.0",
      schemaVersion: "1",
      generatedAt: "2026-03-06T00:00:00.000Z",
      sessionCount: 1,
      turnCount: 10,
      incidentCount: 0,
      labelCounts: {},
      complianceSummary: [],
      sessions,
      inventory: [],
    };
    const sessionLabelCounts = new Map<string, Record<LabelName, number>>();
    sessionLabelCounts.set("with-labels", {
      ...createEmptySessionLabelMap(),
      context_drift: 3,
      interrupt: 1,
    });

    const result = buildTopSessions(metrics, sessionLabelCounts);
    expect(result[0]!.dominantLabels).toContain("context_drift");
    expect(result[0]!.dominantLabels).toContain("interrupt");
  });

  it("breaks ties by incident count descending", () => {
    const sessions = [
      createSession("fewer-incidents", {
        complianceScore: 80,
        incidentCount: 1,
      }),
      createSession("more-incidents", {
        complianceScore: 80,
        incidentCount: 3,
      }),
    ];
    const metrics: MetricsRecord = {
      evaluatorVersion: "0.1.0",
      schemaVersion: "1",
      generatedAt: "2026-03-06T00:00:00.000Z",
      sessionCount: 2,
      turnCount: 20,
      incidentCount: 4,
      labelCounts: {},
      complianceSummary: [],
      sessions,
      inventory: [],
    };
    const sessionLabelCounts = new Map<string, Record<LabelName, number>>();
    for (const session of sessions) {
      sessionLabelCounts.set(session.sessionId, createEmptySessionLabelMap());
    }

    const result = buildTopSessions(metrics, sessionLabelCounts);
    // Same friction score, so sorted by incident count
    expect(result[0]!.sessionId).toBe("more-incidents");
    expect(result[1]!.sessionId).toBe("fewer-incidents");
  });

  it("breaks ties by session ID alphabetically", () => {
    const sessions = [
      createSession("session-b", { complianceScore: 100 }),
      createSession("session-a", { complianceScore: 100 }),
    ];
    const metrics: MetricsRecord = {
      evaluatorVersion: "0.1.0",
      schemaVersion: "1",
      generatedAt: "2026-03-06T00:00:00.000Z",
      sessionCount: 2,
      turnCount: 20,
      incidentCount: 0,
      labelCounts: {},
      complianceSummary: [],
      sessions,
      inventory: [],
    };
    const sessionLabelCounts = new Map<string, Record<LabelName, number>>();
    for (const session of sessions) {
      sessionLabelCounts.set(session.sessionId, createEmptySessionLabelMap());
    }

    const result = buildTopSessions(metrics, sessionLabelCounts);
    // Same friction and incident count, so sorted by sessionId
    expect(result[0]!.sessionId).toBe("session-a");
    expect(result[1]!.sessionId).toBe("session-b");
  });
});

describe("buildVictoryLaps", () => {
  it("returns empty array when no verified delivery sessions", () => {
    const topSessions = [
      {
        sessionId: "unverified",
        archetype: "unverified_delivery" as const,
        archetypeLabel: "Needs Proof",
        frictionScore: 5,
        complianceScore: 60,
        incidentCount: 2,
        labeledTurnCount: 3,
        writeCount: 5,
        verificationPassedCount: 0,
        dominantLabels: [],
        note: "test",
      },
    ];

    const result = buildVictoryLaps(topSessions);
    expect(result).toEqual([]);
  });

  it("filters to only verified_delivery archetype", () => {
    const topSessions = [
      {
        sessionId: "verified-1",
        archetype: "verified_delivery" as const,
        archetypeLabel: "Clean Ship",
        frictionScore: 2,
        complianceScore: 100,
        incidentCount: 0,
        labeledTurnCount: 2,
        writeCount: 5,
        verificationPassedCount: 3,
        dominantLabels: [],
        note: "test",
      },
      {
        sessionId: "unverified",
        archetype: "unverified_delivery" as const,
        archetypeLabel: "Needs Proof",
        frictionScore: 5,
        complianceScore: 60,
        incidentCount: 2,
        labeledTurnCount: 3,
        writeCount: 5,
        verificationPassedCount: 0,
        dominantLabels: [],
        note: "test",
      },
      {
        sessionId: "verified-2",
        archetype: "verified_delivery" as const,
        archetypeLabel: "Clean Ship",
        frictionScore: 1,
        complianceScore: 95,
        incidentCount: 1,
        labeledTurnCount: 2,
        writeCount: 3,
        verificationPassedCount: 2,
        dominantLabels: [],
        note: "test",
      },
    ];

    const result = buildVictoryLaps(topSessions);
    expect(result).toHaveLength(2);
    expect(result.every((s) => s.archetype === "verified_delivery")).toBe(true);
  });

  it("sorts by compliance score descending", () => {
    const topSessions = [
      {
        sessionId: "lower-compliance",
        archetype: "verified_delivery" as const,
        archetypeLabel: "Clean Ship",
        frictionScore: 1,
        complianceScore: 90,
        incidentCount: 0,
        labeledTurnCount: 2,
        writeCount: 5,
        verificationPassedCount: 3,
        dominantLabels: [],
        note: "test",
      },
      {
        sessionId: "higher-compliance",
        archetype: "verified_delivery" as const,
        archetypeLabel: "Clean Ship",
        frictionScore: 1,
        complianceScore: 100,
        incidentCount: 0,
        labeledTurnCount: 2,
        writeCount: 5,
        verificationPassedCount: 3,
        dominantLabels: [],
        note: "test",
      },
    ];

    const result = buildVictoryLaps(topSessions);
    expect(result[0]!.sessionId).toBe("higher-compliance");
    expect(result[1]!.sessionId).toBe("lower-compliance");
  });

  it("limits to maximum 6 sessions", () => {
    const topSessions = Array.from({ length: 10 }, (_, i) => ({
      sessionId: `verified-${i}`,
      archetype: "verified_delivery" as const,
      archetypeLabel: "Clean Ship",
      frictionScore: 1,
      complianceScore: 100 - i,
      incidentCount: 0,
      labeledTurnCount: 2,
      writeCount: 5,
      verificationPassedCount: 3,
      dominantLabels: [],
      note: "test",
    }));

    const result = buildVictoryLaps(topSessions);
    expect(result).toHaveLength(6);
  });
});
