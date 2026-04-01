/**
 * Purpose: Public exports for the HTML report generation module.
 * Entrypoint: Use `renderHtmlReport()` to generate complete HTML reports.
 * Notes: HTML is self-contained with inline CSS for portability.
 */

export {
  renderExecutiveSummaryCards,
  renderIncidentCards,
  renderInventoryList,
  renderMetricGlossary,
  renderOperatorMetrics,
  renderOpportunityList,
  renderSessionCards,
} from "./cards.js";
export { renderHtmlReport } from "./render.js";
export {
  renderComparativeSliceTable,
  renderComplianceTable,
} from "./tables.js";
export {
  createEmptyState,
  createMetricCard,
  createMetricGrid,
  createScoreCard,
  createSection,
  escapeHtml,
  renderStyles,
} from "./templates.js";
