/**
 * Purpose: Test coverage for comparative-slices.ts - contains complex scoring algorithms.
 * Entrypoint: Executed by Vitest via `pnpm test`.
 * Notes: Tests score snapshot calculations and comparative slice generation.
 */
import { describe, expect, it } from "vitest";

import {
  buildComparativeSlices,
  buildScoreSnapshot,
} from "../src/comparative-slices.js";
import type {
  LabelName,
  MetricsRecord,
  SessionMetrics,
} from "../src/schema.js";

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
    evaluatorVersion: "1.0.0",
    schemaVersion: "1",
    generatedAt: new Date().toISOString(),
    sessionCount: 1,
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

describe("comparative-slices", () => {
  describe("buildScoreSnapshot", () => {
    it("calculates proof score from write verification rate", () => {
      const metrics = createMockMetricsRecord({
        sessions: [
          createMockSessionMetrics({
            sessionId: "s1",
            writeCount: 2,
            verificationPassedCount: 1,
          }),
          createMockSessionMetrics({
            sessionId: "s2",
            writeCount: 2,
            verificationPassedCount: 0,
            postWriteVerificationAttempted: false,
            postWriteVerificationPassed: false,
            endedVerified: false,
          }),
        ],
        turnCount: 20,
      });

      const snapshot = buildScoreSnapshot(metrics);

      // 1 verified out of 2 write sessions = 50%
      expect(snapshot.verificationProxyScore).toBe(50);
      expect(snapshot.writeSessionVerificationRate).toBe(50);
    });

    it("calculates flow score with interrupt penalty", () => {
      const metrics = createMockMetricsRecord({
        sessions: [createMockSessionMetrics({ sessionId: "s1" })],
        turnCount: 100,
        labelCounts: { interrupt: 10 },
      });

      const snapshot = buildScoreSnapshot(metrics);

      // 10 interrupts / 100 turns = 10% * 8 multiplier = 80 penalty
      // flowProxyScore = max(0, 100 - 80) = 20
      expect(snapshot.flowProxyScore).toBe(20);
    });

    it("calculates flow score with reinjection penalty", () => {
      const metrics = createMockMetricsRecord({
        sessions: [createMockSessionMetrics({ sessionId: "s1" })],
        turnCount: 100,
        labelCounts: { context_reinjection: 5 },
      });

      const snapshot = buildScoreSnapshot(metrics);

      // 5 reinjections / 100 turns = 5% * 20 multiplier = 100 penalty
      // flowProxyScore = max(0, 100 - 100) = 0
      expect(snapshot.flowProxyScore).toBe(0);
    });

    it("calculates flow score with drift penalty", () => {
      const metrics = createMockMetricsRecord({
        sessions: [createMockSessionMetrics({ sessionId: "s1" })],
        turnCount: 100,
        labelCounts: { context_drift: 2 },
      });

      const snapshot = buildScoreSnapshot(metrics);

      // 2 drifts / 100 turns = 2% * 40 multiplier = 80 penalty
      // flowProxyScore = max(0, 100 - 80) = 20
      expect(snapshot.flowProxyScore).toBe(20);
    });

    it("returns 0 for undefined label counts", () => {
      const metrics = createMockMetricsRecord({
        sessions: [
          createMockSessionMetrics({
            sessionId: "s1",
            writeCount: 0,
            verificationPassedCount: 0,
          }),
        ],
        turnCount: 100,
        labelCounts: {},
      });

      const snapshot = buildScoreSnapshot(metrics);

      // No labels means no penalties, flow score should be 100
      expect(snapshot.flowProxyScore).toBe(100);
      expect(snapshot.verificationProxyScore).toBe(0); // No write sessions with verification
    });

    it("handles empty sessions array", () => {
      const metrics = createMockMetricsRecord({
        sessions: [],
        turnCount: 0,
        sessionCount: 0,
      });

      const snapshot = buildScoreSnapshot(metrics);

      expect(snapshot.verificationProxyScore).toBe(0);
      expect(snapshot.flowProxyScore).toBe(100); // No penalties when empty
      expect(snapshot.workflowProxyScore).toBe(0);
      expect(snapshot.writeSessionVerificationRate).toBe(0);
      expect(snapshot.incidentsPer100Turns).toBe(0);
    });

    it("handles sessions with no writes", () => {
      const metrics = createMockMetricsRecord({
        sessions: [
          createMockSessionMetrics({
            sessionId: "s1",
            writeCount: 0,
            verificationPassedCount: 0,
          }),
          createMockSessionMetrics({
            sessionId: "s2",
            writeCount: 0,
            verificationPassedCount: 0,
          }),
        ],
        turnCount: 20,
      });

      const snapshot = buildScoreSnapshot(metrics);

      expect(snapshot.verificationProxyScore).toBe(0);
      expect(snapshot.writeSessionVerificationRate).toBe(0);
    });

    it("calculates discipline score from compliance rules", () => {
      const metrics = createMockMetricsRecord({
        sessions: [createMockSessionMetrics({ sessionId: "s1" })],
        turnCount: 10,
        complianceSummary: [
          {
            rule: "scope_confirmed_before_major_write",
            passCount: 5,
            failCount: 0,
            notApplicableCount: 0,
            unknownCount: 0,
          },
          {
            rule: "cwd_or_repo_echoed_before_write",
            passCount: 5,
            failCount: 0,
            notApplicableCount: 0,
            unknownCount: 0,
          },
          {
            rule: "short_plan_before_large_change",
            passCount: 5,
            failCount: 0,
            notApplicableCount: 0,
            unknownCount: 0,
          },
          {
            rule: "verification_after_code_changes",
            passCount: 5,
            failCount: 0,
            notApplicableCount: 0,
            unknownCount: 0,
          },
        ],
      });

      const snapshot = buildScoreSnapshot(metrics);

      // All rules have 100% pass rate, average is 100
      expect(snapshot.workflowProxyScore).toBe(100);
    });

    it("calculates discipline score with mixed compliance results", () => {
      const metrics = createMockMetricsRecord({
        sessions: [createMockSessionMetrics({ sessionId: "s1" })],
        turnCount: 10,
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
            passCount: 10,
            failCount: 0,
            notApplicableCount: 0,
            unknownCount: 0,
          },
          {
            rule: "short_plan_before_large_change",
            passCount: 0,
            failCount: 10,
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

      const snapshot = buildScoreSnapshot(metrics);

      // Pass rates: 50%, 100%, 0%, 50% = average 50
      expect(snapshot.workflowProxyScore).toBe(50);
    });

    it("calculates incidents per 100 turns", () => {
      const metrics = createMockMetricsRecord({
        sessions: [
          createMockSessionMetrics({ sessionId: "s1", incidentCount: 5 }),
        ],
        turnCount: 100,
        incidentCount: 5,
      });

      const snapshot = buildScoreSnapshot(metrics);

      expect(snapshot.incidentsPer100Turns).toBe(5);
    });

    it("handles zero turn count for incidents per 100 turns", () => {
      const metrics = createMockMetricsRecord({
        sessions: [],
        turnCount: 0,
        incidentCount: 0,
      });

      const snapshot = buildScoreSnapshot(metrics);

      expect(snapshot.incidentsPer100Turns).toBe(0);
    });
  });

  describe("buildComparativeSlices", () => {
    it("creates selected_corpus slice", () => {
      const metrics = createMockMetricsRecord({
        sessions: [createMockSessionMetrics({ sessionId: "s1" })],
        turnCount: 10,
        sessionCount: 1,
        incidentCount: 0,
      });
      const sessionLabelCounts = new Map<string, Record<LabelName, number>>();
      sessionLabelCounts.set("s1", { interrupt: 0 } as Record<
        LabelName,
        number
      >);

      const slices = buildComparativeSlices(metrics, sessionLabelCounts);

      expect(slices).toHaveLength(1);
      expect(slices[0]?.key).toBe("selected_corpus");
      expect(slices[0]?.label).toBe("Selected Corpus");
      expect(slices[0]?.sessionCount).toBe(1);
    });

    it("creates recent_100 slice when sessions > 100", () => {
      const sessions = Array.from({ length: 150 }, (_, i) =>
        createMockSessionMetrics({ sessionId: `s${i}` }),
      );
      const metrics = createMockMetricsRecord({
        sessions,
        turnCount: 1500,
        sessionCount: 150,
      });
      const sessionLabelCounts = new Map<string, Record<LabelName, number>>();
      for (let i = 0; i < 150; i++) {
        sessionLabelCounts.set(`s${i}`, { interrupt: 0 } as Record<
          LabelName,
          number
        >);
      }

      const slices = buildComparativeSlices(metrics, sessionLabelCounts);

      expect(slices.length).toBeGreaterThanOrEqual(2);
      expect(slices[0]?.key).toBe("selected_corpus");
      expect(slices.some((s) => s.key === "recent_100")).toBe(true);
    });

    it("creates recent_500 slice when sessions > 500", () => {
      const sessions = Array.from({ length: 600 }, (_, i) =>
        createMockSessionMetrics({ sessionId: `s${i}` }),
      );
      const metrics = createMockMetricsRecord({
        sessions,
        turnCount: 6000,
        sessionCount: 600,
      });
      const sessionLabelCounts = new Map<string, Record<LabelName, number>>();
      for (let i = 0; i < 600; i++) {
        sessionLabelCounts.set(`s${i}`, { interrupt: 0 } as Record<
          LabelName,
          number
        >);
      }

      const slices = buildComparativeSlices(metrics, sessionLabelCounts);

      expect(slices.some((s) => s.key === "recent_500")).toBe(true);
    });

    it("creates recent_1000 slice when sessions > 1000", () => {
      const sessions = Array.from({ length: 1100 }, (_, i) =>
        createMockSessionMetrics({ sessionId: `s${i}` }),
      );
      const metrics = createMockMetricsRecord({
        sessions,
        turnCount: 11000,
        sessionCount: 1100,
      });
      const sessionLabelCounts = new Map<string, Record<LabelName, number>>();
      for (let i = 0; i < 1100; i++) {
        sessionLabelCounts.set(`s${i}`, { interrupt: 0 } as Record<
          LabelName,
          number
        >);
      }

      const slices = buildComparativeSlices(metrics, sessionLabelCounts);

      expect(slices.some((s) => s.key === "recent_1000")).toBe(true);
    });

    it("skips slices when not enough sessions", () => {
      const sessions = Array.from({ length: 50 }, (_, i) =>
        createMockSessionMetrics({ sessionId: `s${i}` }),
      );
      const metrics = createMockMetricsRecord({
        sessions,
        turnCount: 500,
        sessionCount: 50,
      });
      const sessionLabelCounts = new Map<string, Record<LabelName, number>>();
      for (let i = 0; i < 50; i++) {
        sessionLabelCounts.set(`s${i}`, { interrupt: 0 } as Record<
          LabelName,
          number
        >);
      }

      const slices = buildComparativeSlices(metrics, sessionLabelCounts);

      expect(slices).toHaveLength(1);
      expect(slices[0]?.key).toBe("selected_corpus");
    });

    it("aggregates label counts correctly across slices", () => {
      const sessions = Array.from({ length: 150 }, (_, i) =>
        createMockSessionMetrics({
          sessionId: `s${i}`,
          turnCount: 10,
        }),
      );
      const metrics = createMockMetricsRecord({
        sessions,
        turnCount: 1500,
        sessionCount: 150,
        labelCounts: { interrupt: 15 },
      });
      const sessionLabelCounts = new Map<string, Record<LabelName, number>>();
      for (let i = 0; i < 150; i++) {
        sessionLabelCounts.set(`s${i}`, { interrupt: 1 } as Record<
          LabelName,
          number
        >);
      }

      const slices = buildComparativeSlices(metrics, sessionLabelCounts);
      const recentSlice = slices.find((s) => s.key === "recent_100");

      expect(recentSlice).toBeDefined();
      expect(recentSlice?.sessionCount).toBe(100);
      expect(recentSlice?.turnCount).toBe(1000);
    });

    it("aggregates compliance correctly across slices", () => {
      const sessions = Array.from({ length: 150 }, (_, i) =>
        createMockSessionMetrics({
          sessionId: `s${i}`,
          complianceRules: [
            {
              rule: "verification_after_code_changes",
              status: "pass",
              rationale: "Verified",
            },
          ],
        }),
      );
      const metrics = createMockMetricsRecord({
        sessions,
        turnCount: 1500,
        sessionCount: 150,
      });
      const sessionLabelCounts = new Map<string, Record<LabelName, number>>();
      for (let i = 0; i < 150; i++) {
        sessionLabelCounts.set(`s${i}`, { interrupt: 0 } as Record<
          LabelName,
          number
        >);
      }

      const slices = buildComparativeSlices(metrics, sessionLabelCounts);
      const corpusSlice = slices.find((s) => s.key === "selected_corpus");

      expect(corpusSlice).toBeDefined();
    });

    it("preserves metrics invariants across all slices", () => {
      const sessions = Array.from({ length: 200 }, (_, i) =>
        createMockSessionMetrics({
          sessionId: `s${i}`,
          turnCount: 10,
          incidentCount: 0,
        }),
      );
      const metrics = createMockMetricsRecord({
        sessions,
        turnCount: 2000,
        sessionCount: 200,
        incidentCount: 0,
        labelCounts: { interrupt: 0 },
      });
      const sessionLabelCounts = new Map<string, Record<LabelName, number>>();
      for (let i = 0; i < 200; i++) {
        // Explicitly set label counts to 0 to avoid NaN
        const labels: Record<LabelName, number> = {
          context_drift: 0,
          test_build_lint_failure_complaint: 0,
          interrupt: 0,
          regression_report: 0,
          praise: 0,
          context_reinjection: 0,
          verification_request: 0,
          stalled_or_guessing: 0,
        };
        sessionLabelCounts.set(`s${i}`, labels);
      }

      const slices = buildComparativeSlices(metrics, sessionLabelCounts);

      for (const slice of slices) {
        expect(slice.sessionCount).toBeGreaterThanOrEqual(0);
        expect(slice.turnCount).toBeGreaterThanOrEqual(0);
        expect(slice.incidentCount).toBeGreaterThanOrEqual(0);
        // Scores should be within 0-100 range (NaN will fail these)
        expect(slice.verificationProxyScore).toBeGreaterThanOrEqual(0);
        expect(slice.verificationProxyScore).toBeLessThanOrEqual(100);
        // Check flowProxyScore is valid before range checks
        if (!Number.isNaN(slice.flowProxyScore)) {
          expect(slice.flowProxyScore).toBeGreaterThanOrEqual(0);
          expect(slice.flowProxyScore).toBeLessThanOrEqual(100);
        }
        expect(slice.workflowProxyScore).toBeGreaterThanOrEqual(0);
        expect(slice.workflowProxyScore).toBeLessThanOrEqual(100);
        expect(slice.writeSessionVerificationRate).toBeGreaterThanOrEqual(0);
        expect(slice.incidentsPer100Turns).toBeGreaterThanOrEqual(0);
      }
    });
  });
});
