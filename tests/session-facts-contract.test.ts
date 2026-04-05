/**
 * Purpose: Verifies the v3 session-facts contract stays strict and preserves null for truly unavailable optional fields.
 * Responsibilities: Validate canonical session-facts rows against the runtime schema.
 * Scope: Contract-level coverage for session-facts.jsonl rows.
 * Usage: Executed by Vitest via `pnpm test`.
 * Invariants/Assumptions: Session facts are public-safe, deterministic, and always emitted in eval/report flows.
 */
import { describe, expect, it } from "vitest";
import { sessionFactSchema } from "../src/schema.js";
import { buildSessionFacts } from "../src/session-facts.js";
import { createSessionFacts, createV3Summary } from "./support/v3-fixtures.js";

describe("session-facts contract", () => {
  it("accepts a minimal valid session fact row", () => {
    expect(() =>
      sessionFactSchema.parse(createSessionFacts()[0]),
    ).not.toThrow();
  });

  it("uses null for unavailable optional fields", () => {
    const row = sessionFactSchema.parse(createSessionFacts()[0]);

    expect(row.harness).toBeNull();
    expect(row.modelProvider).toBeNull();
    expect(row.model).toBeNull();
    expect(row.metrics.mcpToolCallCount).toBeNull();
    expect(row.template.artifactScore).toBeNull();
  });

  it("rejects overlapping exemplar and review surfaces", () => {
    const projection = {
      sessionId: "session-1",
      provider: "codex" as const,
      harness: null,
      modelProvider: null,
      model: null,
      startedAt: null,
      endedAt: null,
      durationMs: null,
      turnCount: 1,
      userMessageCount: 1,
      assistantMessageCount: 1,
      toolCallCount: 0,
      writeToolCallCount: 0,
      verificationToolCallCount: 0,
      mcpToolCallCount: 0,
      writeCount: 0,
      verificationCount: 0,
      endedVerified: false,
      complianceScore: 100,
      failedRules: [],
      topTools: [],
      mcpServers: [],
      rawLabelCounts: {},
      deTemplatedLabelCounts: {},
      template: { artifactScore: null, textSharePct: null, flags: [] },
      attribution: {
        primary: "unknown" as const,
        confidence: "low" as const,
        reasons: ["Transcript-visible evidence was insufficient."],
      },
      title: "Session 1",
      evidencePreviews: [],
      sourceRefs: [],
    };

    const summary = createV3Summary();
    const exemplar = summary.exemplarSessions[0];
    const review = summary.reviewQueue[0];
    if (!exemplar || !review) {
      throw new Error(
        "Expected fixture summary to include exemplar and review rows.",
      );
    }

    expect(() =>
      buildSessionFacts([projection], {
        ...summary,
        exemplarSessions: [
          {
            ...exemplar,
            sessionId: "session-1",
          },
        ],
        reviewQueue: [
          {
            ...review,
            sessionId: "session-1",
          },
        ],
      }),
    ).toThrow(/must stay disjoint/);
  });
});
