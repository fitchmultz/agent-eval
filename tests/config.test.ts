/**
 * Tests for the configuration system.
 */
import { describe, expect, it } from "vitest";
import { getConfig, resetConfig, setConfig } from "../src/config.js";

describe("config", () => {
  describe("getConfig", () => {
    it("returns default configuration values", () => {
      const config = getConfig();

      expect(config.concurrency.full).toBe(4);
      expect(config.concurrency.summary).toBe(8);
      expect(config.clustering.maxTurnGap).toBe(2);
      expect(config.previews.maxMessageLength).toBe(220);
      expect(config.previews.maxMessageItems).toBe(2);
      expect(config.previews.maxIncidentEvidence).toBe(3);
      expect(config.previews.maxTopIncidents).toBe(8);
      expect(config.previews.maxVictoryLaps).toBe(6);
      expect(config.previews.maxTopSessions).toBe(8);
      expect(config.scoring.frictionThreshold).toBe(6);
    });

    it("returns label weights for all label types", () => {
      const config = getConfig();

      expect(config.scoring.labelWeights).toEqual({
        context_drift: 4,
        test_build_lint_failure_complaint: 5,
        interrupt: 2,
        regression_report: 5,
        praise: -1,
        context_reinjection: 2,
        verification_request: 2,
        stalled_or_guessing: 5,
      });
    });
  });

  describe("setConfig", () => {
    it("updates concurrency settings", () => {
      setConfig({ concurrency: { full: 10 } });

      const config = getConfig();
      expect(config.concurrency.full).toBe(10);
      expect(config.concurrency.summary).toBe(8); // unchanged

      resetConfig();
    });

    it("updates clustering settings", () => {
      setConfig({ clustering: { maxTurnGap: 5 } });

      const config = getConfig();
      expect(config.clustering.maxTurnGap).toBe(5);

      resetConfig();
    });

    it("updates preview settings", () => {
      setConfig({
        previews: {
          maxMessageLength: 500,
          maxMessageItems: 5,
        },
      });

      const config = getConfig();
      expect(config.previews.maxMessageLength).toBe(500);
      expect(config.previews.maxMessageItems).toBe(5);
      expect(config.previews.maxIncidentEvidence).toBe(3); // unchanged

      resetConfig();
    });

    it("updates scoring settings", () => {
      setConfig({
        scoring: {
          frictionThreshold: 10,
          labelWeights: {
            context_drift: 8,
          },
        },
      });

      const config = getConfig();
      expect(config.scoring.frictionThreshold).toBe(10);
      expect(config.scoring.labelWeights.context_drift).toBe(8);
      expect(config.scoring.labelWeights.praise).toBe(-1); // unchanged

      resetConfig();
    });

    it("merges nested objects correctly", () => {
      setConfig({
        concurrency: { full: 2 },
        clustering: { maxTurnGap: 3 },
      });

      const config = getConfig();
      expect(config.concurrency.full).toBe(2);
      expect(config.concurrency.summary).toBe(8);
      expect(config.clustering.maxTurnGap).toBe(3);
      expect(config.previews.maxMessageLength).toBe(220);

      resetConfig();
    });
  });

  describe("resetConfig", () => {
    it("restores default configuration values", () => {
      setConfig({
        concurrency: { full: 100, summary: 200 },
        clustering: { maxTurnGap: 99 },
        previews: { maxMessageLength: 999 },
        scoring: { frictionThreshold: 999 },
      });

      resetConfig();
      const config = getConfig();

      expect(config.concurrency.full).toBe(4);
      expect(config.concurrency.summary).toBe(8);
      expect(config.clustering.maxTurnGap).toBe(2);
      expect(config.previews.maxMessageLength).toBe(220);
      expect(config.scoring.frictionThreshold).toBe(6);
    });
  });

  describe("config immutability", () => {
    it("returns independent copies on multiple getConfig calls", () => {
      resetConfig();
      const config1 = getConfig();

      setConfig({ concurrency: { full: 99 } });
      const config2 = getConfig();

      expect(config1.concurrency.full).toBe(4);
      expect(config2.concurrency.full).toBe(99);

      resetConfig();
    });
  });
});
