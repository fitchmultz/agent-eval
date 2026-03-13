/**
 * Purpose: Verify reports and presentation outputs are derived from one canonical summary model.
 * Responsibilities: Build a summary once, then assert the markdown, HTML, and SVG outputs stay aligned with it.
 * Scope: Deterministic presentation contract for public-facing redaction evaluator outputs.
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
  {
    engineVersion: "0.1.0",
    schemaVersion: "1",
    incidentId: "incident-2",
    sessionId: "session-2",
    turnIds: ["turn-4"],
    turnIndices: [3],
    labels: [
      {
        label: "context_reinjection",
        family: "cue",
        severity: "low",
        confidence: "high",
        rationale: "re-anchor",
      },
    ],
    summary: "context_reinjection across 1 turn(s)",
    evidencePreviews: ["Goals: keep the parser deterministic."],
    severity: "low",
    confidence: "high",
    sourceRefs: [
      {
        provider: "codex",
        kind: "session_jsonl",
        path: "~/.codex/sessions/b.jsonl",
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
  {
    engineVersion: "0.1.0",
    schemaVersion: "1",
    sessionId: "session-2",
    turnId: "turn-2",
    turnIndex: 1,
    userMessageCount: 1,
    assistantMessageCount: 0,
    userMessagePreviews: ["Goals: keep the parser deterministic."],
    assistantMessagePreviews: [],
    toolCalls: [],
    labels: [
      {
        label: "context_reinjection",
        family: "cue",
        severity: "low",
        confidence: "high",
        rationale: "re-anchor",
      },
    ],
    sourceRefs: [
      {
        provider: "codex",
        kind: "session_jsonl",
        path: "~/.codex/sessions/b.jsonl",
      },
    ],
  },
];

describe("presentation", () => {
  it("builds html and svg artifacts from a pre-built canonical summary", () => {
    const summary = buildSummaryArtifact(
      metrics,
      buildSummaryInputsFromArtifacts(rawTurns, incidents),
    );
    const presentation = buildPresentationArtifacts(metrics, summary);

    expect(summary.incidents).toBe(2);
    expect(summary.labels[0]?.label).toBe("verification_request");
    expect(summary.topSessions[0]?.archetype).toBe("verified_delivery");
    expect(summary.topSessions[0]?.archetypeLabel).toBe(
      "Ended-Verified Delivery",
    );
    expect(summary.rates.verificationRequestsPer100Turns).toBe(37.5);
    expect(summary.highlightCards[0]?.title).toBe("Ended-Verified Deliveries");
    expect(summary.comparativeSlices[0]?.label).toBe("Selected Corpus");
    expect(summary.scoreCards[0]?.title).toBe("Verification Proxy Score");
    expect(summary.scoreCards[0]?.score).toBe(100);
    expect(summary.recognitions).toContain("Low-Interruption Corpus");
    expect(summary.endedVerifiedDeliverySpotlights[0]?.sessionId).toBe(
      "session-1",
    );
    expect(summary.opportunities[0]?.title).toContain("verification");
    expect(summary.topIncidents[0]?.turnSpan).toBe(2);
    expect(presentation.reportHtml).toContain("Transcript Analytics Report");
    expect(presentation.reportHtml).toContain("<svg");
    expect(presentation.reportHtml).toContain("./favicon.ico");
    expect(presentation.reportHtml).toContain("Sessions To Review First");
    expect(presentation.reportHtml).toContain("Heuristic Scorecards");
    expect(presentation.reportHtml).toContain("Recent Momentum");
    expect(presentation.reportHtml).toContain("Comparative Slices");
    expect(presentation.reportHtml).not.toContain("Victory Lap Sessions");
    expect(presentation.faviconIco).toBeInstanceOf(Uint8Array);
    expect(presentation.faviconIco.byteLength).toBeGreaterThan(0);
    expect(presentation.labelChartSvg).toContain("<svg");
    expect(presentation.complianceChartSvg).toContain("Compliance Pass Counts");
    expect(presentation.severityChartSvg).toContain("Incident Severity");
  });

  it("keeps markdown rendering aligned for both summary-first and convenience entrypoints", () => {
    const summary = buildSummaryArtifact(
      metrics,
      buildSummaryInputsFromArtifacts(rawTurns, incidents),
    );
    const canonicalMarkdown = renderSummaryReport(metrics, summary);
    const convenienceMarkdown = renderReport(metrics, incidents, rawTurns);

    expect(canonicalMarkdown).toBe(convenienceMarkdown);
    expect(canonicalMarkdown).toContain("## Headline Insights");
    expect(canonicalMarkdown).toContain("## Heuristic Scorecards");
    expect(canonicalMarkdown).toContain("## Recent Momentum");
    expect(canonicalMarkdown).toContain("## Comparative Slices");
    expect(canonicalMarkdown).toContain("## Sessions To Review First");
    expect(canonicalMarkdown).toContain("## Deterministic Opportunities");
    expect(canonicalMarkdown).toContain("## Methodology And Limitations");
    expect(canonicalMarkdown).not.toContain("## Show-Off Stats");
    expect(canonicalMarkdown).not.toContain("## Badges");
    expect(canonicalMarkdown).not.toContain("## Victory Lap Sessions");
    expect(canonicalMarkdown).toContain("Ended-Verified Delivery");
  });

  it("omits top-incident cards whose best preview remains low-signal or unsafe", () => {
    const summary = buildSummaryArtifact(
      metrics,
      buildSummaryInputsFromArtifacts(
        [
          {
            ...rawTurns[0]!,
            sessionId: "session-low-signal",
            turnId: "turn-low-signal",
            turnIndex: 10,
            userMessagePreviews: [
              "- Missing/blocked: If a named skill isn't in the list or the path can't be read, say so briefly and continue with the best fallback.",
            ],
          },
        ],
        [
          {
            ...incidents[0]!,
            sessionId: "session-low-signal",
            incidentId: "incident-low-signal",
            turnIds: ["turn-low-signal"],
            turnIndices: [10],
            evidencePreviews: [
              "Checking the actual key state now. If the encrypted artifacts are usable, I'll restore ~/.ssh immediately.",
            ],
          },
        ],
      ),
    );

    expect(summary.topIncidents).toEqual([]);
  });
});
