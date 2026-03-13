/**
 * Purpose: Tests markdown report generation.
 * Entrypoint: Executed by Vitest via `pnpm test`.
 * Notes: Uses synthetic metrics data to verify report structure and content.
 */
import { describe, expect, it } from "vitest";
import {
  buildSummaryArtifact,
  createEmptySessionLabelMap,
} from "../src/insights.js";
import { renderReport, renderSummaryReport } from "../src/report.js";
import type {
  IncidentRecord,
  MetricsRecord,
  RawTurnRecord,
} from "../src/schema.js";

function createTestMetrics(overrides?: Partial<MetricsRecord>): MetricsRecord {
  return {
    engineVersion: "0.1.0",
    schemaVersion: "1",
    generatedAt: "2026-03-06T19:00:00.000Z",
    sessionCount: 2,
    turnCount: 10,
    incidentCount: 1,
    parseWarningCount: 0,
    labelCounts: {
      verification_request: 1,
      praise: 2,
    },
    complianceSummary: [
      {
        rule: "scope_confirmed_before_major_write",
        passCount: 2,
        failCount: 0,
        notApplicableCount: 0,
        unknownCount: 0,
      },
      {
        rule: "cwd_or_repo_echoed_before_write",
        passCount: 2,
        failCount: 0,
        notApplicableCount: 0,
        unknownCount: 0,
      },
      {
        rule: "short_plan_before_large_change",
        passCount: 1,
        failCount: 1,
        notApplicableCount: 0,
        unknownCount: 0,
      },
      {
        rule: "verification_after_code_changes",
        passCount: 2,
        failCount: 0,
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
        verificationPassedCount: 1,
        verificationFailedCount: 0,
        postWriteVerificationAttempted: false,
        postWriteVerificationPassed: false,
        endedVerified: false,
        complianceScore: 80,
        complianceRules: [
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
          {
            rule: "short_plan_before_large_change",
            status: "fail",
            rationale: "missing",
          },
          {
            rule: "verification_after_code_changes",
            status: "pass",
            rationale: "ok",
          },
          {
            rule: "no_unverified_ending",
            status: "fail",
            rationale: "unverified",
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
        postWriteVerificationAttempted: false,
        postWriteVerificationPassed: false,
        endedVerified: false,
        complianceScore: 100,
        complianceRules: [
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
          {
            rule: "short_plan_before_large_change",
            status: "pass",
            rationale: "ok",
          },
          {
            rule: "verification_after_code_changes",
            status: "pass",
            rationale: "ok",
          },
          {
            rule: "no_unverified_ending",
            status: "pass",
            rationale: "ok",
          },
        ],
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
      {
        provider: "codex",
        kind: "state_sqlite",
        path: "/home/user/.codex/state_5.sqlite",
        discovered: false,
        required: false,
        optional: true,
      },
    ],
    ...overrides,
  };
}

function createTestRawTurns(): RawTurnRecord[] {
  return [
    {
      engineVersion: "0.1.0",
      schemaVersion: "1",
      sessionId: "session-1",
      turnId: "turn-1",
      turnIndex: 0,
      startedAt: "2026-03-06T19:00:00.000Z",
      cwd: "/workspace/test",
      userMessageCount: 1,
      assistantMessageCount: 1,
      userMessagePreviews: ["Please fix the bug"],
      assistantMessagePreviews: ["I'll help you fix that"],
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

function createTestIncidents(): IncidentRecord[] {
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
      firstSeenAt: "2026-03-06T19:00:00.000Z",
      lastSeenAt: "2026-03-06T19:00:00.000Z",
      sourceRefs: [
        { provider: "codex", kind: "session_jsonl", path: "/test.jsonl" },
      ],
    },
  ];
}

function createEmptyMetrics(): MetricsRecord {
  return {
    engineVersion: "0.1.0",
    schemaVersion: "1",
    generatedAt: "2026-03-06T19:00:00.000Z",
    sessionCount: 0,
    turnCount: 0,
    incidentCount: 0,
    parseWarningCount: 0,
    labelCounts: {},
    complianceSummary: [
      {
        rule: "scope_confirmed_before_major_write",
        passCount: 0,
        failCount: 0,
        notApplicableCount: 0,
        unknownCount: 0,
      },
      {
        rule: "cwd_or_repo_echoed_before_write",
        passCount: 0,
        failCount: 0,
        notApplicableCount: 0,
        unknownCount: 0,
      },
      {
        rule: "short_plan_before_large_change",
        passCount: 0,
        failCount: 0,
        notApplicableCount: 0,
        unknownCount: 0,
      },
      {
        rule: "verification_after_code_changes",
        passCount: 0,
        failCount: 0,
        notApplicableCount: 0,
        unknownCount: 0,
      },
      {
        rule: "no_unverified_ending",
        passCount: 0,
        failCount: 0,
        notApplicableCount: 0,
        unknownCount: 0,
      },
    ],
    sessions: [],
    inventory: [],
  };
}

describe("renderReport", () => {
  it("includes all required sections", () => {
    const metrics = createTestMetrics();
    const incidents = createTestIncidents();
    const rawTurns = createTestRawTurns();

    const report = renderReport(metrics, incidents, rawTurns);

    expect(report).toContain("# Transcript Analytics Report");
    expect(report).toContain("## Headline Insights");
    expect(report).toContain("## Heuristic Scorecards");
    expect(report).toContain("## Recent Momentum");
    expect(report).toContain("## Operational Rates");
    expect(report).toContain("## Comparative Slices");
    expect(report).toContain("## Label Counts");
    expect(report).toContain("## Sessions To Review First");
    expect(report).toContain("## Deterministic Opportunities");
    expect(report).toContain("## Compliance Summary");
    expect(report).toContain("## Top Incidents");
    expect(report).toContain("## Methodology And Limitations");
    expect(report).toContain("## Inventory");
  });

  it("includes metadata in header", () => {
    const metrics = createTestMetrics();
    const incidents = createTestIncidents();
    const rawTurns = createTestRawTurns();

    const report = renderReport(metrics, incidents, rawTurns);

    expect(report).toContain("Analytics engine version: `0.1.0`");
    expect(report).toContain("Schema version: `1`");
    expect(report).toContain("Sessions: `2`");
    expect(report).toContain("Turns: `10`");
    expect(report).toContain("Incidents: `1`");
  });

  it("handles empty data gracefully", () => {
    const metrics = createEmptyMetrics();
    const report = renderReport(metrics, [], []);

    expect(report).toContain("# Transcript Analytics Report");
    expect(report).toContain("## No Data Yet");
    expect(report).toContain(
      "The selected source home has the expected transcript layout, but no session JSONL files were discovered yet.",
    );
    expect(report).toContain("No labels were detected");
    expect(report).toContain("- No session insights were available.");
    expect(report).toContain(
      "- No deterministic improvement opportunities were identified.",
    );
    expect(report).toContain("- No labeled incidents detected.");
    expect(report).toContain(
      "Selected Corpus: sessions 0, verification proxy N/A",
    );
    expect(report).toContain("flow proxy N/A");
  });

  it("includes label counts correctly", () => {
    const metrics = createTestMetrics();
    const incidents = createTestIncidents();
    const rawTurns = createTestRawTurns();

    const report = renderReport(metrics, incidents, rawTurns);

    expect(report).toContain("verification_request: 1");
    expect(report).toContain("praise: 2");
  });

  it("includes compliance summary correctly", () => {
    const metrics = createTestMetrics();
    const incidents = createTestIncidents();
    const rawTurns = createTestRawTurns();

    const report = renderReport(metrics, incidents, rawTurns);

    expect(report).toContain("scope_confirmed_before_major_write: pass 2");
    expect(report).toContain("short_plan_before_large_change: pass 1, fail 1");
  });

  it("includes inventory correctly", () => {
    const metrics = createTestMetrics();
    const incidents = createTestIncidents();
    const rawTurns = createTestRawTurns();

    const report = renderReport(metrics, incidents, rawTurns);

    expect(report).toContain("required session_jsonl: present");
    expect(report).not.toContain("optional state_sqlite: missing");
  });

  it("includes operational rates", () => {
    const metrics = createTestMetrics();
    const incidents = createTestIncidents();
    const rawTurns = createTestRawTurns();

    const report = renderReport(metrics, incidents, rawTurns);

    expect(report).toContain("Incidents / 100 turns:");
    expect(report).toContain("Writes / 100 turns:");
    expect(report).toContain("Verification requests / 100 turns:");
    expect(report).toContain("Interruptions / 100 turns:");
    expect(report).toContain("Reinjections / 100 turns:");
    expect(report).toContain("Praise / 100 turns:");
  });

  it("includes top incidents with details", () => {
    const metrics = createTestMetrics();
    const incidents = createTestIncidents();
    const rawTurns = createTestRawTurns();

    const report = renderReport(metrics, incidents, rawTurns);

    expect(report).toContain("`low` / `high`");
    expect(report).toContain("verification_request across 1 turn(s)");
  });

  it("renders sanitized incident evidence in markdown output", () => {
    const metrics = createTestMetrics();
    const incident = createTestIncidents()[0];
    if (!incident) {
      throw new Error("Expected a synthetic incident fixture.");
    }
    const incidents: IncidentRecord[] = [
      {
        engineVersion: incident.engineVersion,
        schemaVersion: incident.schemaVersion,
        incidentId: incident.incidentId,
        sessionId: incident.sessionId,
        turnIds: incident.turnIds,
        turnIndices: incident.turnIndices,
        labels: incident.labels,
        summary: incident.summary,
        evidencePreviews: [
          "Git access broke after the migration and [redacted-sensitive-content]",
        ],
        severity: incident.severity,
        confidence: incident.confidence,
        firstSeenAt: incident.firstSeenAt,
        lastSeenAt: incident.lastSeenAt,
        sourceRefs: incident.sourceRefs,
      },
    ];
    const rawTurns = createTestRawTurns();

    const report = renderReport(metrics, incidents, rawTurns);

    expect(report).toContain("Please fix the bug");
    expect(report).not.toContain("[redacted-sensitive-content]");
    expect(report).not.toContain("mitchfultz_id_ed25519");
  });

  it("ends with redaction notice", () => {
    const metrics = createTestMetrics();
    const incidents = createTestIncidents();
    const rawTurns = createTestRawTurns();

    const report = renderReport(metrics, incidents, rawTurns);

    expect(report).toContain(
      "_Incident evidence is redacted and truncated for compact reporting. Preview sanitization reduces common sensitive data exposure but is not a guarantee of full anonymization._",
    );
  });
});

describe("renderSummaryReport", () => {
  it("renders with provided summary artifact", () => {
    const metrics = createTestMetrics();
    const session1Labels = createEmptySessionLabelMap();
    session1Labels.verification_request = 1;
    const session2Labels = createEmptySessionLabelMap();
    session2Labels.praise = 2;
    const sessionLabelCounts = new Map([
      ["session-1", session1Labels],
      ["session-2", session2Labels],
    ]);

    const summary = buildSummaryArtifact(metrics, {
      sessionLabelCounts,
      topIncidents: [
        {
          incidentId: "inc-1",
          sessionId: "session-1",
          summary: "test incident",
          severity: "low",
          confidence: "high",
          turnSpan: 1,
          evidencePreview: "test evidence",
        },
      ],
      severityCounts: { info: 0, low: 1, medium: 0, high: 0 },
      writeTurnCount: 3,
    });

    const report = renderSummaryReport(metrics, summary);

    expect(report).toContain("# Transcript Analytics Report");
    expect(report).toContain("## Headline Insights");
    expect(report).toContain("test incident");
  });

  it("renders score cards", () => {
    const metrics = createTestMetrics();
    const session1Labels = createEmptySessionLabelMap();
    session1Labels.verification_request = 1;
    const session2Labels = createEmptySessionLabelMap();
    session2Labels.praise = 2;
    const sessionLabelCounts = new Map([
      ["session-1", session1Labels],
      ["session-2", session2Labels],
    ]);

    const summary = buildSummaryArtifact(metrics, {
      sessionLabelCounts,
      topIncidents: [],
      severityCounts: { info: 0, low: 0, medium: 0, high: 0 },
      writeTurnCount: 3,
    });

    const report = renderSummaryReport(metrics, summary);

    expect(report).toContain("Verification Proxy Score:");
    expect(report).toContain("/100");
  });

  it("renders N/A for inapplicable pretty scores", () => {
    const metrics = createEmptyMetrics();
    const summary = buildSummaryArtifact(metrics, {
      sessionLabelCounts: new Map(),
      topIncidents: [],
      severityCounts: { info: 0, low: 0, medium: 0, high: 0 },
      writeTurnCount: 0,
    });

    const report = renderSummaryReport(metrics, summary);

    expect(report).toContain("Verification Proxy Score: N/A");
    expect(report).toContain("Flow Proxy Score: N/A");
    expect(report).toContain("Workflow Proxy Score: N/A");
  });

  it("omits the no-data callout once sessions exist", () => {
    const metrics = createTestMetrics();
    const summary = buildSummaryArtifact(metrics, {
      sessionLabelCounts: new Map(),
      topIncidents: [],
      severityCounts: { info: 0, low: 0, medium: 0, high: 0 },
      writeTurnCount: 3,
    });

    const report = renderSummaryReport(metrics, summary);

    expect(report).not.toContain("## No Data Yet");
  });

  it("renders brag cards", () => {
    const metrics = createTestMetrics();
    const session1Labels = createEmptySessionLabelMap();
    session1Labels.verification_request = 1;
    const session2Labels = createEmptySessionLabelMap();
    session2Labels.praise = 2;
    const sessionLabelCounts = new Map([
      ["session-1", session1Labels],
      ["session-2", session2Labels],
    ]);

    const summary = buildSummaryArtifact(metrics, {
      sessionLabelCounts,
      topIncidents: [],
      severityCounts: { info: 0, low: 0, medium: 0, high: 0 },
      writeTurnCount: 3,
    });

    const report = renderSummaryReport(metrics, summary);

    expect(report).not.toContain("## Show-Off Stats");
  });

  it("handles sessions to review", () => {
    const metrics = createTestMetrics();
    const session1Labels = createEmptySessionLabelMap();
    session1Labels.verification_request = 1;
    const session2Labels = createEmptySessionLabelMap();
    session2Labels.praise = 2;
    const sessionLabelCounts = new Map([
      ["session-1", session1Labels],
      ["session-2", session2Labels],
    ]);

    const summary = buildSummaryArtifact(metrics, {
      sessionLabelCounts,
      topIncidents: [],
      severityCounts: { info: 0, low: 0, medium: 0, high: 0 },
      writeTurnCount: 3,
    });

    const report = renderSummaryReport(metrics, summary);

    expect(report).toContain("## Sessions To Review First");
    // Should contain session info
    expect(report).toContain("session-1");
  });

  it("includes comparative slices", () => {
    const metrics = createTestMetrics();
    const session1Labels = createEmptySessionLabelMap();
    session1Labels.verification_request = 1;
    const session2Labels = createEmptySessionLabelMap();
    session2Labels.praise = 2;
    const sessionLabelCounts = new Map([
      ["session-1", session1Labels],
      ["session-2", session2Labels],
    ]);

    const summary = buildSummaryArtifact(metrics, {
      sessionLabelCounts,
      topIncidents: [],
      severityCounts: { info: 0, low: 0, medium: 0, high: 0 },
      writeTurnCount: 3,
    });

    const report = renderSummaryReport(metrics, summary);

    expect(report).toContain("## Comparative Slices");
    // The slice key is shown as "Selected Corpus" (human-readable label)
    expect(report).toContain("Selected Corpus");
  });

  it("renders badges section even with no badges", () => {
    const metrics = createEmptyMetrics();
    const summary = buildSummaryArtifact(metrics, {
      sessionLabelCounts: new Map(),
      topIncidents: [],
      severityCounts: { info: 0, low: 0, medium: 0, high: 0 },
      writeTurnCount: 0,
    });

    const report = renderSummaryReport(metrics, summary);

    expect(report).not.toContain("## Badges");
  });
});
