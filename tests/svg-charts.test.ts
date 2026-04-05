/**
 * Purpose: Verifies the Phase 4 dashboard SVG charts render from canonical metrics and summary distributions.
 * Entrypoint: Executed by Vitest via `pnpm test`.
 * Notes: Covers empty and non-empty chart states after the presentation cutover.
 */
import { describe, expect, it } from "vitest";

import {
  renderAttributionMixChart,
  renderHarnessShareChart,
  renderProviderShareChart,
  renderSessionsOverTimeChart,
  renderToolFamilyShareChart,
} from "../src/svg-charts.js";
import { createV3Metrics, createV3Summary } from "./support/v3-fixtures.js";

describe("svg charts", () => {
  it("renders sessions-over-time from temporal buckets", () => {
    const svg = renderSessionsOverTimeChart(createV3Metrics());
    expect(svg).toContain("Sessions Over Time");
    expect(svg).toContain('data-chart="sessions-over-time"');
  });

  it("renders provider, harness, tool-family, and attribution charts", () => {
    const summary = createV3Summary();

    expect(renderProviderShareChart(summary)).toContain("Provider Share");
    expect(renderHarnessShareChart(summary)).toContain("Harness Share");
    expect(renderToolFamilyShareChart(summary)).toContain("Tool Family Share");
    expect(renderAttributionMixChart(summary)).toContain("Attribution Mix");
  });

  it("renders empty states when chart inputs are empty", () => {
    const metrics = createV3Metrics({
      temporalBuckets: {
        bucket: "week",
        values: [],
      },
    });
    const summary = createV3Summary({
      usageDashboard: {
        ...createV3Summary().usageDashboard,
        distributions: {
          providers: [],
          harnesses: [],
          models: [],
          toolFamilies: [],
          attribution: [],
        },
      },
    });

    expect(renderSessionsOverTimeChart(metrics)).toContain(
      "No time-bucket values were available",
    );
    expect(renderProviderShareChart(summary)).toContain(
      "No values were available for this chart",
    );
    expect(renderHarnessShareChart(summary)).toContain(
      "No values were available for this chart",
    );
    expect(renderToolFamilyShareChart(summary)).toContain(
      "No values were available for this chart",
    );
    expect(renderAttributionMixChart(summary)).toContain(
      "No values were available for this chart",
    );
  });
});
