/**
 * Purpose: Converts analytics metrics and summary data into a concise markdown triage report for operators.
 * Responsibilities: Build deterministic report sections from metrics and summary artifacts without recomputing analytics logic.
 * Scope: Used by the `report` and `eval` commands for all supported sources.
 * Usage: Call `renderSummaryReport()` with a summary artifact, or `renderReport()` as a convenience wrapper.
 * Invariants/Assumptions: Incident evidence stays redacted and truncated, and claims remain grounded in transcript-visible proxy signals rather than correctness assertions.
 */

import {
  buildSummaryArtifact,
  buildSummaryInputsFromArtifacts,
} from "./insights.js";
import { describeCorpusScope } from "./report-scope.js";
import type {
  IncidentRecord,
  MetricsRecord,
  RawTurnRecord,
  SummaryArtifact,
} from "./schema.js";
import {
  deriveSessionDisplayLabel,
  deriveSessionProjectLabel,
  deriveSessionShortId,
  deriveSessionTimestampLabel,
} from "./summary/session-display.js";

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

function renderNoDataLines(summary: SummaryArtifact): string[] {
  if (summary.sessions > 0) {
    return [];
  }

  return [
    "## No Data Yet",
    "",
    "- The selected source home has the expected transcript layout, but no session JSONL files were discovered yet.",
    "- This is a valid first-run or freshly bootstrapped state, so the report renders a deterministic empty corpus instead of treating it as a runtime failure.",
    "",
  ];
}

function renderLines<T>(
  items: readonly T[],
  emptyMessage: string,
  renderItem: (item: T) => string,
): string[] {
  return items.length > 0 ? items.map(renderItem) : [emptyMessage];
}

function renderOperatorMetricLines(summary: SummaryArtifact): string[] {
  return renderLines(
    summary.operatorMetrics ?? [],
    "- No operator action metrics were available.",
    (metric) => `- ${metric.label}: ${metric.value} (${metric.detail})`,
  );
}

function renderSessionProvenanceTags(
  session: SummaryArtifact["topSessions"][number],
): string {
  const tags: string[] = [];

  if (session.titleSource !== "user") {
    tags.push(`title=${session.titleSource}`);
  }
  if (session.titleConfidence !== "strong") {
    tags.push(`title-confidence=${session.titleConfidence}`);
  }
  if (session.evidenceConfidence !== "strong") {
    tags.push(`evidence-confidence=${session.evidenceConfidence}`);
  }
  for (const issue of session.evidenceIssues) {
    tags.push(issue);
  }

  return tags.length > 0 ? ` | trust: ${tags.join(", ")}` : "";
}

function renderSessionLines(summary: SummaryArtifact): string[] {
  return renderLines(
    summary.topSessions,
    "- No session insights were available.",
    (session) => {
      const evidencePreviews = session.evidencePreviews ?? [];
      const failedRulesList = session.failedRules ?? [];
      const whySelected = session.whySelected ?? [
        "No persisted ranking reasons were available.",
      ];
      const displayLabel =
        session.sessionDisplayLabel ??
        deriveSessionDisplayLabel(session.sessionId);
      const projectLabel =
        session.sessionProjectLabel ??
        deriveSessionProjectLabel(undefined, session.sourceRefs ?? []);
      const timestampLabel =
        session.sessionTimestampLabel ?? deriveSessionTimestampLabel();
      const shortId =
        session.sessionShortId ?? deriveSessionShortId(session.sessionId);
      const evidencePreview = evidencePreviews[0]
        ? ` | evidence: "${evidencePreviews[0]}"`
        : "";
      const failedRules =
        failedRulesList.length > 0
          ? ` | failed rules: ${failedRulesList.join(", ")}`
          : "";
      const trust = renderSessionProvenanceTags(session);
      return `- ${displayLabel} (${projectLabel} · ${timestampLabel} · ${shortId}) | why: ${whySelected.join("; ")}${failedRules}${trust}${evidencePreview}`;
    },
  );
}

function renderComparativeSliceLines(summary: SummaryArtifact): string[] {
  return renderLines(
    summary.comparativeSlices,
    "- No comparative slices were available.",
    (slice) =>
      `- ${slice.label}: sessions ${slice.sessionCount}, write verification ${slice.writeSessionVerificationRate ?? "N/A"}${slice.writeSessionVerificationRate === null ? "" : "%"}, verification proxy ${slice.verificationProxyScore ?? "N/A"}, workflow proxy ${slice.workflowProxyScore ?? "N/A"}, flow proxy ${slice.flowProxyScore ?? "N/A"}, incidents/100 turns ${slice.incidentsPer100Turns}`,
  );
}

function renderComplianceLines(summary: SummaryArtifact): string[] {
  return renderLines(
    summary.compliance,
    "- No compliance rows were available.",
    (rule) =>
      `- ${rule.rule}: pass ${rule.passRate ?? "N/A"}${typeof rule.passRate === "number" ? "%" : ""} | fail ${rule.failCount} | affected sessions ${rule.affectedSessionCount ?? "N/A"} | n/a ${rule.notApplicableCount} | unknown ${rule.unknownCount}`,
  );
}

