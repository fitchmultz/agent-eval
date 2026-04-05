/**
 * Purpose: Card and panel rendering components for v3 HTML reports.
 * Entrypoint: Used by render.ts for dashboard, learning, review, attribution, template, and inventory sections.
 * Notes: Prefers static HTML patterns such as details/summary and anchored cards over client-side interaction.
 */

import type {
  PresentationDistributionSection,
  PresentationMetricCard,
  PresentationPatternSection,
  PresentationSurfaceSection,
  ReportPresentationModel,
} from "../presentation-model.js";
import type { MetricsRecord, SummaryNote } from "../schema.js";
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

export function renderPill(value: string, extraClass = ""): string {
  return `<span class="pill ${extraClass}">${escapeHtml(value)}</span>`;
}

function renderChip(value: string, extraClass = ""): string {
  return `<span class="chip ${extraClass}">${escapeHtml(value)}</span>`;
}

export function renderStringList(
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

export function renderSummaryNotes(notes: readonly SummaryNote[]): string {
  if (notes.length === 0) {
    return "";
  }

  return `<ul class="note-list">${notes
    .map(
      (note) =>
        `<li class="note-item note-${escapeHtml(note.level)}"><strong>${escapeHtml(note.level)}</strong><span>${escapeHtml(note.message)}</span></li>`,
    )
    .join("")}</ul>`;
}

export function renderAppliedFilters(model: ReportPresentationModel): string {
  if (model.appliedFilters.length === 0) {
    return "";
  }

  return `<div class="filter-row">${model.appliedFilters
    .map((filter) =>
      renderPill(`${filter.label}: ${filter.value}`, "filter-pill"),
    )
    .join("")}</div>`;
}

function renderMetricCards(cards: readonly PresentationMetricCard[]): string {
  return cards
    .map((card) =>
      createMetricCard(
        card.label,
        card.value,
        card.detail,
        card.tone,
        card.emphasis === "secondary" ? "secondary-metric-card" : "",
      ),
    )
    .join("");
}

export function renderPrimaryMetricCards(
  model: ReportPresentationModel,
): string {
  return renderMetricCards(model.primaryMetrics);
}

export function renderSecondaryMetricCards(
  model: ReportPresentationModel,
): string {
  return renderMetricCards(model.secondaryMetrics);
}

export function renderOverviewHighlights(
  model: ReportPresentationModel,
): string {
  return renderStringList(
    model.highlights,
    "No overview highlights were available.",
  );
}

function renderDistributionSection(
  section: PresentationDistributionSection,
): string {
  if (section.entries.length === 0) {
    return `<div class="panel detail-panel"><h3>${escapeHtml(section.title)}</h3><p class="empty-state">${escapeHtml(section.emptyMessage)}</p></div>`;
  }

  return `<div class="panel detail-panel"><h3>${escapeHtml(section.title)}</h3><ul class="stack-list">${section.entries
    .map(
      (entry) =>
        `<li>${escapeHtml(entry.label)} — ${entry.count}${entry.pct === null ? "" : ` (${entry.pct}%)`}</li>`,
    )
    .join("")}</ul></div>`;
}

export function renderDashboardDistributions(
  model: ReportPresentationModel,
): string {
  return model.dashboardDistributions.map(renderDistributionSection).join("");
}

function renderPatternCards(section: PresentationPatternSection): string {
  if (section.items.length === 0) {
    return createEmptyState(section.emptyMessage);
  }

  return `<div class="pattern-grid">${section.items
    .map(
      (pattern) => `<article class="pattern-card">
        <div class="pattern-head">
          <h3>${escapeHtml(pattern.label)}</h3>
          ${renderPill(`${pattern.sessionCount ?? "N/A"} sessions`, "pattern-pill")}
        </div>
        <p>${escapeHtml(pattern.explanation)}</p>
        ${
          pattern.sourceSessionIds.length > 0
            ? `<div class="chip-row">${pattern.sourceSessionIds
                .map((sessionId) => renderChip(sessionId))
                .join("")}</div>`
            : ""
        }
      </article>`,
    )
    .join("")}</div>`;
}

export function renderSurfacePatterns(
  section: PresentationSurfaceSection,
): string {
  return section.patterns
    .map(
      (patternSection) =>
        `<div class="surface-pattern-block"><h3>${escapeHtml(patternSection.title)}</h3>${renderPatternCards(patternSection)}</div>`,
    )
    .join("");
}

function renderTrustPills(
  session: PresentationSurfaceSection["sessions"][number],
): string {
  const pills: string[] = [];

  if (session.provenance.titleSource !== "user") {
    pills.push(renderPill(`${session.provenance.titleSource} title`, "warn"));
  }
  if (session.provenance.titleConfidence !== "strong") {
    pills.push(
      renderPill(`title ${session.provenance.titleConfidence}`, "warn"),
    );
  }
  if (session.provenance.evidenceConfidence !== "strong") {
    pills.push(
      renderPill(`evidence ${session.provenance.evidenceConfidence}`, "warn"),
    );
  }

  return pills.join("");
}

function renderSurfaceCardMeta(
  variant: PresentationSurfaceSection["variant"],
  session: PresentationSurfaceSection["sessions"][number],
): string {
  const statusPills: string[] = [];

  const writeCount = session.metrics.writeCount ?? 0;
  const incidentCount = session.metrics.incidentCount ?? 0;

  if (variant === "exemplar") {
    if (session.metrics.endedVerified) {
      statusPills.push(renderPill("verified", "good"));
    }
    if (incidentCount === 0) {
      statusPills.push(renderPill("0 incidents", "good"));
    }
  } else {
    if (!session.metrics.endedVerified && writeCount > 0) {
      statusPills.push(renderPill("unverified", "warn"));
    }
    if (incidentCount > 0) {
      statusPills.push(renderPill(`${incidentCount} incidents`, "warn"));
    }
  }

  statusPills.push(
    renderPill(
      `${session.attribution.primary} · ${session.attribution.confidence}`,
      variant === "exemplar" ? "good subtle" : "warn subtle",
    ),
  );

  return `<div class="session-meta-row">
    <div class="meta-pills">
      ${session.provider ? renderPill(session.provider) : ""}
      ${session.harness ? renderPill(session.harness) : ""}
      ${session.projectLabel ? renderPill(session.projectLabel) : ""}
      ${session.timestampLabel ? renderPill(session.timestampLabel) : ""}
      ${statusPills.join("")}
      ${renderTrustPills(session)}
    </div>
  </div>`;
}

function renderSurfaceCards(section: PresentationSurfaceSection): string {
  if (section.sessions.length === 0) {
    return createEmptyState(section.emptyMessage);
  }

  return section.sessions
    .map((session) => {
      const cardId = `session-${escapeHtml(session.shortId)}`;
      const metadataLabel = [
        session.projectLabel,
        session.timestampLabel,
        session.shortId,
      ]
        .filter((value): value is string => Boolean(value))
        .join(" · ");

      return `<article class="surface-card surface-card-${section.variant}" id="${cardId}">
        ${renderSurfaceCardMeta(section.variant, session)}
        <h3>${escapeHtml(session.title)}</h3>
        ${metadataLabel.length > 0 && metadataLabel !== session.title ? `<p class="surface-subline">${escapeHtml(metadataLabel)}</p>` : ""}
        <div class="surface-block">
          <h4>${section.variant === "exemplar" ? "Why it worked" : "Why review"}</h4>
          ${renderStringList(session.whyIncluded, "No inclusion reasons were available.")}
        </div>
        <div class="surface-block">
          <h4>${section.variant === "exemplar" ? "Signals to copy" : "Inspect next"}</h4>
          <div class="chip-row">${session.reasonTags
            .map((tag) =>
              renderChip(tag, section.variant === "exemplar" ? "good" : "warn"),
            )
            .join("")}</div>
        </div>
        ${
          session.evidencePreviews[0]
            ? `<div class="surface-block"><h4>Evidence preview</h4><blockquote>${escapeHtml(session.evidencePreviews[0])}</blockquote></div>`
            : ""
        }
        <details class="surface-details">
          <summary>Evidence and provenance</summary>
          <div class="surface-block"><h4>Attribution reasons</h4>${renderStringList(
            session.attribution.reasons,
            "No attribution reasons were available.",
          )}</div>
          ${
            session.provenance.trustFlags.length > 0
              ? `<div class="surface-block"><h4>Trust flags</h4>${renderStringList(session.provenance.trustFlags)}</div>`
              : ""
          }
          ${
            session.evidencePreviews.length > 1
              ? `<div class="surface-block"><h4>Additional previews</h4>${renderStringList(session.evidencePreviews.slice(1))}</div>`
              : ""
          }
          ${
            session.sourceRefs.length > 0
              ? `<div class="surface-block"><h4>Source refs</h4><ul class="stack-list">${session.sourceRefs
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

export function renderSurfaceSection(
  section: PresentationSurfaceSection,
): string {
  return `<div class="surface-section-head"><p class="section-intro">${escapeHtml(section.intro)}</p></div>
    ${renderSurfacePatterns(section)}
    <div class="surface-grid">${renderSurfaceCards(section)}</div>`;
}

export function renderAttributionSummary(
  model: ReportPresentationModel,
): string {
  const counts = model.attributionSummary.counts;

  return `<div class="panel detail-panel">
    <h3>Attribution Breakdown</h3>
    <ul class="stack-list">
      <li><strong>user_scope</strong> — ${counts.user_scope}</li>
      <li><strong>agent_behavior</strong> — ${counts.agent_behavior}</li>
      <li><strong>template_artifact</strong> — ${counts.template_artifact}</li>
      <li><strong>mixed</strong> — ${counts.mixed}</li>
      <li><strong>unknown</strong> — ${counts.unknown}</li>
    </ul>
    ${renderSummaryNotes(model.attributionSummary.notes)}
  </div>`;
}

export function renderTemplateSubstrate(
  model: ReportPresentationModel,
): string {
  const substrate = model.templateSubstrate;

  return `<div class="panel detail-panel">
    <h3>Template Substrate</h3>
    <ul class="stack-list">
      <li><strong>Affected sessions</strong> — ${substrate.affectedSessionCount ?? "N/A"}</li>
      <li><strong>Affected session share</strong> — ${substrate.affectedSessionPct === null ? "N/A" : `${substrate.affectedSessionPct}%`}</li>
      <li><strong>Estimated template text share</strong> — ${substrate.estimatedTemplateTextSharePct === null ? "N/A" : `${substrate.estimatedTemplateTextSharePct}%`}</li>
    </ul>
    ${
      substrate.topFamilies.length > 0
        ? `<div class="surface-block"><h4>Top scaffold families</h4><ul class="stack-list">${substrate.topFamilies
            .map(
              (family) =>
                `<li><strong>${escapeHtml(family.label)}</strong> — ${family.affectedSessionCount} ${family.affectedSessionCount === 1 ? "session" : "sessions"}${family.estimatedTextSharePct === null ? "" : ` · ${family.estimatedTextSharePct}% text share`}</li>`,
            )
            .join("")}</ul></div>`
        : ""
    }
    ${renderSummaryNotes(substrate.notes)}
  </div>`;
}

export function renderCausePatterns(model: ReportPresentationModel): string {
  return model.causePatterns
    .map(
      (section) =>
        `<div class="panel detail-panel"><h3>${escapeHtml(section.title)}</h3>${renderPatternCards(section)}</div>`,
    )
    .join("");
}

export function renderInventoryList(model: ReportPresentationModel): string {
  const items = model.inventory.filter(
    (record) => record.discovered || record.required,
  );

  if (items.length === 0) {
    return createEmptyState("No inventory records were available.");
  }

  return `<ul class="inventory-list">${items
    .map(
      (record) => `<li>
        <div class="inventory-head">${renderPill(record.required ? "required" : "optional", record.required ? "required" : "optional")}${renderPill(record.provider)}${renderPill(record.kind)}</div>
        <strong>${escapeHtml(inventoryStatusLabel(record))}</strong>
        <code>${escapeHtml(record.path)}</code>
      </li>`,
    )
    .join("")}</ul>`;
}

export function renderMetadata(model: ReportPresentationModel): string {
  return `<ul class="stack-list">
    <li><strong>Engine</strong> — ${escapeHtml(model.metadata.engineVersion)}</li>
    <li><strong>Schema</strong> — ${escapeHtml(model.metadata.schemaVersion)}</li>
    <li><strong>Providers</strong> — ${escapeHtml(model.metadata.providers.join(", "))}</li>
    <li><strong>Parse warnings</strong> — ${model.metadata.parseWarningCount}</li>
  </ul>`;
}
