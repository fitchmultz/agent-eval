/**
 * Purpose: Tests for session archetype classification logic.
 * Entrypoint: Executed by Vitest via `pnpm test`.
 * Notes: Verifies archetype determination and labeling for different session patterns.
 */
import { describe, expect, it } from "vitest";

import {
  archetypeLabel,
  createArchetypeNote,
  determineArchetype,
} from "../src/session-archetype.js";

describe("archetypeLabel", () => {
  it("returns correct labels for all archetypes", () => {
    expect(archetypeLabel("verified_delivery")).toBe("Clean Ship");
    expect(archetypeLabel("unverified_delivery")).toBe("Needs Proof");
    expect(archetypeLabel("high_friction_recovery")).toBe("Recovery Run");
    expect(archetypeLabel("interrupted_non_write")).toBe("Interrupted Pass");
    expect(archetypeLabel("analysis_only")).toBe("Recon Only");
  });
});

describe("determineArchetype", () => {
  it("classifies verified delivery when writes and verifications exist with low friction", () => {
    const result = determineArchetype(
      5, // writeCount
      3, // verificationPassedCount
      [], // dominantLabels
      3.5, // frictionScore (below 6 threshold)
    );
    expect(result).toBe("verified_delivery");
  });

  it("classifies high friction recovery when writes and verifications exist with high friction", () => {
    const result = determineArchetype(
      5, // writeCount
      3, // verificationPassedCount
      ["context_drift", "interrupt"],
      8.5, // frictionScore (above 6 threshold)
    );
    expect(result).toBe("high_friction_recovery");
  });

  it("classifies unverified delivery when writes exist but no verifications", () => {
    const result = determineArchetype(
      5, // writeCount
      0, // verificationPassedCount
      [],
      2.0,
    );
    expect(result).toBe("unverified_delivery");
  });

  it("classifies interrupted non-write when no writes and interrupt label present", () => {
    const result = determineArchetype(
      0, // writeCount
      0, // verificationPassedCount
      ["interrupt"],
      0,
    );
    expect(result).toBe("interrupted_non_write");
  });

  it("classifies analysis only when no writes and no interrupt label", () => {
    const result = determineArchetype(
      0, // writeCount
      0, // verificationPassedCount
      ["praise", "context_drift"],
      0,
    );
    expect(result).toBe("analysis_only");
  });

  it("classifies analysis only for completely empty sessions", () => {
    const result = determineArchetype(0, 0, [], 0);
    expect(result).toBe("analysis_only");
  });
});

describe("createArchetypeNote", () => {
  it("creates note for verified delivery", () => {
    const note = createArchetypeNote("verified_delivery", [], {
      verificationPassedCount: 3,
      verificationCount: 4,
    });
    expect(note).toContain("passing verification (3/4)");
  });

  it("creates note for unverified delivery", () => {
    const note = createArchetypeNote("unverified_delivery", [], {
      verificationPassedCount: 0,
      verificationCount: 0,
    });
    expect(note).toContain("without a passing verification signal");
  });

  it("creates note for high friction recovery with dominant labels", () => {
    const note = createArchetypeNote(
      "high_friction_recovery",
      ["context_drift", "interrupt"],
      { verificationPassedCount: 2, verificationCount: 3 },
    );
    expect(note).toContain("notable operator burden");
    expect(note).toContain("context_drift, interrupt");
  });

  it("creates note for interrupted non-write", () => {
    const note = createArchetypeNote("interrupted_non_write", ["interrupt"], {
      verificationPassedCount: 0,
      verificationCount: 0,
    });
    expect(note).toContain("interruption-style signals");
    expect(note).toContain("interrupt");
  });

  it("creates note for analysis only with dominant labels", () => {
    const note = createArchetypeNote(
      "analysis_only",
      ["praise", "context_drift"],
      { verificationPassedCount: 0, verificationCount: 0 },
    );
    expect(note).toContain("analysis-heavy");
    expect(note).toContain("praise, context_drift");
  });

  it("creates note for analysis only without dominant labels", () => {
    const note = createArchetypeNote("analysis_only", [], {
      verificationPassedCount: 0,
      verificationCount: 0,
    });
    expect(note).toBe(
      "The session remained analysis-only with no dominant incident label.",
    );
  });
});
