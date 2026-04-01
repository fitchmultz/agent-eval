/**
 * Purpose: Builds shared section data for markdown and HTML reports from the canonical summary artifact.
 * Entrypoint: `buildSummarySections()` is consumed by report renderers for lightweight derived sections.
 * Notes: Executive summary stays persisted in summary.json; this module now focuses on momentum helpers for presentation.
 */
import { MOMENTUM_TONE } from "./constants/index.js";
import type { SummaryArtifact } from "./schema.js";

/**
 * A card in a summary section with a title, value, detail, and visual tone.
 */
export interface SummarySectionCard {
  title: string;
  value: string;
  valueKind?: "default" | "session-id";
  detail: string;
  tone: "neutral" | "good" | "warn" | "danger";
}

export interface SummarySectionModel {
  headlineInsights: SummarySectionCard[];
  recentMomentum: SummarySectionCard[];
}

function toneForDelta(delta: number): SummarySectionCard["tone"] {
  if (delta >= MOMENTUM_TONE.GOOD_THRESHOLD) {
    return "good";
  }
  if (delta <= MOMENTUM_TONE.DANGER_THRESHOLD) {
    return "danger";
  }
  if (delta <= MOMENTUM_TONE.WARN_THRESHOLD) {
    return "warn";
  }
  return "neutral";
}

function formatSignedDelta(delta: number): string {
  return `${delta >= 0 ? "+" : ""}${delta}`;
}

function buildMomentumCard(
  title: string,
  detail: string,
  corpusScore: number | null,
  recentScore: number | null,
): SummarySectionCard {
  if (corpusScore === null || recentScore === null) {
    return {
      title,
      value: "N/A",
      detail: `${detail} Not scoreable for one of the compared slices yet.`,
      tone: "neutral",
    };
  }

  const delta = Number((recentScore - corpusScore).toFixed(1));
  return {
    title,
    value: `${formatSignedDelta(delta)} pts`,
    detail,
    tone: toneForDelta(delta),
  };
}

function buildHeadlineInsights(
  summary: SummaryArtifact,
): SummarySectionModel["headlineInsights"] {
  const executiveSummary = summary.executiveSummary ?? {
    problem: "No persisted executive problem summary was available.",
    change: "No persisted recent-change summary was available.",
    action: "No persisted next-action summary was available.",
  };

  return [
    {
      title: "Problem",
      value: "What is wrong",
      detail: executiveSummary.problem,
      tone:
        summary.delivery.sessionsWithWrites >
        summary.delivery.sessionsEndingVerified
          ? "danger"
          : "neutral",
    },
    {
      title: "Recent Change",
      value: "What changed",
      detail: executiveSummary.change,
      tone: "neutral",
    },
    {
      title: "Next Action",
      value: "What to inspect first",
      detail: executiveSummary.action,
      tone: "warn",
    },
  ];
}

function buildRecentMomentum(
  summary: SummaryArtifact,
): SummarySectionModel["recentMomentum"] {
  const corpus = summary.comparativeSlices.find(
    (slice) => slice.key === "selected_corpus",
  );
  const recent =
    summary.comparativeSlices.find((slice) => slice.key === "recent_500") ??
    summary.comparativeSlices.find((slice) => slice.key === "recent_100") ??
    summary.comparativeSlices.find((slice) => slice.key === "recent_1000") ??
    summary.comparativeSlices.find((slice) => slice.key !== "selected_corpus");
  if (!corpus || !recent) {
    return [];
  }

  return [
    buildMomentumCard(
      "Verification Discipline Momentum",
      `${recent.label} vs selected corpus on write-session verification rate.`,
      corpus.writeSessionVerificationRate,
      recent.writeSessionVerificationRate,
    ),
    buildMomentumCard(
      "Workflow Hygiene Momentum",
      `${recent.label} vs selected corpus on workflow proxy score.`,
      corpus.workflowProxyScore,
      recent.workflowProxyScore,
    ),
    buildMomentumCard(
      "Flow Stability Momentum",
      `${recent.label} vs selected corpus on calmer-session flow proxy score.`,
      corpus.flowProxyScore,
      recent.flowProxyScore,
    ),
  ];
}

export function buildSummarySections(
  summary: SummaryArtifact,
): SummarySectionModel {
  return {
    headlineInsights: buildHeadlineInsights(summary),
    recentMomentum: buildRecentMomentum(summary),
  };
}
