/**
 * Purpose: Unit tests for ranking module.
 * Entrypoint: Run with `pnpm test tests/ranking.test.ts`
 * Notes: Tests severity and confidence ranking utilities.
 */

import { describe, expect, it } from "vitest";
import {
  chooseMaxConfidence,
  chooseMaxSeverity,
  confidenceRank,
  severityRank,
} from "../src/ranking.js";
import type { Confidence, Severity } from "../src/schema.js";

describe("severityRank", () => {
  it("should map severity values to increasing ranks", () => {
    expect(severityRank.get("info")).toBe(0);
    expect(severityRank.get("low")).toBe(1);
    expect(severityRank.get("medium")).toBe(2);
    expect(severityRank.get("high")).toBe(3);
  });

  it("should have all severity values", () => {
    expect(severityRank.size).toBe(4);
  });
});

describe("confidenceRank", () => {
  it("should map confidence values to increasing ranks", () => {
    expect(confidenceRank.get("low")).toBe(0);
    expect(confidenceRank.get("medium")).toBe(1);
    expect(confidenceRank.get("high")).toBe(2);
  });

  it("should have all confidence values", () => {
    expect(confidenceRank.size).toBe(3);
  });
});

describe("chooseMaxSeverity", () => {
  it("should return the highest severity from a list", () => {
    const severities: Severity[] = ["low", "high", "medium"];
    expect(chooseMaxSeverity(severities)).toBe("high");
  });

  it("should handle single value", () => {
    expect(chooseMaxSeverity(["info"])).toBe("info");
    expect(chooseMaxSeverity(["high"])).toBe("high");
  });

  it("should return first value for equal severities", () => {
    const severities: Severity[] = ["medium", "medium", "medium"];
    expect(chooseMaxSeverity(severities)).toBe("medium");
  });

  it("should handle descending order", () => {
    const severities: Severity[] = ["high", "medium", "low", "info"];
    expect(chooseMaxSeverity(severities)).toBe("high");
  });

  it("should handle ascending order", () => {
    const severities: Severity[] = ["info", "low", "medium", "high"];
    expect(chooseMaxSeverity(severities)).toBe("high");
  });
});

describe("chooseMaxConfidence", () => {
  it("should return the highest confidence from a list", () => {
    const confidences: Confidence[] = ["low", "high", "medium"];
    expect(chooseMaxConfidence(confidences)).toBe("high");
  });

  it("should handle single value", () => {
    expect(chooseMaxConfidence(["low"])).toBe("low");
    expect(chooseMaxConfidence(["high"])).toBe("high");
  });

  it("should return first value for equal confidences", () => {
    const confidences: Confidence[] = ["medium", "medium", "medium"];
    expect(chooseMaxConfidence(confidences)).toBe("medium");
  });

  it("should handle descending order", () => {
    const confidences: Confidence[] = ["high", "medium", "low"];
    expect(chooseMaxConfidence(confidences)).toBe("high");
  });

  it("should handle ascending order", () => {
    const confidences: Confidence[] = ["low", "medium", "high"];
    expect(chooseMaxConfidence(confidences)).toBe("high");
  });
});
