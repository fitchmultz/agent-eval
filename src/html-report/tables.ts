/**
 * Purpose: Table rendering components for v3 HTML reports.
 * Entrypoint: Used by render.ts for lower-page diagnostics and grouped comparative slices.
 * Notes: Tables favor raw counts and rates over proxy-heavy scoring and remain static/exportable.
 */

import type { ReportPresentationModel } from "../presentation-model.js";
import { escapeHtml } from "./templates.js";

export function renderComplianceTable(model: ReportPresentationModel): string {
  if (model.complianceDiagnostics.length === 0) {
    return '<p class="empty-state">No compliance diagnostics were available.</p>';
  }

  return [
    '<table class="report-table">',
    "<thead><tr><th>Rule</th><th>Pass %</th><th>Fail</th><th>Affected Sessions</th><th>N/A</th><th>Unknown</th></tr></thead>",
    "<tbody>",
    ...model.complianceDiagnostics.map(
      (rule) =>
        `<tr><td data-label="Rule">${escapeHtml(rule.rule)}</td><td data-label="Pass %">${rule.passRate}%</td><td data-label="Fail">${rule.failCount}</td><td data-label="Affected Sessions">${rule.affectedSessionCount}</td><td data-label="N/A">${rule.notApplicableCount}</td><td data-label="Unknown">${rule.unknownCount}</td></tr>`,
    ),
    "</tbody>",
    "</table>",
  ].join("");
}

function renderSliceFilterRow(
  filters: ReportPresentationModel["comparativeSliceGroups"][number]["slices"][number]["filters"],
): string {
  if (filters.length === 0) {
    return "";
  }

  return `<p class="slice-meta">${filters
    .map((filter) => `${escapeHtml(filter.label)}: ${escapeHtml(filter.value)}`)
    .join(" · ")}</p>`;
}

function renderSliceNotes(
  notes: ReportPresentationModel["comparativeSliceGroups"][number]["slices"][number]["notes"],
): string {
  if (notes.length === 0) {
    return "";
  }

  return `<ul class="stack-list">${notes
    .map(
      (note) =>
        `<li><strong>${escapeHtml(note.level)}</strong> — ${escapeHtml(note.message)}</li>`,
    )
    .join("")}</ul>`;
}

export function renderComparativeSliceGroups(
  model: ReportPresentationModel,
): string {
  return model.comparativeSliceGroups
    .map(
      (
        group,
      ) => `<details class="panel slice-group"${group.kind === "selected_corpus" ? " open" : ""}>
        <summary>${escapeHtml(group.title)}</summary>
        ${group.slices
          .map(
            (slice) => `<div class="slice-card">
              <h3>${escapeHtml(slice.label)}</h3>
              ${renderSliceFilterRow(slice.filters)}
              <table class="report-table compact-table">
                <tbody>
                  <tr><td data-label="Metric">Sessions</td><td data-label="Value">${slice.metrics.sessionCount}</td></tr>
                  <tr><td data-label="Metric">Turns</td><td data-label="Value">${slice.metrics.turnCount}</td></tr>
                  <tr><td data-label="Metric">Incidents</td><td data-label="Value">${slice.metrics.incidentCount}</td></tr>
                  <tr><td data-label="Metric">Write Sessions</td><td data-label="Value">${slice.metrics.writeSessionCount ?? "N/A"}</td></tr>
                  <tr><td data-label="Metric">Ended Verified</td><td data-label="Value">${slice.metrics.endedVerifiedCount ?? "N/A"}</td></tr>
                  <tr><td data-label="Metric">Ended Unverified</td><td data-label="Value">${slice.metrics.endedUnverifiedCount ?? "N/A"}</td></tr>
                  <tr><td data-label="Metric">Incidents / 100 Turns</td><td data-label="Value">${slice.metrics.incidentsPer100Turns ?? "N/A"}</td></tr>
                  <tr><td data-label="Metric">Interrupts / 100 Turns</td><td data-label="Value">${slice.metrics.interruptRatePer100Turns ?? "N/A"}</td></tr>
                </tbody>
              </table>
              ${renderSliceNotes(slice.notes)}
            </div>`,
          )
          .join("")}
      </details>`,
    )
    .join("");
}
