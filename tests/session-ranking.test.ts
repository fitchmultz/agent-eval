/**
 * Purpose: Tests for session ranking and victory lap selection.
 * Entrypoint: Executed by Vitest via `pnpm test`.
 * Notes: Verifies session ranking by friction and victory lap selection.
 */
import { describe, expect, it } from "vitest";
import type { LabelName, MetricsRecord } from "../src/schema.js";
import {
  buildEndedVerifiedDeliverySpotlights,
  buildTopSessions,
} from "../src/session-ranking.js";
import { createEmptySessionLabelMap } from "../src/summary/index.js";
import type { SessionContext } from "../src/summary/types.js";

function createSession(
  sessionId: string,
  overrides: Partial<MetricsRecord["sessions"][number]> = {},
): MetricsRecord["sessions"][number] {
  return {
    sessionId,
    provider: overrides.provider ?? "codex",
    turnCount: 10,
    labeledTurnCount: 2,
    incidentCount: 1,
    parseWarningCount: 0,
    writeCount: 3,
    verificationCount: 2,
    verificationPassedCount: 1,
    verificationFailedCount: 1,
    postWriteVerificationAttempted: true,
    postWriteVerificationPassed: true,
    endedVerified: true,
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
      engineVersion: "0.1.0",
      schemaVersion: "2",
      generatedAt: "2026-03-06T00:00:00.000Z",
      sessionCount: 0,
      corpusScope: {
        selection: "all_discovered",
        discoveredSessionCount: 0,
        appliedSessionLimit: null,
      },
      turnCount: 0,
      incidentCount: 0,
      parseWarningCount: 0,
      labelCounts: {},
      complianceSummary: [],
      sessions: [],
      inventory: [],
    };
    const sessionLabelCounts = new Map<string, Record<LabelName, number>>();

    const result = buildTopSessions(metrics, sessionLabelCounts);
    expect(result).toEqual([]);
  });

  it("filters out sessions with no meaningful review signal", () => {
    const sessions = [
      createSession("quiet-analysis", {
        incidentCount: 0,
        labeledTurnCount: 0,
        writeCount: 0,
        verificationCount: 0,
        verificationPassedCount: 0,
        verificationFailedCount: 0,
        postWriteVerificationAttempted: false,
        postWriteVerificationPassed: false,
        complianceScore: 100,
        complianceRules: createPassingRules(),
      }),
      createSession("needs-review", {
        incidentCount: 1,
        writeCount: 0,
        complianceScore: 80,
      }),
    ];
    const metrics: MetricsRecord = {
      engineVersion: "0.1.0",
      schemaVersion: "2",
      generatedAt: "2026-03-06T00:00:00.000Z",
      sessionCount: sessions.length,
      corpusScope: {
        selection: "all_discovered",
        discoveredSessionCount: sessions.length,
        appliedSessionLimit: null,
      },
      turnCount: 20,
      incidentCount: 1,
      parseWarningCount: 0,
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
    expect(result.map((session) => session.sessionId)).toEqual([
      "needs-review",
    ]);
  });

  it("prioritizes active delivery risk ahead of higher-friction analysis-only sessions", () => {
    const sessions = [
      createSession("analysis-only", {
        writeCount: 0,
        endedVerified: false,
        complianceScore: 20,
        incidentCount: 5,
        verificationCount: 0,
        verificationPassedCount: 0,
        verificationFailedCount: 0,
        postWriteVerificationAttempted: false,
        postWriteVerificationPassed: false,
        complianceRules: [],
      }),
      createSession("unverified-delivery", {
        writeCount: 2,
        endedVerified: false,
        complianceScore: 60,
        incidentCount: 0,
        verificationPassedCount: 0,
        verificationFailedCount: 1,
        complianceRules: [
          {
            rule: "verification_after_code_changes",
            status: "fail",
            rationale: "missing verification",
          },
          {
            rule: "no_unverified_ending",
            status: "fail",
            rationale: "ended unverified",
          },
        ],
      }),
    ];
    const metrics: MetricsRecord = {
      engineVersion: "0.1.0",
      schemaVersion: "2",
      generatedAt: "2026-03-06T00:00:00.000Z",
      sessionCount: sessions.length,
      corpusScope: {
        selection: "all_discovered",
        discoveredSessionCount: sessions.length,
        appliedSessionLimit: null,
      },
      turnCount: 20,
      incidentCount: 5,
      parseWarningCount: 0,
      labelCounts: {},
      complianceSummary: [],
      sessions,
      inventory: [],
    };
    const sessionLabelCounts = new Map<string, Record<LabelName, number>>();
    sessionLabelCounts.set("analysis-only", {
      ...createEmptySessionLabelMap(),
      regression_report: 3,
      stalled_or_guessing: 2,
    });
    sessionLabelCounts.set("unverified-delivery", createEmptySessionLabelMap());

    const result = buildTopSessions(metrics, sessionLabelCounts);
    expect(result[0]?.sessionId).toBe("unverified-delivery");
    expect(result[1]?.sessionId).toBe("analysis-only");
  });

  it("ranks sessions by friction score descending", () => {
    const sessions = [
      createSession("low-friction", { complianceScore: 100, incidentCount: 0 }),
      createSession("high-friction", { complianceScore: 50, incidentCount: 5 }),
    ];
    const metrics: MetricsRecord = {
      engineVersion: "0.1.0",
      schemaVersion: "2",
      generatedAt: "2026-03-06T00:00:00.000Z",
      sessionCount: sessions.length,
      corpusScope: {
        selection: "all_discovered",
        discoveredSessionCount: sessions.length,
        appliedSessionLimit: null,
      },
      turnCount: 20,
      incidentCount: 5,
      parseWarningCount: 0,
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
    expect(result[0]?.sessionId).toBe("high-friction");
    expect(result[1]?.sessionId).toBe("low-friction");
    expect(result[0]?.frictionScore ?? 0).toBeGreaterThan(
      result[1]?.frictionScore ?? 0,
    );
  });

  it("includes archetype and archetypeLabel in results", () => {
    const sessions = [
      createSession("verified", {
        writeCount: 5,
        verificationPassedCount: 3,
        endedVerified: true,
        complianceScore: 100,
        complianceRules: createPassingRules(),
      }),
    ];
    const metrics: MetricsRecord = {
      engineVersion: "0.1.0",
      schemaVersion: "2",
      generatedAt: "2026-03-06T00:00:00.000Z",
      sessionCount: 1,
      corpusScope: {
        selection: "all_discovered",
        discoveredSessionCount: 1,
        appliedSessionLimit: null,
      },
      turnCount: 10,
      incidentCount: 0,
      parseWarningCount: 0,
      labelCounts: {},
      complianceSummary: [],
      sessions,
      inventory: [],
    };
    const sessionLabelCounts = new Map<string, Record<LabelName, number>>();
    sessionLabelCounts.set("verified", createEmptySessionLabelMap());

    const result = buildTopSessions(metrics, sessionLabelCounts);
    expect(result[0]?.archetype).toBe("verified_delivery");
    expect(result[0]?.archetypeLabel).toBe("Ended-Verified Delivery");
  });

  it("adds trust flags when queue titles fall back to assistant text or truncated previews", () => {
    const sessions = [
      createSession("assistant-fallback", {
        writeCount: 1,
        endedVerified: false,
        verificationPassedCount: 0,
        verificationFailedCount: 1,
        complianceRules: [
          {
            rule: "verification_after_code_changes",
            status: "fail",
            rationale: "missing verification",
          },
        ],
      }),
    ];
    const metrics: MetricsRecord = {
      engineVersion: "0.1.0",
      schemaVersion: "2",
      generatedAt: "2026-03-06T00:00:00.000Z",
      sessionCount: 1,
      corpusScope: {
        selection: "all_discovered",
        discoveredSessionCount: 1,
        appliedSessionLimit: null,
      },
      turnCount: 10,
      incidentCount: 0,
      parseWarningCount: 0,
      labelCounts: {},
      complianceSummary: [],
      sessions,
      inventory: [],
    };
    const sessionLabelCounts = new Map<string, Record<LabelName, number>>();
    sessionLabelCounts.set("assistant-fallback", createEmptySessionLabelMap());
    const sessionContexts: Map<string, SessionContext> = new Map([
      [
        "assistant-fallback",
        {
          sessionId: "assistant-fallback",
          leadPreview: "I checked the callback path and will verify the patch.",
          leadPreviewSource: "assistant",
          leadPreviewConfidence: "medium",
          leadPreviewIsCodeLike: false,
          evidencePreviews: [
            "I checked the callback path and will verify the patch...",
          ],
          evidenceSource: "assistant",
          evidenceConfidence: "medium",
          evidenceIssues: ["truncated_evidence"],
          sourceRefs: [
            {
              provider: "codex",
              kind: "session_jsonl",
              path: "/tmp/session.jsonl",
            },
          ],
        },
      ],
    ]);

    const result = buildTopSessions(
      metrics,
      sessionLabelCounts,
      sessionContexts,
    );
    expect(result[0]?.trustFlags).toContain(
      "Queue title fell back to assistant text because no stronger user preview was available.",
    );
    expect(result[0]?.trustFlags).toContain(
      "Evidence previews were truncated for compact reporting.",
    );
  });

  it("flags metadata fallback when no strong lead preview is available", () => {
    const sessions = [
      createSession("metadata-fallback", {
        writeCount: 1,
        endedVerified: false,
        verificationPassedCount: 0,
        verificationFailedCount: 1,
        complianceRules: [
          {
            rule: "verification_after_code_changes",
            status: "fail",
            rationale: "missing verification",
          },
        ],
      }),
    ];
    const metrics: MetricsRecord = {
      engineVersion: "0.1.0",
      schemaVersion: "2",
      generatedAt: "2026-03-06T00:00:00.000Z",
      sessionCount: 1,
      corpusScope: {
        selection: "all_discovered",
        discoveredSessionCount: 1,
        appliedSessionLimit: null,
      },
      turnCount: 10,
      incidentCount: 0,
      parseWarningCount: 0,
      labelCounts: {},
      complianceSummary: [],
      sessions,
      inventory: [],
    };
    const sessionLabelCounts = new Map<string, Record<LabelName, number>>();
    sessionLabelCounts.set("metadata-fallback", createEmptySessionLabelMap());
    const sessionContexts: Map<string, SessionContext> = new Map([
      [
        "metadata-fallback",
        {
          sessionId: "metadata-fallback",
          evidencePreviews: [
            "**Default assumption: Codex is already very smart.** Only add context Codex doesn't already have...",
          ],
          evidenceSource: "user",
          evidenceConfidence: "weak",
          evidenceIssues: [
            "metadata_fallback_title",
            "low_signal_evidence",
            "truncated_evidence",
          ],
          sourceRefs: [
            {
              provider: "codex",
              kind: "session_jsonl",
              path: "/tmp/session.jsonl",
            },
          ],
        },
      ],
    ]);

    const result = buildTopSessions(
      metrics,
      sessionLabelCounts,
      sessionContexts,
    );
    expect(result[0]?.sessionDisplayLabel).toContain("fallback");
    expect(result[0]?.trustFlags).toContain(
      "No strong human problem statement was available, so the queue title falls back to metadata.",
    );
  });

  it("includes dominant labels in results", () => {
    const sessions = [createSession("with-labels", { complianceScore: 100 })];
    const metrics: MetricsRecord = {
      engineVersion: "0.1.0",
      schemaVersion: "2",
      generatedAt: "2026-03-06T00:00:00.000Z",
      sessionCount: 1,
      corpusScope: {
        selection: "all_discovered",
        discoveredSessionCount: 1,
        appliedSessionLimit: null,
      },
      turnCount: 10,
      incidentCount: 0,
      parseWarningCount: 0,
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
    expect(result[0]?.dominantLabels).toContain("context_drift");
    expect(result[0]?.dominantLabels).not.toContain("interrupt");
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
      engineVersion: "0.1.0",
      schemaVersion: "2",
      generatedAt: "2026-03-06T00:00:00.000Z",
      sessionCount: 2,
      corpusScope: {
        selection: "all_discovered",
        discoveredSessionCount: 2,
        appliedSessionLimit: null,
      },
      turnCount: 20,
      incidentCount: 4,
      parseWarningCount: 0,
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
    expect(result[0]?.sessionId).toBe("more-incidents");
    expect(result[1]?.sessionId).toBe("fewer-incidents");
  });

  it("prefers stronger title confidence over metadata fallback on ties", () => {
    const sessions = [
      createSession("metadata-title", { complianceScore: 100 }),
      createSession("user-title", { complianceScore: 100 }),
    ];
    const metrics: MetricsRecord = {
      engineVersion: "0.1.0",
      schemaVersion: "2",
      generatedAt: "2026-03-06T00:00:00.000Z",
      sessionCount: 2,
      corpusScope: {
        selection: "all_discovered",
        discoveredSessionCount: 2,
        appliedSessionLimit: null,
      },
      turnCount: 20,
      incidentCount: 0,
      parseWarningCount: 0,
      labelCounts: {},
      complianceSummary: [],
      sessions,
      inventory: [],
    };
    const sessionLabelCounts = new Map<string, Record<LabelName, number>>();
    sessionLabelCounts.set("metadata-title", createEmptySessionLabelMap());
    sessionLabelCounts.set("user-title", createEmptySessionLabelMap());
    const sessionContexts: Map<string, SessionContext> = new Map([
      [
        "metadata-title",
        {
          sessionId: "metadata-title",
          evidencePreviews: ["Stabilize them. - Add or update tests."],
          evidenceSource: "user",
          evidenceConfidence: "weak",
          evidenceIssues: ["metadata_fallback_title", "low_signal_evidence"],
          sourceRefs: [
            {
              provider: "codex",
              kind: "session_jsonl",
              path: "/tmp/metadata.jsonl",
            },
          ],
        },
      ],
      [
        "user-title",
        {
          sessionId: "user-title",
          leadPreview:
            "Please fix the failing export path and rerun verification.",
          leadPreviewSource: "user",
          leadPreviewConfidence: "strong",
          leadPreviewIsCodeLike: false,
          evidencePreviews: [
            "Please fix the failing export path and rerun verification.",
          ],
          evidenceSource: "user",
          evidenceConfidence: "strong",
          evidenceIssues: [],
          sourceRefs: [
            {
              provider: "codex",
              kind: "session_jsonl",
              path: "/tmp/user.jsonl",
            },
          ],
        },
      ],
    ]);

    const result = buildTopSessions(
      metrics,
      sessionLabelCounts,
      sessionContexts,
    );
    expect(result[0]?.sessionId).toBe("user-title");
  });

  it("breaks ties by session ID alphabetically", () => {
    const sessions = [
      createSession("session-b", { complianceScore: 100 }),
      createSession("session-a", { complianceScore: 100 }),
    ];
    const metrics: MetricsRecord = {
      engineVersion: "0.1.0",
      schemaVersion: "2",
      generatedAt: "2026-03-06T00:00:00.000Z",
      sessionCount: 2,
      corpusScope: {
        selection: "all_discovered",
        discoveredSessionCount: 2,
        appliedSessionLimit: null,
      },
      turnCount: 20,
      incidentCount: 0,
      parseWarningCount: 0,
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
    expect(result[0]?.sessionId).toBe("session-a");
    expect(result[1]?.sessionId).toBe("session-b");
  });

  it("deduplicates repeated session IDs after ranking", () => {
    const sessions = [
      createSession("repeat-session", {
        complianceScore: 40,
        incidentCount: 4,
      }),
      createSession("repeat-session", {
        complianceScore: 60,
        incidentCount: 2,
      }),
      createSession("unique-session", {
        complianceScore: 70,
        incidentCount: 1,
      }),
    ];
    const metrics: MetricsRecord = {
      engineVersion: "0.1.0",
      schemaVersion: "2",
      generatedAt: "2026-03-06T00:00:00.000Z",
      sessionCount: sessions.length,
      corpusScope: {
        selection: "all_discovered",
        discoveredSessionCount: sessions.length,
        appliedSessionLimit: null,
      },
      turnCount: 30,
      incidentCount: 7,
      parseWarningCount: 0,
      labelCounts: {},
      complianceSummary: [],
      sessions,
      inventory: [],
    };
    const sessionLabelCounts = new Map<string, Record<LabelName, number>>();
    sessionLabelCounts.set("repeat-session", createEmptySessionLabelMap());
    sessionLabelCounts.set("unique-session", createEmptySessionLabelMap());

    const result = buildTopSessions(metrics, sessionLabelCounts);

    expect(result.map((session) => session.sessionId)).toEqual([
      "repeat-session",
      "unique-session",
    ]);
  });
});

function createSpotlightSession(
  sessionId: string,
  overrides: Partial<ReturnType<typeof buildTopSessions>[number]> = {},
): ReturnType<typeof buildTopSessions>[number] {
  return {
    sessionId,
    sessionShortId: sessionId,
    sessionDisplayLabel: sessionId,
    sessionTimestampLabel: "2026-03-06 00:00Z",
    sessionProjectLabel: "agent-eval",
    archetype: "verified_delivery" as const,
    archetypeLabel: "Ended-Verified Delivery",
    frictionScore: 1,
    complianceScore: 100,
    incidentCount: 0,
    labeledTurnCount: 2,
    writeCount: 5,
    verificationPassedCount: 3,
    endedVerified: true,
    dominantLabels: [],
    whySelected: ["Test reason."],
    failedRules: [],
    evidencePreviews: [],
    titleSource: "user",
    titleConfidence: "strong",
    evidenceSource: "none",
    evidenceConfidence: "weak",
    evidenceIssues: ["missing_evidence", "missing_source_refs"],
    sourceRefs: [],
    trustFlags: [],
    note: "test",
    ...overrides,
  };
}

describe("buildEndedVerifiedDeliverySpotlights", () => {
  it("returns empty array when no verified delivery sessions", () => {
    const topSessions = [
      createSpotlightSession("unverified", {
        archetype: "unverified_delivery",
        archetypeLabel: "Unverified Delivery",
        frictionScore: 5,
        complianceScore: 60,
        incidentCount: 2,
        labeledTurnCount: 3,
        verificationPassedCount: 0,
        endedVerified: false,
      }),
    ];

    const result = buildEndedVerifiedDeliverySpotlights(topSessions);
    expect(result).toEqual([]);
  });

  it("filters to only verified_delivery archetype", () => {
    const topSessions = [
      createSpotlightSession("verified-1", {
        frictionScore: 2,
        complianceScore: 100,
        incidentCount: 0,
        verificationPassedCount: 3,
      }),
      createSpotlightSession("unverified", {
        archetype: "unverified_delivery",
        archetypeLabel: "Unverified Delivery",
        frictionScore: 5,
        complianceScore: 60,
        incidentCount: 2,
        labeledTurnCount: 3,
        verificationPassedCount: 0,
        endedVerified: false,
      }),
      createSpotlightSession("verified-2", {
        frictionScore: 1,
        complianceScore: 95,
        incidentCount: 1,
        writeCount: 3,
        verificationPassedCount: 2,
      }),
    ];

    const result = buildEndedVerifiedDeliverySpotlights(topSessions);
    expect(result).toHaveLength(2);
    expect(result.every((s) => s.archetype === "verified_delivery")).toBe(true);
  });

  it("sorts by compliance score descending", () => {
    const topSessions = [
      createSpotlightSession("lower-compliance", { complianceScore: 90 }),
      createSpotlightSession("higher-compliance", { complianceScore: 100 }),
    ];

    const result = buildEndedVerifiedDeliverySpotlights(topSessions);
    expect(result[0]?.sessionId).toBe("higher-compliance");
    expect(result[1]?.sessionId).toBe("lower-compliance");
  });

  it("limits to maximum 6 sessions", () => {
    const topSessions = Array.from({ length: 10 }, (_, i) =>
      createSpotlightSession(`verified-${i}`, {
        complianceScore: 100 - i,
      }),
    );

    const result = buildEndedVerifiedDeliverySpotlights(topSessions);
    expect(result).toHaveLength(6);
  });

  it("deduplicates repeated verified delivery session IDs", () => {
    const topSessions = [
      createSpotlightSession("repeat-session", {
        frictionScore: 2,
        complianceScore: 100,
        note: "better entry",
      }),
      createSpotlightSession("repeat-session", {
        frictionScore: 4,
        complianceScore: 95,
        incidentCount: 1,
        verificationPassedCount: 2,
        note: "duplicate entry",
      }),
      createSpotlightSession("unique-session", {
        frictionScore: 3,
        complianceScore: 90,
        verificationPassedCount: 2,
        note: "unique entry",
      }),
    ];

    const result = buildEndedVerifiedDeliverySpotlights(topSessions);

    expect(result.map((session) => session.sessionId)).toEqual([
      "repeat-session",
      "unique-session",
    ]);
    expect(result[0]?.note).toBe("better entry");
  });
});
