/**
 * Purpose: Tests markdown report generation for the v3 dashboard-first report contract.
 * Responsibilities: Verify section order, review/exemplar rendering, and convenience wrapper behavior.
 * Scope: Deterministic markdown surface generated from canonical metrics and summary artifacts.
 * Usage: Executed by Vitest via `pnpm test`.
 * Invariants/Assumptions: Report generation should read only v3 summary fields.
 */
import { describe, expect, it } from "vitest";

import { renderReport, renderSummaryReport } from "../src/report.js";
import {
  createIncidents,
  createRawTurns,
  createV3Metrics,
  createV3Summary,
} from "./support/v3-fixtures.js";

describe("renderSummaryReport", () => {
  it("renders the v3 markdown structure", () => {
    const report = renderSummaryReport(createV3Metrics(), createV3Summary());

    expect(report).toContain("# Transcript Analytics Report");
    expect(report).toContain("## Overview Dashboard");
    expect(report).toContain("## What Worked");
    expect(report).toContain("## Needs Review");
    expect(report).toContain("## Why This Happened");
    expect(report).toContain("## Comparative Slices");
  });

  it("renders singular surfaced-session wording cleanly", () => {
    const report = renderSummaryReport(createV3Metrics(), createV3Summary());

    expect(report).toContain(
      "1 exemplar session was surfaced from the selected corpus.",
    );
    expect(report).toContain(
      "1 exemplar session and 1 review session were surfaced from the de-templated transcript substrate.",
    );
    expect(report).not.toContain("1 exemplar sessions");
  });

  it("renders review, exemplar, and learning-pattern rows from v3 fields", () => {
    const report = renderSummaryReport(createV3Metrics(), createV3Summary());

    expect(report).toContain("Fix login regression and verify the build");
    expect(report).toContain(
      "Ship the CLI cleanup and verify the package build",
    );
    expect(report).toContain("attribution: agent_behavior/medium");
    expect(report).toContain("### What To Copy");
    expect(report).toContain("Verify after write before close");
    expect(report).toContain("evidence:");
  });

  it("renders a clear review empty state when no sessions are surfaced", () => {
    const report = renderSummaryReport(
      createV3Metrics(),
      createV3Summary({ exemplarSessions: [], reviewQueue: [] }),
    );

    expect(report).toContain("No exemplar sessions are available yet.");
    expect(report).toContain("No review-queue sessions were available.");
  });

  it("renders a deterministic no-data state", () => {
    const report = renderSummaryReport(
      createV3Metrics({
        sessionCount: 0,
        turnCount: 0,
        incidentCount: 0,
        sessions: [],
      }),
      createV3Summary({
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
    );

    expect(report).toContain("## No Data Yet");
  });
});

describe("renderReport", () => {
  it("builds a v3 summary from raw turns and incidents before rendering", () => {
    const report = renderReport(
      createV3Metrics(),
      createRawTurns(),
      createIncidents(),
    );

    expect(report).toContain("## Overview Dashboard");
    expect(report).toContain("## Needs Review");
  });
});
