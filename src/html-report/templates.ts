/**
 * Purpose: HTML template fragments for report generation.
 * Entrypoint: Used by cards.ts and render.ts for HTML structure.
 * Notes: Shared template utilities and HTML escaping.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STYLES_PATH = join(__dirname, "..", "styles", "report.css");

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
 * Creates a score card HTML element with /100 suffix.
 */
export function createScoreCard(
  title: string,
  score: number,
  detail: string,
  tone: string,
): string {
  return `
    <article class="metric-card tone-${escapeHtml(tone)} score-card">
      <div class="metric-label">${escapeHtml(title)}</div>
      <div class="metric-value">${score}<span class="metric-suffix">/100</span></div>
      <div class="metric-detail">${escapeHtml(detail)}</div>
    </article>`;
}

/**
 * Creates an empty state message HTML.
 */
export function createEmptyState(message: string): string {
  return `<p class="empty-state">${escapeHtml(message)}</p>`;
}

/**
 * Creates a section wrapper HTML.
 */
export function createSection(title: string, content: string): string {
  return `<section><h2>${escapeHtml(title)}</h2>${content}</section>`;
}

/**
 * Creates a metric grid wrapper HTML.
 */
export function createMetricGrid(cards: string[]): string {
  return `<div class="metric-grid">${cards.join("")}</div>`;
}

/**
 * Loads CSS styles from external file.
 * Falls back to empty string if file cannot be read.
 */
function loadStyles(): string {
  try {
    return readFileSync(STYLES_PATH, "utf8");
  } catch {
    // Fallback: return empty string - styles will be loaded from external file
    return "";
  }
}

/**
 * Generates the CSS styles for the HTML report.
 * @returns CSS string
 */
export function renderStyles(): string {
  return loadStyles();
}
