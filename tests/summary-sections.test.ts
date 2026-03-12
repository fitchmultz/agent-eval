/**
 * Purpose: Test coverage for summary-sections.ts - headline insights and momentum.
 * Entrypoint: Executed by Vitest via `pnpm test`.
 * Notes: Tests derived summary sections computation.
 */
import { describe, expect, it } from "vitest";
import type { SummaryArtifact } from "../src/schema.js";
import { buildSummarySections } from "../src/summary-sections.js";

function createMockSummaryArtifact(
  overrides: Partial<SummaryArtifact> = {},
): SummaryArtifact {
  const now = new Date().toISOString();
  return {
    engineVersion: "1.0.0",
    schemaVersion: "1",
    generatedAt: now,
    sessions: 10,
    turns: 100,
    incidents: 5,
    parseWarningCount: 0,
    labels: [],
    severities: [],
    compliance: [],
    rates: {
      incidentsPer100Turns: 5,
      writesPer100Turns: 10,
      verificationRequestsPer100Turns: 2,
      interruptionsPer100Turns: 3,
      reinjectionsPer100Turns: 1,
      praisePer100Turns: 0.5,
    },
    delivery: {
      sessionsWithWrites: 8,
      sessionsEndingVerified: 6,
      writeSessionVerificationRate: 75,
    },
    comparativeSlices: [
      {
        key: "selected_corpus",
        label: "Selected Corpus",
        sessionCount: 10,
        turnCount: 100,
        incidentCount: 5,
        verificationProxyScore: 75,
        flowProxyScore: 80,
        workflowProxyScore: 85,
        writeSessionVerificationRate: 75,
        incidentsPer100Turns: 5,
      },
    ],
    topSessions: [
      {
        sessionId: "session-1",
        archetype: "high_friction_verified_delivery",
        archetypeLabel: "High-Friction Ended-Verified Delivery",
        frictionScore: 12,
        complianceScore: 70,
        incidentCount: 3,
        labeledTurnCount: 5,
        writeCount: 2,
        verificationPassedCount: 1,
        endedVerified: true,
        dominantLabels: ["interrupt"],
        note: "High friction session",
      },
    ],
    topIncidents: [],
    scoreCards: [],
    highlightCards: [],
    recognitions: [],
    endedVerifiedDeliverySpotlights: [],
    opportunities: [],
    ...overrides,
  };
}

