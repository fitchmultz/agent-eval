/**
 * Purpose: Verify reports and presentation outputs stay aligned with the v3 canonical summary model.
 * Responsibilities: Ensure HTML, markdown, and charts are derived from the same v3 summary inputs.
 * Scope: Deterministic presentation contract after the v3 cutover.
 * Usage: Executed by Vitest via `pnpm test`.
 * Invariants/Assumptions: Presentation is derived from metrics and v3 summary only.
 */
import { describe, expect, it } from "vitest";

import { buildPresentationArtifacts } from "../src/presentation.js";
import { renderSummaryReport } from "../src/report.js";
import { createV3Metrics, createV3Summary } from "./support/v3-fixtures.js";

describe("presentation", () => {
  it("renders html and charts from the v3 summary", () => {
    const presentation = buildPresentationArtifacts(
      createV3Metrics(),
      createV3Summary(),
    );

    expect(presentation.reportHtml).toContain("Overview Dashboard");
    expect(presentation.reportHtml).toContain("What Worked");
    expect(presentation.sessionsOverTimeChartSvg).toContain("<svg");
    expect(presentation.providerShareChartSvg).toContain("<svg");
    expect(presentation.harnessShareChartSvg).toContain("<svg");
    expect(presentation.toolFamilyShareChartSvg).toContain("<svg");
    expect(presentation.attributionMixChartSvg).toContain("<svg");
  });

  it("keeps markdown and html aligned on core v3 sections", () => {
    const summary = createV3Summary();
    const metrics = createV3Metrics();
    const report = renderSummaryReport(metrics, summary);
    const presentation = buildPresentationArtifacts(metrics, summary);

    expect(report).toContain("## Overview Dashboard");
    expect(report).toContain("## Needs Review");
    expect(presentation.reportHtml).toContain("Overview Dashboard");
    expect(presentation.reportHtml).toContain("Needs Review");
  });
});
