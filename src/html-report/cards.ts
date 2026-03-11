/**
 * Purpose: Card rendering components for HTML reports.
 * Entrypoint: Used by render.ts for all card-based sections.
 * Notes: Handles summary cards, highlight cards, score cards, momentum, incidents, sessions.
 */

import type { MetricsRecord, SummaryArtifact } from "../schema.js";
import { buildSummarySections } from "../summary-sections.js";
import {
  createEmptyState,
  createMetricCard,
  createScoreCard,
  escapeHtml,
} from "./templates.js";

const WRITE_DISCIPLINE_RULES = new Set([
  "scope_confirmed_before_major_write",
  "cwd_or_repo_echoed_before_write",
  "short_plan_before_large_change",
  "verification_after_code_changes",
]);

function hasApplicableDiscipline(summary: SummaryArtifact): boolean {
  return summary.compliance.some(
    (rule) =>
      WRITE_DISCIPLINE_RULES.has(rule.rule) &&
      rule.passCount + rule.failCount > 0,
  );
}

function formatScoreCardDisplay(
  summary: SummaryArtifact,
  card: SummaryArtifact["scoreCards"][number],
): { score: number | string; detail: string; tone: typeof card.tone } {
  if (
    card.title === "Verification Proxy Score" &&
    summary.delivery.sessionsWithWrites === 0
  ) {
    return {
      score: "N/A",
      detail: "No write sessions were observed in this slice.",
      tone: "neutral",
    };
  }

  if (
    card.title === "Workflow Proxy Score" &&
    !hasApplicableDiscipline(summary)
  ) {
    return {
      score: "N/A",
      detail: "No write-related compliance rules were exercised in this slice.",
      tone: "neutral",
    };
  }

  return {
    score: card.score,
    detail: card.detail,
    tone: card.tone,
  };
}

/**
 * Renders the summary metric cards section.
 */
export function renderSummaryCards(summary: SummaryArtifact): string {
  const sections = buildSummarySections(summary);
  const cards = [
    {
      label: "Sessions",
      value: `${summary.sessions}`,
      detail: "Parsed transcript sessions",
      tone: "neutral",
    },
    {
      label: "Incidents / 100 Turns",
      value: `${summary.rates.incidentsPer100Turns}`,
      detail: "Aggregate friction density",
      tone: "neutral",
    },
    ...sections.headlineInsights.map((card) => ({
      label: card.title,
      value: card.value,
      detail: card.detail,
      tone: card.tone,
    })),
  ];

  return cards
    .map((card) =>
      createMetricCard(
        card.label,
        card.value,
        card.detail,
        card.tone ?? "neutral",
      ),
    )
    .join("");
}

/**
 * Renders the highlight cards section.
 */
export function renderHighlightCards(summary: SummaryArtifact): string {
  if (summary.highlightCards.length === 0) {
    return createEmptyState("No highlight cards available for this slice.");
  }

  return summary.highlightCards
    .map((card) =>
      createMetricCard(
        card.title,
        card.value,
        card.detail,
        card.tone,
        "brag-card",
      ),
    )
    .join("");
}

/**
 * Renders the score cards section.
 */
export function renderScoreCards(summary: SummaryArtifact): string {
  if (summary.scoreCards.length === 0) {
    return createEmptyState("No score cards available for this slice.");
  }

  return summary.scoreCards
    .map((card) => {
      const display = formatScoreCardDisplay(summary, card);
      return createScoreCard(
        card.title,
        display.score,
        display.detail,
        display.tone,
      );
    })
    .join("");
}

/**
 * Renders the momentum cards section.
 */
export function renderMomentumCards(summary: SummaryArtifact): string {
  const sections = buildSummarySections(summary);
  if (sections.recentMomentum.length === 0) {
    return createEmptyState(
      "Not enough sessions in this slice for recent-vs-corpus momentum comparisons yet.",
    );
  }

  return sections.recentMomentum
    .map((card) =>
      createMetricCard(
        card.title,
        card.value,
        card.detail,
        card.tone,
        "score-card",
      ),
    )
    .join("");
}

