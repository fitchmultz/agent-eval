/**
 * Purpose: Card rendering components for HTML reports.
 * Entrypoint: Used by render.ts for operator-facing executive summary, triage queue, incidents, glossary, and inventory sections.
 * Notes: Prefers static HTML patterns such as details/summary and anchored cards over client-side interaction.
 */

import type { MetricsRecord, SummaryArtifact } from "../schema.js";
import {
  deriveSessionDisplayLabel,
  deriveSessionProjectLabel,
  deriveSessionShortId,
  deriveSessionTimestampLabel,
} from "../summary/session-display.js";
import { createEmptyState, createMetricCard, escapeHtml } from "./templates.js";

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

function renderPill(value: string, extraClass = ""): string {
  return `<span class="pill ${extraClass}">${escapeHtml(value)}</span>`;
}

function renderStringList(
  items: readonly string[],
  emptyMessage?: string,
): string {
  if (items.length === 0) {
    return emptyMessage
      ? `<p class="empty-state">${escapeHtml(emptyMessage)}</p>`
      : "";
  }

  return `<ul class="stack-list">${items
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("")}</ul>`;
}

export function renderExecutiveSummaryCards(summary: SummaryArtifact): string {
  const executiveSummary = summary.executiveSummary ?? {
    problem: "No persisted executive problem summary was available.",
    change: "No persisted recent-change summary was available.",
    action: "No persisted next-action summary was available.",
  };

  return [
    createMetricCard(
      "Problem",
      "What is wrong",
      executiveSummary.problem,
      "danger",
      "executive-card",
      "default",
    ),
    createMetricCard(
      "Recent Change",
      "What changed",
      executiveSummary.change,
      "neutral",
      "executive-card",
      "default",
    ),
    createMetricCard(
      "Next Action",
      "What to inspect first",
      executiveSummary.action,
      "warn",
      "executive-card",
      "default",
    ),
  ].join("");
}

export function renderOperatorMetrics(summary: SummaryArtifact): string {
  const operatorMetrics = summary.operatorMetrics ?? [];
  if (operatorMetrics.length === 0) {
    return createEmptyState("No operator action metrics were available.");
  }

  return operatorMetrics
    .map((metric) =>
      createMetricCard(
        metric.label,
        metric.value,
        metric.detail,
        metric.tone,
        "operator-metric-card",
        "default",
      ),
    )
    .join("");
}

export function renderSessionCards(summary: SummaryArtifact): string {
  if (summary.topSessions.length === 0) {
    return createEmptyState("No session insights were available.");
  }

  return summary.topSessions
    .map((session) => {
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
      const whySelected = session.whySelected ?? [];
      const failedRules = session.failedRules ?? [];
      const evidencePreviews = session.evidencePreviews ?? [];
      const trustFlags = session.trustFlags ?? [];
      const sourceRefs = session.sourceRefs ?? [];
      const evidencePreview = evidencePreviews[0];
      const cardId = `session-${escapeHtml(shortId)}`;
      return `
      <article class="session-card" id="${cardId}">
        <div class="incident-meta">
          ${renderPill(session.archetypeLabel)}
          ${renderPill(`friction ${session.frictionScore}`)}
          ${renderPill(`compliance ${session.complianceScore}`)}
          ${renderPill(`${session.incidentCount} incidents`)}
        </div>
        <h3>${escapeHtml(displayLabel)}</h3>
        <p class="session-subline">${escapeHtml(
          `${projectLabel} · ${timestampLabel} · ${shortId}`,
        )}</p>
        <p>${escapeHtml(session.note)}</p>
        <div class="queue-section">
          <h4>Why selected</h4>
          ${renderStringList(whySelected, "No persisted ranking reasons were available.")}
        </div>
        ${
          failedRules.length > 0
            ? `<div class="queue-section"><h4>Failed rules</h4>${renderStringList(failedRules)}</div>`
            : ""
        }
        ${
          evidencePreview
            ? `<div class="queue-section"><h4>Strongest evidence preview</h4><blockquote>${escapeHtml(evidencePreview)}</blockquote></div>`
            : ""
        }
        <details class="session-details">
          <summary>Evidence and provenance</summary>
          ${
            evidencePreviews.length > 1
              ? `<div class="queue-section"><h4>Additional previews</h4>${renderStringList(evidencePreviews.slice(1))}</div>`
              : ""
          }
          <div class="queue-section"><h4>Dominant labels</h4>${renderStringList(
            session.dominantLabels.length > 0
              ? session.dominantLabels
              : ["none"],
          )}</div>
          ${
            trustFlags.length > 0
              ? `<div class="queue-section"><h4>Trust flags</h4>${renderStringList(trustFlags)}</div>`
              : ""
          }
          ${
            sourceRefs.length > 0
              ? `<div class="queue-section"><h4>Source refs</h4><ul class="stack-list">${sourceRefs
                  .map(
                    (sourceRef) =>
                      `<li><code>${escapeHtml(sourceRef.path)}</code>${sourceRef.line ? ` · line ${sourceRef.line}` : ""}</li>`,
                  )
                  .join("")}</ul></div>`
              : ""
          }
        </details>
      </article>`;
    })
    .join("");
}

