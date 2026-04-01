/**
 * Purpose: Table rendering components for HTML reports.
 * Entrypoint: Used by render.ts for compliance and comparative slices sections.
 * Notes: Tables are intentionally compact and operator-oriented rather than exhaustive dashboards.
 */

import type { SummaryArtifact } from "../schema.js";
import { escapeHtml } from "./templates.js";

function formatComparativeSliceValue(
  slice: SummaryArtifact["comparativeSlices"][number],
  field:
    | "flowProxyScore"
    | "verificationProxyScore"
    | "workflowProxyScore"
    | "writeSessionVerificationRate",
): string {
  const value = slice[field];
  if (value === null) {
    return "N/A";
  }

  return field === "writeSessionVerificationRate" ? `${value}%` : `${value}`;
}

/**
 * Renders the compliance rules table.
 */
export function renderComplianceTable(summary: SummaryArtifact): string {
  return [
    `<table class="compliance-table">`,
    `<thead><tr><th>Rule</th><th>Pass %</th><th>Fail</th><th>Affected Sessions</th><th>N/A</th><th>Unknown</th></tr></thead>`,
    "<tbody>",
    ...summary.compliance.map(
      (rule) =>
        `<tr><td data-label="Rule">${escapeHtml(rule.rule)}</td><td data-label="Pass %">${rule.passRate}%</td><td data-label="Fail">${rule.failCount}</td><td data-label="Affected Sessions">${rule.affectedSessionCount}</td><td data-label="N/A">${rule.notApplicableCount}</td><td data-label="Unknown">${rule.unknownCount}</td></tr>`,
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
    `<thead><tr><th>Slice</th><th>Sessions</th><th>Write Verification</th><th>Verification Proxy</th><th>Workflow Proxy</th><th>Flow Proxy</th><th>Incidents / 100 Turns</th></tr></thead>`,
    "<tbody>",
    ...summary.comparativeSlices.map(
      (slice) =>
        `<tr><td data-label="Slice">${escapeHtml(slice.label)}</td><td data-label="Sessions">${slice.sessionCount}</td><td data-label="Write Verification">${escapeHtml(formatComparativeSliceValue(slice, "writeSessionVerificationRate"))}</td><td data-label="Verification Proxy">${escapeHtml(formatComparativeSliceValue(slice, "verificationProxyScore"))}</td><td data-label="Workflow Proxy">${escapeHtml(formatComparativeSliceValue(slice, "workflowProxyScore"))}</td><td data-label="Flow Proxy">${escapeHtml(formatComparativeSliceValue(slice, "flowProxyScore"))}</td><td data-label="Incidents / 100 Turns">${slice.incidentsPer100Turns}</td></tr>`,
    ),
    "</tbody>",
    "</table>",
  ].join("");
}
