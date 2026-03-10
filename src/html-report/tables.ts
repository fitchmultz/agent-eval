/**
 * Purpose: Table rendering components for HTML reports.
 * Entrypoint: Used by render.ts for all table-based sections.
 * Notes: Handles compliance table and comparative slices table.
 */

import type { SummaryArtifact } from "../schema.js";
import { escapeHtml } from "./templates.js";

function hasApplicableDiscipline(summary: SummaryArtifact): boolean {
  return summary.compliance.some(
    (rule) =>
      rule.rule !== "no_unverified_ending" &&
      rule.passCount + rule.failCount > 0,
  );
}

function formatComparativeSliceValue(
  summary: SummaryArtifact,
  slice: SummaryArtifact["comparativeSlices"][number],
  field: "proofScore" | "disciplineScore" | "writeVerificationRate",
): string {
  if (slice.key !== "selected_corpus") {
    return field === "writeVerificationRate"
      ? `${slice[field]}%`
      : `${slice[field]}`;
  }

  if (
    field === "writeVerificationRate" &&
    summary.delivery.sessionsWithWrites === 0
  ) {
    return "N/A";
  }

  if (field === "proofScore" && summary.delivery.sessionsWithWrites === 0) {
    return "N/A";
  }

  if (field === "disciplineScore" && !hasApplicableDiscipline(summary)) {
    return "N/A";
  }

  return field === "writeVerificationRate"
    ? `${slice[field]}%`
    : `${slice[field]}`;
}

/**
 * Renders the compliance rules table.
 */
export function renderComplianceTable(summary: SummaryArtifact): string {
  return [
    `<table class="compliance-table">`,
    `<thead><tr><th>Rule</th><th>Pass</th><th>Fail</th><th>N/A</th><th>Unknown</th></tr></thead>`,
    "<tbody>",
    ...summary.compliance.map(
      (rule) =>
        `<tr><td>${escapeHtml(rule.rule)}</td><td>${rule.passCount}</td><td>${rule.failCount}</td><td>${rule.notApplicableCount}</td><td>${rule.unknownCount}</td></tr>`,
    ),
    "</tbody>",
    "</table>",
  ].join("");
}

/**
 * Renders the comparative slices table.
 */
export function renderComparativeSliceTable(summary: SummaryArtifact): string {
  return [
    `<table class="compliance-table">`,
    `<thead><tr><th>Slice</th><th>Sessions</th><th>Proof</th><th>Flow</th><th>Discipline</th><th>Write Verification</th><th>Incidents / 100 Turns</th></tr></thead>`,
    "<tbody>",
    ...summary.comparativeSlices.map(
      (slice) =>
        `<tr><td>${escapeHtml(slice.label)}</td><td>${slice.sessionCount}</td><td>${escapeHtml(formatComparativeSliceValue(summary, slice, "proofScore"))}</td><td>${slice.flowScore}</td><td>${escapeHtml(formatComparativeSliceValue(summary, slice, "disciplineScore"))}</td><td>${escapeHtml(formatComparativeSliceValue(summary, slice, "writeVerificationRate"))}</td><td>${slice.incidentsPer100Turns}</td></tr>`,
    ),
    "</tbody>",
    "</table>",
  ].join("");
}
