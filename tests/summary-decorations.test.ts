/**
 * Purpose: Test coverage for summary-decorations.ts - badges, brag cards, opportunities.
 * Entrypoint: Executed by Vitest via `pnpm test`.
 * Notes: Tests presentation-oriented decorations on top of summary core.
 */
import { describe, expect, it } from "vitest";
import type { MetricsRecord, SessionMetrics } from "../src/schema.js";
import type { SessionInsightRow } from "../src/summary/types.js";
import { buildSummaryDecorations } from "../src/summary-decorations.js";

function createMockSessionMetrics(
  overrides: Partial<SessionMetrics> = {},
): SessionMetrics {
  return {
    sessionId: "session-1",
    provider: overrides.provider ?? "codex",
    turnCount: 10,
    labeledTurnCount: 5,
    incidentCount: 0,
    parseWarningCount: 0,
    writeCount: 2,
    verificationCount: 1,
    verificationPassedCount: 1,
    verificationFailedCount: 0,
    postWriteVerificationAttempted: true,
    postWriteVerificationPassed: true,
    endedVerified: true,
    complianceScore: 100,
    complianceRules: [],
    ...overrides,
  };
}

function createMockMetricsRecord(
  overrides: Partial<MetricsRecord> = {},
): MetricsRecord {
  return {
    engineVersion: "1.0.0",
    schemaVersion: "1",
    generatedAt: new Date().toISOString(),
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
    sessions: [createMockSessionMetrics()],
    inventory: [],
    ...overrides,
  };
}

function createMockSessionInsightRow(
  overrides: Partial<SessionInsightRow> = {},
): SessionInsightRow {
  return {
    sessionId: "session-1",
    archetype: "verified_delivery",
    archetypeLabel: "Ended-Verified Delivery",
    frictionScore: 2,
    complianceScore: 100,
    incidentCount: 0,
    labeledTurnCount: 5,
    writeCount: 2,
    verificationPassedCount: 1,
    endedVerified: true,
    dominantLabels: [],
    note: "Clean session",
    ...overrides,
  };
}

