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
  const { corpusScope } = metrics;
  const { appliedFilters } = metrics;
  const { sessionCount } = metrics;
  const isWindowed =
    corpusScope.selection === "most_recent_window" ||
    corpusScope.selection === "date_filtered_window";

  const detailSuffixParts: string[] = [];
  if (appliedFilters.startDate || appliedFilters.endDate) {
    detailSuffixParts.push(
      `Date window: ${appliedFilters.startDate ?? "-∞"} → ${appliedFilters.endDate ?? "+∞"}.`,
    );
  }
  if (appliedFilters.undatedExcludedCount > 0) {
    detailSuffixParts.push(
      `${appliedFilters.undatedExcludedCount} undated sessions were excluded while date filtering was active.`,
    );
  }
  const detailSuffix =
    detailSuffixParts.length > 0 ? ` ${detailSuffixParts.join(" ")}` : "";

  if (!isWindowed && corpusScope.selection === "all_discovered") {
    return {
      pill: `scope all ${formatSessionCount(sessionCount)}`,
      headline: `Corpus scope: all ${formatSessionCount(sessionCount)}`,
      detail:
        "This report includes every discovered session in the selected source home for this run.",
      comparability:
        "Metrics are directly comparable only to reports built from the same source home, discovery moment, and date filter settings.",
      isWindowed: false,
    };
  }

  if (corpusScope.selection === "date_filtered") {
    return {
      pill: `scope filtered ${sessionCount}/${appliedFilters.discoveredSessionCount}`,
      headline: `Corpus scope: filtered ${formatSessionCount(sessionCount)} of ${formatSessionCount(appliedFilters.discoveredSessionCount)}`,
      detail: `This run applied a date filter and retained ${formatSessionCount(appliedFilters.eligibleSessionCount)} before any session limit.${detailSuffix}`,
      comparability:
        "Metrics are not directly comparable to reports built with a different date window, bucket size, or source-home discovery moment.",
      isWindowed: false,
    };
  }

  return {
    pill: `scope recent ${sessionCount}/${appliedFilters.eligibleSessionCount}`,
    headline: `Corpus scope: most recent ${formatSessionCount(sessionCount)} of ${formatSessionCount(appliedFilters.eligibleSessionCount)}`,
    detail: `This run applied session limit ${appliedFilters.sessionLimit ?? corpusScope.appliedSessionLimit}, so the report covers only the most recent eligible sessions after filtering.${detailSuffix}`,
    comparability:
      "Metrics are not directly comparable to reports built with a different session limit, date window, bucket size, or discovery moment.",
    isWindowed: true,
  };
}
