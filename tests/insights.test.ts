/**
 * Purpose: Verifies deterministic comparative slices and momentum cards stay stable as corpus windows change.
 * Entrypoint: Executed by Vitest via `pnpm test`.
 * Notes: Uses synthetic session aggregates so trend behavior remains reproducible and public-safe.
 */
import { describe, expect, it } from "vitest";

import {
  buildSummaryArtifact,
  createEmptySessionLabelMap,
  createEmptySeverityCounts,
  insertTopIncident,
} from "../src/insights.js";
import type { MetricsRecord, SummaryArtifact } from "../src/schema.js";
import { buildSummarySections } from "../src/summary-sections.js";

function createPassingRules() {
  return [
    {
      rule: "scope_confirmed_before_major_write" as const,
      status: "pass" as const,
      rationale: "ok",
    },
    {
      rule: "cwd_or_repo_echoed_before_write" as const,
      status: "pass" as const,
      rationale: "ok",
    },
    {
      rule: "short_plan_before_large_change" as const,
      status: "pass" as const,
      rationale: "ok",
    },
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
  it("emits recent slice comparisons and positive momentum when the latest sessions improve", () => {
    const sessions: MetricsRecord["sessions"] = [
      {
        sessionId: "older-failing-session",
        provider: "codex",
        turnCount: 10,
        labeledTurnCount: 1,
        incidentCount: 1,
        writeCount: 1,
        verificationCount: 1,
        verificationPassedCount: 0,
        verificationFailedCount: 1,
        complianceScore: 60,
        complianceRules: createPassingRules().map((rule, index) =>
          index === 3 ? { ...rule, status: "fail" as const } : rule,
        ),
      },
      ...Array.from({ length: 100 }, (_, index) => ({
        sessionId: `recent-session-${index + 1}`,
        provider: "codex" as const,
        turnCount: 10,
        labeledTurnCount: 0,
        incidentCount: 0,
        writeCount: 1,
        verificationCount: 1,
        verificationPassedCount: 1,
        verificationFailedCount: 0,
        complianceScore: 100,
        complianceRules: createPassingRules(),
      })),
    ];

    const metrics: MetricsRecord = {
      evaluatorVersion: "0.1.0",
      schemaVersion: "1",
      generatedAt: "2026-03-06T19:00:00.000Z",
      sessionCount: sessions.length,
      turnCount: 1010,
      incidentCount: 1,
      labelCounts: {
        verification_request: 1,
      },
      complianceSummary: [
        {
          rule: "scope_confirmed_before_major_write",
          passCount: 101,
          failCount: 0,
          notApplicableCount: 0,
          unknownCount: 0,
        },
        {
          rule: "cwd_or_repo_echoed_before_write",
          passCount: 101,
          failCount: 0,
          notApplicableCount: 0,
          unknownCount: 0,
        },
        {
          rule: "short_plan_before_large_change",
          passCount: 101,
          failCount: 0,
          notApplicableCount: 0,
          unknownCount: 0,
        },
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
    expect(summary.comparativeSlices[0]?.proofScore).toBe(99);
    expect(summary.comparativeSlices[1]?.proofScore).toBe(100);
    const sections = buildSummarySections(summary);
    expect(sections.recentMomentum[0]?.title).toBe("Proof Momentum");
    expect(sections.recentMomentum[0]?.value).toBe("+1 pts");
    expect(sections.recentMomentum[0]?.tone).toBe("neutral");
  });

  it("deduplicates top incidents that would otherwise burn multiple slots on the same session summary", () => {
    const topIncidents = insertTopIncident(
      [
        {
          incidentId: "incident-a",
          sessionId: "session-1",
          summary: "verification_request across 4 turn(s)",
          severity: "high",
          confidence: "high",
          turnSpan: 4,
          evidencePreview: "please verify",
        },
      ] satisfies SummaryArtifact["topIncidents"],
      {
        incidentId: "incident-b",
        sessionId: "session-1",
        summary: "verification_request across 5 turn(s)",
        severity: "high",
        confidence: "high",
        turnSpan: 5,
        evidencePreview: "please verify again",
      },
      8,
    );

    expect(topIncidents).toHaveLength(1);
    expect(topIncidents[0]?.incidentId).toBe("incident-b");
    expect(topIncidents[0]?.turnSpan).toBe(5);
  });
});