describe("summary-decorations", () => {
  describe("buildScoreCards", () => {
    it("returns proof/flow/discipline cards", () => {
      const metrics = createMockMetricsRecord();
      const topSessions: SessionInsightRow[] = [];

      const decorations = buildSummaryDecorations(metrics, topSessions);

      expect(decorations.scoreCards).toHaveLength(3);
      expect(decorations.scoreCards[0]?.title).toBe("Verification Proxy Score");
      expect(decorations.scoreCards[1]?.title).toBe("Flow Proxy Score");
      expect(decorations.scoreCards[2]?.title).toBe("Workflow Proxy Score");
    });

    it("sets good tone for scores >= 90", () => {
      const metrics = createMockMetricsRecord({
        sessions: [
          createMockSessionMetrics({
            sessionId: "s1",
            writeCount: 10,
            verificationPassedCount: 10,
            endedVerified: true,
            complianceScore: 95,
          }),
        ],
        turnCount: 100,
        labelCounts: {},
        complianceSummary: [
          {
            rule: "scope_confirmed_before_major_write",
            passCount: 10,
            failCount: 0,
            notApplicableCount: 0,
            unknownCount: 0,
          },
          {
            rule: "cwd_or_repo_echoed_before_write",
            passCount: 10,
            failCount: 0,
            notApplicableCount: 0,
            unknownCount: 0,
          },
          {
            rule: "short_plan_before_large_change",
            passCount: 10,
            failCount: 0,
            notApplicableCount: 0,
            unknownCount: 0,
          },
          {
            rule: "verification_after_code_changes",
            passCount: 10,
            failCount: 0,
            notApplicableCount: 0,
            unknownCount: 0,
          },
        ],
      });
      const topSessions: SessionInsightRow[] = [];

      const decorations = buildSummaryDecorations(metrics, topSessions);

      for (const card of decorations.scoreCards) {
        expect(card.tone).toBe("good");
      }
    });

    it("renders unavailable score cards neutrally with explanatory copy", () => {
      const metrics = createMockMetricsRecord({
        sessions: [],
        sessionCount: 0,
        turnCount: 0,
        complianceSummary: [],
      });

      const decorations = buildSummaryDecorations(metrics, []);
      const flowCard = decorations.scoreCards.find(
        (card) => card.title === "Flow Proxy Score",
      );

      expect(flowCard?.score).toBeNull();
      expect(flowCard?.tone).toBe("neutral");
      expect(flowCard?.detail).toContain("not scoreable");
    });

    it("sets neutral tone for scores 70-89", () => {
      // Need multiple sessions to get a partial verification rate
      // 8 verified out of 10 with writes = 80%
      const sessions = [
        ...Array.from({ length: 8 }, (_, i) =>
          createMockSessionMetrics({
            sessionId: `s${i}`,
            writeCount: 10,
            verificationPassedCount: 10,
            endedVerified: true,
          }),
        ),
        ...Array.from({ length: 2 }, (_, i) =>
          createMockSessionMetrics({
            sessionId: `s${i + 8}`,
            writeCount: 10,
            verificationPassedCount: 0,
            endedVerified: false, // Not verified
          }),
        ),
      ];
      const metrics = createMockMetricsRecord({
        sessions,
        sessionCount: 10,
        turnCount: 100,
        labelCounts: {},
        complianceSummary: [
          {
            rule: "scope_confirmed_before_major_write",
            passCount: 8,
            failCount: 2,
            notApplicableCount: 0,
            unknownCount: 0,
          },
          {
            rule: "cwd_or_repo_echoed_before_write",
            passCount: 8,
            failCount: 2,
            notApplicableCount: 0,
            unknownCount: 0,
          },
          {
            rule: "short_plan_before_large_change",
            passCount: 8,
            failCount: 2,
            notApplicableCount: 0,
            unknownCount: 0,
          },
          {
            rule: "verification_after_code_changes",
            passCount: 8,
            failCount: 2,
            notApplicableCount: 0,
            unknownCount: 0,
          },
        ],
      });
      const topSessions: SessionInsightRow[] = [];

      const decorations = buildSummaryDecorations(metrics, topSessions);

      // Proof score should be 80 (neutral)
      const proofCard = decorations.scoreCards.find(
        (c) => c.title === "Verification Proxy Score",
      );
      expect(proofCard?.score).toBe(80);
      expect(proofCard?.tone).toBe("neutral");
    });

    it("sets warn tone for scores 40-69", () => {
      // Need multiple sessions to get a partial verification rate
      // 5 verified out of 10 with writes = 50%
      const sessions = [
        ...Array.from({ length: 5 }, (_, i) =>
          createMockSessionMetrics({
            sessionId: `s${i}`,
            writeCount: 10,
            verificationPassedCount: 10,
            endedVerified: true,
          }),
        ),
        ...Array.from({ length: 5 }, (_, i) =>
          createMockSessionMetrics({
            sessionId: `s${i + 5}`,
            writeCount: 10,
            verificationPassedCount: 0,
            endedVerified: false, // Not verified
          }),
        ),
      ];
      const metrics = createMockMetricsRecord({
        sessions,
        sessionCount: 10,
        turnCount: 100,
        labelCounts: {},
        complianceSummary: [
          {
            rule: "scope_confirmed_before_major_write",
            passCount: 5,
            failCount: 5,
            notApplicableCount: 0,
            unknownCount: 0,
          },
          {
            rule: "cwd_or_repo_echoed_before_write",
            passCount: 5,
            failCount: 5,
            notApplicableCount: 0,
            unknownCount: 0,
          },
          {
            rule: "short_plan_before_large_change",
            passCount: 5,
            failCount: 5,
            notApplicableCount: 0,
            unknownCount: 0,
          },
          {
            rule: "verification_after_code_changes",
            passCount: 5,
            failCount: 5,
            notApplicableCount: 0,
            unknownCount: 0,
          },
        ],
      });
      const topSessions: SessionInsightRow[] = [];

      const decorations = buildSummaryDecorations(metrics, topSessions);

      // Proof score should be 50 (warn)
      const proofCard = decorations.scoreCards.find(
        (c) => c.title === "Verification Proxy Score",
      );
      expect(proofCard?.score).toBe(50);
      expect(proofCard?.tone).toBe("warn");
    });

    it("sets danger tone for scores < 40", () => {
      // Need multiple sessions to get a partial verification rate
      // 2 verified out of 10 with writes = 20%
      const sessions = [
        ...Array.from({ length: 2 }, (_, i) =>
          createMockSessionMetrics({
            sessionId: `s${i}`,
            writeCount: 10,
            verificationPassedCount: 10,
            endedVerified: true,
          }),
        ),
        ...Array.from({ length: 8 }, (_, i) =>
          createMockSessionMetrics({
            sessionId: `s${i + 2}`,
            writeCount: 10,
            verificationPassedCount: 0,
            endedVerified: false, // Not verified
          }),
        ),
      ];
      const metrics = createMockMetricsRecord({
        sessions,
        sessionCount: 10,
        turnCount: 100,
        labelCounts: { interrupt: 50 }, // High interrupt rate for low flow score
        complianceSummary: [
          {
            rule: "scope_confirmed_before_major_write",
            passCount: 2,
            failCount: 8,
            notApplicableCount: 0,
            unknownCount: 0,
          },
          {
            rule: "cwd_or_repo_echoed_before_write",
            passCount: 2,
            failCount: 8,
            notApplicableCount: 0,
            unknownCount: 0,
          },
          {
            rule: "short_plan_before_large_change",
            passCount: 2,
            failCount: 8,
            notApplicableCount: 0,
            unknownCount: 0,
          },
          {
            rule: "verification_after_code_changes",
            passCount: 2,
            failCount: 8,
            notApplicableCount: 0,
            unknownCount: 0,
          },
        ],
      });
      const topSessions: SessionInsightRow[] = [];

      const decorations = buildSummaryDecorations(metrics, topSessions);

      // Proof score should be 20 (danger)
      const proofCard = decorations.scoreCards.find(
        (c) => c.title === "Verification Proxy Score",
      );
      expect(proofCard?.score).toBe(20);
      expect(proofCard?.tone).toBe("danger");
    });
  });

  describe("buildBragCards", () => {
    it("counts verification-backed ships correctly", () => {
      const metrics = createMockMetricsRecord({
        sessions: [
          createMockSessionMetrics({
            sessionId: "s1",
            writeCount: 2,
            verificationPassedCount: 1,
            endedVerified: true,
          }),
          createMockSessionMetrics({
            sessionId: "s2",
            writeCount: 2,
            verificationPassedCount: 1,
            endedVerified: true,
          }),
          createMockSessionMetrics({
            sessionId: "s3",
            writeCount: 0, // No writes
            verificationPassedCount: 0,
            endedVerified: false,
          }),
        ],
        sessionCount: 3,
      });
      const topSessions: SessionInsightRow[] = [];

      const decorations = buildSummaryDecorations(metrics, topSessions);

      const proofCard = decorations.highlightCards.find(
        (c) => c.title === "Ended-Verified Deliveries",
      );
      expect(proofCard?.value).toBe("2");
      expect(proofCard?.tone).toBe("good");
    });

    it("counts quiet runs correctly", () => {
      const metrics = createMockMetricsRecord({
        sessions: [
          createMockSessionMetrics({
            sessionId: "s1",
            incidentCount: 0,
          }),
          createMockSessionMetrics({
            sessionId: "s2",
            incidentCount: 0,
          }),
          createMockSessionMetrics({
            sessionId: "s3",
            incidentCount: 2,
          }),
        ],
        sessionCount: 3,
      });
      const topSessions: SessionInsightRow[] = [];

      const decorations = buildSummaryDecorations(metrics, topSessions);

      const quietCard = decorations.highlightCards.find(
        (c) => c.title === "Low-Incident Sessions",
      );
      expect(quietCard?.value).toBe("2");
      expect(quietCard?.tone).toBe("good");
      expect(quietCard?.detail).toContain("66.7%");
    });

    it("shows battle-tested count", () => {
      const metrics = createMockMetricsRecord({
        sessions: Array.from({ length: 500 }, (_, i) =>
          createMockSessionMetrics({ sessionId: `s${i}` }),
        ),
        sessionCount: 500,
      });
      const topSessions: SessionInsightRow[] = [];

      const decorations = buildSummaryDecorations(metrics, topSessions);

      const battleCard = decorations.highlightCards.find(
        (c) => c.title === "Corpus Coverage",
      );
      expect(battleCard?.value).toBe("500");
      expect(battleCard?.tone).toBe("neutral");
    });

    it("sets good tone for battle-tested at 1000+ sessions", () => {
      const metrics = createMockMetricsRecord({
        sessions: Array.from({ length: 1500 }, (_, i) =>
          createMockSessionMetrics({ sessionId: `s${i}` }),
        ),
        sessionCount: 1500,
      });
      const topSessions: SessionInsightRow[] = [];

      const decorations = buildSummaryDecorations(metrics, topSessions);

      const battleCard = decorations.highlightCards.find(
        (c) => c.title === "Corpus Coverage",
      );
      expect(battleCard?.tone).toBe("good");
    });

    it("sets neutral tone for quiet runs when none exist", () => {
      const metrics = createMockMetricsRecord({
        sessions: [
          createMockSessionMetrics({
            sessionId: "s1",
            incidentCount: 2,
          }),
          createMockSessionMetrics({
            sessionId: "s2",
            incidentCount: 3,
          }),
        ],
        sessionCount: 2,
      });
      const topSessions: SessionInsightRow[] = [];

      const decorations = buildSummaryDecorations(metrics, topSessions);

      const quietCard = decorations.highlightCards.find(
        (c) => c.title === "Low-Incident Sessions",
      );
      expect(quietCard?.value).toBe("0");
      expect(quietCard?.tone).toBe("neutral");
      expect(quietCard?.detail).toContain("No fully incident-free sessions");
    });

    it("sets neutral tone for verification-backed ships when none exist", () => {
      const metrics = createMockMetricsRecord({
        sessions: [
          createMockSessionMetrics({
            sessionId: "s1",
            writeCount: 2,
            verificationPassedCount: 0,
            endedVerified: false,
          }),
          createMockSessionMetrics({
            sessionId: "s2",
            writeCount: 1,
            verificationPassedCount: 0,
            endedVerified: false,
          }),
        ],
        sessionCount: 2,
      });
      const topSessions: SessionInsightRow[] = [];

      const decorations = buildSummaryDecorations(metrics, topSessions);

      const proofCard = decorations.highlightCards.find(
        (c) => c.title === "Ended-Verified Deliveries",
      );
      expect(proofCard?.value).toBe("0");
      expect(proofCard?.tone).toBe("neutral");
    });
  });

  describe("buildAchievementBadges", () => {
    it("awards Battle-Tested Corpus at 1000+ sessions", () => {
      const metrics = createMockMetricsRecord({
        sessions: Array.from({ length: 1000 }, (_, i) =>
          createMockSessionMetrics({ sessionId: `s${i}` }),
        ),
        sessionCount: 1000,
      });
      const topSessions: SessionInsightRow[] = [];

      const decorations = buildSummaryDecorations(metrics, topSessions);

      expect(decorations.recognitions).toContain("Battle-Tested Corpus");
    });

    it("does not award Battle-Tested Corpus below 1000 sessions", () => {
      const metrics = createMockMetricsRecord({
        sessions: Array.from({ length: 999 }, (_, i) =>
          createMockSessionMetrics({ sessionId: `s${i}` }),
        ),
        sessionCount: 999,
      });
      const topSessions: SessionInsightRow[] = [];

      const decorations = buildSummaryDecorations(metrics, topSessions);

      expect(decorations.recognitions).not.toContain("Battle-Tested Corpus");
    });

    it("awards Strong Verification Proxy at 90%+ verification", () => {
      const metrics = createMockMetricsRecord({
        sessions: [
          createMockSessionMetrics({
            sessionId: "s1",
            writeCount: 10,
            verificationPassedCount: 10,
            endedVerified: true,
          }),
        ],
        sessionCount: 1,
      });
      const topSessions: SessionInsightRow[] = [];

      const decorations = buildSummaryDecorations(metrics, topSessions);

      expect(decorations.recognitions).toContain(
        "Strong Terminal Verification Proxy",
      );
    });

    it("does not award Strong Verification Proxy when no sessions have verification passed", () => {
      const metrics = createMockMetricsRecord({
        sessions: [
          createMockSessionMetrics({
            sessionId: "s1",
            writeCount: 10,
            verificationPassedCount: 0,
            endedVerified: false, // No verifications passed
          }),
        ],
        sessionCount: 1,
      });
      const topSessions: SessionInsightRow[] = [];

      const decorations = buildSummaryDecorations(metrics, topSessions);

      expect(decorations.recognitions).not.toContain(
        "Strong Verification Proxy",
      );
    });

    it("awards Low-Interruption Corpus at <= 2% interruptions", () => {
      const metrics = createMockMetricsRecord({
        sessions: [createMockSessionMetrics({ sessionId: "s1" })],
        turnCount: 100,
        labelCounts: { interrupt: 2 }, // 2%
        sessionCount: 1,
      });
      const topSessions: SessionInsightRow[] = [];

      const decorations = buildSummaryDecorations(metrics, topSessions);

      expect(decorations.recognitions).toContain("Low-Interruption Corpus");
    });

    it("does not award Low-Interruption Corpus above 2% interruptions", () => {
      const metrics = createMockMetricsRecord({
        sessions: [createMockSessionMetrics({ sessionId: "s1" })],
        turnCount: 100,
        labelCounts: { interrupt: 3 }, // 3%
        sessionCount: 1,
      });
      const topSessions: SessionInsightRow[] = [];

      const decorations = buildSummaryDecorations(metrics, topSessions);

      expect(decorations.recognitions).not.toContain("Low-Interruption Corpus");
    });

    it("awards Zero Drift Complaints when no drift", () => {
      const metrics = createMockMetricsRecord({
        sessions: [createMockSessionMetrics({ sessionId: "s1" })],
        turnCount: 100,
        labelCounts: { context_drift: 0 },
        sessionCount: 1,
      });
      const topSessions: SessionInsightRow[] = [];

      const decorations = buildSummaryDecorations(metrics, topSessions);

      expect(decorations.recognitions).toContain("Zero Drift Complaints");
    });

    it("does not award Zero Drift Complaints when drift exists", () => {
      const metrics = createMockMetricsRecord({
        sessions: [createMockSessionMetrics({ sessionId: "s1" })],
        turnCount: 100,
        labelCounts: { context_drift: 1 },
        sessionCount: 1,
      });
      const topSessions: SessionInsightRow[] = [];

      const decorations = buildSummaryDecorations(metrics, topSessions);

      expect(decorations.recognitions).not.toContain("Zero Drift Complaints");
    });

    it("awards High-Friction Recovery Evidence when high friction recovery exists", () => {
      const metrics = createMockMetricsRecord({
        sessions: [createMockSessionMetrics({ sessionId: "s1" })],
        sessionCount: 1,
      });
      const topSessions: SessionInsightRow[] = [
        createMockSessionInsightRow({
          sessionId: "s1",
          archetype: "high_friction_verified_delivery",
        }),
      ];

      const decorations = buildSummaryDecorations(metrics, topSessions);

      expect(decorations.recognitions).toContain(
        "High-Friction Recovery Evidence",
      );
    });

    it("does not award High-Friction Recovery Evidence without high friction recovery", () => {
      const metrics = createMockMetricsRecord({
        sessions: [createMockSessionMetrics({ sessionId: "s1" })],
        sessionCount: 1,
      });
      const topSessions: SessionInsightRow[] = [
        createMockSessionInsightRow({
          sessionId: "s1",
          archetype: "verified_delivery",
        }),
      ];

      const decorations = buildSummaryDecorations(metrics, topSessions);

      expect(decorations.recognitions).not.toContain(
        "High-Friction Recovery Evidence",
      );
    });

    it("returns empty array when no badges earned", () => {
      const metrics = createMockMetricsRecord({
        sessions: [
          createMockSessionMetrics({
            sessionId: "s1",
            writeCount: 10,
            verificationPassedCount: 0,
            endedVerified: false, // No verifications passed
            incidentCount: 5,
          }),
        ],
        turnCount: 10,
        labelCounts: {
          interrupt: 5, // 50%, above 2%
          context_drift: 1, // has drift
        },
        sessionCount: 1,
      });
      const topSessions: SessionInsightRow[] = [
        createMockSessionInsightRow({
          sessionId: "s1",
          archetype: "unverified_delivery",
        }),
      ];

      const decorations = buildSummaryDecorations(metrics, topSessions);

      expect(decorations.recognitions).toHaveLength(0);
    });

    it("awards multiple badges when criteria met", () => {
      const metrics = createMockMetricsRecord({
        sessions: Array.from({ length: 1000 }, (_, i) =>
          createMockSessionMetrics({
            sessionId: `s${i}`,
            writeCount: 10,
            verificationPassedCount: 10,
            endedVerified: true,
            incidentCount: 0,
          }),
        ),
        turnCount: 10000,
        labelCounts: {},
        sessionCount: 1000,
      });
      const topSessions: SessionInsightRow[] = [];

      const decorations = buildSummaryDecorations(metrics, topSessions);

      expect(decorations.recognitions).toContain("Battle-Tested Corpus");
      expect(decorations.recognitions).toContain(
        "Strong Terminal Verification Proxy",
      );
      expect(decorations.recognitions).toContain("Low-Interruption Corpus");
      expect(decorations.recognitions).toContain("Zero Drift Complaints");
    });
  });

  describe("buildOpportunities", () => {
    it("suggests verification prompting at >= 15 rate", () => {
      const metrics = createMockMetricsRecord({
        sessions: [createMockSessionMetrics({ sessionId: "s1" })],
        turnCount: 100,
        labelCounts: { verification_request: 15 }, // 15%
        sessionCount: 1,
      });
      const topSessions: SessionInsightRow[] = [];

      const decorations = buildSummaryDecorations(metrics, topSessions);

      const opp = decorations.opportunities.find((o) =>
        o.title.includes("verification prompting"),
      );
      expect(opp).toBeDefined();
    });

    it("does not suggest verification prompting below 15 rate", () => {
      const metrics = createMockMetricsRecord({
        sessions: [createMockSessionMetrics({ sessionId: "s1" })],
        turnCount: 100,
        labelCounts: { verification_request: 14 }, // 14%
        sessionCount: 1,
      });
      const topSessions: SessionInsightRow[] = [];

      const decorations = buildSummaryDecorations(metrics, topSessions);

      const opp = decorations.opportunities.find((o) =>
        o.title.includes("verification prompting"),
      );
      expect(opp).toBeUndefined();
    });

    it("suggests context retention at >= 8 rate", () => {
      const metrics = createMockMetricsRecord({
        sessions: [createMockSessionMetrics({ sessionId: "s1" })],
        turnCount: 100,
        labelCounts: { context_reinjection: 8 }, // 8%
        sessionCount: 1,
      });
      const topSessions: SessionInsightRow[] = [];

      const decorations = buildSummaryDecorations(metrics, topSessions);

      const opp = decorations.opportunities.find((o) =>
        o.title.includes("context retention"),
      );
      expect(opp).toBeDefined();
    });

    it("does not suggest context retention below 8 rate", () => {
      const metrics = createMockMetricsRecord({
        sessions: [createMockSessionMetrics({ sessionId: "s1" })],
        turnCount: 100,
        labelCounts: { context_reinjection: 7 }, // 7%
        sessionCount: 1,
      });
      const topSessions: SessionInsightRow[] = [];

      const decorations = buildSummaryDecorations(metrics, topSessions);

      const opp = decorations.opportunities.find((o) =>
        o.title.includes("context retention"),
      );
      expect(opp).toBeUndefined();
    });

    it("suggests drift guard when drift exists", () => {
      const metrics = createMockMetricsRecord({
        sessions: [createMockSessionMetrics({ sessionId: "s1" })],
        turnCount: 100,
        labelCounts: { context_drift: 1 },
        sessionCount: 1,
      });
      const topSessions: SessionInsightRow[] = [];

      const decorations = buildSummaryDecorations(metrics, topSessions);

      const opp = decorations.opportunities.find((o) =>
        o.title.includes("scope drift"),
      );
      expect(opp).toBeDefined();
    });

    it("does not suggest drift guard when no drift", () => {
      const metrics = createMockMetricsRecord({
        sessions: [createMockSessionMetrics({ sessionId: "s1" })],
        turnCount: 100,
        labelCounts: {},
        sessionCount: 1,
      });
      const topSessions: SessionInsightRow[] = [];

      const decorations = buildSummaryDecorations(metrics, topSessions);

      const opp = decorations.opportunities.find((o) =>
        o.title.includes("scope drift"),
      );
      expect(opp).toBeUndefined();
    });

    it("suggests blocking unverified delivery", () => {
      const metrics = createMockMetricsRecord({
        sessions: [createMockSessionMetrics({ sessionId: "s1" })],
        sessionCount: 1,
      });
      const topSessions: SessionInsightRow[] = [
        createMockSessionInsightRow({
          sessionId: "s1",
          archetype: "unverified_delivery",
        }),
      ];

      const decorations = buildSummaryDecorations(metrics, topSessions);

      const opp = decorations.opportunities.find((o) =>
        o.title.includes("unverified deliveries"),
      );
      expect(opp).toBeDefined();
    });

    it("does not suggest blocking unverified delivery when all verified", () => {
      const metrics = createMockMetricsRecord({
        sessions: [createMockSessionMetrics({ sessionId: "s1" })],
        sessionCount: 1,
      });
      const topSessions: SessionInsightRow[] = [
        createMockSessionInsightRow({
          sessionId: "s1",
          archetype: "verified_delivery",
        }),
      ];

      const decorations = buildSummaryDecorations(metrics, topSessions);

      const opp = decorations.opportunities.find((o) =>
        o.title.includes("unverified deliveries"),
      );
      expect(opp).toBeUndefined();
    });

    it("limits to 5 opportunities", () => {
      const metrics = createMockMetricsRecord({
        sessions: [
          createMockSessionMetrics({
            sessionId: "s1",
            writeCount: 0,
            verificationPassedCount: 0,
            endedVerified: false,
          }),
        ],
        turnCount: 100,
        labelCounts: {
          verification_request: 20, // >= 15
          context_reinjection: 10, // >= 8
          context_drift: 1, // > 0
        },
        sessionCount: 1,
      });
      const topSessions: SessionInsightRow[] = [
        createMockSessionInsightRow({
          sessionId: "s1",
          archetype: "unverified_delivery",
        }),
      ];

      const decorations = buildSummaryDecorations(metrics, topSessions);

      // All 4 opportunities should be present but limited to 5 max
      expect(decorations.opportunities.length).toBeLessThanOrEqual(5);
    });
  });
});
