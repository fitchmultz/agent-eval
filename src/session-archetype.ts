/**
 * Purpose: Classifies sessions into archetypes based on behavior patterns.
 * Entrypoint: `determineArchetype()` and `archetypeLabel()` for session classification.
 * Notes: Archetypes categorize sessions by their delivery pattern and friction characteristics.
 */

import type { LabelName, SessionArchetype } from "./schema.js";

/**
 * Human-readable labels for each session archetype.
 */
const ARCHETYPE_LABELS: Record<SessionArchetype, string> = {
  verified_delivery: "Clean Ship",
  unverified_delivery: "Needs Proof",
  high_friction_recovery: "Recovery Run",
  interrupted_non_write: "Interrupted Pass",
  analysis_only: "Recon Only",
} as const;

/**
 * Gets the human-readable label for a session archetype.
 * @param archetype - The archetype to label
 * @returns The display label for the archetype
 */
export function archetypeLabel(archetype: SessionArchetype): string {
  return ARCHETYPE_LABELS[archetype];
}

/**
 * Determines the archetype for a session based on its metrics.
 * @param writeCount - Number of write operations in the session
 * @param verificationPassedCount - Number of passed verifications
 * @param dominantLabels - Most frequent labels for the session
 * @param frictionScore - Calculated friction score
 * @returns The determined session archetype
 */
export function determineArchetype(
  writeCount: number,
  verificationPassedCount: number,
  dominantLabels: readonly LabelName[],
  frictionScore: number,
): SessionArchetype {
  if (writeCount > 0 && verificationPassedCount > 0) {
    return frictionScore >= 6 ? "high_friction_recovery" : "verified_delivery";
  }
  if (writeCount > 0) {
    return "unverified_delivery";
  }
  if (dominantLabels.includes("interrupt")) {
    return "interrupted_non_write";
  }
  return "analysis_only";
}

/**
 * Creates a descriptive note explaining the archetype classification.
 * @param archetype - The session archetype
 * @param dominantLabels - Most frequent labels for the session
 * @param session - Session metrics containing verification counts
 * @returns A human-readable explanation of the classification
 */
export function createArchetypeNote(
  archetype: SessionArchetype,
  dominantLabels: readonly LabelName[],
  session: { verificationPassedCount: number; verificationCount: number },
): string {
  switch (archetype) {
    case "verified_delivery":
      return `Code changes were followed by passing verification (${session.verificationPassedCount}/${session.verificationCount}).`;
    case "unverified_delivery":
      return "Code changes were observed without a passing verification signal.";
    case "high_friction_recovery":
      return `The session delivered verified changes, but only after notable operator burden: ${dominantLabels.join(", ")}.`;
    case "interrupted_non_write":
      return `The session stayed non-write and was dominated by interruption-style signals: ${dominantLabels.join(", ")}.`;
    case "analysis_only":
      return dominantLabels.length > 0
        ? `The session remained analysis-heavy; dominant user signals were ${dominantLabels.join(", ")}.`
        : "The session remained analysis-only with no dominant incident label.";
  }
}
