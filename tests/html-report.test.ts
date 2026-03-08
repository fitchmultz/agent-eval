/**
 * Purpose: Verifies HTML report generation produces valid and safe output.
 * Entrypoint: Executed by Vitest via `pnpm test`.
 * Notes: Tests HTML structure, escaping, and all section renderers.
 */
import { describe, expect, it } from "vitest";

import { renderHtmlReport } from "../src/html-report.js";
import type { MetricsRecord, SummaryArtifact } from "../src/schema.js";

const baseMetrics: MetricsRecord = {
  evaluatorVersion: "0.1.0",
  schemaVersion: "1",
  generatedAt: "2026-03-06T19:00:00.000Z",
  sessionCount: 2,
  turnCount: 8,
  incidentCount: 2,
  labelCounts: {
    verification_request: 3,
    context_reinjection: 1,
  },
  complianceSummary: [
    {
      rule: "scope_confirmed_before_major_write",
      passCount: 1,
      failCount: 0,
      notApplicableCount: 1,
      unknownCount: 0,
    },
  ],
  sessions: [
    {
      sessionId: "session-1",
      turnCount: 4,
      labeledTurnCount: 2,
      incidentCount: 1,
      writeCount: 1,
      verificationCount: 1,
      verificationPassedCount: 1,
      verificationFailedCount: 0,
      complianceScore: 100,
      complianceRules: [],
    },
  ],
  inventory: [
    {
      kind: "session_jsonl",
      path: "~/.codex/sessions",
      discovered: true,
      required: true,
      optional: false,
    },
  ],
};

const baseSummary: SummaryArtifact = {
  evaluatorVersion: "0.1.0",
  schemaVersion: "1",
  generatedAt: "2026-03-06T19:00:00.000Z",
  sessions: 2,
  turns: 8,
  incidents: 2,
  labels: [
    { label: "verification_request", count: 3 },
    { label: "context_reinjection", count: 1 },
  ],
  severities: [
    { severity: "low", count: 1 },
    { severity: "medium", count: 1 },
  ],
  compliance: [
    {
      rule: "scope_confirmed_before_major_write",
      passCount: 5,
      failCount: 1,
      notApplicableCount: 0,
      unknownCount: 0,
    },
  ],
  rates: {
    incidentsPer100Turns: 25,
    writesPer100Turns: 12.5,
    verificationRequestsPer100Turns: 37.5,
    interruptionsPer100Turns: 0,
    reinjectionsPer100Turns: 12.5,
    praisePer100Turns: 0,
  },
  delivery: {
    sessionsWithWrites: 1,
    verifiedWriteSessions: 1,
    writeVerificationRate: 100,
  },
  topSessions: [],
  victoryLaps: [],
  topIncidents: [],
  opportunities: [],
  bragCards: [],
  scoreCards: [],
  achievementBadges: [],
  comparativeSlices: [],
};

