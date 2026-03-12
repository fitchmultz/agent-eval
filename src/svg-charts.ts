/**
 * Purpose: Generates SVG bar charts for summary visualization.
 * Entrypoint: `renderBarChart()` is used by the presentation layer.
 * Notes: Charts are rendered as static SVG strings for portability.
 */
import { CHARTS } from "./constants/index.js";
import type { Severity, SummaryArtifact } from "./schema.js";

interface BarDatum {
  label: string;
  value: number;
  tone: string;
}

const severityTones: Record<Severity, string> = {
  info: "#5B8DEF",
  low: "#2E9E6F",
  medium: "#F4A259",
  high: "#D64545",
};

const labelChartPalette = ["#0F766E", "#1D8A7A", "#329F8A", "#49B39A"] as const;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function createEmptyChart(title: string, message: string): string {
  const width = CHARTS.WIDTH;
  const height = 140;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" class="report-chart" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMinYMin meet" role="img" aria-label="${escapeHtml(title)}">`,
    `<rect width="${width}" height="${height}" fill="#FFFDF8" />`,
    `<text x="12" y="30" font-size="22" font-weight="700" fill="#10263B">${escapeHtml(title)}</text>`,
    `<text x="12" y="82" font-size="15" fill="#5B6F82">${escapeHtml(message)}</text>`,
    "</svg>",
  ].join("");
}

/**
 * Renders a horizontal bar chart as an SVG string.
 *
 * @param title - The chart title displayed at the top
 * @param data - Array of bar data with labels, values, and colors
 * @returns SVG string
 */
export function renderBarChart(
  title: string,
  data: readonly BarDatum[],
): string {
  const nonZeroData = data.filter((entry) => entry.value > 0);
  const visibleData = nonZeroData.length > 0 ? nonZeroData : data;

  if (visibleData.length === 0) {
    return createEmptyChart(title, "No values were available for this slice.");
  }

  const width = CHARTS.WIDTH;
  const rowHeight = CHARTS.ROW_HEIGHT;
  const topPadding = CHARTS.TOP_PADDING;
  const leftPadding = CHARTS.LEFT_PADDING;
  const rightPadding = CHARTS.RIGHT_PADDING;
  const chartWidth = width - leftPadding - rightPadding;
  const height = topPadding + visibleData.length * rowHeight + 24;
  const maxValue = Math.max(1, ...visibleData.map((entry) => entry.value));

  const rows = visibleData
    .map((entry, index) => {
      const y = topPadding + index * rowHeight;
      const barWidth = Math.round((entry.value / maxValue) * chartWidth);
      return [
        `<text x="12" y="${y + 20}" font-size="14" fill="#17324D">${escapeHtml(entry.label)}</text>`,
        `<rect x="${leftPadding}" y="${y + 6}" width="${barWidth}" height="18" rx="6" fill="${entry.tone}" />`,
        `<text x="${leftPadding + barWidth + 10}" y="${y + 20}" font-size="13" fill="#17324D">${entry.value}</text>`,
      ].join("");
    })
    .join("");

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" class="report-chart" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMinYMin meet" role="img" aria-label="${escapeHtml(title)}">`,
    `<rect width="${width}" height="${height}" fill="#FFFDF8" />`,
    `<text x="12" y="30" font-size="22" font-weight="700" fill="#10263B">${escapeHtml(title)}</text>`,
    `<line x1="${leftPadding}" y1="44" x2="${leftPadding}" y2="${height - 12}" stroke="#D8E0E8" stroke-width="1" />`,
    rows,
    "</svg>",
  ].join("");
}

/**
 * Renders a bar chart of label counts.
 *
 * @param summary - The summary artifact containing label data
 * @returns SVG string
 */
export function renderLabelChart(summary: SummaryArtifact): string {
  if (summary.labels.length === 0) {
    return createEmptyChart(
      "Label Counts",
      "No labels were detected in this slice.",
    );
  }

  return renderBarChart(
    "Label Counts",
    summary.labels.map((entry, index) => ({
      label: entry.label,
      value: entry.count,
      tone: labelChartPalette[index % labelChartPalette.length] ?? "#0F766E",
    })),
  );
}

/**
 * Renders a bar chart of compliance pass counts.
 *
 * @param summary - The summary artifact containing compliance data
 * @returns SVG string
 */
export function renderComplianceChart(summary: SummaryArtifact): string {
  if (!summary.compliance.some((entry) => entry.passCount > 0)) {
    return createEmptyChart(
      "Compliance Pass Counts",
      "No passing compliance checks were recorded in this slice.",
    );
  }

  return renderBarChart(
    "Compliance Pass Counts",
    summary.compliance.map((entry) => ({
      label: entry.rule,
      value: entry.passCount,
      tone: "#335C81",
    })),
  );
}

/**
 * Renders a bar chart of incident severity distribution.
 *
 * @param summary - The summary artifact containing severity data
 * @returns SVG string
 */
export function renderSeverityChart(summary: SummaryArtifact): string {
  if (!summary.severities.some((entry) => entry.count > 0)) {
    return createEmptyChart(
      "Incident Severity",
      "No incidents were recorded in this slice.",
    );
  }

  return renderBarChart(
    "Incident Severity",
    summary.severities.map((entry) => ({
      label: entry.severity,
      value: entry.count,
      tone: severityTones[entry.severity],
    })),
  );
}
