/**
 * Purpose: Verify derived summary sections stay aligned with the operator-first summary contract.
 * Entrypoint: Executed by Vitest via `pnpm test`.
 * Notes: Focuses on executive-summary mirroring and recent-vs-corpus momentum behavior after the report redesign cutover.
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
      {
        key: "recent_500",
        label: "Recent 500",
        sessionCount: 10,
        turnCount: 100,
        incidentCount: 4,
        verificationProxyScore: 80,
        flowProxyScore: 82,
        workflowProxyScore: 88,
        writeSessionVerificationRate: 80,
        incidentsPer100Turns: 4,
      },
    ],
    topSessions: [],
    topIncidents: [],
    executiveSummary: {
      problem: "Post-change verification is the main gap.",
      change: "Recent sessions improved slightly on verification discipline.",
      action: "Inspect the highest-ranked session first.",
    },
    operatorMetrics: [
      {
        label: "Ended Unverified",
        value: "2",
        detail:
          "25% of write sessions ended without a passing post-write verification signal.",
        tone: "warn",
      },
    ],
    metricGlossary: [
      {
        key: "verification_proxy_score",
        label: "Verification Proxy Score",
        plainLanguage:
          "How often write sessions ended with a passing post-write verification signal.",
        caveat: "Proxy only.",
      },
    ],
    scoreCards: [],
    highlightCards: [],
    recognitions: [],
    endedVerifiedDeliverySpotlights: [],
    opportunities: [],
    ...overrides,
  };
}

describe("summary-sections", () => {
  it("mirrors the persisted executive summary into headline insight cards", () => {
    const summary = createMockSummaryArtifact();
    const sections = buildSummarySections(summary);

    expect(sections.headlineInsights.map((card) => card.title)).toEqual([
      "Problem",
      "Recent Change",
      "Next Action",
    ]);
    expect(sections.headlineInsights[0]?.detail).toBe(
      "Post-change verification is the main gap.",
    );
    expect(sections.headlineInsights[1]?.detail).toContain("improved slightly");
    expect(sections.headlineInsights[2]?.detail).toContain(
      "highest-ranked session",
    );
  });

  it("builds recent momentum cards from the preferred recent slice", () => {
    const summary = createMockSummaryArtifact();
    const sections = buildSummarySections(summary);

    expect(sections.recentMomentum.map((card) => card.title)).toEqual([
      "Verification Discipline Momentum",
      "Workflow Hygiene Momentum",
      "Flow Stability Momentum",
    ]);
    expect(sections.recentMomentum[0]?.value).toBe("+5 pts");
    expect(sections.recentMomentum[0]?.tone).toBe("good");
    expect(sections.recentMomentum[0]?.detail).toContain("Recent 500");
  });

  it("falls back through recent_100 when recent_500 is unavailable", () => {
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
          sessionCount: 10,
          turnCount: 100,
          incidentCount: 6,
          verificationProxyScore: 70,
          flowProxyScore: 79,
          workflowProxyScore: 81,
          writeSessionVerificationRate: 70,
          incidentsPer100Turns: 6,
        },
      ],
    });

    const sections = buildSummarySections(summary);
    expect(sections.recentMomentum[0]?.detail).toContain("Recent 100");
    expect(sections.recentMomentum[0]?.value).toBe("-5 pts");
    expect(sections.recentMomentum[0]?.tone).toBe("warn");
  });

  it("returns no momentum cards when no comparable recent slice exists", () => {
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
    expect(sections.recentMomentum).toEqual([]);
  });
});
