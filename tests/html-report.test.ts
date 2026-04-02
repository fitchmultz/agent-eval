/**
 * Purpose: Verifies operator-first HTML report generation produces valid, safe, queue-oriented output.
 * Entrypoint: Executed by Vitest via `pnpm test`.
 * Notes: Focuses on conclusions-first layout, humane session identity, and static report safety after the report redesign cutover.
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
  engineVersion: "0.1.0",
  schemaVersion: "2",
  generatedAt: "2026-03-06T19:00:00.000Z",
  sessionCount: 2,
  corpusScope: {
    selection: "all_discovered",
    discoveredSessionCount: 2,
    appliedSessionLimit: null,
  },
  turnCount: 8,
  incidentCount: 2,
  parseWarningCount: 0,
  labelCounts: {
    verification_request: 3,
    context_reinjection: 1,
  },
  complianceSummary: [
    {
      rule: "verification_after_code_changes",
      passCount: 1,
      failCount: 1,
      notApplicableCount: 0,
      unknownCount: 0,
    },
  ],
  sessions: [
    {
      sessionId: "123e4567-e89b-12d3-a456-426614174000",
      provider: "codex",
      turnCount: 4,
      labeledTurnCount: 2,
      incidentCount: 1,
      parseWarningCount: 0,
      writeCount: 1,
      verificationCount: 1,
      verificationPassedCount: 0,
      verificationFailedCount: 1,
      postWriteVerificationAttempted: true,
      postWriteVerificationPassed: false,
      endedVerified: false,
      complianceScore: 60,
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
  engineVersion: "0.1.0",
  schemaVersion: "2",
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
      rule: "verification_after_code_changes",
      passCount: 1,
      failCount: 1,
      notApplicableCount: 0,
      unknownCount: 0,
      passRate: 50,
      affectedSessionCount: 2,
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
    sessionsWithWrites: 2,
    sessionsEndingVerified: 1,
    writeSessionVerificationRate: 50,
  },
  comparativeSlices: [
    {
      key: "selected_corpus",
      label: "Selected Corpus",
      sessionCount: 2,
      turnCount: 8,
      incidentCount: 2,
      verificationProxyScore: 50,
      flowProxyScore: 80,
      workflowProxyScore: 70,
      writeSessionVerificationRate: 50,
      incidentsPer100Turns: 25,
    },
    {
      key: "recent_100",
      label: "Recent 100",
      sessionCount: 2,
      turnCount: 8,
      incidentCount: 1,
      verificationProxyScore: 60,
      flowProxyScore: 82,
      workflowProxyScore: 75,
      writeSessionVerificationRate: 60,
      incidentsPer100Turns: 12.5,
    },
  ],
  topSessions: [
    {
      sessionId: "123e4567-e89b-12d3-a456-426614174000",
      sessionShortId: "4174000",
      sessionDisplayLabel: "Fix login regression and verify the build",
      sessionTimestampLabel: "2026-03-06 19:00Z",
      sessionProjectLabel: "agent-eval",
      archetype: "unverified_delivery",
      archetypeLabel: "Unverified Ending Delivery",
      frictionScore: 8,
      complianceScore: 60,
      incidentCount: 1,
      labeledTurnCount: 2,
      writeCount: 1,
      endedVerified: false,
      verificationPassedCount: 0,
      dominantLabels: ["verification_request"],
      whySelected: [
        "Ended without a passing post-write verification after code changes.",
      ],
      failedRules: ["Verification after code changes"],
      evidencePreviews: [
        "Please fix login and verify the patch before you finish.",
      ],
      titleSource: "user",
      titleConfidence: "strong",
      evidenceSource: "user",
      evidenceConfidence: "strong",
      evidenceIssues: [],
      sourceRefs: [
        {
          provider: "codex",
          kind: "session_jsonl",
          path: "~/.codex/sessions/a.jsonl",
        },
      ],
      trustFlags: [],
      note: "Code changes were observed without a passing post-write verification after the final write.",
    },
  ],
  topIncidents: [
    {
      incidentId: "incident-1",
      sessionId: "123e4567-e89b-12d3-a456-426614174000",
      sessionDisplayLabel: "Fix login regression and verify the build",
      sessionShortId: "4174000",
      summary: "verification_request across 2 turn(s)",
      humanSummary:
        "The user had to ask for verification explicitly across 2 turns.",
      severity: "medium",
      confidence: "high",
      turnSpan: 2,
      evidencePreview: "Please verify after the patch.",
      whySelected: ["Medium-severity incident signal worth review."],
      sourceRefs: [
        {
          provider: "codex",
          kind: "session_jsonl",
          path: "~/.codex/sessions/a.jsonl",
        },
      ],
      trustFlags: [],
    },
  ],
  executiveSummary: {
    problem:
      "Post-change verification is the main delivery gap in this corpus.",
    change: "Recent sessions improved slightly on verification discipline.",
    action: "Inspect the highest-ranked unverified write session first.",
  },
  operatorMetrics: [
    {
      label: "Ended Unverified",
      value: "1",
      detail:
        "50% of write sessions ended without a passing post-write verification signal.",
      tone: "danger",
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
  opportunities: [
    {
      title: "Block unverified deliveries",
      rationale: "Keep post-write verification as the primary operator action.",
    },
  ],
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

  it("renders the operator-first section order", () => {
    const html = renderHtmlReport(baseSummary, baseMetrics, baseCharts);

    expect(html).toContain("Executive Summary");
    expect(html).toContain("Operator Action Metrics");
    expect(html).toContain("Sessions To Review First");
    expect(html).toContain("Compliance Breakdown");
    expect(html).toContain("Comparative Slices");
    expect(html).toContain("Recurring Patterns And Incidents");
    expect(html).toContain('href="#sessions-to-review"');
    expect(html).toContain('href="#session-14174000"');
    expect(html.indexOf("Executive Summary")).toBeLessThan(
      html.indexOf("Sessions To Review First"),
    );
  });

  it("renders humane queue labels instead of raw uuid-only titles", () => {
    const html = renderHtmlReport(baseSummary, baseMetrics, baseCharts);

    expect(html).toContain("Fix login regression and verify the build");
    expect(html).toContain("Why selected");
    expect(html).toContain("Failed rules");
    expect(html).toContain("Strongest evidence preview");
    expect(html).not.toContain(">123e4567-e89b-12d3-a456-426614174000<");
  });

  it("escapes HTML in summary metadata and inventory paths", () => {
    const html = renderHtmlReport(
      {
        ...baseSummary,
        engineVersion: "<script>alert(1)</script>",
      },
      {
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
      },
      baseCharts,
    );

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("<code>&lt;img src=x onerror=alert(1)&gt;</code>");
  });

  it("renders glossary and report metadata disclosure blocks", () => {
    const html = renderHtmlReport(baseSummary, baseMetrics, baseCharts);

    expect(html).toContain("Metric glossary and caveats");
    expect(html).toContain("Verification Proxy Score");
    expect(html).toContain("Report metadata");
    expect(html).toContain("Engine");
  });

  it("renders a deterministic no-data surface for empty corpora", () => {
    const html = renderHtmlReport(
      {
        ...baseSummary,
        sessions: 0,
        turns: 0,
        incidents: 0,
        topSessions: [],
        topIncidents: [],
        operatorMetrics: [],
      },
      {
        ...baseMetrics,
        sessionCount: 0,
        turnCount: 0,
        incidentCount: 0,
        sessions: [],
        inventory: [
          {
            provider: "codex",
            kind: "session_jsonl",
            path: "~/.codex/sessions",
            discovered: false,
            required: true,
            optional: false,
          },
        ],
      },
      baseCharts,
    );

    expect(html).toContain("No Data Yet");
    expect(html).toContain("missing canonical input");
    expect(html).not.toContain("Recurring Patterns And Incidents");
  });
});
