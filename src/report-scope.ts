/**
 * Purpose: Shared corpus-scope disclosure helpers for markdown and HTML reports.
 * Responsibilities: Convert metrics run parameters into concise, reader-facing scope and comparability text.
 * Scope: Report rendering only; this module never mutates analytics data.
 */

import type { MetricsRecord } from "./schema.js";

export interface CorpusScopeDisclosure {
  pill: string;
  headline: string;
  detail: string;
  comparability: string;
  isWindowed: boolean;
}

function formatSessionCount(count: number): string {
  return `${count} session${count === 1 ? "" : "s"}`;
}

export function describeCorpusScope(
  metrics: MetricsRecord,
): CorpusScopeDisclosure {
  const corpusScope = metrics.corpusScope ?? {
    selection: "all_discovered",
    discoveredSessionCount: metrics.sessionCount,
    appliedSessionLimit: null,
  };
  const { sessionCount } = metrics;
  const { appliedSessionLimit, discoveredSessionCount, selection } =
    corpusScope;
  const isWindowed =
    selection === "most_recent_window" && discoveredSessionCount > sessionCount;

  if (appliedSessionLimit === null || selection === "all_discovered") {
    return {
      pill: `scope all ${formatSessionCount(sessionCount)}`,
      headline: `Corpus scope: all ${formatSessionCount(sessionCount)}`,
      detail:
        "This report includes every discovered session in the selected source home for this run.",
      comparability:
        "Metrics are directly comparable only to reports built from the same source home and discovery moment.",
      isWindowed: false,
    };
  }

  if (isWindowed) {
    return {
      pill: `scope recent ${sessionCount}/${discoveredSessionCount}`,
      headline: `Corpus scope: most recent ${formatSessionCount(sessionCount)} of ${formatSessionCount(discoveredSessionCount)}`,
      detail: `This run applied session limit ${appliedSessionLimit}, so the report covers only the most recent discovered sessions instead of the full discovered corpus.`,
      comparability:
        "Metrics are not directly comparable to reports built with a different session limit or corpus window.",
      isWindowed: true,
    };
  }

  return {
    pill: `scope all ${formatSessionCount(sessionCount)}`,
    headline: `Corpus scope: all ${formatSessionCount(sessionCount)}`,
    detail: `This run used session limit ${appliedSessionLimit}, but only ${formatSessionCount(discoveredSessionCount)} were discovered, so the report still covers the full discovered corpus.`,
    comparability:
      "Metrics remain comparable to other full-corpus reports from the same source home and discovery moment.",
    isWindowed: false,
  };
}
