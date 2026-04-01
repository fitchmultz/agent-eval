/**
 * Purpose: Tests markdown report generation for the operator-first report redesign.
 * Entrypoint: Executed by Vitest via `pnpm test`.
 * Notes: Verifies conclusions-first structure, queue content, and deterministic empty-state behavior.
 */
import { describe, expect, it } from "vitest";
import { renderReport, renderSummaryReport } from "../src/report.js";
import type {
  IncidentRecord,
  MetricsRecord,
  RawTurnRecord,
  SummaryArtifact,
} from "../src/schema.js";

function createMetrics(overrides: Partial<MetricsRecord> = {}): MetricsRecord {
  return {
    engineVersion: "0.1.0",
    schemaVersion: "1",
    generatedAt: "2026-03-06T19:00:00.000Z",
    sessionCount: 2,
    corpusScope: {
      selection: "all_discovered",
      discoveredSessionCount: 2,
      appliedSessionLimit: null,
    },
    turnCount: 10,
    incidentCount: 1,
    parseWarningCount: 0,
    labelCounts: {
      verification_request: 1,
      praise: 2,
    },
    complianceSummary: [
      {
        rule: "verification_after_code_changes",
        passCount: 1,
        failCount: 1,
        notApplicableCount: 0,
        unknownCount: 0,
      },
      {
        rule: "no_unverified_ending",
        passCount: 1,
        failCount: 1,
        notApplicableCount: 0,
        unknownCount: 0,
      },
    ],
    sessions: [
      {
        sessionId: "session-1",
        provider: "codex",
        turnCount: 5,
        labeledTurnCount: 1,
        incidentCount: 1,
        parseWarningCount: 0,
        writeCount: 2,
        verificationCount: 1,
        verificationPassedCount: 0,
        verificationFailedCount: 1,
        postWriteVerificationAttempted: true,
        postWriteVerificationPassed: false,
        endedVerified: false,
        complianceScore: 80,
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
      },
      {
        sessionId: "session-2",
        provider: "codex",
        turnCount: 5,
        labeledTurnCount: 0,
        incidentCount: 0,
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
        path: "/home/user/.codex/sessions",
        discovered: true,
        required: true,
        optional: false,
      },
    ],
    ...overrides,
  };
}

function createRawTurns(): RawTurnRecord[] {
  return [
    {
      engineVersion: "0.1.0",
      schemaVersion: "1",
      sessionId: "session-1",
      turnId: "turn-1",
      turnIndex: 0,
      startedAt: "2026-03-06T19:00:00.000Z",
      cwd: "/workspace/agent-eval",
      userMessageCount: 1,
      assistantMessageCount: 1,
      userMessagePreviews: ["Please fix the login flow and verify the patch."],
      assistantMessagePreviews: [
        "I will inspect the issue and verify the result.",
      ],
      toolCalls: [
        {
          toolName: "apply_patch",
          category: "write",
          commandText: undefined,
          writeLike: true,
          verificationLike: false,
          status: "completed",
        },
      ],
      labels: [
        {
          label: "verification_request",
          family: "cue",
          severity: "low",
          confidence: "high",
          rationale: "User asked for verification",
        },
      ],
      sourceRefs: [
        { provider: "codex", kind: "session_jsonl", path: "/test.jsonl" },
      ],
    },
  ];
}

function createIncidents(): IncidentRecord[] {
  return [
    {
      engineVersion: "0.1.0",
      schemaVersion: "1",
      incidentId: "incident-1",
      sessionId: "session-1",
      turnIds: ["turn-1"],
      turnIndices: [0],
      labels: [
        {
          label: "verification_request",
          family: "cue",
          severity: "low",
          confidence: "high",
          rationale: "User asked for verification",
        },
      ],
      summary: "verification_request across 1 turn(s)",
      evidencePreviews: ["please verify"],
      severity: "low",
      confidence: "high",
      sourceRefs: [
        { provider: "codex", kind: "session_jsonl", path: "/test.jsonl" },
      ],
    },
  ];
}

