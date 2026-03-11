/**
 * Purpose: Verifies HTML report generation produces valid and safe output.
 * Entrypoint: Executed by Vitest via `pnpm test`.
 * Notes: Tests HTML structure, escaping, and all section renderers.
 */
import { describe, expect, it } from "vitest";

import { renderHtmlReport } from "../src/html-report/index.js";
import type { MetricsRecord, SummaryArtifact } from "../src/schema.js";

const baseCharts = {
  labelChartSvg: '<svg data-chart="labels"></svg>',
  complianceChartSvg: '<svg data-chart="compliance"></svg>',
  severityChartSvg: '<svg data-chart="severity"></svg>',
};

const baseMetrics: MetricsRecord = {
  evaluatorVersion: "0.1.0",
  schemaVersion: "1",
  generatedAt: "2026-03-06T19:00:00.000Z",
  sessionCount: 2,
  turnCount: 8,
  incidentCount: 2,
  parseWarningCount: 0,
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
      provider: "codex",
      turnCount: 4,
      labeledTurnCount: 2,
      incidentCount: 1,
      parseWarningCount: 0,
      writeCount: 1,
      verificationCount: 1,
      verificationPassedCount: 1,
      verificationFailedCount: 0,
      postWriteVerificationAttempted: true,
      postWriteVerificationPassed: true,
      endedVerified: true,
      complianceScore: 100,
      complianceRules: [],
    },
  ],
  inventory: [
    {
      provider: "codex",
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
  parseWarningCount: 0,
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
    sessionsEndingVerified: 1,
    writeSessionVerificationRate: 100,
  },
  topSessions: [],
  verifiedDeliverySpotlights: [],
  topIncidents: [],
  opportunities: [],
  highlightCards: [],
  scoreCards: [],
  recognitions: [],
  comparativeSlices: [],
};

