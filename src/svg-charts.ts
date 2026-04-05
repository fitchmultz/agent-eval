/**
 * Purpose: Generates static SVG charts for the v3 dashboard surface.
 * Entrypoint: Used by the presentation layer to emit portable chart artifacts and inline HTML chart content.
 * Notes: Charts are deterministic, no-JS, and intentionally simple.
 */
import { CHARTS } from "./constants/index.js";
import type {
  DistributionEntry,
  MetricsRecord,
  SummaryArtifact,
} from "./schema.js";

interface BarDatum {
  label: string;
  value: number;
  tone: string;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function createEmptyChart(title: string, message: string, key: string): string {
  const width = CHARTS.WIDTH;
  const height = 140;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" class="report-chart" data-chart="${escapeHtml(key)}" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMinYMin meet" role="img" aria-label="${escapeHtml(title)}">`,
    `<rect width="${width}" height="${height}" fill="#FFFDF8" />`,
    `<text x="12" y="30" font-size="22" font-weight="700" fill="#10263B">${escapeHtml(title)}</text>`,
    `<text x="12" y="82" font-size="15" fill="#5B6F82">${escapeHtml(message)}</text>`,
    "</svg>",
  ].join("");
}

function renderHorizontalBarChart(
  title: string,
  key: string,
  data: readonly BarDatum[],
): string {
  const visibleData = data.filter((entry) => entry.value > 0);
  if (visibleData.length === 0) {
    return createEmptyChart(
      title,
      "No values were available for this chart.",
      key,
    );
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
    `<svg xmlns="http://www.w3.org/2000/svg" class="report-chart" data-chart="${escapeHtml(key)}" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMinYMin meet" role="img" aria-label="${escapeHtml(title)}">`,
    `<rect width="${width}" height="${height}" fill="#FFFDF8" />`,
    `<text x="12" y="30" font-size="22" font-weight="700" fill="#10263B">${escapeHtml(title)}</text>`,
    `<line x1="${leftPadding}" y1="44" x2="${leftPadding}" y2="${height - 12}" stroke="#D8E0E8" stroke-width="1" />`,
    rows,
    "</svg>",
  ].join("");
}

function renderVerticalBarChart(
  title: string,
  key: string,
  data: readonly { label: string; value: number }[],
): string {
  const visibleData = data.filter((entry) => entry.value > 0);
  if (visibleData.length === 0) {
    return createEmptyChart(
      title,
      "No time-bucket values were available for this chart.",
      key,
    );
  }

  const width = CHARTS.WIDTH;
  const height = 260;
  const top = 48;
  const bottom = 44;
  const left = 18;
  const right = 18;
  const chartWidth = width - left - right;
  const chartHeight = height - top - bottom;
  const maxValue = Math.max(1, ...visibleData.map((entry) => entry.value));
  const slotWidth = chartWidth / visibleData.length;
  const barWidth = Math.max(10, Math.min(42, slotWidth - 8));

  const rows = visibleData
    .map((entry, index) => {
      const barHeight = Math.round((entry.value / maxValue) * chartHeight);
      const x = left + index * slotWidth + (slotWidth - barWidth) / 2;
      const y = top + chartHeight - barHeight;
      const shortLabel =
        entry.label.length > 10 ? entry.label.slice(5) : entry.label;
      return [
        `<rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="6" fill="#335C81" />`,
        `<text x="${x + barWidth / 2}" y="${height - 14}" font-size="11" text-anchor="middle" fill="#5B6F82">${escapeHtml(shortLabel)}</text>`,
        `<text x="${x + barWidth / 2}" y="${Math.max(62, y - 6)}" font-size="11" text-anchor="middle" fill="#17324D">${entry.value}</text>`,
      ].join("");
    })
    .join("");

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" class="report-chart" data-chart="${escapeHtml(key)}" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMinYMin meet" role="img" aria-label="${escapeHtml(title)}">`,
    `<rect width="${width}" height="${height}" fill="#FFFDF8" />`,
    `<text x="12" y="30" font-size="22" font-weight="700" fill="#10263B">${escapeHtml(title)}</text>`,
    `<line x1="${left}" y1="${top + chartHeight}" x2="${width - right}" y2="${top + chartHeight}" stroke="#D8E0E8" stroke-width="1" />`,
    rows,
    "</svg>",
  ].join("");
}

function sortDistribution(
  entries: readonly DistributionEntry[],
): DistributionEntry[] {
  return [...entries].sort(
    (left, right) =>
      right.count - left.count || left.label.localeCompare(right.label),
  );
}

function fixedAttributionOrder(summary: SummaryArtifact): DistributionEntry[] {
  const byKey = new Map(
    summary.usageDashboard.distributions.attribution.map((entry) => [
      entry.key,
      entry,
    ]),
  );
  return [
    "user_scope",
    "agent_behavior",
    "template_artifact",
    "mixed",
    "unknown",
  ]
    .map((key) => byKey.get(key))
    .filter((entry): entry is DistributionEntry => Boolean(entry));
}

export function renderSessionsOverTimeChart(metrics: MetricsRecord): string {
  return renderVerticalBarChart(
    "Sessions Over Time",
    "sessions-over-time",
    metrics.temporalBuckets.values.map((entry) => ({
      label: entry.label,
      value: entry.sessionCount,
    })),
  );
}

export function renderProviderShareChart(summary: SummaryArtifact): string {
  return renderHorizontalBarChart(
    "Provider Share",
    "provider-share",
    sortDistribution(summary.usageDashboard.distributions.providers).map(
      (entry) => ({
        label: entry.label,
        value: entry.count,
        tone: "#0F766E",
      }),
    ),
  );
}

export function renderHarnessShareChart(summary: SummaryArtifact): string {
  return renderHorizontalBarChart(
    "Harness Share",
    "harness-share",
    sortDistribution(summary.usageDashboard.distributions.harnesses).map(
      (entry) => ({
        label: entry.label,
        value: entry.count,
        tone: "#335C81",
      }),
    ),
  );
}

export function renderToolFamilyShareChart(summary: SummaryArtifact): string {
  return renderHorizontalBarChart(
    "Tool Family Share",
    "tool-family-share",
    sortDistribution(summary.usageDashboard.distributions.toolFamilies).map(
      (entry) => ({
        label: entry.label,
        value: entry.count,
        tone: "#4F7CAC",
      }),
    ),
  );
}

export function renderAttributionMixChart(summary: SummaryArtifact): string {
  return renderHorizontalBarChart(
    "Attribution Mix",
    "attribution-mix",
    fixedAttributionOrder(summary).map((entry) => ({
      label: entry.label,
      value: entry.count,
      tone:
        entry.key === "agent_behavior"
          ? "#D64545"
          : entry.key === "user_scope"
            ? "#F4A259"
            : entry.key === "template_artifact"
              ? "#8A5CF6"
              : entry.key === "mixed"
                ? "#335C81"
                : "#7A8796",
    })),
  );
}
