/**
 * Purpose: Tests for friction scoring calculations.
 * Entrypoint: Executed by Vitest via `pnpm test`.
 * Notes: Verifies session friction is incident-only and dominant labels ignore cue/positive signals.
 */
import { describe, expect, it } from "vitest";

import {
  calculateFrictionScore,
  dominantLabelsForSession,
  getIncidentLabelWeight,
} from "../src/friction-scoring.js";
import type { LabelName } from "../src/schema.js";
import { createEmptySessionLabelMap } from "../src/summary/index.js";

describe("getIncidentLabelWeight", () => {
  it("returns positive weights for incident-family friction labels", () => {
    expect(getIncidentLabelWeight("context_drift")).toBe(4);
    expect(getIncidentLabelWeight("test_build_lint_failure_complaint")).toBe(5);
    expect(getIncidentLabelWeight("regression_report")).toBe(5);
    expect(getIncidentLabelWeight("stalled_or_guessing")).toBe(5);
  });
});

describe("calculateFrictionScore", () => {
  it("returns 0 for empty label counts with perfect compliance", () => {
    const emptyCounts = createEmptySessionLabelMap();
    expect(calculateFrictionScore(emptyCounts, 100)).toBe(0);
  });

  it("calculates incident-only weighted sums", () => {
    const labelCounts: Record<LabelName, number> = {
      ...createEmptySessionLabelMap(),
      context_drift: 2,
    };
    expect(calculateFrictionScore(labelCounts, 100)).toBe(8);
  });

  it("applies compliance penalty for scores below 100", () => {
    const labelCounts = createEmptySessionLabelMap();
    expect(calculateFrictionScore(labelCounts, 80)).toBe(2);
  });

  it("combines incident weights with compliance penalty", () => {
    const labelCounts: Record<LabelName, number> = {
      ...createEmptySessionLabelMap(),
      context_drift: 1,
      regression_report: 1,
    };
    expect(calculateFrictionScore(labelCounts, 90)).toBe(10);
  });

  it("ignores cue and positive labels in session friction", () => {
    const labelCounts: Record<LabelName, number> = {
      ...createEmptySessionLabelMap(),
      interrupt: 5,
      context_reinjection: 3,
      verification_request: 4,
      praise: 2,
    };
    expect(calculateFrictionScore(labelCounts, 100)).toBe(0);
  });

  it("rounds to 1 decimal place", () => {
    const labelCounts: Record<LabelName, number> = {
      ...createEmptySessionLabelMap(),
      context_drift: 1,
    };
    expect(calculateFrictionScore(labelCounts, 95)).toBe(4.5);
  });
});

describe("dominantLabelsForSession", () => {
  it("returns empty array when no incident labels are present", () => {
    const labelCounts: Record<LabelName, number> = {
      ...createEmptySessionLabelMap(),
      interrupt: 2,
      praise: 1,
    };
    expect(dominantLabelsForSession(labelCounts)).toEqual([]);
  });

  it("returns incident labels sorted by count descending", () => {
    const labelCounts: Record<LabelName, number> = {
      ...createEmptySessionLabelMap(),
      context_drift: 10,
      regression_report: 5,
      interrupt: 100,
    };
    expect(dominantLabelsForSession(labelCounts)).toEqual([
      "context_drift",
      "regression_report",
    ]);
  });

  it("returns up to 3 incident labels", () => {
    const labelCounts: Record<LabelName, number> = {
      ...createEmptySessionLabelMap(),
      context_drift: 5,
      regression_report: 4,
      stalled_or_guessing: 3,
      test_build_lint_failure_complaint: 2,
    };
    expect(dominantLabelsForSession(labelCounts)).toEqual([
      "context_drift",
      "regression_report",
      "stalled_or_guessing",
    ]);
  });

  it("sorts alphabetically when incident counts are equal", () => {
    const labelCounts: Record<LabelName, number> = {
      ...createEmptySessionLabelMap(),
      context_drift: 5,
      regression_report: 5,
    };
    expect(dominantLabelsForSession(labelCounts)).toEqual([
      "context_drift",
      "regression_report",
    ]);
  });
});
