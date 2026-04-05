/**
 * Purpose: Builds a shared display-only report model from canonical metrics and summary artifacts.
 * Responsibilities: Normalize header, overview, pattern, session-surface, and comparative-slice display data for HTML and markdown renderers.
 * Scope: Presentation-only shaping; never recomputes evaluator logic or ranking decisions.
 * Usage: Call `buildReportPresentationModel(metrics, summary)` before rendering markdown or HTML.
 * Invariants/Assumptions: The canonical truth remains `metrics.json` and `summary.json`; this model is a deterministic derivative only.
 */

import { describeCorpusScope } from "./report-scope.js";
import type {
  DistributionEntry,
  MetricsRecord,
  SummaryArtifact,
  SummaryFilter,
  SummaryNote,
} from "./schema.js";

export interface PresentationMetricCard {
  label: string;
  value: string;
  detail: string;
  tone: "neutral" | "good" | "warn" | "danger";
  emphasis: "primary" | "secondary";
}

export interface PresentationDistributionSection {
  title: string;
  entries: DistributionEntry[];
  emptyMessage: string;
}

export interface PresentationPatternSection {
  title: string;
  items: SummaryArtifact["learningPatterns"][keyof SummaryArtifact["learningPatterns"]];
  emptyMessage: string;
}

export interface PresentationSurfaceSection {
  title: string;
  intro: string;
  sessions:
    | SummaryArtifact["exemplarSessions"]
    | SummaryArtifact["reviewQueue"];
  emptyMessage: string;
  patterns: PresentationPatternSection[];
  variant: "exemplar" | "review";
}

export interface PresentationComparativeSliceGroup {
  title: string;
  kind: SummaryArtifact["comparativeSlices"][number]["kind"];
  slices: SummaryArtifact["comparativeSlices"];
}

