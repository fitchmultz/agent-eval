/**
 * Purpose: Classifies sessions into operator-safe archetypes based on delivery and friction patterns.
 * Responsibilities: Provide canonical archetype ids, labels, and notes for ranked session summaries.
 * Scope: Shared by summary ranking and report generation for all supported providers.
 * Usage: Call `determineArchetype()` with terminal verification state and session friction details.
 * Invariants/Assumptions: Archetypes are derived from deterministic metrics only and do not infer correctness beyond transcript-visible proxy signals.
 */

import { SCORING } from "./constants/index.js";
import type { LabelName, SessionArchetype } from "./schema.js";

const ARCHETYPE_LABELS: Record<SessionArchetype, string> = {
  verified_delivery: "Ended-Verified Delivery",
  unverified_delivery: "Unverified Ending Delivery",
  high_friction_verified_delivery: "High-Friction Ended-Verified Delivery",
  analysis_only: "Analysis Only",
} as const;

export function archetypeLabel(archetype: SessionArchetype): string {
  return ARCHETYPE_LABELS[archetype];
}

export function determineArchetype(
  writeCount: number,
  endedVerified: boolean,
  frictionScore: number,
): SessionArchetype {
  if (writeCount > 0 && endedVerified) {
    return frictionScore >= SCORING.FRICTION_THRESHOLD
      ? "high_friction_verified_delivery"
      : "verified_delivery";
  }
  if (writeCount > 0) {
    return "unverified_delivery";
  }
  return "analysis_only";
}

export function createArchetypeNote(
  archetype: SessionArchetype,
  dominantLabels: readonly LabelName[],
  session: {
    endedVerified: boolean;
    verificationPassedCount: number;
    verificationCount: number;
  },
): string {
  switch (archetype) {
    case "verified_delivery":
      return session.endedVerified
        ? `Code changes ended with a passing post-write verification signal (${session.verificationPassedCount}/${session.verificationCount} passing verifications observed overall).`
        : "Code changes ended verified.";
    case "unverified_delivery":
      return "Code changes were observed without a passing post-write verification after the final write.";
    case "high_friction_verified_delivery":
      return `The session ended verified, but only after notable operator burden: ${dominantLabels.join(", ") || "incident pressure without a single dominant label"}.`;
    case "analysis_only":
      return dominantLabels.length > 0
        ? `The session remained analysis-heavy; dominant incident signals were ${dominantLabels.join(", ")}.`
        : "The session remained analysis-only with no dominant incident label.";
  }
}
