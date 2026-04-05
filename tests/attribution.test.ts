/**
 * Purpose: Verifies deterministic attribution stays conservative and transcript-grounded.
 * Responsibilities: Cover template_artifact, agent_behavior, user_scope, mixed, and unknown outcomes.
 * Scope: Unit coverage for the Phase 2 attribution rules.
 * Usage: Executed by Vitest via `pnpm test`.
 * Invariants/Assumptions: Unknown and mixed are preferred over over-claiming certainty.
 */
import { describe, expect, it } from "vitest";

import { assignSessionAttribution } from "../src/attribution.js";

describe("assignSessionAttribution", () => {
  it("assigns template_artifact from high template share and signal drop", () => {
    const attribution = assignSessionAttribution({
      rawLabelCounts: { verification_request: 3, context_reinjection: 1 },
      deTemplatedLabelCounts: {},
      template: {
        artifactScore: 70,
        textSharePct: 65,
        flags: ["template_heavy"],
      },
      writeCount: 0,
      endedVerified: false,
    });

    expect(attribution.primary).toBe("template_artifact");
    expect(attribution.confidence).toBe("high");
  });

  it("assigns agent_behavior from de-templated failure evidence", () => {
    const attribution = assignSessionAttribution({
      rawLabelCounts: { regression_report: 1 },
      deTemplatedLabelCounts: { regression_report: 1 },
      template: {
        artifactScore: 0,
        textSharePct: 0,
        flags: [],
      },
      writeCount: 1,
      endedVerified: false,
    });

    expect(attribution.primary).toBe("agent_behavior");
    expect(attribution.reasons).toContain(
      "Regression or breakage was reported.",
    );
  });

  it("assigns user_scope only from explicit user-side scope cues", () => {
    const attribution = assignSessionAttribution({
      rawLabelCounts: { interrupt: 1, context_reinjection: 1 },
      deTemplatedLabelCounts: { interrupt: 1, context_reinjection: 1 },
      template: {
        artifactScore: 0,
        textSharePct: 0,
        flags: [],
      },
      writeCount: 0,
      endedVerified: true,
    });

    expect(attribution.primary).toBe("user_scope");
  });

  it("assigns mixed when multiple cause classes are present", () => {
    const attribution = assignSessionAttribution({
      rawLabelCounts: { interrupt: 1, context_drift: 1 },
      deTemplatedLabelCounts: { interrupt: 1, context_drift: 1 },
      template: {
        artifactScore: 0,
        textSharePct: 0,
        flags: [],
      },
      writeCount: 0,
      endedVerified: true,
    });

    expect(attribution.primary).toBe("mixed");
    expect(attribution.confidence).toBe("low");
  });

  it("falls back to unknown when evidence is insufficient", () => {
    const attribution = assignSessionAttribution({
      rawLabelCounts: {},
      deTemplatedLabelCounts: {},
      template: {
        artifactScore: 0,
        textSharePct: 0,
        flags: [],
      },
      writeCount: 0,
      endedVerified: true,
    });

    expect(attribution.primary).toBe("unknown");
    expect(attribution.confidence).toBe("low");
  });
});