function pluralizeSurfaceCount(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

export interface ReportPresentationModel {
  title: string;
  lede: string;
  corpusContext: string;
  scope: ReturnType<typeof describeCorpusScope>;
  appliedFilters: SummaryFilter[];
  coverageNotes: SummaryNote[];
  sampleNotes: SummaryNote[];
  highlights: string[];
  isEmptyCorpus: boolean;
  primaryMetrics: PresentationMetricCard[];
  secondaryMetrics: PresentationMetricCard[];
  dashboardDistributions: PresentationDistributionSection[];
  overviewNotes: SummaryNote[];
  worked: PresentationSurfaceSection;
  review: PresentationSurfaceSection;
  attributionSummary: SummaryArtifact["attributionSummary"];
  templateSubstrate: SummaryArtifact["templateSubstrate"];
  causePatterns: PresentationPatternSection[];
  comparativeSliceGroups: PresentationComparativeSliceGroup[];
  complianceDiagnostics: SummaryArtifact["usageDashboard"]["diagnostics"]["compliance"];
  methodology: string[];
  inventory: MetricsRecord["inventory"];
  metadata: {
    engineVersion: string;
    schemaVersion: string;
    providers: string[];
    parseWarningCount: number;
  };
}

function metricValue(value: number | null, suffix = ""): string {
  return value === null ? "N/A" : `${value}${suffix}`;
}

function buildPrimaryMetrics(
  summary: SummaryArtifact,
): PresentationMetricCard[] {
  const metrics = summary.usageDashboard.headlineMetrics;

  return [
    {
      label: "Sessions",
      value: `${metrics.sessions}`,
      detail: "Transcript-visible sessions in the selected corpus.",
      tone: "neutral",
      emphasis: "primary",
    },
    {
      label: "Write Sessions",
      value: `${metrics.writeSessions}`,
      detail: "Sessions with transcript-visible code changes.",
      tone: metrics.writeSessions > 0 ? "neutral" : "warn",
      emphasis: "primary",
    },
    {
      label: "Ended Verified",
      value: `${metrics.endedVerified}`,
      detail: "Write sessions with a passing post-write verification signal.",
      tone: metrics.endedVerified > 0 ? "good" : "neutral",
      emphasis: "primary",
    },
    {
      label: "Ended Unverified",
      value: `${metrics.endedUnverified}`,
      detail:
        "Write sessions that ended without a passing post-write verification signal.",
      tone: metrics.endedUnverified > 0 ? "warn" : "good",
      emphasis: "primary",
    },
    {
      label: "Avg User Messages / Session",
      value: metricValue(metrics.avgUserMessagesPerSession),
      detail: "Average transcript-visible user-message count per session.",
      tone: "neutral",
      emphasis: "primary",
    },
    {
      label: "Avg Assistant Messages / Session",
      value: metricValue(metrics.avgAssistantMessagesPerSession),
      detail: "Average transcript-visible assistant-message count per session.",
      tone: "neutral",
      emphasis: "primary",
    },
    {
      label: "Avg Tool Calls / Session",
      value: metricValue(metrics.avgToolCallsPerSession),
      detail: "Average transcript-visible tool-call count per session.",
      tone: "neutral",
      emphasis: "primary",
    },
    {
      label: "MCP Session Share",
      value: metricValue(metrics.mcpSessionShare, "%"),
      detail: "Share of sessions with transcript-visible MCP tool activity.",
      tone: "neutral",
      emphasis: "primary",
    },
  ];
}

function buildSecondaryMetrics(
  metrics: MetricsRecord,
  summary: SummaryArtifact,
): PresentationMetricCard[] {
  const headline = summary.usageDashboard.headlineMetrics;
  const tokenCoverage = summary.usageDashboard.tokenCoverage;
  const tokenStats = summary.usageDashboard.tokenStats;

  return [
    {
      label: "Interrupt Rate / 100 Turns",
      value: metricValue(headline.interruptRatePer100Turns),
      detail: "Transcript-visible interrupt labels per 100 turns.",
      tone: (headline.interruptRatePer100Turns ?? 0) >= 10 ? "warn" : "neutral",
      emphasis: "secondary",
    },
    {
      label: "Compaction Rate",
      value: metricValue(headline.compactionRate, "%"),
      detail: "Share of sessions with transcript-visible compaction events.",
      tone: "neutral",
      emphasis: "secondary",
    },
    {
      label: "Token Coverage",
      value:
        tokenCoverage?.coveragePct === null || tokenCoverage === null
          ? "N/A"
          : `${tokenCoverage.coveragePct}%`,
      detail: "Share of sessions with transcript-visible token accounting.",
      tone: "neutral",
      emphasis: "secondary",
    },
    {
      label: "Avg Total Tokens",
      value: metricValue(tokenStats?.totalTokensAvg ?? null),
      detail: "Average total tokens per covered session when available.",
      tone: "neutral",
      emphasis: "secondary",
    },
    {
      label: "Avg Duration",
      value:
        metrics.durationStats.avgDurationMs === null
          ? "N/A"
          : `${Math.round(metrics.durationStats.avgDurationMs / 1000)}s`,
      detail: "Average transcript-visible session duration when available.",
      tone: "neutral",
      emphasis: "secondary",
    },
  ];
}

function buildDashboardDistributions(
  summary: SummaryArtifact,
): PresentationDistributionSection[] {
  return [
    {
      title: "Provider Share",
      entries: summary.usageDashboard.distributions.providers,
      emptyMessage: "No provider distribution was available.",
    },
    {
      title: "Harness Share",
      entries: summary.usageDashboard.distributions.harnesses,
      emptyMessage: "No harness distribution was available.",
    },
    {
      title: "Model Coverage",
      entries: summary.usageDashboard.distributions.models,
      emptyMessage: "No model distribution was available.",
    },
    {
      title: "Tool Family Share",
      entries: summary.usageDashboard.distributions.toolFamilies,
      emptyMessage: "No tool-family distribution was available.",
    },
    {
      title: "Attribution Mix",
      entries: summary.usageDashboard.distributions.attribution,
      emptyMessage: "No attribution distribution was available.",
    },
  ];
}

function buildComparativeSliceGroups(
  summary: SummaryArtifact,
): PresentationComparativeSliceGroup[] {
  const groups: Array<
    Pick<PresentationComparativeSliceGroup, "title" | "kind">
  > = [
    { title: "Selected Corpus And Time Windows", kind: "selected_corpus" },
    { title: "Providers", kind: "provider" },
    { title: "Harnesses", kind: "harness" },
    { title: "Workload Split", kind: "workload" },
    { title: "Template Bands", kind: "template_band" },
  ];

  return groups
    .map((group) => ({
      ...group,
      slices: summary.comparativeSlices.filter((slice) =>
        group.kind === "selected_corpus"
          ? slice.kind === "selected_corpus" || slice.kind === "time_window"
          : slice.kind === group.kind,
      ),
    }))
    .filter((group) => group.slices.length > 0);
}

function buildMethodology(metrics: MetricsRecord): string[] {
  const lines = [
    "This report is a deterministic transcript analytics summary built from transcript-visible behavior, not a rigorous correctness evaluator.",
    "HTML and markdown are derived from one shared presentation model while ranking, attribution, and de-templating remain in the canonical analytics layers.",
    "Public-safe artifacts use redacted, truncated previews and should not be treated as a substitute for full secret scanning.",
  ];

  if (metrics.parseWarningCount > 0) {
    lines.push(
      `Parse warnings: ${metrics.parseWarningCount}. Some malformed transcript lines were skipped, so affected sessions may be partial.`,
    );
  }

  return lines;
}

export function buildReportPresentationModel(
  metrics: MetricsRecord,
  summary: SummaryArtifact,
): ReportPresentationModel {
  const providers = [
    ...new Set(metrics.inventory.map((record) => record.provider)),
  ];

  return {
    title: summary.overview.title,
    lede: "A deterministic, static, transcript-first agent usage evaluation report for understanding overall usage, what worked, what needs review, and why those outcomes surfaced.",
    corpusContext: summary.overview.corpusContext,
    scope: describeCorpusScope(metrics),
    appliedFilters: summary.overview.appliedFilters,
    coverageNotes: summary.overview.coverageNotes,
    sampleNotes: summary.overview.sampleNotes,
    highlights: summary.overview.highlights,
    isEmptyCorpus: summary.usageDashboard.headlineMetrics.sessions === 0,
    primaryMetrics: buildPrimaryMetrics(summary),
    secondaryMetrics: buildSecondaryMetrics(metrics, summary),
    dashboardDistributions: buildDashboardDistributions(summary),
    overviewNotes: summary.usageDashboard.notes,
    worked: {
      title: "What Worked",
      intro: `${pluralizeSurfaceCount(summary.exemplarSessions.length, "exemplar session")} ${summary.exemplarSessions.length === 1 ? "was" : "were"} surfaced from the selected corpus.`,
      sessions: summary.exemplarSessions,
      emptyMessage: "No exemplar sessions are available yet.",
      patterns: [
        {
          title: "What To Copy",
          items: summary.learningPatterns.whatToCopy,
          emptyMessage: "No positive learning patterns were available.",
        },
      ],
      variant: "exemplar",
    },
    review: {
      title: "Needs Review",
      intro: `${pluralizeSurfaceCount(summary.reviewQueue.length, "session")} ${summary.reviewQueue.length === 1 ? "was" : "were"} surfaced for review from the selected corpus.`,
      sessions: summary.reviewQueue,
      emptyMessage: "No review-queue sessions were available.",
      patterns: [
        {
          title: "What To Avoid",
          items: summary.learningPatterns.whatToAvoid,
          emptyMessage: "No recurring avoidable patterns were available.",
        },
      ],
      variant: "review",
    },
    attributionSummary: summary.attributionSummary,
    templateSubstrate: summary.templateSubstrate,
    causePatterns: [
      {
        title: "User Scope Patterns",
        items: summary.learningPatterns.userScopePatterns,
        emptyMessage: "No user-scope patterns were available.",
      },
      {
        title: "Agent Behavior Patterns",
        items: summary.learningPatterns.agentBehaviorPatterns,
        emptyMessage: "No agent-behavior patterns were available.",
      },
      {
        title: "Mixed Patterns",
        items: summary.learningPatterns.mixedPatterns,
        emptyMessage: "No mixed-cause patterns were available.",
      },
      {
        title: "Unknown Patterns",
        items: summary.learningPatterns.unknownPatterns,
        emptyMessage: "No unknown-cause patterns were available.",
      },
    ],
    comparativeSliceGroups: buildComparativeSliceGroups(summary),
    complianceDiagnostics: summary.usageDashboard.diagnostics.compliance,
    methodology: buildMethodology(metrics),
    inventory: metrics.inventory,
    metadata: {
      engineVersion: summary.engineVersion,
      schemaVersion: summary.schemaVersion,
      providers,
      parseWarningCount: metrics.parseWarningCount,
    },
  };
}
