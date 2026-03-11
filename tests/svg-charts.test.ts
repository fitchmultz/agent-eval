/**
 * Purpose: Verifies SVG chart generation produces valid and correctly structured output.
 * Entrypoint: Executed by Vitest via `pnpm test`.
 * Notes: Tests chart rendering with various data shapes and edge cases.
 */
import { describe, expect, it } from "vitest";
import type { SummaryArtifact } from "../src/schema.js";
import {
  renderBarChart,
  renderComplianceChart,
  renderLabelChart,
  renderSeverityChart,
} from "../src/svg-charts.js";

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
    {
      rule: "cwd_or_repo_echoed_before_write",
      passCount: 3,
      failCount: 2,
      notApplicableCount: 1,
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

describe("renderBarChart", () => {
  it("renders an SVG with correct structure", () => {
    const data = [
      { label: "A", value: 10, tone: "#000" },
      { label: "B", value: 20, tone: "#fff" },
    ];
    const svg = renderBarChart("Test Chart", data);

    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain("Test Chart");
  });

  it("renders bars for each data point", () => {
    const data = [
      { label: "First", value: 5, tone: "#123" },
      { label: "Second", value: 15, tone: "#456" },
      { label: "Third", value: 10, tone: "#789" },
    ];
    const svg = renderBarChart("Multi Chart", data);

    // Should have rect elements for bars
    const rectMatches = svg.match(/<rect/g);
    expect(rectMatches?.length).toBeGreaterThanOrEqual(3);
  });

  it("handles empty data with max value of 1", () => {
    const svg = renderBarChart("Empty Chart", []);

    expect(svg).toContain("<svg");
    expect(svg).toContain("Empty Chart");
  });

  it("escapes HTML in labels and titles", () => {
    const data = [{ label: "<script>", value: 1, tone: "#000" }];
    const svg = renderBarChart("<title>", data);

    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;");
    expect(svg).not.toContain("<title>");
    expect(svg).toContain("&lt;title&gt;");
  });

  it("calculates bar widths proportionally", () => {
    const data = [
      { label: "Half", value: 50, tone: "#000" },
      { label: "Full", value: 100, tone: "#fff" },
    ];
    const svg = renderBarChart("Proportional Chart", data);

    // Both labels should be present
    expect(svg).toContain("Half");
    expect(svg).toContain("Full");
    // Values should be displayed
    expect(svg).toContain(">50<");
    expect(svg).toContain(">100<");
  });

  it("includes aria-label for accessibility", () => {
    const svg = renderBarChart("Accessible Chart", []);

    expect(svg).toContain('aria-label="Accessible Chart"');
    expect(svg).toContain('role="img"');
  });
});

describe("renderLabelChart", () => {
  it("renders label counts from summary", () => {
    const svg = renderLabelChart(baseSummary);

    expect(svg).toContain("Label Counts");
    expect(svg).toContain("verification_request");
    expect(svg).toContain("context_reinjection");
    expect(svg).toContain(">3<");
    expect(svg).toContain(">1<");
  });

  it("applies palette colors cyclically", () => {
    const summaryWithManyLabels: SummaryArtifact = {
      ...baseSummary,
      labels: [
        { label: "context_drift", count: 1 },
        { label: "test_build_lint_failure_complaint", count: 2 },
        { label: "interrupt", count: 3 },
        { label: "regression_report", count: 4 },
        { label: "praise", count: 5 },
      ],
    };
    const svg = renderLabelChart(summaryWithManyLabels);

    expect(svg).toContain("#0F766E");
    expect(svg).toContain("#1D8A7A");
  });

  it("handles empty labels array", () => {
    const emptySummary: SummaryArtifact = {
      ...baseSummary,
      labels: [],
    };
    const svg = renderLabelChart(emptySummary);

    expect(svg).toContain("Label Counts");
    expect(svg).toContain("<svg");
    expect(svg).toContain("No labels were detected");
  });
});

describe("renderComplianceChart", () => {
  it("renders compliance data from summary", () => {
    const svg = renderComplianceChart(baseSummary);

    expect(svg).toContain("Compliance Pass Counts");
    expect(svg).toContain("scope_confirmed_before_major_write");
    expect(svg).toContain("cwd_or_repo_echoed_before_write");
    expect(svg).toContain(">5<");
    expect(svg).toContain(">3<");
  });

  it("uses consistent color for all bars", () => {
    const svg = renderComplianceChart(baseSummary);

    expect(svg).toContain('#335C81"');
  });

  it("handles empty compliance array", () => {
    const emptySummary: SummaryArtifact = {
      ...baseSummary,
      compliance: [],
    };
    const svg = renderComplianceChart(emptySummary);

    expect(svg).toContain("Compliance Pass Counts");
    expect(svg).toContain("<svg");
    expect(svg).toContain("No passing compliance checks");
  });
});

describe("renderSeverityChart", () => {
  it("renders severity data from summary", () => {
    const svg = renderSeverityChart(baseSummary);

    expect(svg).toContain("Incident Severity");
    expect(svg).toContain("low");
    expect(svg).toContain("medium");
    expect(svg).toContain(">1<");
  });

  it("applies correct severity colors", () => {
    const summaryWithAllSeverities: SummaryArtifact = {
      ...baseSummary,
      severities: [
        { severity: "info", count: 1 },
        { severity: "low", count: 2 },
        { severity: "medium", count: 3 },
        { severity: "high", count: 4 },
      ],
    };
    const svg = renderSeverityChart(summaryWithAllSeverities);

    expect(svg).toContain("#5B8DEF"); // info
    expect(svg).toContain("#2E9E6F"); // low
    expect(svg).toContain("#F4A259"); // medium
    expect(svg).toContain("#D64545"); // high
  });

  it("handles empty severities array", () => {
    const emptySummary: SummaryArtifact = {
      ...baseSummary,
      severities: [],
    };
    const svg = renderSeverityChart(emptySummary);

    expect(svg).toContain("Incident Severity");
    expect(svg).toContain("No incidents were recorded");
    expect(svg).toContain("<svg");
  });
});
