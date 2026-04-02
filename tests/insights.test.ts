/**
 * Purpose: Verifies summary artifact generation stays deterministic after the operator-first report redesign.
 * Entrypoint: Executed by Vitest via `pnpm test`.
 * Notes: Focuses on enriched triage fields, incident deduplication, and stable recent-slice behavior.
 */
import { describe, expect, it } from "vitest";

import {
  buildSummaryArtifact,
  createEmptySessionLabelMap,
  createEmptySeverityCounts,
  insertTopIncident,
} from "../src/insights.js";
import type { MetricsRecord, SummaryArtifact } from "../src/schema.js";

function createPassingRules() {
  return [
    {
      rule: "verification_after_code_changes" as const,
      status: "pass" as const,
      rationale: "ok",
    },
    {
      rule: "no_unverified_ending" as const,
      status: "pass" as const,
      rationale: "ok",
    },
  ];
}

describe("buildSummaryArtifact", () => {
  it("emits operator-first summary fields and recent slice comparisons", () => {
    const sessions: MetricsRecord["sessions"] = [
      {
        sessionId: "older-failing-session",
        provider: "codex",
        turnCount: 10,
        labeledTurnCount: 1,
        incidentCount: 1,
        parseWarningCount: 0,
        writeCount: 1,
        verificationCount: 1,
        verificationPassedCount: 0,
        verificationFailedCount: 1,
        postWriteVerificationAttempted: false,
        postWriteVerificationPassed: false,
        endedVerified: false,
        complianceScore: 60,
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
      ...Array.from({ length: 100 }, (_, index) => ({
        sessionId: `recent-session-${index + 1}`,
        provider: "codex" as const,
        turnCount: 10,
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
        complianceRules: createPassingRules(),
      })),
    ];

    const metrics: MetricsRecord = {
      engineVersion: "0.1.0",
      schemaVersion: "2",
      generatedAt: "2026-03-06T19:00:00.000Z",
      sessionCount: sessions.length,
      corpusScope: {
        selection: "all_discovered",
        discoveredSessionCount: sessions.length,
        appliedSessionLimit: null,
      },
      turnCount: 1010,
      incidentCount: 1,
      parseWarningCount: 0,
      labelCounts: {
        verification_request: 1,
      },
      complianceSummary: [
        {
          rule: "verification_after_code_changes",
          passCount: 100,
          failCount: 1,
          notApplicableCount: 0,
          unknownCount: 0,
        },
        {
          rule: "no_unverified_ending",
          passCount: 100,
          failCount: 1,
          notApplicableCount: 0,
          unknownCount: 0,
        },
      ],
      sessions,
      inventory: [],
    };

    const sessionLabelCounts = new Map<
      string,
      ReturnType<typeof createEmptySessionLabelMap>
    >();
    for (const session of sessions) {
      sessionLabelCounts.set(session.sessionId, createEmptySessionLabelMap());
    }
    sessionLabelCounts.set("older-failing-session", {
      ...createEmptySessionLabelMap(),
      verification_request: 1,
    });

    const summary = buildSummaryArtifact(metrics, {
      sessionLabelCounts,
      topIncidents: [] as SummaryArtifact["topIncidents"],
      severityCounts: createEmptySeverityCounts(),
      writeTurnCount: 101,
    });

    expect(summary.comparativeSlices.map((slice) => slice.key)).toEqual([
      "selected_corpus",
      "recent_100",
    ]);
    expect(summary.executiveSummary?.problem).toContain(
      "write sessions ended unverified",
    );
    expect(summary.operatorMetrics?.map((metric) => metric.label)).toContain(
      "Ended Unverified",
    );
    expect(summary.metricGlossary?.length).toBeGreaterThan(0);
    expect(summary.topSessions[0]?.whySelected?.length).toBeGreaterThan(0);
    expect(summary.topSessions[0]?.titleSource).toBeDefined();
    expect(summary.topSessions[0]?.titleConfidence).toBeDefined();
    expect(summary.topSessions[0]?.evidenceConfidence).toBeDefined();
  });

  it("deduplicates top incidents that would otherwise burn multiple slots on the same session summary", () => {
    const topIncidents = insertTopIncident(
      [
        {
          incidentId: "incident-a",
          sessionId: "session-1",
          sessionDisplayLabel: "Fix login regression",
          sessionShortId: "session-1",
          summary: "verification_request across 4 turn(s)",
          humanSummary:
            "The user had to ask for verification explicitly across 4 turns.",
          severity: "high",
          confidence: "high",
          turnSpan: 4,
          evidencePreview: "please verify",
          whySelected: ["High-severity incident signal."],
          sourceRefs: [],
          trustFlags: [],
        },
      ] satisfies SummaryArtifact["topIncidents"],
      {
        incidentId: "incident-b",
        sessionId: "session-1",
        sessionDisplayLabel: "Fix login regression",
        sessionShortId: "session-1",
        summary: "verification_request across 5 turn(s)",
        humanSummary:
          "The user had to ask for verification explicitly across 5 turns.",
        severity: "high",
        confidence: "high",
        turnSpan: 5,
        evidencePreview: "please verify again",
        whySelected: ["High-severity incident signal."],
        sourceRefs: [],
        trustFlags: [],
      },
      8,
    );

    expect(topIncidents).toHaveLength(1);
    expect(topIncidents[0]?.incidentId).toBe("incident-b");
    expect(topIncidents[0]?.turnSpan).toBe(5);
  });

  it("avoids triage-queue guidance when no sessions produce review-worthy signal", () => {
    const sessions: MetricsRecord["sessions"] = [
      {
        sessionId: "quiet-analysis",
        provider: "claude",
        turnCount: 4,
        labeledTurnCount: 0,
        incidentCount: 0,
        parseWarningCount: 0,
        writeCount: 0,
        verificationCount: 0,
        verificationPassedCount: 0,
        verificationFailedCount: 0,
        postWriteVerificationAttempted: false,
        postWriteVerificationPassed: false,
        endedVerified: false,
        complianceScore: 100,
        complianceRules: createPassingRules(),
      },
    ];

    const metrics: MetricsRecord = {
      engineVersion: "0.1.0",
      schemaVersion: "2",
      generatedAt: "2026-03-06T19:00:00.000Z",
      sessionCount: sessions.length,
      corpusScope: {
        selection: "all_discovered",
        discoveredSessionCount: sessions.length,
        appliedSessionLimit: null,
      },
      turnCount: 4,
      incidentCount: 0,
      parseWarningCount: 0,
      labelCounts: {},
      complianceSummary: [],
      sessions,
      inventory: [],
    };

    const summary = buildSummaryArtifact(metrics, {
      sessionLabelCounts: new Map([
        ["quiet-analysis", createEmptySessionLabelMap()],
      ]),
      topIncidents: [] as SummaryArtifact["topIncidents"],
      severityCounts: createEmptySeverityCounts(),
      writeTurnCount: 0,
    });

    expect(summary.topSessions).toEqual([]);
    expect(summary.executiveSummary.change).toContain(
      "no triage-worthy sessions were ranked",
    );
    expect(summary.executiveSummary.action).toContain(
      "No ranked sessions were available",
    );
  });

  it("keeps ranked top sessions unique even when multiple records share a session id", () => {
    const sessions: MetricsRecord["sessions"] = [
      {
        sessionId: "repeat-session",
        provider: "codex",
        turnCount: 10,
        labeledTurnCount: 4,
        incidentCount: 4,
        parseWarningCount: 0,
        writeCount: 2,
        verificationCount: 1,
        verificationPassedCount: 0,
        verificationFailedCount: 1,
        postWriteVerificationAttempted: true,
        postWriteVerificationPassed: false,
        endedVerified: false,
        complianceScore: 60,
        complianceRules: [],
      },
      {
        sessionId: "repeat-session",
        provider: "codex",
        turnCount: 8,
        labeledTurnCount: 1,
        incidentCount: 1,
        parseWarningCount: 0,
        writeCount: 2,
        verificationCount: 1,
        verificationPassedCount: 1,
        verificationFailedCount: 0,
        postWriteVerificationAttempted: true,
        postWriteVerificationPassed: true,
        endedVerified: true,
        complianceScore: 95,
        complianceRules: [],
      },
      {
        sessionId: "unique-session",
        provider: "codex",
        turnCount: 6,
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
    ];

    const metrics: MetricsRecord = {
      engineVersion: "0.1.0",
      schemaVersion: "2",
      generatedAt: "2026-03-06T19:00:00.000Z",
      sessionCount: sessions.length,
      corpusScope: {
        selection: "all_discovered",
        discoveredSessionCount: sessions.length,
        appliedSessionLimit: null,
      },
      turnCount: 24,
      incidentCount: 5,
      parseWarningCount: 0,
      labelCounts: {
        interrupt: 4,
      },
      complianceSummary: [],
      sessions,
      inventory: [],
    };

    const summary = buildSummaryArtifact(metrics, {
      sessionLabelCounts: new Map([
        [
          "repeat-session",
          {
            ...createEmptySessionLabelMap(),
            interrupt: 5,
          },
        ],
        ["unique-session", createEmptySessionLabelMap()],
      ]),
      topIncidents: [] as SummaryArtifact["topIncidents"],
      severityCounts: createEmptySeverityCounts(),
      writeTurnCount: 5,
    });

    expect(summary.topSessions.map((session) => session.sessionId)).toEqual([
      "repeat-session",
      "unique-session",
    ]);
  });
});