describe("renderHtmlReport", () => {
  it("renders a complete HTML document", () => {
    const html = renderHtmlReport(baseSummary, baseMetrics);

    expect(html).toContain("<!doctype html>");
    expect(html).toContain('<html lang="en">');
    expect(html).toContain("</html>");
    expect(html).toContain("<head>");
    expect(html).toContain("<body>");
  });

  it("includes the report title", () => {
    const html = renderHtmlReport(baseSummary, baseMetrics);

    expect(html).toContain("Codex Evaluator Report");
    expect(html).toContain("<title>Codex Evaluator Report</title>");
  });

  it("includes inline CSS styles", () => {
    const html = renderHtmlReport(baseSummary, baseMetrics);

    expect(html).toContain("<style>");
    expect(html).toContain("--bg:");
    expect(html).toContain("--panel:");
    expect(html).toContain(".metric-card");
  });

  it("displays session and incident counts", () => {
    const html = renderHtmlReport(baseSummary, baseMetrics);

    expect(html).toContain("Sessions");
    expect(html).toContain(">2<");
    expect(html).toContain("Incidents / 100 Turns");
    expect(html).toContain("25");
  });

  it("displays operational rates section", () => {
    const html = renderHtmlReport(baseSummary, baseMetrics);

    expect(html).toContain("Operational Rates");
    expect(html).toContain("Incidents / 100 turns");
    expect(html).toContain("Writes / 100 turns");
    expect(html).toContain("Verification requests / 100 turns");
    expect(html).toContain("Interruptions / 100 turns");
    expect(html).toContain("Reinjections / 100 turns");
    expect(html).toContain("Praise / 100 turns");
  });

  it("includes chart image references", () => {
    const html = renderHtmlReport(baseSummary, baseMetrics);

    expect(html).toContain('src="label-counts.svg"');
    expect(html).toContain('src="severity-breakdown.svg"');
    expect(html).toContain('src="compliance-summary.svg"');
  });

  it("escapes HTML in summary metadata", () => {
    const summaryWithHtml: SummaryArtifact = {
      ...baseSummary,
      evaluatorVersion: "<script>alert(1)</script>",
    };
    const html = renderHtmlReport(summaryWithHtml, baseMetrics);

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("escapes HTML in inventory paths", () => {
    const metricsWithHtml: MetricsRecord = {
      ...baseMetrics,
      inventory: [
        {
          kind: "session_jsonl",
          path: "<img src=x onerror=alert(1)>",
          discovered: true,
          required: true,
          optional: false,
        },
      ],
    };
    const html = renderHtmlReport(baseSummary, metricsWithHtml);

    // Check that the dangerous path is escaped in the inventory section
    expect(html).toContain("<code>&lt;img src=x onerror=alert(1)&gt;</code>");
    expect(html).not.toContain("><img src=x onerror=alert(1)></code>");
  });

  it("shows empty state for badges when none exist", () => {
    const html = renderHtmlReport(baseSummary, baseMetrics);

    expect(html).toContain("Badges");
    expect(html).toContain("No badges earned");
  });

  it("shows empty state for incidents when none exist", () => {
    const html = renderHtmlReport(baseSummary, baseMetrics);

    expect(html).toContain("Top Incidents");
    expect(html).toContain("No labeled incidents were detected");
  });

  it("shows empty state for sessions when none exist", () => {
    const html = renderHtmlReport(baseSummary, baseMetrics);

    expect(html).toContain("Sessions To Review First");
    expect(html).toContain("No session insights were available");
  });

  it("shows empty state for victory laps when none exist", () => {
    const html = renderHtmlReport(baseSummary, baseMetrics);

    expect(html).toContain("Victory Lap Sessions");
    expect(html).toContain(
      "No clean verified delivery sessions were available",
    );
  });

  it("shows empty state for opportunities when none exist", () => {
    const html = renderHtmlReport(baseSummary, baseMetrics);

    expect(html).toContain("Deterministic Opportunities");
    expect(html).toContain(
      "No deterministic improvement opportunities were identified",
    );
  });

  it("shows empty state for momentum when not enough data", () => {
    const html = renderHtmlReport(baseSummary, baseMetrics);

    expect(html).toContain("Recent Momentum");
    expect(html).toContain("Not enough sessions in this slice");
  });

  it("includes all major sections", () => {
    const html = renderHtmlReport(baseSummary, baseMetrics);

    expect(html).toContain("Show-Off Stats");
    expect(html).toContain("Shareable Scoreboard");
    expect(html).toContain("Recent Momentum");
    expect(html).toContain("Badges");
    expect(html).toContain("Comparative Slices");
    expect(html).toContain("Charts");
    expect(html).toContain("Sessions To Review First");
    expect(html).toContain("Victory Lap Sessions");
    expect(html).toContain("Top Incidents");
    expect(html).toContain("Deterministic Opportunities");
    expect(html).toContain("Compliance Breakdown");
    expect(html).toContain("Inventory");
  });

  it("includes footer note", () => {
    const html = renderHtmlReport(baseSummary, baseMetrics);

    expect(html).toContain("footer-note");
    expect(html).toContain("Incident evidence is redacted");
  });

  it("renders badges when present", () => {
    const summaryWithBadges: SummaryArtifact = {
      ...baseSummary,
      achievementBadges: ["Low-Drama Operator", "Clean Ship"],
    };
    const html = renderHtmlReport(summaryWithBadges, baseMetrics);

    expect(html).toContain("Low-Drama Operator");
    expect(html).toContain("Clean Ship");
    expect(html).not.toContain("No badges earned");
  });

  it("renders brag cards when present", () => {
    const summaryWithBrag: SummaryArtifact = {
      ...baseSummary,
      bragCards: [
        {
          title: "Test Brag",
          value: "100%",
          detail: "Test detail",
          tone: "good",
        },
      ],
    };
    const html = renderHtmlReport(summaryWithBrag, baseMetrics);

    expect(html).toContain("Test Brag");
    expect(html).toContain("100%");
    expect(html).toContain("Test detail");
    expect(html).toContain("tone-good");
  });

  it("renders score cards when present", () => {
    const summaryWithScores: SummaryArtifact = {
      ...baseSummary,
      scoreCards: [
        {
          title: "Proof Score",
          score: 95,
          detail: "Based on verification",
          tone: "good",
        },
      ],
    };
    const html = renderHtmlReport(summaryWithScores, baseMetrics);

    expect(html).toContain("Proof Score");
    expect(html).toContain(">95<");
    expect(html).toContain("/100");
  });

  it("renders top incidents when present", () => {
    const summaryWithIncidents: SummaryArtifact = {
      ...baseSummary,
      topIncidents: [
        {
          incidentId: "inc-1",
          sessionId: "session-1",
          severity: "high",
          confidence: "high",
          turnSpan: 2,
          summary: "Test incident",
          evidencePreview: "Test evidence",
        },
      ],
    };
    const html = renderHtmlReport(summaryWithIncidents, baseMetrics);

    expect(html).toContain("Test incident");
    expect(html).toContain("Test evidence");
    expect(html).toContain("severity-high");
    expect(html).toContain("session-1");
  });

  it("renders top sessions when present", () => {
    const summaryWithSessions: SummaryArtifact = {
      ...baseSummary,
      topSessions: [
        {
          sessionId: "session-1",
          archetype: "verified_delivery",
          archetypeLabel: "Clean Ship",
          frictionScore: 2,
          complianceScore: 100,
          incidentCount: 0,
          labeledTurnCount: 2,
          writeCount: 1,
          verificationPassedCount: 1,
          dominantLabels: ["verification_request"],
          note: "Well executed session",
        },
      ],
    };
    const html = renderHtmlReport(summaryWithSessions, baseMetrics);

    expect(html).toContain("session-1");
    expect(html).toContain("Clean Ship");
    expect(html).toContain("Well executed session");
    expect(html).toContain("verification_request");
  });

  it("renders victory laps when present", () => {
    const summaryWithVictory: SummaryArtifact = {
      ...baseSummary,
      victoryLaps: [
        {
          sessionId: "session-1",
          archetype: "verified_delivery",
          archetypeLabel: "Clean Ship",
          frictionScore: 0,
          complianceScore: 100,
          incidentCount: 0,
          labeledTurnCount: 2,
          writeCount: 1,
          verificationPassedCount: 2,
          dominantLabels: [],
          note: "Perfect session",
        },
      ],
    };
    const html = renderHtmlReport(summaryWithVictory, baseMetrics);

    expect(html).toContain("victory-lap");
    expect(html).toContain("Perfect session");
    expect(html).toContain("2 verifications");
  });

  it("renders opportunities when present", () => {
    const summaryWithOpps: SummaryArtifact = {
      ...baseSummary,
      opportunities: [
        {
          title: "Add more verification",
          rationale: "Verification improves confidence",
        },
      ],
    };
    const html = renderHtmlReport(summaryWithOpps, baseMetrics);

    expect(html).toContain("Add more verification");
    expect(html).toContain("Verification improves confidence");
  });

  it("renders comparative slices table when present", () => {
    const summaryWithSlices: SummaryArtifact = {
      ...baseSummary,
      comparativeSlices: [
        {
          key: "selected_corpus",
          label: "Selected Corpus",
          sessionCount: 10,
          turnCount: 80,
          incidentCount: 5,
          proofScore: 85,
          flowScore: 90,
          disciplineScore: 88,
          writeVerificationRate: 100,
          incidentsPer100Turns: 5,
        },
      ],
    };
    const html = renderHtmlReport(summaryWithSlices, baseMetrics);

    expect(html).toContain("Selected Corpus");
    expect(html).toContain("compliance-table");
  });

  it("renders momentum cards when comparative slices available", () => {
    const summaryWithMomentum: SummaryArtifact = {
      ...baseSummary,
      comparativeSlices: [
        {
          key: "selected_corpus",
          label: "Selected Corpus",
          sessionCount: 10,
          turnCount: 80,
          incidentCount: 5,
          proofScore: 80,
          flowScore: 80,
          disciplineScore: 80,
          writeVerificationRate: 100,
          incidentsPer100Turns: 5,
        },
        {
          key: "recent_100",
          label: "Recent 100",
          sessionCount: 5,
          turnCount: 40,
          incidentCount: 2,
          proofScore: 85,
          flowScore: 82,
          disciplineScore: 83,
          writeVerificationRate: 100,
          incidentsPer100Turns: 3,
        },
      ],
    };
    const html = renderHtmlReport(summaryWithMomentum, baseMetrics);

    expect(html).toContain("Recent Momentum");
    expect(html).toContain("Proof Momentum");
    expect(html).not.toContain("Not enough sessions");
  });
});
