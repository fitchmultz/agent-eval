/**
 * Purpose: Verifies the shared Phase 5 presentation model stays aligned with canonical metrics and summary artifacts.
 * Responsibilities: Cover section composition, grouped comparative slices, propagated notes, and empty-corpus handling.
 * Scope: Presentation-model contract coverage beneath HTML/markdown renderer smoke tests.
 * Usage: Executed by Vitest via `pnpm test`.
 * Invariants/Assumptions: The presentation model is a deterministic derivative of canonical metrics and summary only.
 */
import { describe, expect, it } from "vitest";

import { buildReportPresentationModel } from "../src/presentation-model.js";
import { createV3Metrics, createV3Summary } from "./support/v3-fixtures.js";

describe("buildReportPresentationModel", () => {
  it("builds the expected top-level sections and grouped slices", () => {
    const model = buildReportPresentationModel(
      createV3Metrics(),
      createV3Summary(),
    );

    expect(model.title).toBe("Transcript Analytics Report");
    expect(model.primaryMetrics[0]?.label).toBe("Sessions");
    expect(model.worked.title).toBe("What Worked");
    expect(model.review.title).toBe("Needs Review");
    expect(model.causePatterns.map((section) => section.title)).toContain(
      "Agent Behavior Patterns",
    );
    expect(
      model.comparativeSliceGroups.some(
        (group) => group.title === "Selected Corpus And Time Windows",
      ),
    ).toBe(true);
  });

  it("propagates overview warnings and lower-page metadata", () => {
    const model = buildReportPresentationModel(
      createV3Metrics(),
      createV3Summary({
        overview: {
          ...createV3Summary().overview,
          coverageNotes: [
            {
              code: "coverage_1",
              level: "warning",
              message: "Coverage warning.",
            },
          ],
          sampleNotes: [
            {
              code: "sample_1",
              level: "warning",
              message: "Sample warning.",
            },
          ],
        },
      }),
    );

    expect(model.coverageNotes.length).toBeGreaterThan(0);
    expect(model.sampleNotes.length).toBeGreaterThan(0);
    expect(model.metadata.schemaVersion).toBe("3");
    expect(model.inventory.length).toBeGreaterThan(0);
  });

  it("renders deterministic empty-corpus state from canonical artifacts", () => {
    const model = buildReportPresentationModel(
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
        exemplarSessions: [],
        reviewQueue: [],
      }),
    );

    expect(model.isEmptyCorpus).toBe(true);
    expect(model.worked.sessions).toEqual([]);
    expect(model.review.sessions).toEqual([]);
  });
});
