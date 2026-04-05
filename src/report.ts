/**
 * Purpose: Converts analytics metrics and v3 summary data into a structured markdown evaluation report.
 * Responsibilities: Build deterministic report sections from canonical metrics and summary artifacts without recomputing analytics logic.
 * Scope: Used by the `report` and `eval` commands for all supported sources.
 * Usage: Call `renderSummaryReport()` with a summary artifact, or `renderReport()` as a convenience wrapper.
 * Invariants/Assumptions: Report claims remain grounded in transcript-visible proxy signals rather than correctness assertions.
 */

import { buildReportPresentationModel } from "./presentation-model.js";
import type {
  IncidentRecord,
  MetricsRecord,
  RawTurnRecord,
  SummaryArtifact,
} from "./schema.js";
import { buildSummaryInputsFromArtifacts } from "./summary/aggregation.js";
import { buildSummaryArtifact } from "./summary-core.js";

function inventoryStatusLabel(
  record: MetricsRecord["inventory"][number],
): string {
  if (
    record.required &&
    record.kind === "session_jsonl" &&
    !record.discovered
  ) {
    return "missing canonical input";
  }

  return record.discovered ? "present" : "missing";
}

function renderLines<T>(
  items: readonly T[],
  emptyMessage: string,
  renderItem: (item: T) => string,
): string[] {
  return items.length > 0 ? items.map(renderItem) : [emptyMessage];
}

function renderMetricLines(
  metrics: ReturnType<typeof buildReportPresentationModel>["primaryMetrics"],
): string[] {
  return metrics.map((metric) => `- ${metric.label}: ${metric.value}`);
}

function pluralizeReportCount(
  count: number,
  singular: string,
  plural?: string,
): string {
  return `${count} ${count === 1 ? singular : (plural ?? `${singular}s`)}`;
}

function renderSurfaceLines(
  sessions: SummaryArtifact["reviewQueue"],
  emptyMessage: string,
): string[] {
  return renderLines(sessions, emptyMessage, (session) => {
    const evidencePreview = session.evidencePreviews[0]
      ? ` | evidence: "${session.evidencePreviews[0]}"`
      : "";
    const refs =
      session.sourceRefs.length > 0
        ? ` | refs: ${session.sourceRefs
            .slice(0, 2)
            .map(
              (sourceRef) =>
                `${sourceRef.path}${sourceRef.line ? `:${sourceRef.line}` : ""}`,
            )
            .join(", ")}`
        : "";
    const trust =
      session.provenance.trustFlags.length > 0
        ? ` | trust-notes: ${session.provenance.trustFlags.slice(0, 2).join("; ")}`
        : "";

    const metadataLabel = [
      session.projectLabel,
      session.timestampLabel,
      session.shortId,
    ]
      .filter((value): value is string => Boolean(value))
      .join(" · ");
    const metadataSuffix =
      metadataLabel.length > 0 && session.title !== metadataLabel
        ? ` (${metadataLabel})`
        : "";

    return `- ${session.title}${metadataSuffix} | attribution: ${session.attribution.primary}/${session.attribution.confidence} | why: ${session.whyIncluded.join("; ")}${trust}${refs}${evidencePreview}`;
  });
}

function renderPatternLines(
  patterns: SummaryArtifact["learningPatterns"][keyof SummaryArtifact["learningPatterns"]],
  emptyMessage: string,
): string[] {
  return renderLines(patterns, emptyMessage, (pattern) => {
    const sources =
      pattern.sourceSessionIds.length > 0
        ? ` | sources: ${pattern.sourceSessionIds.join(", ")}`
        : "";
    return `- ${pattern.label} (${pattern.sessionCount == null ? "N/A sessions" : pluralizeReportCount(pattern.sessionCount, "session")}): ${pattern.explanation}${sources}`;
  });
}

function renderAttributionLines(summary: SummaryArtifact): string[] {
  const counts = summary.attributionSummary.counts;
  return [
    `- user_scope: ${counts.user_scope}`,
    `- agent_behavior: ${counts.agent_behavior}`,
    `- template_artifact: ${counts.template_artifact}`,
    `- mixed: ${counts.mixed}`,
    `- unknown: ${counts.unknown}`,
    ...summary.attributionSummary.notes.map(
      (note) => `- ${note.level}: ${note.message}`,
    ),
  ];
}

function renderTemplateLines(summary: SummaryArtifact): string[] {
  const topFamilies = summary.templateSubstrate.topFamilies.map(
    (family) =>
      `- ${family.label}: ${pluralizeReportCount(family.affectedSessionCount, "session")}${family.estimatedTextSharePct === null ? "" : ` · ${family.estimatedTextSharePct}% text share`}`,
  );

  return [
    `- affected sessions: ${summary.templateSubstrate.affectedSessionCount ?? "N/A"}`,
    `- affected session share: ${summary.templateSubstrate.affectedSessionPct === null ? "N/A" : `${summary.templateSubstrate.affectedSessionPct}%`}`,
    `- estimated template text share: ${summary.templateSubstrate.estimatedTemplateTextSharePct === null ? "N/A" : `${summary.templateSubstrate.estimatedTemplateTextSharePct}%`}`,
    ...topFamilies,
    ...summary.templateSubstrate.notes.map(
      (note) => `- ${note.level}: ${note.message}`,
    ),
  ];
}