/**
 * Renders the recognitions section.
 */
export function renderRecognitions(summary: SummaryArtifact): string {
  if (summary.recognitions.length === 0) {
    return createEmptyState("No recognitions earned for this slice yet.");
  }

  return summary.recognitions
    .map(
      (recognition) => `<span class="badge">${escapeHtml(recognition)}</span>`,
    )
    .join("");
}

/**
 * Renders the incident cards section.
 */
export function renderIncidentCards(summary: SummaryArtifact): string {
  if (summary.topIncidents.length === 0) {
    return createEmptyState("No labeled incidents were detected.");
  }

  return summary.topIncidents
    .map(
      (incident) => `
      <article class="incident-card severity-${incident.severity}">
        <div class="incident-meta">
          <span class="pill severity">${escapeHtml(incident.severity)}</span>
          <span class="pill confidence">${escapeHtml(incident.confidence)}</span>
          <span class="pill">span ${incident.turnSpan}</span>
          <span class="session-ref">${escapeHtml(incident.sessionId)}</span>
        </div>
        <h3>${escapeHtml(incident.summary)}</h3>
        <p>${escapeHtml(incident.evidencePreview ?? "No preview available.")}</p>
      </article>`,
    )
    .join("");
}

/**
 * Renders the session cards section.
 */
export function renderSessionCards(summary: SummaryArtifact): string {
  if (summary.topSessions.length === 0) {
    return createEmptyState("No session insights were available.");
  }

  return summary.topSessions
    .map(
      (session) => `
      <article class="session-card">
        <div class="incident-meta">
          <span class="pill">${escapeHtml(session.archetypeLabel)}</span>
          <span class="pill">friction ${session.frictionScore}</span>
          <span class="pill">score ${session.complianceScore}</span>
        </div>
        <h3>${escapeHtml(session.sessionId)}</h3>
        <p>${escapeHtml(session.note)}</p>
        <p class="session-detail">Dominant labels: ${escapeHtml(session.dominantLabels.join(", ") || "none")}</p>
      </article>`,
    )
    .join("");
}

/**
 * Renders the verified delivery spotlight cards section.
 */
export function renderVerifiedDeliverySpotlightCards(
  summary: SummaryArtifact,
): string {
  if (summary.verifiedDeliverySpotlights.length === 0) {
    return createEmptyState(
      "No clean verified delivery sessions were available in this slice.",
    );
  }

  return summary.verifiedDeliverySpotlights
    .map(
      (session) => `
      <article class="session-card verified-delivery-spotlight">
        <div class="incident-meta">
          <span class="pill">${escapeHtml(session.archetypeLabel)}</span>
          <span class="pill">score ${session.complianceScore}</span>
          <span class="pill">${session.verificationPassedCount} verifications</span>
          <span class="pill">${session.incidentCount} incidents</span>
        </div>
        <h3>${escapeHtml(session.sessionId)}</h3>
        <p>${escapeHtml(session.note)}</p>
      </article>`,
    )
    .join("");
}

/**
 * Renders the opportunities list section.
 */
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

/**
 * Renders the inventory list section.
 */
export function renderInventoryList(metrics: MetricsRecord): string {
  const visibleInventory = metrics.inventory.filter(
    (record) => record.discovered || record.required,
  );

  if (visibleInventory.length === 0) {
    return createEmptyState(
      "No inventory records were available for this slice.",
    );
  }

  return visibleInventory
    .map(
      (record) => `
      <li>
        <span class="pill">${escapeHtml(record.provider)}</span>
        <span class="pill ${record.required ? "required" : "optional"}">${record.required ? "required" : "optional"}</span>
        <strong>${escapeHtml(record.kind)}</strong>
        <span>${record.discovered ? "present" : "missing"}</span>
        <code>${escapeHtml(record.path)}</code>
      </li>`,
    )
    .join("");
}
