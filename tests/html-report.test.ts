/**
 * Purpose: Verifies v3 HTML report generation produces valid, safe, dashboard-first output.
 * Entrypoint: Executed by Vitest via `pnpm test`.
 * Notes: Focuses on section order, chart embedding, and review/exemplar rendering after the v3 cutover.
 */
import { describe, expect, it } from "vitest";

import { renderHtmlReport } from "../src/html-report/index.js";
import { createV3Metrics, createV3Summary } from "./support/v3-fixtures.js";

const baseCharts = {
  sessionsOverTimeChartSvg: '<svg data-chart="sessions-over-time"></svg>',
  providerShareChartSvg: '<svg data-chart="provider-share"></svg>',
  harnessShareChartSvg: '<svg data-chart="harness-share"></svg>',
  toolFamilyShareChartSvg: '<svg data-chart="tool-family-share"></svg>',
  attributionMixChartSvg: '<svg data-chart="attribution-mix"></svg>',
};

describe("renderHtmlReport", () => {
  it("renders a complete HTML document", () => {
    const html = renderHtmlReport(
      createV3Summary(),
      createV3Metrics(),
      baseCharts,
    );

    expect(html).toContain("<!doctype html>");
    expect(html).toContain('<html lang="en">');
    expect(html).toContain("</html>");
  });

  it("renders the v3 section order", () => {
    const html = renderHtmlReport(
      createV3Summary(),
      createV3Metrics(),
      baseCharts,
    );

    expect(
      html.indexOf('<section id="overview"><h2>Overview Dashboard</h2>'),
    ).toBeLessThan(
      html.indexOf('<section id="what-worked"><h2>What Worked</h2>'),
    );
    expect(
      html.indexOf('<section id="what-worked"><h2>What Worked</h2>'),
    ).toBeLessThan(
      html.indexOf('<section id="needs-review"><h2>Needs Review</h2>'),
    );
    expect(
      html.indexOf('<section id="needs-review"><h2>Needs Review</h2>'),
    ).toBeLessThan(
      html.indexOf(
        '<section id="why-this-happened"><h2>Why This Happened</h2>',
      ),
    );
    expect(
      html.indexOf(
        '<section id="why-this-happened"><h2>Why This Happened</h2>',
      ),
    ).toBeLessThan(
      html.indexOf(
        '<section id="comparative-slices"><h2>Comparative Slices</h2>',
      ),
    );
  });

  it("renders singular surfaced-session wording cleanly", () => {
    const html = renderHtmlReport(
      createV3Summary(),
      createV3Metrics(),
      baseCharts,
    );

    expect(html).toContain(
      "1 exemplar session was surfaced from the selected corpus.",
    );
    expect(html).not.toContain("1 exemplar sessions");
  });

  it("renders exemplar, review, and learning content from v3 fields", () => {
    const html = renderHtmlReport(
      createV3Summary(),
      createV3Metrics(),
      baseCharts,
    );

    expect(html).toContain("Fix login regression and verify the build");
    expect(html).toContain("Ship the CLI cleanup and verify the package build");
    expect(html).toContain("Why it worked");
    expect(html).toContain("Why review");
    expect(html).toContain("What To Copy");
    expect(html).toContain("Attribution reasons");
    expect(html).not.toContain("Jump to first review session");
  });

  it("renders a clear empty exemplar state", () => {
    const html = renderHtmlReport(
      createV3Summary({ exemplarSessions: [] }),
      createV3Metrics(),
      baseCharts,
    );

    expect(html).toContain("No exemplar sessions are available yet.");
  });

  it("embeds the chart payloads in the overview section", () => {
    const html = renderHtmlReport(
      createV3Summary(),
      createV3Metrics(),
      baseCharts,
    );

    expect(html).toContain('data-chart="sessions-over-time"');
    expect(html).toContain('data-chart="provider-share"');
    expect(html).toContain('data-chart="harness-share"');
    expect(html).toContain('data-chart="tool-family-share"');
    expect(html).toContain('data-chart="attribution-mix"');
  });

  it("renders a deterministic empty corpus state", () => {
    const html = renderHtmlReport(
      createV3Summary({
        overview: {
          ...createV3Summary().overview,
          highlights: [],
        },
        usageDashboard: {
          ...createV3Summary().usageDashboard,
          headlineMetrics: {
            ...createV3Summary().usageDashboard.headlineMetrics,
            sessions: 0,
            writeSessions: 0,
            endedVerified: 0,
            endedUnverified: 0,
          },
        },
        reviewQueue: [],
      }),
      createV3Metrics({
        sessionCount: 0,
        turnCount: 0,
        incidentCount: 0,
        sessions: [],
      }),
      baseCharts,
    );

    expect(html).toContain("No Data Yet");
    expect(html).not.toContain(
      'Needs Review</h2><div class="sessions-grid">No review-queue sessions were available.',
    );
  });
});
