/**
 * Purpose: Verifies derived presentation artifacts stay aligned with canonical metrics and remain safe to publish.
 * Entrypoint: Executed by Vitest via `pnpm test`.
 * Notes: Uses synthetic incidents and metrics so the pretty-output layer stays deterministic and public-safe.
 */
import { describe, expect, it } from "vitest";

import { createPresentationArtifacts } from "../src/presentation.js";
import type { IncidentRecord, MetricsRecord } from "../src/schema.js";

const metrics: MetricsRecord = {
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
    {
      rule: "cwd_or_repo_echoed_before_write",
      passCount: 1,
      failCount: 0,
      notApplicableCount: 1,
      unknownCount: 0,
    },
    {
      rule: "short_plan_before_large_change",
      passCount: 1,
      failCount: 0,
      notApplicableCount: 1,
      unknownCount: 0,
    },
    {
      rule: "verification_after_code_changes",
      passCount: 1,
      failCount: 0,
      notApplicableCount: 1,
      unknownCount: 0,
    },
    {
      rule: "no_unverified_ending",
      passCount: 2,
      failCount: 0,
      notApplicableCount: 0,
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
    {
      sessionId: "session-2",
      turnCount: 4,
      labeledTurnCount: 1,
      incidentCount: 1,
      writeCount: 0,
      verificationCount: 0,
      verificationPassedCount: 0,
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

const incidents: IncidentRecord[] = [
  {
    evaluatorVersion: "0.1.0",
    schemaVersion: "1",
    incidentId: "incident-1",
    sessionId: "session-1",
    turnIds: ["turn-1"],
    turnIndices: [1, 2],
    labels: [
      {
        label: "verification_request",
        severity: "medium",
        confidence: "high",
        rationale: "request",
      },
    ],
    summary: "verification_request across 2 turn(s)",
    evidencePreviews: ["Please verify after the patch."],
    severity: "medium",
    confidence: "high",
    sourceRefs: [{ kind: "session_jsonl", path: "~/.codex/sessions/a.jsonl" }],
  },
  {
    evaluatorVersion: "0.1.0",
    schemaVersion: "1",
    incidentId: "incident-2",
    sessionId: "session-2",
    turnIds: ["turn-4"],
    turnIndices: [3],
    labels: [
      {
        label: "context_reinjection",
        severity: "low",
        confidence: "high",
        rationale: "re-anchor",
      },
    ],
    summary: "context_reinjection across 1 turn(s)",
    evidencePreviews: ["Goals: keep the parser deterministic."],
    severity: "low",
    confidence: "high",
    sourceRefs: [{ kind: "session_jsonl", path: "~/.codex/sessions/b.jsonl" }],
  },
];

describe("createPresentationArtifacts", () => {
  it("builds summary json, html, and svg artifacts from canonical metrics", () => {
    const presentation = createPresentationArtifacts(metrics, incidents);

    expect(presentation.summary.incidents).toBe(2);
    expect(presentation.summary.labels[0]?.label).toBe("verification_request");
    expect(presentation.reportHtml).toContain("Codex Evaluator Report");
    expect(presentation.reportHtml).toContain("label-counts.svg");
    expect(presentation.labelChartSvg).toContain("<svg");
    expect(presentation.complianceChartSvg).toContain("Compliance Pass Counts");
    expect(presentation.severityChartSvg).toContain("Incident Severity");
  });
});
