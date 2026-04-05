/**
 * Purpose: Verifies release manifest helpers produce deterministic provenance and config fingerprints.
 * Responsibilities: Cover fingerprint recomputation against built manifests and preserve the emitted artifact inventory contract.
 * Scope: Unit coverage for release-manifest helper logic.
 * Usage: Executed by Vitest via `pnpm test`.
 * Invariants/Assumptions: Synthetic metrics, summary, and session facts are sufficient because the helper only depends on normalized evaluation inputs.
 */
import { describe, expect, it } from "vitest";

import {
  buildReleaseManifest,
  computeReleaseConfigFingerprint,
} from "../src/release-manifest.js";
import {
  createSessionFacts,
  createV3Metrics,
  createV3Summary,
} from "./support/v3-fixtures.js";

describe("release-manifest", () => {
  it("recomputes the live config fingerprint from manifest-visible fields", () => {
    const metrics = createV3Metrics();
    const summary = createV3Summary();
    const sessionFacts = createSessionFacts();
    const manifest = buildReleaseManifest(
      metrics,
      summary,
      sessionFacts,
      {
        source: "codex",
        home: "/tmp/codex-home",
        outputMode: "summary",
        sessionLimit: 10,
        timeBucket: "week",
      },
      ["metrics.json", "summary.json", "session-facts.jsonl"],
    );

    expect(manifest.configFingerprint).toBe(
      computeReleaseConfigFingerprint({
        evaluation: manifest.evaluation,
        corpusScope: manifest.corpusScope,
        appliedFilters: manifest.appliedFilters,
      }),
    );
    expect(manifest.artifactFiles).toEqual([
      "metrics.json",
      "summary.json",
      "session-facts.jsonl",
    ]);
  });
});
