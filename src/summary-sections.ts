/**
 * Purpose: Builds shared section data for markdown and HTML reports from the canonical summary artifact.
 * Entrypoint: `buildSummarySections()` is consumed by both report.ts and presentation.ts to reduce structural drift.
 * Notes: Derived headline and momentum sections are computed here instead of being persisted in summary.json.
 */
import type { SummaryArtifact } from "./schema.js";

export interface SummarySectionCard {
  title: string;
  value: string;
  detail: string;
  tone: "neutral" | "good" | "warn" | "danger";
}

export interface SummarySectionModel {
  headlineInsights: SummarySectionCard[];
  recentMomentum: SummarySectionCard[];
}

function toneForDelta(delta: number): SummarySectionCard["tone"] {
  if (delta >= 5) {
    return "good";
  }
  if (delta <= -10) {
    return "danger";
  }
  if (delta <= -5) {
    return "warn";
  }
  return "neutral";
}

function formatSignedDelta(delta: number): string {
  return `${delta >= 0 ? "+" : ""}${delta}`;
}

function buildHeadlineInsights(
  summary: SummaryArtifact,
): SummarySectionModel["headlineInsights"] {
  const highestFriction = summary.topSessions[0];

  return [
    {
      title: "Write Verification",
      value: `${summary.delivery.verifiedWriteSessions}/${summary.delivery.sessionsWithWrites}`,
      detail:
        summary.delivery.sessionsWithWrites > 0
          ? `${summary.delivery.writeVerificationRate}% of write sessions ended with a passing verification signal.`
          : "No write sessions were observed.",
      tone:
        summary.delivery.sessionsWithWrites === 0
          ? "neutral"
          : summary.delivery.verifiedWriteSessions ===
              summary.delivery.sessionsWithWrites
            ? "good"
            : "warn",
    },
    {
      title: "Interruption Load",
      value: `${summary.rates.interruptionsPer100Turns}`,
      detail:
        "Interrupt labels per 100 turns, useful for spotting redirected or churn-heavy sessions.",
      tone: summary.rates.interruptionsPer100Turns >= 10 ? "warn" : "neutral",
    },
    {
      title: "Highest Friction Session",
      value: highestFriction ? highestFriction.sessionId : "none",
      detail: highestFriction
        ? `${highestFriction.frictionScore} friction points, archetype ${highestFriction.archetype}.`
        : "No sessions were available.",
      tone:
        highestFriction && highestFriction.frictionScore >= 8
          ? "danger"
          : "neutral",
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

  const proofDelta = recent.proofScore - corpus.proofScore;
  const flowDelta = recent.flowScore - corpus.flowScore;
  const disciplineDelta = recent.disciplineScore - corpus.disciplineScore;

  return [
    {
      title: "Proof Momentum",
      value: `${formatSignedDelta(proofDelta)} pts`,
      detail: `${recent.label} vs selected corpus on proof-backed delivery.`,
      tone: toneForDelta(proofDelta),
    },
    {
      title: "Flow Momentum",
      value: `${formatSignedDelta(flowDelta)} pts`,
      detail: `${recent.label} vs selected corpus on calmer sessions.`,
      tone: toneForDelta(flowDelta),
    },
    {
      title: "Discipline Momentum",
      value: `${formatSignedDelta(disciplineDelta)} pts`,
      detail: `${recent.label} vs selected corpus on operating-rule compliance.`,
      tone: toneForDelta(disciplineDelta),
    },
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
