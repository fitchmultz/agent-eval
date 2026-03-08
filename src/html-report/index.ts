/**
 * Purpose: Public exports for the HTML report generation module.
 * Entrypoint: Use `renderHtmlReport()` to generate complete HTML reports.
 * Notes: HTML is self-contained with inline CSS for portability.
 */

export {
  renderBadges,
  renderBragCards,
  renderIncidentCards,
  renderInventoryList,
  renderMomentumCards,
  renderOpportunityList,
  renderScoreCards,
  renderSessionCards,
  renderSummaryCards,
  renderVictoryLapCards,
} from "./cards.js";
export { renderHtmlReport } from "./render.js";
export { loadStyles, renderStyles } from "./styles.js";
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
} from "./templates.js";
