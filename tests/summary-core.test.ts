/**
 * Purpose: Verifies v3 summary artifact generation stays deterministic after the Phase 3 summary-core cutover.
 * Responsibilities: Cover top-level sections, independent exemplars/review rows, and populated learning patterns.
 * Scope: Deterministic summary generation from canonical metrics plus summary inputs.
 * Usage: Executed by Vitest via `pnpm test`.
 * Invariants/Assumptions: The v3 summary contract is the only supported canonical summary shape.
 */
import { describe, expect, it } from "vitest";
import { buildSummaryInputsFromArtifacts } from "../src/summary/aggregation.js";
import { buildSummaryArtifact } from "../src/summary-core.js";
import {
  createIncidents,
  createRawTurns,
  createV3Metrics,
} from "./support/v3-fixtures.js";

describe("buildSummaryArtifact", () => {
  it("emits the v3 top-level sections with populated exemplars and patterns", () => {
    const metrics = createV3Metrics();
    const summary = buildSummaryArtifact(
      metrics,
      buildSummaryInputsFromArtifacts(
        metrics,
        createRawTurns(),
        createIncidents(),
      ),
    );

    expect(summary.schemaVersion).toBe("3");
    expect(summary.overview.title).toBe("Transcript Analytics Report");
    expect(summary.usageDashboard.headlineMetrics.sessions).toBe(2);
    expect(
      summary.exemplarSessions.map((session) => session.sessionId),
    ).toContain("session-2");
    expect(summary.reviewQueue.map((session) => session.sessionId)).toContain(
      "session-1",
    );
    expect(summary.learningPatterns.whatToCopy.length).toBeGreaterThan(0);
    expect(summary.learningPatterns.whatToAvoid.length).toBeGreaterThan(0);
    const exemplarIds = new Set(
      summary.exemplarSessions.map((session) => session.sessionId),
    );
    const reviewIds = new Set(
      summary.reviewQueue.map((session) => session.sessionId),
    );
    expect(
      summary.learningPatterns.whatToCopy.every((pattern) =>
        pattern.sourceSessionIds.every((sessionId) =>
          exemplarIds.has(sessionId),
        ),
      ),
    ).toBe(true);
    expect(
      summary.learningPatterns.whatToAvoid.every((pattern) =>
        pattern.sourceSessionIds.every((sessionId) => reviewIds.has(sessionId)),
      ),
    ).toBe(true);
  });

  it("keeps exemplar and review surfaces disjoint", () => {
    const metrics = createV3Metrics();
    const summary = buildSummaryArtifact(
      metrics,
      buildSummaryInputsFromArtifacts(
        metrics,
        createRawTurns(),
        createIncidents(),
      ),
    );

    const exemplarIds = new Set(
      summary.exemplarSessions.map((session) => session.sessionId),
    );
    expect(
      summary.reviewQueue.some((session) => exemplarIds.has(session.sessionId)),
    ).toBe(false);
  });

  it("builds Phase 3 comparative slice families from canonical facts", () => {
    const metrics = createV3Metrics();
    const summary = buildSummaryArtifact(
      metrics,
      buildSummaryInputsFromArtifacts(
        metrics,
        createRawTurns(),
        createIncidents(),
      ),
    );

    expect(
      summary.comparativeSlices.some((slice) => slice.kind === "provider"),
    ).toBe(true);
    expect(
      summary.comparativeSlices.some((slice) => slice.kind === "harness"),
    ).toBe(true);
    expect(
      summary.comparativeSlices.some((slice) => slice.kind === "time_window"),
    ).toBe(true);
  });
});
