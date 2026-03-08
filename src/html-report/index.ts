/**
 * Purpose: Public exports for the HTML report generation module.
 * Entrypoint: Use `renderHtmlReport()` to generate complete HTML reports.
 * Notes: HTML is self-contained with inline CSS for portability.
 */

export { renderHtmlReport } from "./render.js";
export {
  renderSummaryCards,
  renderBragCards,
  renderScoreCards,
  renderMomentumCards,
  renderBadges,
  renderIncidentCards,
  renderSessionCards,
  renderVictoryLapCards,
  renderOpportunityList,
  renderInventoryList,
} from "./cards.js";
export { renderComplianceTable, renderComparativeSliceTable } from "./tables.js";
export { renderStyles, loadStyles } from "./styles.js";
export { escapeHtml, createMetricCard, createScoreCard, createEmptyState, createSection, createMetricGrid } from "./templates.js";