describe("renderHtmlReport", () => {
  it("renders a complete HTML document", () => {
    const html = renderHtmlReport(baseSummary, baseMetrics, baseCharts);

    expect(html).toContain("<!doctype html>");
    expect(html).toContain('<html lang="en">');
    expect(html).toContain("</html>");
    expect(html).toContain("<head>");
    expect(html).toContain("<body>");
  });

  it("includes the report title", () => {
    const html = renderHtmlReport(baseSummary, baseMetrics, baseCharts);

    expect(html).toContain("Transcript Analytics Report");
    expect(html).toContain("<title>Transcript Analytics Report</title>");
  });

  it("includes inline CSS styles", () => {
    const html = renderHtmlReport(baseSummary, baseMetrics, baseCharts);

    expect(html).toContain("<style>");
    expect(html).toContain("--bg:");
    expect(html).toContain("--panel:");
    expect(html).toContain(".metric-card");
  });

  it("displays session and incident counts", () => {
    const html = renderHtmlReport(baseSummary, baseMetrics, baseCharts);

    expect(html).toContain("Sessions");
    expect(html).toContain(">2<");
    expect(html).toContain("Incidents / 100 Turns");
    expect(html).toContain("25");
  });

  it("displays operational rates section", () => {
    const html = renderHtmlReport(baseSummary, baseMetrics, baseCharts);

    expect(html).toContain("Operational Rates");
    expect(html).toContain("Incidents / 100 turns");
    expect(html).toContain("Writes / 100 turns");
    expect(html).toContain("Verification requests / 100 turns");
    expect(html).toContain("Interruptions / 100 turns");
    expect(html).toContain("Reinjections / 100 turns");
    expect(html).toContain("Praise / 100 turns");
  });

  it("inlines chart SVG markup", () => {
    const html = renderHtmlReport(baseSummary, baseMetrics, baseCharts);

    expect(html).toContain('<svg data-chart="labels"></svg>');
    expect(html).toContain('<svg data-chart="severity"></svg>');
    expect(html).toContain('<svg data-chart="compliance"></svg>');
  });

  it("escapes HTML in summary metadata", () => {
    const summaryWithHtml: SummaryArtifact = {
      ...baseSummary,
      evaluatorVersion: "<script>alert(1)</script>",
    };
    const html = renderHtmlReport(summaryWithHtml, baseMetrics, baseCharts);

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("escapes HTML in inventory paths", () => {
    const metricsWithHtml: MetricsRecord = {
      ...baseMetrics,
      inventory: [
        {
          provider: "codex",
          kind: "session_jsonl",
          path: "<img src=x onerror=alert(1)>",
          discovered: true,
          required: true,
          optional: false,
        },
      ],
    };
    const html = renderHtmlReport(baseSummary, metricsWithHtml, baseCharts);

    // Check that the dangerous path is escaped in the inventory section
    expect(html).toContain("<code>&lt;img src=x onerror=alert(1)&gt;</code>");
    expect(html).not.toContain("><img src=x onerror=alert(1)></code>");
  });

  it("shows empty state for badges when none exist", () => {
    const html = renderHtmlReport(baseSummary, baseMetrics, baseCharts);

    expect(html).not.toContain("Badges");
    expect(html).not.toContain("No badges earned");
  });

  it("shows empty state for incidents when none exist", () => {
    const html = renderHtmlReport(baseSummary, baseMetrics, baseCharts);

    expect(html).toContain("Top Incidents");
    expect(html).toContain("No labeled incidents were detected");
  });

  it("shows empty state for sessions when none exist", () => {
    const html = renderHtmlReport(baseSummary, baseMetrics, baseCharts);

    expect(html).toContain("Sessions To Review First");
    expect(html).toContain("No session insights were available");
  });

  it("shows empty state for victory laps when none exist", () => {
    const html = renderHtmlReport(baseSummary, baseMetrics, baseCharts);

    expect(html).not.toContain("Victory Lap Sessions");
    expect(html).not.toContain(
      "No clean verified delivery sessions were available",
    );
  });

  it("shows empty state for opportunities when none exist", () => {
    const html = renderHtmlReport(baseSummary, baseMetrics, baseCharts);

    expect(html).toContain("Deterministic Opportunities");
    expect(html).toContain(
      "No deterministic improvement opportunities were identified",
    );
  });

  it("shows empty state for momentum when not enough data", () => {
    const html = renderHtmlReport(baseSummary, baseMetrics, baseCharts);

    expect(html).toContain("Recent Momentum");
    expect(html).toContain("Not enough sessions in this slice");
  });

  it("includes all major sections", () => {
    const html = renderHtmlReport(baseSummary, baseMetrics, baseCharts);

    expect(html).not.toContain("Show-Off Stats");
    expect(html).toContain("Heuristic Scorecards");
    expect(html).toContain("Recent Momentum");
    expect(html).toContain("Comparative Slices");
    expect(html).toContain("Charts");
    expect(html).toContain("Sessions To Review First");
    expect(html).toContain("Top Incidents");
    expect(html).toContain("Deterministic Opportunities");
    expect(html).toContain("Compliance Breakdown");
    expect(html).toContain("Methodology And Limitations");
    expect(html).toContain("Inventory");
  });

  it("includes footer note", () => {
    const html = renderHtmlReport(baseSummary, baseMetrics, baseCharts);

    expect(html).toContain("footer-note");
    expect(html).toContain("Incident evidence is redacted");
  });

  it("renders badges when present", () => {
    const summaryWithBadges: SummaryArtifact = {
      ...baseSummary,
      recognitions: ["Low-Interruption Corpus", "Verified Delivery"],
    };
    const html = renderHtmlReport(summaryWithBadges, baseMetrics, baseCharts);

    expect(html).not.toContain("Low-Interruption Corpus");
    expect(html).not.toContain("Verified Delivery");
  });

  it("renders brag cards when present", () => {
    const summaryWithBrag: SummaryArtifact = {
      ...baseSummary,
      highlightCards: [
        {
          title: "Test Brag",
          value: "100%",
          detail: "Test detail",
          tone: "good",
        },
      ],
    };
    const html = renderHtmlReport(summaryWithBrag, baseMetrics, baseCharts);

    expect(html).not.toContain("Test Brag");
    expect(html).not.toContain("Test detail");
  });

  it("renders score cards when present", () => {
    const summaryWithScores: SummaryArtifact = {
      ...baseSummary,
      scoreCards: [
        {
          title: "Verification Proxy Score",
          score: 95,
          detail: "Based on verification",
          tone: "good",
        },
      ],
    };
    const html = renderHtmlReport(summaryWithScores, baseMetrics, baseCharts);

    expect(html).toContain("Verification Proxy Score");
    expect(html).toContain(">95<");
    expect(html).toContain("/100");
  });

  it("renders N/A instead of misleading score badges when no writes or applicable rules exist", () => {
    const html = renderHtmlReport(
      {
        ...baseSummary,
        delivery: {
          sessionsWithWrites: 0,
          sessionsEndingVerified: 0,
          writeSessionVerificationRate: 0,
        },
        compliance: baseSummary.compliance.map((rule) => ({
          ...rule,
          passCount: 0,
          failCount: 0,
          notApplicableCount: 1,
        })),
        scoreCards: [
          {
            title: "Verification Proxy Score",
            score: 0,
            detail: "placeholder",
            tone: "danger",
          },
          {
            title: "Workflow Proxy Score",
            score: 0,
            detail: "placeholder",
            tone: "danger",
          },
        ],
      },
      {
        ...baseMetrics,
        sessions: [],
        complianceSummary: baseMetrics.complianceSummary.map((rule) => ({
          ...rule,
          passCount: 0,
          failCount: 0,
          notApplicableCount: 1,
        })),
      },
      baseCharts,
    );

    expect(html).toContain("Terminal Verification");
    expect(html).toContain(">N/A<");
    expect(html).toContain("No write sessions were observed in this slice.");
    expect(html).toContain(
      "No write-related compliance rules were exercised in this slice.",
    );
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
    const html = renderHtmlReport(
      summaryWithIncidents,
      baseMetrics,
      baseCharts,
    );

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
          archetypeLabel: "Verified Delivery",
          frictionScore: 2,
          complianceScore: 100,
          incidentCount: 0,
          labeledTurnCount: 2,
          writeCount: 1,
          verificationPassedCount: 1,
          endedVerified: true,
          dominantLabels: ["verification_request"],
          note: "Well executed session",
        },
      ],
    };
    const html = renderHtmlReport(summaryWithSessions, baseMetrics, baseCharts);

    expect(html).toContain("session-1");
    expect(html).toContain("Verified Delivery");
    expect(html).toContain("Well executed session");
    expect(html).toContain("verification_request");
    expect(html).not.toContain("verified_delivery");
  });

  it("filters inventory noise down to discovered items and missing required inputs", () => {
    const html = renderHtmlReport(
      baseSummary,
      {
        ...baseMetrics,
        inventory: [
          ...baseMetrics.inventory,
          {
            provider: "codex",
            kind: "state_sqlite",
            path: "~/.codex/state_5.sqlite",
            discovered: false,
            required: false,
            optional: true,
          },
        ],
      },
      baseCharts,
    );

    expect(html).toContain("session_jsonl");
    expect(html).not.toContain("state_5.sqlite");
  });

  it("renders victory laps when present", () => {
    const summaryWithVictory: SummaryArtifact = {
      ...baseSummary,
      verifiedDeliverySpotlights: [
        {
          sessionId: "session-1",
          archetype: "verified_delivery",
          archetypeLabel: "Verified Delivery",
          frictionScore: 0,
          complianceScore: 100,
          incidentCount: 0,
          labeledTurnCount: 2,
          writeCount: 1,
          verificationPassedCount: 2,
          endedVerified: true,
          dominantLabels: [],
          note: "Perfect session",
        },
      ],
    };
    const html = renderHtmlReport(summaryWithVictory, baseMetrics, baseCharts);

    expect(html).not.toContain("Perfect session");
    expect(html).not.toContain("2 verifications");
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
    const html = renderHtmlReport(summaryWithOpps, baseMetrics, baseCharts);

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
          verificationProxyScore: 85,
          flowProxyScore: 90,
          workflowProxyScore: 88,
          writeSessionVerificationRate: 100,
          incidentsPer100Turns: 5,
        },
      ],
    };
    const html = renderHtmlReport(summaryWithSlices, baseMetrics, baseCharts);

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
          verificationProxyScore: 80,
          flowProxyScore: 80,
          workflowProxyScore: 80,
          writeSessionVerificationRate: 100,
          incidentsPer100Turns: 5,
        },
        {
          key: "recent_100",
          label: "Recent 100",
          sessionCount: 5,
          turnCount: 40,
          incidentCount: 2,
          verificationProxyScore: 85,
          flowProxyScore: 82,
          workflowProxyScore: 83,
          writeSessionVerificationRate: 100,
          incidentsPer100Turns: 3,
        },
      ],
    };
    const html = renderHtmlReport(summaryWithMomentum, baseMetrics, baseCharts);

    expect(html).toContain("Recent Momentum");
    expect(html).toContain("Verification Proxy Momentum");
    expect(html).not.toContain("Not enough sessions");
  });
});
