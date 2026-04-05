/**
 * Purpose: HTML template helpers for report generation.
 * Entrypoint: Used by cards.ts, tables.ts, and render.ts for shared fragments and escaping.
 * Notes: Keeps renderer helpers tiny and presentation-only.
 */

/**
 * Escapes HTML special characters to prevent XSS.
 */
export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * Creates a metric card HTML element.
 */
export function createMetricCard(
  label: string,
  value: string,
  detail: string,
  tone: string,
  extraClass = "",
): string {
  return `
    <article class="metric-card tone-${escapeHtml(tone)} ${extraClass}">
      <div class="metric-label">${escapeHtml(label)}</div>
      <div class="metric-value">${escapeHtml(value)}</div>
      <div class="metric-detail">${escapeHtml(detail)}</div>
    </article>`;
}

/**
 * Creates an empty state message HTML.
 */
export function createEmptyState(message: string): string {
  return `<p class="empty-state">${escapeHtml(message)}</p>`;
}
