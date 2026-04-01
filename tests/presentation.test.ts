/**
 * Purpose: Verify reports and presentation outputs stay aligned with the operator-first canonical summary model.
 * Responsibilities: Build a summary once, then assert the markdown and HTML outputs preserve the same triage narrative.
 * Scope: Deterministic presentation contract for the redesigned operator report.
 * Usage: Executed by Vitest via `pnpm test`.
 * Invariants/Assumptions: Synthetic incidents and metrics are enough because these tests exercise pure derived-output functions.
 */
import { describe, expect, it } from "vitest";

import {
  buildSummaryArtifact,
  buildSummaryInputsFromArtifacts,
} from "../src/insights.js";
import { buildPresentationArtifacts } from "../src/presentation.js";
import { renderReport, renderSummaryReport } from "../src/report.js";
import type {
  IncidentRecord,
  MetricsRecord,
  RawTurnRecord,
} from "../src/schema.js";

const metrics: MetricsRecord = {
  engineVersion: "0.1.0",
  schemaVersion: "1",
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
      complianceScore: 80,
      complianceRules: [
        {
          rule: "verification_after_code_changes",
          status: "fail",
          rationale: "missing verification",
        },
      ],
    },
    {
      sessionId: "session-2",
      provider: "codex",
      turnCount: 4,
      labeledTurnCount: 1,
      incidentCount: 1,
      parseWarningCount: 0,
      writeCount: 0,
      verificationCount: 0,
      verificationPassedCount: 0,
      verificationFailedCount: 0,
      postWriteVerificationAttempted: false,
      postWriteVerificationPassed: false,
      endedVerified: false,
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

const incidents: IncidentRecord[] = [
  {
    engineVersion: "0.1.0",
    schemaVersion: "1",
    incidentId: "incident-1",
    sessionId: "session-1",
    turnIds: ["turn-1"],
    turnIndices: [1, 2],
    labels: [
      {
        label: "verification_request",
        family: "cue",
        severity: "medium",
        confidence: "high",
        rationale: "request",
      },
    ],
    summary: "verification_request across 2 turn(s)",
    evidencePreviews: ["Please verify after the patch."],
    severity: "medium",
    confidence: "high",
    sourceRefs: [
      {
        provider: "codex",
        kind: "session_jsonl",
        path: "~/.codex/sessions/a.jsonl",
      },
    ],
  },
];

const rawTurns: RawTurnRecord[] = [
  {
    engineVersion: "0.1.0",
    schemaVersion: "1",
    sessionId: "session-1",
    turnId: "turn-1",
    turnIndex: 0,
    startedAt: "2026-03-06T19:00:00.000Z",
    cwd: "~/Projects/AI/agent-eval",
    userMessageCount: 1,
    assistantMessageCount: 1,
    userMessagePreviews: ["Please verify after the patch."],
    assistantMessagePreviews: ["I will verify the code after writing."],
    toolCalls: [],
    labels: [
      {
        label: "verification_request",
        family: "cue",
        severity: "medium",
        confidence: "high",
        rationale: "request",
      },
    ],
    sourceRefs: [
      {
        provider: "codex",
        kind: "session_jsonl",
        path: "~/.codex/sessions/a.jsonl",
      },
    ],
  },
];

describe("presentation", () => {
  it("builds operator summary fields and queue data from canonical artifacts", () => {
    const summary = buildSummaryArtifact(
      metrics,
      buildSummaryInputsFromArtifacts(rawTurns, incidents),
    );

    expect(summary.executiveSummary?.problem).toContain("verification");
    expect(summary.operatorMetrics?.[0]?.label).toBe("Write Sessions");
    expect(summary.metricGlossary?.[0]?.label).toBe(
      "Write-Session Verification Rate",
    );
    expect(summary.topSessions[0]?.sessionDisplayLabel).toBeDefined();
    expect(summary.topSessions[0]?.whySelected?.length).toBeGreaterThan(0);
    expect(summary.topIncidents[0]?.humanSummary).toContain("verification");
  });

  it("keeps html and markdown aligned around the same triage story", () => {
    const summary = buildSummaryArtifact(
      metrics,
      buildSummaryInputsFromArtifacts(rawTurns, incidents),
    );
    const presentation = buildPresentationArtifacts(metrics, summary);
    const reportFromSummary = renderSummaryReport(metrics, summary);
    const reportFromConvenience = renderReport(metrics, incidents, rawTurns);

    expect(presentation.reportHtml).toContain("Executive Summary");
    expect(presentation.reportHtml).toContain("Sessions To Review First");
    expect(presentation.reportHtml).toContain("Metric glossary and caveats");
    expect(reportFromSummary).toContain("## Executive Summary");
    expect(reportFromSummary).toContain("## Sessions To Review First");
    expect(reportFromConvenience).toContain("## Executive Summary");
    expect(reportFromConvenience).toContain("## Sessions To Review First");
  });
});
