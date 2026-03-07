/**
 * Purpose: Verifies derived presentation artifacts stay aligned with canonical metrics and remain safe to publish.
 * Entrypoint: Executed by Vitest via `pnpm test`.
 * Notes: Uses synthetic incidents and metrics so the pretty-output layer stays deterministic and public-safe.
 */
import { describe, expect, it } from "vitest";

import { createPresentationArtifacts } from "../src/presentation.js";
import { renderReport } from "../src/report.js";
import type {
  IncidentRecord,
  MetricsRecord,
  RawTurnRecord,
} from "../src/schema.js";

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

const rawTurns: RawTurnRecord[] = [
  {
    evaluatorVersion: "0.1.0",
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
        severity: "medium",
        confidence: "high",
        rationale: "request",
      },
    ],
    sourceRefs: [{ kind: "session_jsonl", path: "~/.codex/sessions/a.jsonl" }],
  },
  {
    evaluatorVersion: "0.1.0",
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
        severity: "low",
        confidence: "high",
        rationale: "re-anchor",
      },
    ],
    sourceRefs: [{ kind: "session_jsonl", path: "~/.codex/sessions/b.jsonl" }],
  },
];

describe("createPresentationArtifacts", () => {
  it("builds summary json, html, and svg artifacts from canonical metrics", () => {
    const presentation = createPresentationArtifacts(
      metrics,
      incidents,
      rawTurns,
    );

    expect(presentation.summary.incidents).toBe(2);
    expect(presentation.summary.labels[0]?.label).toBe("verification_request");
    expect(presentation.summary.topSessions[0]?.archetype).toBe(
      "verified_delivery",
    );
    expect(presentation.summary.topSessions[0]?.archetypeLabel).toBe(
      "Clean Ship",
    );
    expect(presentation.summary.rates.verificationRequestsPer100Turns).toBe(
      37.5,
    );
    expect(presentation.summary.bragCards[0]?.title).toBe("Proof-Backed Ships");
    expect(presentation.summary.comparativeSlices[0]?.label).toBe(
      "Selected Corpus",
    );
    expect(presentation.summary.scoreCards[0]?.title).toBe("Proof Score");
    expect(presentation.summary.scoreCards[0]?.score).toBe(100);
    expect(presentation.summary.achievementBadges).toContain(
      "Low-Drama Operator",
    );
    expect(presentation.summary.victoryLaps[0]?.sessionId).toBe("session-1");
    expect(presentation.summary.opportunities[0]?.title).toContain(
      "verification",
    );
    expect(presentation.summary.topIncidents[0]?.turnSpan).toBe(2);
    expect(presentation.reportHtml).toContain("Codex Evaluator Report");
    expect(presentation.reportHtml).toContain("label-counts.svg");
    expect(presentation.reportHtml).toContain("Sessions To Review First");
    expect(presentation.reportHtml).toContain("Shareable Scoreboard");
    expect(presentation.reportHtml).toContain("Recent Momentum");
    expect(presentation.reportHtml).toContain("Comparative Slices");
    expect(presentation.reportHtml).toContain("Victory Lap Sessions");
    expect(presentation.labelChartSvg).toContain("<svg");
    expect(presentation.complianceChartSvg).toContain("Compliance Pass Counts");
    expect(presentation.severityChartSvg).toContain("Incident Severity");
  });

  it("keeps the markdown report aligned with the deterministic summary model", () => {
    const markdown = renderReport(metrics, incidents, rawTurns);

    expect(markdown).toContain("## Headline Insights");
    expect(markdown).toContain("## Show-Off Stats");
    expect(markdown).toContain("## Shareable Scoreboard");
    expect(markdown).toContain("## Recent Momentum");
    expect(markdown).toContain("## Badges");
    expect(markdown).toContain("## Comparative Slices");
    expect(markdown).toContain("## Sessions To Review First");
    expect(markdown).toContain("## Victory Lap Sessions");
    expect(markdown).toContain("## Deterministic Opportunities");
    expect(markdown).toContain("Clean Ship");
  });
});
