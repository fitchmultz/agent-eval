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
  field:
    | "verificationProxyScore"
    | "workflowProxyScore"
    | "writeSessionVerificationRate",
): string {
  if (slice.key !== "selected_corpus") {
    return field === "writeSessionVerificationRate"
      ? `${slice[field]}%`
      : `${slice[field]}`;
  }

  if (
    field === "writeSessionVerificationRate" &&
    summary.delivery.sessionsWithWrites === 0
  ) {
    return "N/A";
  }

  if (
    field === "verificationProxyScore" &&
    summary.delivery.sessionsWithWrites === 0
  ) {
    return "N/A";
  }

  if (field === "workflowProxyScore" && !hasApplicableDiscipline(summary)) {
    return "N/A";
  }

  return field === "writeSessionVerificationRate"
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
        `<tr><td data-label="Rule">${escapeHtml(rule.rule)}</td><td data-label="Pass">${rule.passCount}</td><td data-label="Fail">${rule.failCount}</td><td data-label="N/A">${rule.notApplicableCount}</td><td data-label="Unknown">${rule.unknownCount}</td></tr>`,
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
    `<thead><tr><th>Slice</th><th>Sessions</th><th>Verification Proxy</th><th>Flow Proxy</th><th>Workflow Proxy</th><th>Write-Session Verification</th><th>Incidents / 100 Turns</th></tr></thead>`,
    "<tbody>",
    ...summary.comparativeSlices.map(
      (slice) =>
        `<tr><td data-label="Slice">${escapeHtml(slice.label)}</td><td data-label="Sessions">${slice.sessionCount}</td><td data-label="Verification Proxy">${escapeHtml(formatComparativeSliceValue(summary, slice, "verificationProxyScore"))}</td><td data-label="Flow Proxy">${slice.flowProxyScore}</td><td data-label="Workflow Proxy">${escapeHtml(formatComparativeSliceValue(summary, slice, "workflowProxyScore"))}</td><td data-label="Write-Session Verification">${escapeHtml(formatComparativeSliceValue(summary, slice, "writeSessionVerificationRate"))}</td><td data-label="Incidents / 100 Turns">${slice.incidentsPer100Turns}</td></tr>`,
    ),
    "</tbody>",
    "</table>",
  ].join("");
}