describe("summary-sections", () => {
  describe("toneForDelta (via buildRecentMomentum)", () => {
    it("returns good for delta >= 5", () => {
      const summary = createMockSummaryArtifact({
        comparativeSlices: [
          {
            key: "selected_corpus",
            label: "Selected Corpus",
            sessionCount: 10,
            turnCount: 100,
            incidentCount: 5,
            verificationProxyScore: 70,
            flowProxyScore: 80,
            workflowProxyScore: 85,
            writeSessionVerificationRate: 70,
            incidentsPer100Turns: 5,
          },
          {
            key: "recent_100",
            label: "Recent 100",
            sessionCount: 10,
            turnCount: 100,
            incidentCount: 5,
            verificationProxyScore: 75, // +5 delta
            flowProxyScore: 80,
            workflowProxyScore: 85,
            writeSessionVerificationRate: 75,
            incidentsPer100Turns: 5,
          },
        ],
      });

      const sections = buildSummarySections(summary);
      const proofMomentum = sections.recentMomentum.find(
        (m) => m.title === "Verification Proxy Momentum",
      );

      expect(proofMomentum?.tone).toBe("good");
      expect(proofMomentum?.value).toBe("+5 pts");
    });

    it("returns danger for delta <= -10", () => {
      const summary = createMockSummaryArtifact({
        comparativeSlices: [
          {
            key: "selected_corpus",
            label: "Selected Corpus",
            sessionCount: 10,
            turnCount: 100,
            incidentCount: 5,
            verificationProxyScore: 80,
            flowProxyScore: 80,
            workflowProxyScore: 85,
            writeSessionVerificationRate: 80,
            incidentsPer100Turns: 5,
          },
          {
            key: "recent_100",
            label: "Recent 100",
            sessionCount: 10,
            turnCount: 100,
            incidentCount: 5,
            verificationProxyScore: 70, // -10 delta
            flowProxyScore: 80,
            workflowProxyScore: 85,
            writeSessionVerificationRate: 70,
            incidentsPer100Turns: 5,
          },
        ],
      });

      const sections = buildSummarySections(summary);
      const proofMomentum = sections.recentMomentum.find(
        (m) => m.title === "Verification Proxy Momentum",
      );

      expect(proofMomentum?.tone).toBe("danger");
      expect(proofMomentum?.value).toBe("-10 pts");
    });

    it("returns warn for delta <= -5", () => {
      const summary = createMockSummaryArtifact({
        comparativeSlices: [
          {
            key: "selected_corpus",
            label: "Selected Corpus",
            sessionCount: 10,
            turnCount: 100,
            incidentCount: 5,
            verificationProxyScore: 80,
            flowProxyScore: 80,
            workflowProxyScore: 85,
            writeSessionVerificationRate: 80,
            incidentsPer100Turns: 5,
          },
          {
            key: "recent_100",
            label: "Recent 100",
            sessionCount: 10,
            turnCount: 100,
            incidentCount: 5,
            verificationProxyScore: 75, // -5 delta
            flowProxyScore: 80,
            workflowProxyScore: 85,
            writeSessionVerificationRate: 75,
            incidentsPer100Turns: 5,
          },
        ],
      });

      const sections = buildSummarySections(summary);
      const proofMomentum = sections.recentMomentum.find(
        (m) => m.title === "Verification Proxy Momentum",
      );

      expect(proofMomentum?.tone).toBe("warn");
      expect(proofMomentum?.value).toBe("-5 pts");
    });

    it("returns neutral for delta between -5 and 5", () => {
      const summary = createMockSummaryArtifact({
        comparativeSlices: [
          {
            key: "selected_corpus",
            label: "Selected Corpus",
            sessionCount: 10,
            turnCount: 100,
            incidentCount: 5,
            verificationProxyScore: 80,
            flowProxyScore: 80,
            workflowProxyScore: 85,
            writeSessionVerificationRate: 80,
            incidentsPer100Turns: 5,
          },
          {
            key: "recent_100",
            label: "Recent 100",
            sessionCount: 10,
            turnCount: 100,
            incidentCount: 5,
            verificationProxyScore: 82, // +2 delta (between -5 and 5)
            flowProxyScore: 80,
            workflowProxyScore: 85,
            writeSessionVerificationRate: 82,
            incidentsPer100Turns: 5,
          },
        ],
      });

      const sections = buildSummarySections(summary);
      const proofMomentum = sections.recentMomentum.find(
        (m) => m.title === "Verification Proxy Momentum",
      );

      expect(proofMomentum?.tone).toBe("neutral");
      expect(proofMomentum?.value).toBe("+2 pts");
    });

    it("returns neutral for delta between -10 and -5", () => {
      const summary = createMockSummaryArtifact({
        comparativeSlices: [
          {
            key: "selected_corpus",
            label: "Selected Corpus",
            sessionCount: 10,
            turnCount: 100,
            incidentCount: 5,
            verificationProxyScore: 80,
            flowProxyScore: 80,
            workflowProxyScore: 85,
            writeSessionVerificationRate: 80,
            incidentsPer100Turns: 5,
          },
          {
            key: "recent_100",
            label: "Recent 100",
            sessionCount: 10,
            turnCount: 100,
            incidentCount: 5,
            verificationProxyScore: 74, // -6 delta (between -10 and -5)
            flowProxyScore: 80,
            workflowProxyScore: 85,
            writeSessionVerificationRate: 74,
            incidentsPer100Turns: 5,
          },
        ],
      });

      const sections = buildSummarySections(summary);
      const proofMomentum = sections.recentMomentum.find(
        (m) => m.title === "Verification Proxy Momentum",
      );

      expect(proofMomentum?.tone).toBe("warn");
      expect(proofMomentum?.value).toBe("-6 pts");
    });
  });

  describe("formatSignedDelta (via buildRecentMomentum)", () => {
    it("prefixes positive with +", () => {
      const summary = createMockSummaryArtifact({
        comparativeSlices: [
          {
            key: "selected_corpus",
            label: "Selected Corpus",
            sessionCount: 10,
            turnCount: 100,
            incidentCount: 5,
            verificationProxyScore: 70,
            flowProxyScore: 80,
            workflowProxyScore: 85,
            writeSessionVerificationRate: 70,
            incidentsPer100Turns: 5,
          },
          {
            key: "recent_100",
            label: "Recent 100",
            sessionCount: 10,
            turnCount: 100,
            incidentCount: 5,
            verificationProxyScore: 80, // +10 delta
            flowProxyScore: 80,
            workflowProxyScore: 85,
            writeSessionVerificationRate: 80,
            incidentsPer100Turns: 5,
          },
        ],
      });

      const sections = buildSummarySections(summary);
      const proofMomentum = sections.recentMomentum.find(
        (m) => m.title === "Verification Proxy Momentum",
      );

      expect(proofMomentum?.value).toBe("+10 pts");
    });

    it("keeps negative sign", () => {
      const summary = createMockSummaryArtifact({
        comparativeSlices: [
          {
            key: "selected_corpus",
            label: "Selected Corpus",
            sessionCount: 10,
            turnCount: 100,
            incidentCount: 5,
            verificationProxyScore: 80,
            flowProxyScore: 80,
            workflowProxyScore: 85,
            writeSessionVerificationRate: 80,
            incidentsPer100Turns: 5,
          },
          {
            key: "recent_100",
            label: "Recent 100",
            sessionCount: 10,
            turnCount: 100,
            incidentCount: 5,
            verificationProxyScore: 70, // -10 delta
            flowProxyScore: 80,
            workflowProxyScore: 85,
            writeSessionVerificationRate: 70,
            incidentsPer100Turns: 5,
          },
        ],
      });

      const sections = buildSummarySections(summary);
      const proofMomentum = sections.recentMomentum.find(
        (m) => m.title === "Verification Proxy Momentum",
      );

      expect(proofMomentum?.value).toBe("-10 pts");
    });

    it("handles zero", () => {
      const summary = createMockSummaryArtifact({
        comparativeSlices: [
          {
            key: "selected_corpus",
            label: "Selected Corpus",
            sessionCount: 10,
            turnCount: 100,
            incidentCount: 5,
            verificationProxyScore: 80,
            flowProxyScore: 80,
            workflowProxyScore: 85,
            writeSessionVerificationRate: 80,
            incidentsPer100Turns: 5,
          },
          {
            key: "recent_100",
            label: "Recent 100",
            sessionCount: 10,
            turnCount: 100,
            incidentCount: 5,
            verificationProxyScore: 80, // 0 delta
            flowProxyScore: 80,
            workflowProxyScore: 85,
            writeSessionVerificationRate: 80,
            incidentsPer100Turns: 5,
          },
        ],
      });

      const sections = buildSummarySections(summary);
      const proofMomentum = sections.recentMomentum.find(
        (m) => m.title === "Verification Proxy Momentum",
      );

      expect(proofMomentum?.value).toBe("+0 pts");
    });
  });

  describe("buildHeadlineInsights", () => {
    it("includes write verification card", () => {
      const summary = createMockSummaryArtifact({
        delivery: {
          sessionsWithWrites: 10,
          sessionsEndingVerified: 8,
          writeSessionVerificationRate: 80,
        },
      });

      const sections = buildSummarySections(summary);
      const writeCard = sections.headlineInsights.find(
        (c) => c.title === "Terminal Verification",
      );

      expect(writeCard).toBeDefined();
      expect(writeCard?.value).toBe("8/10");
      expect(writeCard?.detail).toContain("80%");
    });

    it("sets good tone when all write sessions verified", () => {
      const summary = createMockSummaryArtifact({
        delivery: {
          sessionsWithWrites: 10,
          sessionsEndingVerified: 10,
          writeSessionVerificationRate: 100,
        },
      });

      const sections = buildSummarySections(summary);
      const writeCard = sections.headlineInsights.find(
        (c) => c.title === "Terminal Verification",
      );

      expect(writeCard?.tone).toBe("good");
    });

    it("sets warn tone when some write sessions unverified", () => {
      const summary = createMockSummaryArtifact({
        delivery: {
          sessionsWithWrites: 10,
          sessionsEndingVerified: 8,
          writeSessionVerificationRate: 80,
        },
      });

      const sections = buildSummarySections(summary);
      const writeCard = sections.headlineInsights.find(
        (c) => c.title === "Terminal Verification",
      );

      expect(writeCard?.tone).toBe("warn");
    });

    it("sets neutral tone when no write sessions", () => {
      const summary = createMockSummaryArtifact({
        delivery: {
          sessionsWithWrites: 0,
          sessionsEndingVerified: 0,
          writeSessionVerificationRate: 0,
        },
      });

      const sections = buildSummarySections(summary);
      const writeCard = sections.headlineInsights.find(
        (c) => c.title === "Terminal Verification",
      );

      expect(writeCard?.tone).toBe("neutral");
      expect(writeCard?.detail).toContain("No write sessions");
    });

    it("includes interruption load card", () => {
      const summary = createMockSummaryArtifact({
        rates: {
          incidentsPer100Turns: 5,
          writesPer100Turns: 10,
          verificationRequestsPer100Turns: 2,
          interruptionsPer100Turns: 15, // Above threshold
          reinjectionsPer100Turns: 1,
          praisePer100Turns: 0.5,
        },
      });

      const sections = buildSummarySections(summary);
      const interruptCard = sections.headlineInsights.find(
        (c) => c.title === "Interruption Load",
      );

      expect(interruptCard).toBeDefined();
      expect(interruptCard?.value).toBe("15");
    });

    it("sets warn tone for high interruption load", () => {
      const summary = createMockSummaryArtifact({
        rates: {
          incidentsPer100Turns: 5,
          writesPer100Turns: 10,
          verificationRequestsPer100Turns: 2,
          interruptionsPer100Turns: 15, // Above 10 threshold
          reinjectionsPer100Turns: 1,
          praisePer100Turns: 0.5,
        },
      });

      const sections = buildSummarySections(summary);
      const interruptCard = sections.headlineInsights.find(
        (c) => c.title === "Interruption Load",
      );

      expect(interruptCard?.tone).toBe("warn");
    });

    it("sets neutral tone for normal interruption load", () => {
      const summary = createMockSummaryArtifact({
        rates: {
          incidentsPer100Turns: 5,
          writesPer100Turns: 10,
          verificationRequestsPer100Turns: 2,
          interruptionsPer100Turns: 5, // Below 10 threshold
          reinjectionsPer100Turns: 1,
          praisePer100Turns: 0.5,
        },
      });

      const sections = buildSummarySections(summary);
      const interruptCard = sections.headlineInsights.find(
        (c) => c.title === "Interruption Load",
      );

      expect(interruptCard?.tone).toBe("neutral");
    });

    it("includes highest friction session card", () => {
      const summary = createMockSummaryArtifact({
        topSessions: [
          {
            sessionId: "high-friction-session",
            archetype: "high_friction_verified_delivery",
            archetypeLabel: "High-Friction Ended-Verified Delivery",
            frictionScore: 15,
            complianceScore: 60,
            incidentCount: 5,
            labeledTurnCount: 10,
            writeCount: 3,
            verificationPassedCount: 1,
            endedVerified: true,
            dominantLabels: ["interrupt", "context_drift"],
            note: "Very high friction",
          },
        ],
      });

      const sections = buildSummarySections(summary);
      const frictionCard = sections.headlineInsights.find(
        (c) => c.title === "Highest Friction Session",
      );

      expect(frictionCard).toBeDefined();
      expect(frictionCard?.value).toBe("high-friction-session");
      expect(frictionCard?.valueKind).toBe("session-id");
      expect(frictionCard?.detail).toContain("15 friction points");
      expect(frictionCard?.detail).toContain(
        "High-Friction Ended-Verified Delivery",
      );
    });

    it("sets danger tone for high friction session", () => {
      const summary = createMockSummaryArtifact({
        topSessions: [
          {
            sessionId: "high-friction-session",
            archetype: "high_friction_verified_delivery",
            archetypeLabel: "High-Friction Ended-Verified Delivery",
            frictionScore: 12, // Above HIGH_FRICTION_THRESHOLD of 8
            complianceScore: 60,
            incidentCount: 5,
            labeledTurnCount: 10,
            writeCount: 3,
            verificationPassedCount: 1,
            endedVerified: true,
            dominantLabels: ["interrupt"],
            note: "Very high friction",
          },
        ],
      });

      const sections = buildSummarySections(summary);
      const frictionCard = sections.headlineInsights.find(
        (c) => c.title === "Highest Friction Session",
      );

      expect(frictionCard?.tone).toBe("danger");
    });

    it("sets neutral tone for normal friction session", () => {
      const summary = createMockSummaryArtifact({
        topSessions: [
          {
            sessionId: "normal-session",
            archetype: "verified_delivery",
            archetypeLabel: "Ended-Verified Delivery",
            frictionScore: 3, // Below HIGH_FRICTION_THRESHOLD of 8
            complianceScore: 95,
            incidentCount: 1,
            labeledTurnCount: 5,
            writeCount: 2,
            verificationPassedCount: 2,
            endedVerified: true,
            dominantLabels: [],
            note: "Normal session",
          },
        ],
      });

      const sections = buildSummarySections(summary);
      const frictionCard = sections.headlineInsights.find(
        (c) => c.title === "Highest Friction Session",
      );

      expect(frictionCard?.tone).toBe("neutral");
    });

    it("handles empty sessions", () => {
      const summary = createMockSummaryArtifact({
        topSessions: [],
      });

      const sections = buildSummarySections(summary);
      const frictionCard = sections.headlineInsights.find(
        (c) => c.title === "Highest Friction Session",
      );

      expect(frictionCard?.value).toBe("none");
      expect(frictionCard?.valueKind).toBe("default");
      expect(frictionCard?.detail).toBe("No sessions were available.");
      expect(frictionCard?.tone).toBe("neutral");
    });

    it("returns all three headline cards in order", () => {
      const summary = createMockSummaryArtifact();

      const sections = buildSummarySections(summary);

      expect(sections.headlineInsights).toHaveLength(3);
      expect(sections.headlineInsights[0]?.title).toBe("Terminal Verification");
      expect(sections.headlineInsights[1]?.title).toBe("Interruption Load");
      expect(sections.headlineInsights[2]?.title).toBe(
        "Highest Friction Session",
      );
    });
  });

  describe("buildRecentMomentum", () => {
    it("returns empty when no slices available", () => {
      const summary = createMockSummaryArtifact({
        comparativeSlices: [],
      });

      const sections = buildSummarySections(summary);

      expect(sections.recentMomentum).toHaveLength(0);
    });

    it("returns empty when only selected_corpus slice exists", () => {
      const summary = createMockSummaryArtifact({
        comparativeSlices: [
          {
            key: "selected_corpus",
            label: "Selected Corpus",
            sessionCount: 10,
            turnCount: 100,
            incidentCount: 5,
            verificationProxyScore: 75,
            flowProxyScore: 80,
            workflowProxyScore: 85,
            writeSessionVerificationRate: 75,
            incidentsPer100Turns: 5,
          },
        ],
      });

      const sections = buildSummarySections(summary);

      expect(sections.recentMomentum).toHaveLength(0);
    });

    it("falls back through slice chain (500 -> 100 -> 1000)", () => {
      const summary = createMockSummaryArtifact({
        comparativeSlices: [
          {
            key: "selected_corpus",
            label: "Selected Corpus",
            sessionCount: 10,
            turnCount: 100,
            incidentCount: 5,
            verificationProxyScore: 75,
            flowProxyScore: 80,
            workflowProxyScore: 85,
            writeSessionVerificationRate: 75,
            incidentsPer100Turns: 5,
          },
          {
            key: "recent_500",
            label: "Recent 500",
            sessionCount: 500,
            turnCount: 5000,
            incidentCount: 25,
            verificationProxyScore: 80,
            flowProxyScore: 85,
            workflowProxyScore: 90,
            writeSessionVerificationRate: 80,
            incidentsPer100Turns: 0.5,
          },
        ],
      });

      const sections = buildSummarySections(summary);

      // Should use recent_500 since it's available
      expect(sections.recentMomentum).toHaveLength(3);
      const proofMomentum = sections.recentMomentum.find(
        (m) => m.title === "Verification Proxy Momentum",
      );
      expect(proofMomentum?.detail).toContain("Recent 500");
    });

    it("prefers recent_500 over recent_100", () => {
      const summary = createMockSummaryArtifact({
        comparativeSlices: [
          {
            key: "selected_corpus",
            label: "Selected Corpus",
            sessionCount: 10,
            turnCount: 100,
            incidentCount: 5,
            verificationProxyScore: 75,
            flowProxyScore: 80,
            workflowProxyScore: 85,
            writeSessionVerificationRate: 75,
            incidentsPer100Turns: 5,
          },
          {
            key: "recent_500",
            label: "Recent 500",
            sessionCount: 500,
            turnCount: 5000,
            incidentCount: 25,
            verificationProxyScore: 80,
            flowProxyScore: 85,
            workflowProxyScore: 90,
            writeSessionVerificationRate: 80,
            incidentsPer100Turns: 0.5,
          },
          {
            key: "recent_100",
            label: "Recent 100",
            sessionCount: 100,
            turnCount: 1000,
            incidentCount: 5,
            verificationProxyScore: 85,
            flowProxyScore: 90,
            workflowProxyScore: 95,
            writeSessionVerificationRate: 85,
            incidentsPer100Turns: 0.5,
          },
        ],
      });

      const sections = buildSummarySections(summary);

      // Implementation prefers recent_500 over recent_100
      const proofMomentum = sections.recentMomentum.find(
        (m) => m.title === "Verification Proxy Momentum",
      );
      expect(proofMomentum?.detail).toContain("Recent 500");
    });

    it("falls back to recent_1000 when others not available", () => {
      const summary = createMockSummaryArtifact({
        comparativeSlices: [
          {
            key: "selected_corpus",
            label: "Selected Corpus",
            sessionCount: 10,
            turnCount: 100,
            incidentCount: 5,
            verificationProxyScore: 75,
            flowProxyScore: 80,
            workflowProxyScore: 85,
            writeSessionVerificationRate: 75,
            incidentsPer100Turns: 5,
          },
          {
            key: "recent_1000",
            label: "Recent 1000",
            sessionCount: 1000,
            turnCount: 10000,
            incidentCount: 50,
            verificationProxyScore: 70,
            flowProxyScore: 75,
            workflowProxyScore: 80,
            writeSessionVerificationRate: 70,
            incidentsPer100Turns: 0.5,
          },
        ],
      });

      const sections = buildSummarySections(summary);

      // Should use recent_1000 as fallback
      expect(sections.recentMomentum).toHaveLength(3);
      const proofMomentum = sections.recentMomentum.find(
        (m) => m.title === "Verification Proxy Momentum",
      );
      expect(proofMomentum?.detail).toContain("Recent 1000");
    });

    it("calculates proof delta correctly", () => {
      const summary = createMockSummaryArtifact({
        comparativeSlices: [
          {
            key: "selected_corpus",
            label: "Selected Corpus",
            sessionCount: 10,
            turnCount: 100,
            incidentCount: 5,
            verificationProxyScore: 70,
            flowProxyScore: 80,
            workflowProxyScore: 85,
            writeSessionVerificationRate: 70,
            incidentsPer100Turns: 5,
          },
          {
            key: "recent_100",
            label: "Recent 100",
            sessionCount: 100,
            turnCount: 1000,
            incidentCount: 5,
            verificationProxyScore: 80, // +10 delta
            flowProxyScore: 80,
            workflowProxyScore: 85,
            writeSessionVerificationRate: 80,
            incidentsPer100Turns: 0.5,
          },
        ],
      });

      const sections = buildSummarySections(summary);
      const proofMomentum = sections.recentMomentum.find(
        (m) => m.title === "Verification Proxy Momentum",
      );

      expect(proofMomentum?.value).toBe("+10 pts");
    });

    it("calculates flow delta correctly", () => {
      const summary = createMockSummaryArtifact({
        comparativeSlices: [
          {
            key: "selected_corpus",
            label: "Selected Corpus",
            sessionCount: 10,
            turnCount: 100,
            incidentCount: 5,
            verificationProxyScore: 75,
            flowProxyScore: 70,
            workflowProxyScore: 85,
            writeSessionVerificationRate: 75,
            incidentsPer100Turns: 5,
          },
          {
            key: "recent_100",
            label: "Recent 100",
            sessionCount: 100,
            turnCount: 1000,
            incidentCount: 5,
            verificationProxyScore: 75,
            flowProxyScore: 85, // +15 delta
            workflowProxyScore: 85,
            writeSessionVerificationRate: 75,
            incidentsPer100Turns: 0.5,
          },
        ],
      });

      const sections = buildSummarySections(summary);
      const flowMomentum = sections.recentMomentum.find(
        (m) => m.title === "Flow Proxy Momentum",
      );

      expect(flowMomentum?.value).toBe("+15 pts");
    });

    it("calculates discipline delta correctly", () => {
      const summary = createMockSummaryArtifact({
        comparativeSlices: [
          {
            key: "selected_corpus",
            label: "Selected Corpus",
            sessionCount: 10,
            turnCount: 100,
            incidentCount: 5,
            verificationProxyScore: 75,
            flowProxyScore: 80,
            workflowProxyScore: 70,
            writeSessionVerificationRate: 75,
            incidentsPer100Turns: 5,
          },
          {
            key: "recent_100",
            label: "Recent 100",
            sessionCount: 100,
            turnCount: 1000,
            incidentCount: 5,
            verificationProxyScore: 75,
            flowProxyScore: 80,
            workflowProxyScore: 90, // +20 delta
            writeSessionVerificationRate: 75,
            incidentsPer100Turns: 0.5,
          },
        ],
      });

      const sections = buildSummarySections(summary);
      const disciplineMomentum = sections.recentMomentum.find(
        (m) => m.title === "Workflow Proxy Momentum",
      );

      expect(disciplineMomentum?.value).toBe("+20 pts");
    });

    it("returns all three momentum cards in order", () => {
      const summary = createMockSummaryArtifact({
        comparativeSlices: [
          {
            key: "selected_corpus",
            label: "Selected Corpus",
            sessionCount: 10,
            turnCount: 100,
            incidentCount: 5,
            verificationProxyScore: 75,
            flowProxyScore: 80,
            workflowProxyScore: 85,
            writeSessionVerificationRate: 75,
            incidentsPer100Turns: 5,
          },
          {
            key: "recent_100",
            label: "Recent 100",
            sessionCount: 100,
            turnCount: 1000,
            incidentCount: 5,
            verificationProxyScore: 80,
            flowProxyScore: 85,
            workflowProxyScore: 90,
            writeSessionVerificationRate: 80,
            incidentsPer100Turns: 0.5,
          },
        ],
      });

      const sections = buildSummarySections(summary);

      expect(sections.recentMomentum).toHaveLength(3);
      expect(sections.recentMomentum[0]?.title).toBe(
        "Verification Proxy Momentum",
      );
      expect(sections.recentMomentum[1]?.title).toBe("Flow Proxy Momentum");
      expect(sections.recentMomentum[2]?.title).toBe("Workflow Proxy Momentum");
    });
  });
});
