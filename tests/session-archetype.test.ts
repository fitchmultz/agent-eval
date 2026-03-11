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
    expect(archetypeLabel("verified_delivery")).toBe("Ended-Verified Delivery");
    expect(archetypeLabel("unverified_delivery")).toBe(
      "Unverified Ending Delivery",
    );
    expect(archetypeLabel("high_friction_verified_delivery")).toBe(
      "High-Friction Ended-Verified Delivery",
    );
    expect(archetypeLabel("analysis_only")).toBe("Analysis Only");
  });
});

describe("determineArchetype", () => {
  it("classifies verified delivery when writes ended verified with low friction", () => {
    const result = determineArchetype(5, true, 3.5);
    expect(result).toBe("verified_delivery");
  });

  it("classifies high friction verified delivery when writes ended verified with high friction", () => {
    const result = determineArchetype(5, true, 8.5);
    expect(result).toBe("high_friction_verified_delivery");
  });

  it("classifies unverified delivery when writes exist but do not end verified", () => {
    const result = determineArchetype(5, false, 2.0);
    expect(result).toBe("unverified_delivery");
  });

  it("classifies analysis only when no writes occur", () => {
    const result = determineArchetype(0, false, 0);
    expect(result).toBe("analysis_only");
  });

  it("classifies analysis only for completely empty sessions", () => {
    const result = determineArchetype(0, false, 0);
    expect(result).toBe("analysis_only");
  });
});

describe("createArchetypeNote", () => {
  it("creates note for verified delivery", () => {
    const note = createArchetypeNote("verified_delivery", [], {
      endedVerified: true,
      verificationPassedCount: 3,
      verificationCount: 4,
    });
    expect(note).toContain("passing post-write verification signal (3/4");
  });

  it("creates note for unverified delivery", () => {
    const note = createArchetypeNote("unverified_delivery", [], {
      endedVerified: false,
      verificationPassedCount: 0,
      verificationCount: 0,
    });
    expect(note).toContain(
      "without a passing post-write verification after the final write",
    );
  });

  it("creates note for high friction verified delivery with dominant labels", () => {
    const note = createArchetypeNote(
      "high_friction_verified_delivery",
      ["context_drift", "interrupt"],
      {
        endedVerified: true,
        verificationPassedCount: 2,
        verificationCount: 3,
      },
    );
    expect(note).toContain("notable operator burden");
    expect(note).toContain("context_drift, interrupt");
  });

  it("creates note for analysis only with incident-like dominant labels", () => {
    const note = createArchetypeNote("analysis_only", ["interrupt"], {
      endedVerified: false,
      verificationPassedCount: 0,
      verificationCount: 0,
    });
    expect(note).toContain("analysis-heavy");
    expect(note).toContain("interrupt");
  });

  it("creates note for analysis only with dominant labels", () => {
    const note = createArchetypeNote(
      "analysis_only",
      ["praise", "context_drift"],
      {
        endedVerified: false,
        verificationPassedCount: 0,
        verificationCount: 0,
      },
    );
    expect(note).toContain("analysis-heavy");
    expect(note).toContain("praise, context_drift");
  });

  it("creates note for analysis only without dominant labels", () => {
    const note = createArchetypeNote("analysis_only", [], {
      endedVerified: false,
      verificationPassedCount: 0,
      verificationCount: 0,
    });
    expect(note).toBe(
      "The session remained analysis-only with no dominant incident label.",
    );
  });
});
