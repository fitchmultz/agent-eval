/**
 * Purpose: Public exports for the HTML report generation module.
 * Entrypoint: Use `renderHtmlReport()` to generate complete HTML reports.
 * Notes: HTML is self-contained with inline CSS for portability.
 */

export {
  renderAppliedFilters,
  renderAttributionSummary,
  renderCausePatterns,
  renderDashboardDistributions,
  renderInventoryList,
  renderMetadata,
  renderOverviewHighlights,
  renderPrimaryMetricCards,
  renderSecondaryMetricCards,
  renderSummaryNotes,
  renderSurfaceSection,
  renderTemplateSubstrate,
} from "./cards.js";
export { renderHtmlReport } from "./render.js";
export { renderStyles } from "./styles.js";
export {
  renderComparativeSliceGroups,
  renderComplianceTable,
} from "./tables.js";
export {
  createEmptyState,
  createMetricCard,
  escapeHtml,
} from "./templates.js";
