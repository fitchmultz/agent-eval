/**
 * Purpose: Test coverage for Phase 3 comparative slices.
 * Entrypoint: Executed by Vitest via `pnpm test`.
 * Notes: Focuses on deterministic time-window, harness, workload, and template-band slices.
 */
import { describe, expect, it } from "vitest";

import { buildComparativeSlices } from "../src/comparative-slices.js";
import { buildSummaryInputsFromArtifacts } from "../src/summary/aggregation.js";
import {
  createIncidents,
  createRawTurns,
  createV3Metrics,
} from "./support/v3-fixtures.js";

describe("buildComparativeSlices", () => {
  it("always includes the selected corpus slice", () => {
    const metrics = createV3Metrics();
    const inputs = buildSummaryInputsFromArtifacts(
      metrics,
      createRawTurns(),
      createIncidents(),
    );
    const slices = buildComparativeSlices(metrics, inputs.sessions);

    expect(slices[0]?.key).toBe("selected_corpus");
    expect(slices[0]?.metrics.sessionCount).toBe(2);
  });

  it("adds time-window, provider, harness, and workload slices", () => {
    const metrics = createV3Metrics();
    const inputs = buildSummaryInputsFromArtifacts(
      metrics,
      createRawTurns(),
      createIncidents(),
    );
    const slices = buildComparativeSlices(metrics, inputs.sessions);

    expect(slices.some((slice) => slice.kind === "time_window")).toBe(true);
    expect(slices.some((slice) => slice.kind === "provider")).toBe(true);
    expect(slices.some((slice) => slice.kind === "harness")).toBe(true);
    expect(slices.some((slice) => slice.kind === "workload")).toBe(true);
  });

  it("anchors time windows to the selected corpus instead of wall-clock time", () => {
    const metrics = createV3Metrics({
      appliedFilters: {
        ...createV3Metrics().appliedFilters,
        endDate: "2026-04-03",
      },
    });
    const inputs = buildSummaryInputsFromArtifacts(
      metrics,
      createRawTurns(),
      createIncidents(),
    );
    const firstRun = buildComparativeSlices(metrics, inputs.sessions);
    const secondRun = buildComparativeSlices(metrics, inputs.sessions);

    expect(firstRun).toEqual(secondRun);
  });

  it("adds template-band slices when template-heavy sessions are present", () => {
    const metrics = createV3Metrics();
    const inputs = buildSummaryInputsFromArtifacts(
      metrics,
      createRawTurns(),
      createIncidents(),
    );
    const firstSession = inputs.sessions[0];
    if (!firstSession) {
      throw new Error("Expected at least one summary session.");
    }
    inputs.sessions[0] = {
      ...firstSession,
      template: {
        artifactScore: 70,
        textSharePct: 65,
        hasTemplateContent: true,
        flags: ["template_heavy"],
        dominantFamilyId: "family-a",
        dominantFamilyLabel: "instruction_scaffold",
      },
    };
    const slices = buildComparativeSlices(metrics, inputs.sessions);

    expect(
      slices.some(
        (slice) =>
          slice.kind === "template_band" && slice.label === "High Template",
      ),
    ).toBe(true);
    expect(
      slices.some(
        (slice) =>
          slice.kind === "template_band" && slice.label === "Low Template",
      ),
    ).toBe(true);
  });
});