function renderOpportunityLines(summary: SummaryArtifact): string[] {
  return renderLines(
    summary.opportunities,
    "- No deterministic improvement opportunities were identified.",
    (opportunity) => `- ${opportunity.title}: ${opportunity.rationale}`,
  );
}

function renderIncidentLines(summary: SummaryArtifact): string[] {
  return renderLines(
    summary.topIncidents,
    "- No labeled incidents detected.",
    (incident) => {
      const suffix = incident.evidencePreview
        ? ` | evidence: "${incident.evidencePreview}"`
        : "";
      const humanSummary = incident.humanSummary ?? incident.summary;
      const sessionDisplayLabel =
        incident.sessionDisplayLabel ??
        deriveSessionDisplayLabel(incident.sessionId);
      const whySelected = incident.whySelected ?? [
        "No persisted incident-ranking reasons were available.",
      ];
      return `- ${humanSummary} (${sessionDisplayLabel}, ${incident.severity}/${incident.confidence}, span ${incident.turnSpan}) | why: ${whySelected.join("; ")}${suffix}`;
    },
  );
}

function renderMethodologyLines(metrics: MetricsRecord): string[] {
  const lines = [
    "- This report is a deterministic transcript analytics summary with heuristic policy proxies, not a rigorous correctness evaluator.",
    "- Labels are transcript-visible heuristics and should be treated as operator-friction signals, not ground-truth task outcomes.",
    "- Compliance scores are proxies based on observed transcript events and do not prove actual repository correctness.",
    "- Static markdown mirrors the static HTML triage report and intentionally prioritizes portability over interactive filtering.",
  ];

  if (metrics.parseWarningCount > 0) {
    lines.push(
      `- Parse warnings: ${metrics.parseWarningCount}. Some malformed transcript lines were skipped, so results should be treated as partial for affected sessions.`,
    );
  }

  return lines;
}

function renderMetricGlossaryLines(summary: SummaryArtifact): string[] {
  return renderLines(
    summary.metricGlossary ?? [],
    "- No glossary entries were available.",
    (entry) =>
      `- ${entry.label}: ${entry.plainLanguage} Caveat: ${entry.caveat}`,
  );
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
 * Convenience wrapper that derives the summary artifact from raw turns and incidents
 * before delegating to the canonical summary-based renderer.
 */
export function renderReport(
  metrics: MetricsRecord,
  incidents: readonly IncidentRecord[],
  rawTurns: readonly RawTurnRecord[],
): string {
  const summary = buildSummaryArtifact(
    metrics,
    buildSummaryInputsFromArtifacts(rawTurns, incidents),
  );
  return renderSummaryReport(metrics, summary);
}

/**
 * Renders a markdown report from a pre-built summary artifact.
 */
export function renderSummaryReport(
  metrics: MetricsRecord,
  summary: SummaryArtifact,
): string {
  const scope = describeCorpusScope(metrics);
  const providers = [
    ...new Set(metrics.inventory.map((record) => record.provider)),
  ];
  const executiveSummary = summary.executiveSummary ?? {
    problem: "No persisted executive problem summary was available.",
    change: "No persisted recent-change summary was available.",
    action: "No persisted next-action summary was available.",
  };

  const lines = [
    "# Transcript Analytics Report",
    "",
    `- Context: ${providers.join(", ")} corpus · ${summary.sessions} sessions · generated ${metrics.generatedAt}`,
    `- ${scope.headline}`,
    `- ${scope.detail}`,
    `- ${scope.comparability}`,
    "",
    ...renderNoDataLines(summary),
    "## Executive Summary",
    "",
    `- Problem: ${executiveSummary.problem}`,
    `- Recent change: ${executiveSummary.change}`,
    `- Next action: ${executiveSummary.action}`,
    "",
    "## Operator Action Metrics",
    "",
    ...renderOperatorMetricLines(summary),
    "",
    "## Sessions To Review First",
    "",
    ...renderSessionLines(summary),
    "",
    "## Compliance Breakdown",
    "",
    ...renderComplianceLines(summary),
    "",
    "## Comparative Slices",
    "",
    ...renderComparativeSliceLines(summary),
    "",
    "## Metric Glossary",
    "",
    ...renderMetricGlossaryLines(summary),
    "",
    "## Recurring Patterns And Incidents",
    "",
    ...renderIncidentLines(summary),
    "",
    "## Deterministic Opportunities",
    "",
    ...renderOpportunityLines(summary),
    "",
    "## Methodology And Limitations",
    "",
    ...renderMethodologyLines(metrics),
    "",
    "## Inventory",
    "",
    ...renderInventoryLines(metrics),
    "",
    "## Report Metadata",
    "",
    `- Analytics engine version: \`${metrics.engineVersion}\``,
    `- Schema version: \`${metrics.schemaVersion}\``,
    `- Parse warnings: \`${metrics.parseWarningCount}\``,
    "",
    "Incident evidence is redacted and truncated for compact reporting. Preview sanitization reduces common sensitive data exposure but is not a guarantee of full anonymization.",
  ];

  return `${lines.join("\n").trim()}\n`;
}
