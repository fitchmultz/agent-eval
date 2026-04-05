/**
 * Purpose: Build the canonical v3 public summary artifact used across reports, charts, and tests.
 * Responsibilities: Compose deterministic dashboard, exemplar, review, attribution, learning, and comparative-slice sections from canonical summary inputs.
 * Scope: Public summary facade for shared analytics outputs.
 * Usage: Call `buildSummaryArtifact(metrics, inputs)` after canonical session processing.
 * Invariants/Assumptions: This module is the only supported summary facade; it does not preserve the old operator-first v2 contract.
 */

import { buildComparativeSlices } from "./comparative-slices.js";
import type { MetricsRecord, SummaryArtifact, SummaryNote } from "./schema.js";
import { selectExemplars, selectReviewQueue } from "./session-ranking.js";
import { safeRate } from "./summary/index.js";
import type { SummaryInputs } from "./summary/types.js";
import {
  buildLearningPatterns,
  buildSurfacedSession,
} from "./summary-decorations.js";

function createNote(
  code: string,
  level: SummaryNote["level"],
  message: string,
): SummaryNote {
  return { code, level, message };
}

function pluralizeSummaryCount(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function uniqueProviders(metrics: MetricsRecord): string[] {
  return [
    ...new Set(metrics.inventory.map((record) => record.provider)),
  ].sort();
}

function buildAppliedFilters(
  metrics: MetricsRecord,
): SummaryArtifact["overview"]["appliedFilters"] {
  const filters: SummaryArtifact["overview"]["appliedFilters"] = [
    {
      key: "corpus_scope",
      label: "Corpus Scope",
      value: metrics.corpusScope.selection,
    },
    {
      key: "time_bucket",
      label: "Time Bucket",
      value: metrics.appliedFilters.timeBucket,
    },
  ];

  if (metrics.appliedFilters.startDate) {
    filters.push({
      key: "start_date",
      label: "Start Date",
      value: metrics.appliedFilters.startDate,
    });
  }
  if (metrics.appliedFilters.endDate) {
    filters.push({
      key: "end_date",
      label: "End Date",
      value: metrics.appliedFilters.endDate,
    });
  }
  if (metrics.appliedFilters.sessionLimit !== null) {
    filters.push({
      key: "session_limit",
      label: "Session Limit",
      value: `${metrics.appliedFilters.sessionLimit}`,
    });
  }

  return filters;
}

function buildCoverageNotes(
  metrics: MetricsRecord,
): SummaryArtifact["overview"]["coverageNotes"] {
  return metrics.coverageWarnings.map((message, index) =>
    createNote(`coverage_${index + 1}`, "warning", message),
  );
}

function buildSampleNotes(
  metrics: MetricsRecord,
): SummaryArtifact["overview"]["sampleNotes"] {
  return metrics.sampleWarnings.map((message, index) =>
    createNote(`sample_${index + 1}`, "warning", message),
  );
}

function buildOverviewHighlights(
  metrics: MetricsRecord,
  surfacedCounts: { exemplarCount: number; reviewCount: number },
): string[] {
  const writeSessions = metrics.sessions.filter(
    (session) => session.writeCount > 0,
  );
  const endedVerified = writeSessions.filter(
    (session) => session.endedVerified,
  ).length;
  const endedUnverified = Math.max(0, writeSessions.length - endedVerified);
  const providers = uniqueProviders(metrics);

  return [
    `${pluralizeSummaryCount(metrics.sessionCount, "session")} ${metrics.sessionCount === 1 ? "was" : "were"} analyzed across ${providers.length > 0 ? providers.join(", ") : "the selected corpus"}.`,
    `${pluralizeSummaryCount(surfacedCounts.exemplarCount, "exemplar session")} and ${pluralizeSummaryCount(surfacedCounts.reviewCount, "review session")} ${surfacedCounts.exemplarCount === 1 && surfacedCounts.reviewCount === 1 ? "were" : "were"} surfaced from the de-templated transcript substrate.`,
    writeSessions.length === 0
      ? "No transcript-visible write sessions were observed, so this corpus reads more as usage shape than delivery verification."
      : `${endedUnverified} of ${writeSessions.length} write sessions ended without a passing post-write verification signal.`,
    "Dashboard metrics preserve explicit time, harness, model, tool, MCP, token, and duration coverage gaps instead of falling back to false zeros.",
  ];
}

function buildOverview(
  metrics: MetricsRecord,
  surfacedCounts: { exemplarCount: number; reviewCount: number },
): SummaryArtifact["overview"] {
  const providers = uniqueProviders(metrics);
  const corpusWindow =
    metrics.corpusScope.selection === "all_discovered"
      ? "full corpus"
      : metrics.corpusScope.selection.replaceAll("_", "-");

  return {
    title: "Transcript Analytics Report",
    corpusContext: `${providers.join(", ") || "selected"} corpus · ${metrics.sessionCount} sessions · ${corpusWindow} · generated ${metrics.generatedAt}`,
    appliedFilters: buildAppliedFilters(metrics),
    coverageNotes: buildCoverageNotes(metrics),
    sampleNotes: buildSampleNotes(metrics),
    highlights: buildOverviewHighlights(metrics, surfacedCounts),
  };
}

function buildUsageDashboard(
  metrics: MetricsRecord,
  inputs: SummaryInputs,
): SummaryArtifact["usageDashboard"] {
  const writeSessions = metrics.sessions.filter(
    (session) => session.writeCount > 0,
  );
  const endedVerified = writeSessions.filter(
    (session) => session.endedVerified,
  ).length;
  const endedUnverified = Math.max(0, writeSessions.length - endedVerified);

  return {
    headlineMetrics: {
      sessions: metrics.sessionCount,
      writeSessions: writeSessions.length,
      endedVerified,
      endedUnverified,
      avgUserMessagesPerSession: metrics.messageStats.avgUserMessagesPerSession,
      avgAssistantMessagesPerSession:
        metrics.messageStats.avgAssistantMessagesPerSession,
      avgToolCallsPerSession: metrics.toolStats.avgToolCallsPerSession,
      mcpSessionShare: metrics.mcpStats.sessionSharePct,
      interruptRatePer100Turns: safeRate(
        metrics.labelCounts.interrupt ?? 0,
        metrics.turnCount,
      ),
      compactionRate: metrics.compactionStats.sessionSharePct,
    },
    distributions: {
      providers: metrics.providerDistribution,
      harnesses: metrics.harnessDistribution.values,
      models: metrics.modelDistribution.values,
      toolFamilies: metrics.toolStats.toolFamilyDistribution,
      attribution: [
        {
          key: "user_scope",
          label: "user_scope",
          count: metrics.attributionSummary.user_scope,
          pct:
            metrics.sessionCount > 0
              ? safeRate(
                  metrics.attributionSummary.user_scope,
                  metrics.sessionCount,
                )
              : null,
        },
        {
          key: "agent_behavior",
          label: "agent_behavior",
          count: metrics.attributionSummary.agent_behavior,
          pct:
            metrics.sessionCount > 0
              ? safeRate(
                  metrics.attributionSummary.agent_behavior,
                  metrics.sessionCount,
                )
              : null,
        },
        {
          key: "template_artifact",
          label: "template_artifact",
          count: metrics.attributionSummary.template_artifact,
          pct:
            metrics.sessionCount > 0
              ? safeRate(
                  metrics.attributionSummary.template_artifact,
                  metrics.sessionCount,
                )
              : null,
        },
        {
          key: "mixed",
          label: "mixed",
          count: metrics.attributionSummary.mixed,
          pct:
            metrics.sessionCount > 0
              ? safeRate(metrics.attributionSummary.mixed, metrics.sessionCount)
              : null,
        },
        {
          key: "unknown",
          label: "unknown",
          count: metrics.attributionSummary.unknown,
          pct:
            metrics.sessionCount > 0
              ? safeRate(
                  metrics.attributionSummary.unknown,
                  metrics.sessionCount,
                )
              : null,
        },
      ].filter((entry) => entry.count > 0 || entry.key === "unknown"),
    },
    tokenCoverage: metrics.tokenStats.coverage,
    tokenStats: {
      inputTokensAvg: metrics.tokenStats.inputTokensAvg,
      outputTokensAvg: metrics.tokenStats.outputTokensAvg,
      totalTokensAvg: metrics.tokenStats.totalTokensAvg,
    },
    diagnostics: {
      labelCounts: Object.entries(metrics.labelCounts)
        .filter(
          (entry): entry is [(typeof entry)[0], number] =>
            typeof entry[1] === "number",
        )
        .map(([label, count]) => ({
          label: label as keyof typeof metrics.labelCounts & string,
          count,
        }))
        .filter(
          (
            entry,
          ): entry is {
            label: SummaryArtifact["usageDashboard"]["diagnostics"]["labelCounts"][number]["label"];
            count: number;
          } => entry.count >= 0,
        ),
      incidentSeverities: (["info", "low", "medium", "high"] as const).map(
        (severity) => ({
          severity,
          count: inputs.severityCounts[severity],
        }),
      ),
      compliance: metrics.complianceSummary.map((rule) => ({
        ...rule,
        passRate: safeRate(rule.passCount, rule.passCount + rule.failCount),
        affectedSessionCount: rule.passCount + rule.failCount,
      })),
    },
    notes:
      metrics.coverageWarnings.length > 0
        ? [
            createNote(
              "coverage_explicit",
              "info",
              "Dashboard metrics preserve explicit coverage gaps instead of falling back to false zeros.",
            ),
          ]
        : [],
  };
}

function buildAttributionSummary(
  metrics: MetricsRecord,
): SummaryArtifact["attributionSummary"] {
  return {
    counts: { ...metrics.attributionSummary },
    notes:
      metrics.attributionSummary.unknown === metrics.sessionCount
        ? [
            createNote(
              "attribution_sparse",
              "info",
              "Attribution remained unknown across the selected corpus because transcript-visible evidence stayed inconclusive after de-templating.",
            ),
          ]
        : [],
  };
}

function buildTemplateSubstrate(
  metrics: MetricsRecord,
): SummaryArtifact["templateSubstrate"] {
  return {
    ...metrics.templateSubstrate,
    notes:
      (metrics.templateSubstrate.affectedSessionCount ?? 0) === 0
        ? [
            createNote(
              "template_none_detected",
              "info",
              "No repeated scaffold families were strong enough to classify in the selected corpus.",
            ),
          ]
        : [],
  };
}

function assertDisjointSurfaces(
  exemplars: SummaryArtifact["exemplarSessions"],
  reviewQueue: SummaryArtifact["reviewQueue"],
): void {
  const exemplarIds = new Set(exemplars.map((session) => session.sessionId));
  const overlap = reviewQueue.find((session) =>
    exemplarIds.has(session.sessionId),
  );

  if (overlap) {
    throw new Error(
      `Summary surfaces must stay disjoint, but session ${overlap.sessionId} appeared in both exemplarSessions and reviewQueue.`,
    );
  }
}

/**
 * Builds a complete v3 summary artifact from metrics and canonical summary inputs.
 */
export function buildSummaryArtifact(
  metrics: MetricsRecord,
  inputs: SummaryInputs,
): SummaryArtifact {
  const exemplarSessions = selectExemplars(inputs.sessions).map((candidate) =>
    buildSurfacedSession("exemplar", candidate),
  );
  const exemplarIds = new Set(
    exemplarSessions.map((session) => session.sessionId),
  );
  const reviewCandidates = selectReviewQueue(inputs.sessions, {
    excludeSessionIds: exemplarIds,
  });
  const reviewQueue = reviewCandidates
    .map((candidate) => buildSurfacedSession("review", candidate))
    .filter(
      (session) =>
        !(
          session.provenance.titleSource === "metadata" &&
          session.metrics.incidentCount === 0 &&
          session.provenance.evidenceConfidence !== "strong"
        ),
    );

  assertDisjointSurfaces(exemplarSessions, reviewQueue);

  return {
    engineVersion: metrics.engineVersion,
    schemaVersion: metrics.schemaVersion,
    generatedAt: metrics.generatedAt,
    overview: buildOverview(metrics, {
      exemplarCount: exemplarSessions.length,
      reviewCount: reviewQueue.length,
    }),
    usageDashboard: buildUsageDashboard(metrics, inputs),
    exemplarSessions,
    reviewQueue,
    attributionSummary: buildAttributionSummary(metrics),
    templateSubstrate: buildTemplateSubstrate(metrics),
    learningPatterns: buildLearningPatterns(inputs.sessions, {
      exemplarSessionIds: exemplarIds,
      reviewSessionIds: new Set(
        reviewQueue.map((session) => session.sessionId),
      ),
    }),
    comparativeSlices: buildComparativeSlices(metrics, inputs.sessions),
  };
}