function renderComparativeSliceGroups(
  model: ReturnType<typeof buildReportPresentationModel>,
): string[] {
  if (model.comparativeSliceGroups.length === 0) {
    return ["- No comparative slices were available."];
  }

  const lines: string[] = [];
  for (const group of model.comparativeSliceGroups) {
    lines.push(`### ${group.title}`, "");
    for (const slice of group.slices) {
      lines.push(
        `- ${slice.label}: sessions ${slice.metrics.sessionCount}, turns ${slice.metrics.turnCount}, incidents ${slice.metrics.incidentCount}, write sessions ${slice.metrics.writeSessionCount ?? "N/A"}, ended verified ${slice.metrics.endedVerifiedCount ?? "N/A"}, ended unverified ${slice.metrics.endedUnverifiedCount ?? "N/A"}, incidents/100 turns ${slice.metrics.incidentsPer100Turns ?? "N/A"}, interrupts/100 turns ${slice.metrics.interruptRatePer100Turns ?? "N/A"}`,
      );
      if (slice.filters.length > 0) {
        lines.push(
          `  - filters: ${slice.filters.map((filter) => `${filter.label}: ${filter.value}`).join("; ")}`,
        );
      }
      for (const note of slice.notes) {
        lines.push(`  - ${note.level}: ${note.message}`);
      }
    }
    lines.push("");
  }

  return lines;
}

function renderMethodologyLines(
  model: ReturnType<typeof buildReportPresentationModel>,
): string[] {
  return model.methodology.map((line) => `- ${line}`);
}

function renderInventoryLines(metrics: MetricsRecord): string[] {
  return metrics.inventory
    .filter((record) => record.discovered || record.required)
    .map(
      (record) =>
        `- ${record.provider} ${record.required ? "required" : "optional"} ${record.kind}: ${inventoryStatusLabel(record)} at \`${record.path}\``,
    );
}

/**
 * Convenience wrapper that derives the summary artifact from raw turns and incidents.
 */
export function renderReport(
  metrics: MetricsRecord,
  rawTurns: readonly RawTurnRecord[],
  incidents: readonly IncidentRecord[],
): string {
  const summary = buildSummaryArtifact(
    metrics,
    buildSummaryInputsFromArtifacts(metrics, rawTurns, incidents),
  );
  return renderSummaryReport(metrics, summary);
}

/**
 * Renders the canonical markdown report from metrics and a prebuilt summary artifact.
 */
export function renderSummaryReport(
  metrics: MetricsRecord,
  summary: SummaryArtifact,
): string {
  const model = buildReportPresentationModel(metrics, summary);
  const lines = [
    `# ${model.title}`,
    "",
    model.lede,
    "",
    `- ${model.corpusContext}`,
    `- ${model.scope.headline}`,
    `- ${model.scope.detail}`,
    `- ${model.scope.comparability}`,
    ...model.appliedFilters.map(
      (filter) => `- ${filter.label}: ${filter.value}`,
    ),
    ...model.coverageNotes.map((note) => `- ${note.level}: ${note.message}`),
    ...model.sampleNotes.map((note) => `- ${note.level}: ${note.message}`),
    "",
  ];

  if (model.isEmptyCorpus) {
    lines.push(
      "## No Data Yet",
      "",
      "- The selected source home has the expected transcript layout, but no session JSONL files were discovered yet.",
      "- This is a valid first-run or freshly bootstrapped state, so the report renders a deterministic empty corpus instead of treating it as a runtime failure.",
      "",
    );
  }

  lines.push(
    "## Overview Dashboard",
    "",
    ...renderMetricLines(model.primaryMetrics),
    ...renderMetricLines(model.secondaryMetrics),
    "",
    ...model.highlights.map((highlight) => `- ${highlight}`),
    "",
    ...model.dashboardDistributions.flatMap((section) => [
      `### ${section.title}`,
      "",
      ...renderLines(
        section.entries,
        `- ${section.emptyMessage}`,
        (entry) =>
          `- ${entry.label}: ${entry.count}${entry.pct === null ? "" : ` (${entry.pct}%)`}`,
      ),
      "",
    ]),
    "## What Worked",
    "",
    `- ${model.worked.intro}`,
    "",
    ...model.worked.patterns.flatMap((section) => [
      `### ${section.title}`,
      "",
      ...renderPatternLines(section.items, section.emptyMessage),
      "",
    ]),
    ...renderSurfaceLines(model.worked.sessions, model.worked.emptyMessage),
    "",
    "## Needs Review",
    "",
    `- ${model.review.intro}`,
    "",
    ...model.review.patterns.flatMap((section) => [
      `### ${section.title}`,
      "",
      ...renderPatternLines(section.items, section.emptyMessage),
      "",
    ]),
    ...renderSurfaceLines(model.review.sessions, model.review.emptyMessage),
    "",
    "## Why This Happened",
    "",
    ...renderAttributionLines(summary),
    "",
    ...renderTemplateLines(summary),
    "",
    ...model.causePatterns.flatMap((section) => [
      `### ${section.title}`,
      "",
      ...renderPatternLines(section.items, section.emptyMessage),
      "",
    ]),
    "## Comparative Slices",
    "",
    ...renderComparativeSliceGroups(model),
    "## Methodology And Limitations",
    "",
    ...renderMethodologyLines(model),
    "",
    "## Inventory",
    "",
    ...renderInventoryLines(metrics),
    "",
    "## Report Metadata",
    "",
    `- Engine version: \`${summary.engineVersion}\``,
    `- Schema version: \`${summary.schemaVersion}\``,
    "",
  );

  return `${lines.join("\n")}\n`;
}
