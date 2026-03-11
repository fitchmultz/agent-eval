/**
 * Purpose: Tests for friction scoring calculations.
 * Entrypoint: Executed by Vitest via `pnpm test`.
 * Notes: Verifies friction score calculation and dominant label detection.
 */
import { describe, expect, it } from "vitest";

import {
  calculateFrictionScore,
  dominantLabelsForSession,
  getLabelWeight,
} from "../src/friction-scoring.js";
import type { LabelName } from "../src/schema.js";
import { createEmptySessionLabelMap } from "../src/summary/index.js";

describe("getLabelWeight", () => {
  it("returns positive weights for friction-indicating labels", () => {
    expect(getLabelWeight("context_drift")).toBe(4);
    expect(getLabelWeight("test_build_lint_failure_complaint")).toBe(5);
    expect(getLabelWeight("interrupt")).toBe(2);
    expect(getLabelWeight("regression_report")).toBe(5);
    expect(getLabelWeight("stalled_or_guessing")).toBe(5);
  });

  it("returns negative weight for praise (reduces friction)", () => {
    expect(getLabelWeight("praise")).toBe(-1);
  });
});

describe("calculateFrictionScore", () => {
  it("returns 0 for empty label counts with perfect compliance", () => {
    const emptyCounts = createEmptySessionLabelMap();
    const score = calculateFrictionScore(emptyCounts, 100);
    expect(score).toBe(0);
  });

  it("calculates weighted sum of labels", () => {
    const labelCounts: Record<LabelName, number> = {
      ...createEmptySessionLabelMap(),
      context_drift: 2, // weight 4 -> 8
    };
    const score = calculateFrictionScore(labelCounts, 100);
    expect(score).toBe(8);
  });

  it("applies compliance penalty for scores below 100", () => {
    const labelCounts = createEmptySessionLabelMap();
    // 100 - 80 = 20, 20 / 10 = 2 penalty
    const score = calculateFrictionScore(labelCounts, 80);
    expect(score).toBe(2);
  });

  it("combines label weights with compliance penalty", () => {
    const labelCounts: Record<LabelName, number> = {
      ...createEmptySessionLabelMap(),
      context_drift: 1, // weight 4 -> 4
    };
    // Label weight: 4, Compliance penalty: (100-90)/10 = 1
    const score = calculateFrictionScore(labelCounts, 90);
    expect(score).toBe(5);
  });

  it("handles negative friction from praise", () => {
    const labelCounts: Record<LabelName, number> = {
      ...createEmptySessionLabelMap(),
      praise: 5, // weight -1 -> -5
    };
    const score = calculateFrictionScore(labelCounts, 100);
    expect(score).toBe(0); // clamped at 0
  });

  it("rounds to 1 decimal place", () => {
    const labelCounts: Record<LabelName, number> = {
      ...createEmptySessionLabelMap(),
      context_drift: 1, // weight 4 -> 4
    };
    // Label weight: 4, Compliance penalty: (100-95)/10 = 0.5
    // Total: 4.5
    const score = calculateFrictionScore(labelCounts, 95);
    expect(score).toBe(4.5);
  });
});

describe("dominantLabelsForSession", () => {
  it("returns empty array when no labels present", () => {
    const emptyCounts = createEmptySessionLabelMap();
    const dominant = dominantLabelsForSession(emptyCounts);
    expect(dominant).toEqual([]);
  });

  it("returns labels sorted by count descending", () => {
    const labelCounts: Record<LabelName, number> = {
      ...createEmptySessionLabelMap(),
      interrupt: 5,
      context_drift: 10,
      praise: 2,
    };
    const dominant = dominantLabelsForSession(labelCounts);
    expect(dominant).toEqual(["context_drift"]);
  });

  it("returns up to 3 labels", () => {
    const labelCounts: Record<LabelName, number> = {
      ...createEmptySessionLabelMap(),
      context_drift: 5,
      interrupt: 4,
      praise: 3,
      regression_report: 2,
      verification_request: 1,
    };
    const dominant = dominantLabelsForSession(labelCounts);
    expect(dominant).toHaveLength(2);
    expect(dominant).toEqual(["context_drift", "regression_report"]);
  });

  it("sorts alphabetically when counts are equal", () => {
    const labelCounts: Record<LabelName, number> = {
      ...createEmptySessionLabelMap(),
      interrupt: 5,
      context_drift: 5,
    };
    // "context_drift" < "interrupt" alphabetically
    const dominant = dominantLabelsForSession(labelCounts);
    expect(dominant).toEqual(["context_drift"]);
  });

  it("only includes labels with count > 0", () => {
    const labelCounts: Record<LabelName, number> = {
      ...createEmptySessionLabelMap(),
      interrupt: 5,
      context_drift: 0,
    };
    const dominant = dominantLabelsForSession(labelCounts);
    expect(dominant).toEqual([]);
  });
});
