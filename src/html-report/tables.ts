/**
 * Purpose: Table rendering components for HTML reports.
 * Entrypoint: Used by render.ts for all table-based sections.
 * Notes: Handles compliance table and comparative slices table.
 */

import type { SummaryArtifact } from "../schema.js";
import { escapeHtml } from "./templates.js";

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
        `<tr><td>${escapeHtml(slice.label)}</td><td>${slice.sessionCount}</td><td>${slice.proofScore}</td><td>${slice.flowScore}</td><td>${slice.disciplineScore}</td><td>${slice.writeVerificationRate}%</td><td>${slice.incidentsPer100Turns}</td></tr>`,
    ),
    "</tbody>",
    "</table>",
  ].join("");
}
