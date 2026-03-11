/**
 * Purpose: Verifies user-message labeling prefers high-confidence signals and avoids known false positives.
 * Entrypoint: Executed by Vitest via `pnpm test`.
 * Notes: Uses synthetic turns so taxonomy behavior remains stable and public-facing redaction.
 */
import { describe, expect, it } from "vitest";

import { labelTurn } from "../src/labels.js";

describe("labelTurn", () => {
  it("does not mark dependency steering as stalled_or_guessing", () => {
    const labels = labelTurn({
      turnIndex: 0,
      userMessages: [
        "you can avoid tsgo if that is the issue so you can keep zod",
      ],
      assistantMessages: [],
      toolCalls: [],
      sourceRefs: [],
    });

    expect(labels).toEqual([]);
  });

  it("does not treat initial verification tasks as failure complaints", () => {
    const labels = labelTurn({
      turnIndex: 0,
      userMessages: ["Please fix the failing tests and run make ci."],
      assistantMessages: [],
      toolCalls: [],
      sourceRefs: [],
    });

    expect(labels.map((label) => label.label)).toEqual([
      "verification_request",
    ]);
  });

  it("does not treat regression-test instructions as a regression report", () => {
    const labels = labelTurn({
      turnIndex: 0,
      userMessages: ["After fixing this, add a regression test if applicable."],
      assistantMessages: [],
      toolCalls: [],
      sourceRefs: [],
    });

    expect(labels).toEqual([]);
  });

  it("labels explicit interruption and context reinjection separately", () => {
    const labels = labelTurn({
      turnIndex: 0,
      userMessages: [
        "Sorry to interrupt. Goals:\n- parse transcripts\n- update the schema docs",
      ],
      assistantMessages: [],
      toolCalls: [],
      sourceRefs: [],
    });

    expect(labels.map((label) => label.label).sort()).toEqual([
      "context_reinjection",
      "interrupt",
    ]);
  });
});