export function renderIncidentCards(summary: SummaryArtifact): string {
  if (summary.topIncidents.length === 0) {
    return createEmptyState("No labeled incidents were detected.");
  }

  return summary.topIncidents
    .map((incident) => {
      const humanSummary = incident.humanSummary ?? incident.summary;
      const sessionDisplayLabel =
        incident.sessionDisplayLabel ??
        deriveSessionDisplayLabel(incident.sessionId);
      const whySelected = incident.whySelected ?? [];
      const trustFlags = incident.trustFlags ?? [];
      const sourceRefs = incident.sourceRefs ?? [];
      return `
      <article class="incident-card severity-${incident.severity}">
        <div class="incident-meta">
          ${renderPill(incident.severity, "severity")}
          ${renderPill(incident.confidence, "confidence")}
          ${renderPill(`span ${incident.turnSpan}`)}
          <span class="session-ref">${escapeHtml(sessionDisplayLabel)}</span>
        </div>
        <h3>${escapeHtml(humanSummary)}</h3>
        ${renderStringList(whySelected, "No persisted incident-ranking reasons were available.")}
        <p>${escapeHtml(incident.evidencePreview ?? "No preview available.")}</p>
        <details class="session-details">
          <summary>Evidence and provenance</summary>
          ${
            trustFlags.length > 0
              ? `<div class="queue-section"><h4>Trust flags</h4>${renderStringList(trustFlags)}</div>`
              : ""
          }
          ${
            sourceRefs.length > 0
              ? `<div class="queue-section"><h4>Source refs</h4><ul class="stack-list">${sourceRefs
                  .map(
                    (sourceRef) =>
                      `<li><code>${escapeHtml(sourceRef.path)}</code>${sourceRef.line ? ` · line ${sourceRef.line}` : ""}</li>`,
                  )
                  .join("")}</ul></div>`
              : ""
          }
        </details>
      </article>`;
    })
    .join("");
}

export function renderOpportunityList(summary: SummaryArtifact): string {
  if (summary.opportunities.length === 0) {
    return createEmptyState(
      "No deterministic improvement opportunities were identified.",
    );
  }

  return summary.opportunities
    .map(
      (opportunity) => `
      <li>
        <strong>${escapeHtml(opportunity.title)}</strong>
        <span>${escapeHtml(opportunity.rationale)}</span>
      </li>`,
    )
    .join("");
}

export function renderMetricGlossary(summary: SummaryArtifact): string {
  const metricGlossary = summary.metricGlossary ?? [];
  if (metricGlossary.length === 0) {
    return createEmptyState("No metric glossary entries were available.");
  }

  return `<details class="panel glossary-panel"><summary>Metric glossary and caveats</summary><ul class="opportunity-list glossary-list">${metricGlossary
    .map(
      (entry) => `
      <li>
        <strong>${escapeHtml(entry.label)}</strong>
        <span>${escapeHtml(entry.plainLanguage)}</span>
        <span class="muted-inline">${escapeHtml(entry.caveat)}</span>
      </li>`,
    )
    .join("")}</ul></details>`;
}

export function renderInventoryList(metrics: MetricsRecord): string {
  const visibleInventory = metrics.inventory.filter(
    (record) => record.discovered || record.required,
  );

  if (visibleInventory.length === 0) {
    return createEmptyState(
      "No inventory records were available for this slice.",
    );
  }

  return `<details class="panel inventory-panel"><summary>${visibleInventory.length} visible inventory records</summary><ul class="inventory-list">${visibleInventory
    .map(
      (record) => `
      <li>
        <span class="pill">${escapeHtml(record.provider)}</span>
        <span class="pill ${record.required ? "required" : "optional"}">${record.required ? "required" : "optional"}</span>
        <strong>${escapeHtml(record.kind)}</strong>
        <span>${escapeHtml(inventoryStatusLabel(record))}</span>
        <code>${escapeHtml(record.path)}</code>
      </li>`,
    )
    .join("")}</ul></details>`;
}