function createSummary(): SummaryArtifact {
  return {
    engineVersion: "0.1.0",
    schemaVersion: "1",
    generatedAt: "2026-03-06T19:00:00.000Z",
    sessions: 2,
    turns: 10,
    incidents: 1,
    parseWarningCount: 0,
    labels: [{ label: "verification_request", count: 1 }],
    severities: [{ severity: "low", count: 1 }],
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
      incidentsPer100Turns: 10,
      writesPer100Turns: 10,
      verificationRequestsPer100Turns: 10,
      interruptionsPer100Turns: 0,
      reinjectionsPer100Turns: 0,
      praisePer100Turns: 20,
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
        turnCount: 10,
        incidentCount: 1,
        verificationProxyScore: 50,
        flowProxyScore: 90,
        workflowProxyScore: 75,
        writeSessionVerificationRate: 50,
        incidentsPer100Turns: 10,
      },
    ],
    topSessions: [
      {
        sessionId: "session-1",
        sessionShortId: "session-1",
        sessionDisplayLabel: "Fix login flow and verify the patch",
        sessionTimestampLabel: "2026-03-06 19:00Z",
        sessionProjectLabel: "agent-eval",
        archetype: "unverified_delivery",
        archetypeLabel: "Unverified Ending Delivery",
        frictionScore: 8,
        complianceScore: 80,
        incidentCount: 1,
        labeledTurnCount: 1,
        writeCount: 2,
        endedVerified: false,
        verificationPassedCount: 0,
        dominantLabels: ["verification_request"],
        whySelected: [
          "Ended without a passing post-write verification after code changes.",
        ],
        failedRules: [
          "Verification after code changes",
          "No unverified ending",
        ],
        evidencePreviews: ["Please fix the login flow and verify the patch."],
        sourceRefs: [
          { provider: "codex", kind: "session_jsonl", path: "/test.jsonl" },
        ],
        trustFlags: [],
        note: "Code changes were observed without a passing post-write verification after the final write.",
      },
    ],
    topIncidents: [
      {
        incidentId: "incident-1",
        sessionId: "session-1",
        sessionDisplayLabel: "Fix login flow and verify the patch",
        sessionShortId: "session-1",
        summary: "verification_request across 1 turn(s)",
        humanSummary:
          "The user had to ask for verification explicitly across 1 turn.",
        severity: "low",
        confidence: "high",
        turnSpan: 1,
        evidencePreview: "please verify",
        whySelected: ["Classifier confidence is high."],
        sourceRefs: [
          { provider: "codex", kind: "session_jsonl", path: "/test.jsonl" },
        ],
        trustFlags: [],
      },
    ],
    executiveSummary: {
      problem: "Post-change verification is the main delivery gap.",
      change: "Recent-versus-corpus change is not yet scoreable.",
      action: "Inspect the highest-ranked unverified session first.",
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
        rationale:
          "Keep post-write verification as the primary operator action.",
      },
    ],
  };
}

describe("renderReport", () => {
  it("renders the operator-first markdown structure", () => {
    const report = renderReport(
      createMetrics(),
      createIncidents(),
      createRawTurns(),
    );

    expect(report).toContain("# Transcript Analytics Report");
    expect(report).toContain("## Executive Summary");
    expect(report).toContain("## Operator Action Metrics");
    expect(report).toContain("## Sessions To Review First");
    expect(report).toContain("## Compliance Breakdown");
    expect(report).toContain("## Recurring Patterns And Incidents");
  });

  it("includes humane queue labels, why-selected reasons, and incident evidence", () => {
    const report = renderReport(
      createMetrics(),
      createIncidents(),
      createRawTurns(),
    );

    expect(report).toContain("Please fix the login flow and verify the patch.");
    expect(report).toContain("why:");
    expect(report).toContain("failed rules");
    expect(report).toContain("please verify");
  });

  it("ends with the redaction notice", () => {
    const report = renderReport(
      createMetrics(),
      createIncidents(),
      createRawTurns(),
    );

    expect(report).toContain(
      "Incident evidence is redacted and truncated for compact reporting.",
    );
  });
});

describe("renderSummaryReport", () => {
  it("renders directly from a pre-built operator summary artifact", () => {
    const report = renderSummaryReport(createMetrics(), createSummary());

    expect(report).toContain("## Executive Summary");
    expect(report).toContain(
      "Post-change verification is the main delivery gap.",
    );
    expect(report).toContain("## Metric Glossary");
    expect(report).toContain("Verification Proxy Score");
    expect(report).toContain("Fix login flow and verify the patch");
  });

  it("renders deterministic no-data output", () => {
    const metrics = createMetrics({
      sessionCount: 0,
      turnCount: 0,
      incidentCount: 0,
      sessions: [],
      inventory: [],
      complianceSummary: [],
      labelCounts: {},
    });
    const summary = {
      ...createSummary(),
      sessions: 0,
      turns: 0,
      incidents: 0,
      topSessions: [],
      topIncidents: [],
      operatorMetrics: [],
      compliance: [],
      comparativeSlices: [
        {
          key: "selected_corpus",
          label: "Selected Corpus",
          sessionCount: 0,
          turnCount: 0,
          incidentCount: 0,
          verificationProxyScore: null,
          flowProxyScore: null,
          workflowProxyScore: null,
          writeSessionVerificationRate: null,
          incidentsPer100Turns: 0,
        },
      ],
      executiveSummary: {
        problem: "No write sessions were observed.",
        change: "Recent-versus-corpus change is not yet scoreable.",
        action: "Start with inventory review.",
      },
    } satisfies SummaryArtifact;

    const report = renderSummaryReport(metrics, summary);
    expect(report).toContain("## No Data Yet");
    expect(report).toContain("No write sessions were observed.");
    expect(report).toContain("- No session insights were available.");
  });
});
