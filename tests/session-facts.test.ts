/**
 * Purpose: Verifies session-facts rows preserve canonical ordering and surfaced-session behavior.
 * Responsibilities: Cover surface precedence, deterministic label ordering, and surfacedIn flags.
 * Scope: Behavioral coverage for `buildSessionFacts()` beyond schema-only validation.
 * Usage: Executed by Vitest via `pnpm test`.
 * Invariants/Assumptions: Session facts are emitted in metrics/session order and reflect canonical summary surfaces.
 */
import { describe, expect, it } from "vitest";

import { buildSessionFacts } from "../src/session-facts.js";
import { createV3Summary } from "./support/v3-fixtures.js";

describe("buildSessionFacts", () => {
  it("preserves projection order and surfaced-session flags", () => {
    const summary = createV3Summary();
    const facts = buildSessionFacts(
      [
        {
          sessionId: "session-1",
          provider: "codex",
          harness: null,
          modelProvider: null,
          model: null,
          startedAt: null,
          endedAt: null,
          durationMs: null,
          turnCount: 3,
          userMessageCount: 1,
          assistantMessageCount: 2,
          toolCallCount: 1,
          writeToolCallCount: 1,
          verificationToolCallCount: 0,
          mcpToolCallCount: 0,
          writeCount: 1,
          verificationCount: 0,
          endedVerified: false,
          complianceScore: 60,
          failedRules: ["Verification after code changes"],
          topTools: [],
          mcpServers: [],
          rawLabelCounts: { regression_report: 1, verification_request: 2 },
          deTemplatedLabelCounts: {
            regression_report: 1,
            verification_request: 1,
          },
          template: { artifactScore: null, textSharePct: null, flags: [] },
          attribution: {
            primary: "agent_behavior",
            confidence: "medium",
            reasons: ["Write work ended without passing verification."],
          },
          title: "fallback title should be overridden",
          evidencePreviews: ["fallback evidence"],
          sourceRefs: [],
        },
        {
          sessionId: "session-2",
          provider: "pi",
          harness: "pi",
          modelProvider: "anthropic",
          model: "claude-sonnet-4-6",
          startedAt: null,
          endedAt: null,
          durationMs: null,
          turnCount: 4,
          userMessageCount: 1,
          assistantMessageCount: 2,
          toolCallCount: 1,
          writeToolCallCount: 1,
          verificationToolCallCount: 1,
          mcpToolCallCount: 0,
          writeCount: 1,
          verificationCount: 1,
          endedVerified: true,
          complianceScore: 95,
          failedRules: [],
          topTools: [],
          mcpServers: [],
          rawLabelCounts: { verification_request: 1 },
          deTemplatedLabelCounts: {},
          template: { artifactScore: null, textSharePct: null, flags: [] },
          attribution: {
            primary: "unknown",
            confidence: "low",
            reasons: ["Transcript-visible evidence was insufficient."],
          },
          title: "projection title",
          evidencePreviews: ["projection evidence"],
          sourceRefs: [],
        },
      ],
      summary,
    );

    expect(facts.map((fact) => fact.sessionId)).toEqual([
      "session-1",
      "session-2",
    ]);
    expect(facts[0]?.surfacedIn.reviewQueue).toBe(true);
    expect(facts[0]?.surfacedIn.exemplar).toBe(false);
    expect(facts[1]?.surfacedIn.exemplar).toBe(true);
    expect(facts[1]?.surfacedIn.reviewQueue).toBe(false);
  });

  it("prefers surfaced summary title/evidence over projection fallbacks and sorts labels deterministically", () => {
    const [fact] = buildSessionFacts(
      [
        {
          sessionId: "session-1",
          provider: "codex",
          harness: null,
          modelProvider: null,
          model: null,
          startedAt: null,
          endedAt: null,
          durationMs: null,
          turnCount: 3,
          userMessageCount: 1,
          assistantMessageCount: 2,
          toolCallCount: 1,
          writeToolCallCount: 1,
          verificationToolCallCount: 0,
          mcpToolCallCount: 0,
          writeCount: 1,
          verificationCount: 0,
          endedVerified: false,
          complianceScore: 60,
          failedRules: [],
          topTools: [],
          mcpServers: [],
          rawLabelCounts: { regression_report: 1, verification_request: 2 },
          deTemplatedLabelCounts: {
            regression_report: 1,
            verification_request: 1,
          },
          template: { artifactScore: null, textSharePct: null, flags: [] },
          attribution: {
            primary: "agent_behavior",
            confidence: "medium",
            reasons: ["Write work ended without passing verification."],
          },
          title: "projection title",
          evidencePreviews: ["projection evidence"],
          sourceRefs: [],
        },
      ],
      createV3Summary(),
    );

    expect(fact?.title).toBe("Fix login regression and verify the build");
    expect(fact?.evidencePreviews[0]).toBe(
      "Please fix login and verify the patch before you finish.",
    );
    expect(fact?.rawLabelCounts).toEqual([
      { label: "verification_request", count: 2 },
      { label: "regression_report", count: 1 },
    ]);
  });

  it("replaces empty unsurfaced evidence with a deterministic fallback", () => {
    const [fact] = buildSessionFacts(
      [
        {
          sessionId: "session-empty",
          provider: "claude",
          harness: "claude",
          modelProvider: null,
          model: null,
          startedAt: null,
          endedAt: null,
          durationMs: null,
          turnCount: 1,
          userMessageCount: 1,
          assistantMessageCount: 0,
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
          template: { artifactScore: 17, textSharePct: 7, flags: [] },
          attribution: {
            primary: "unknown",
            confidence: "low",
            reasons: ["Transcript-visible evidence was insufficient."],
          },
          title: undefined,
          evidencePreviews: [],
          sourceRefs: [],
        },
      ],
      createV3Summary(),
    );

    expect(fact?.evidencePreviews).toEqual([
      "No durable public-safe evidence preview survived extraction for this session.",
    ]);
  });

  it("replaces scaffold-dominated unsurfaced evidence with a deterministic fallback", () => {
    const [fact] = buildSessionFacts(
      [
        {
          sessionId: "session-scaffold",
          provider: "codex",
          harness: "codex",
          modelProvider: "openai",
          model: null,
          startedAt: null,
          endedAt: null,
          durationMs: null,
          turnCount: 2,
          userMessageCount: 2,
          assistantMessageCount: 0,
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
          template: {
            artifactScore: 100,
            textSharePct: 65,
            flags: [
              "instruction_scaffold",
              "template_heavy",
              "template_present",
            ],
          },
          attribution: {
            primary: "template_artifact",
            confidence: "high",
            reasons: ["The visible transcript surface was scaffold-dominated."],
          },
          title: undefined,
          evidencePreviews: [
            "**Keep this file updated** as you learn project patterns. Follow: concise, index-style, no duplication.",
            "Infer intent when reasonable. Ask clarifying questions only when ambiguity materially changes the work.",
          ],
          sourceRefs: [],
        },
      ],
      createV3Summary(),
    );

    expect(fact?.evidencePreviews).toEqual([
      "No durable public-safe evidence preview survived extraction for this session.",
    ]);
  });

  it("drops thin procedural fragments from unsurfaced evidence and falls back when nothing durable remains", () => {
    const [fact] = buildSessionFacts(
      [
        {
          sessionId: "session-fragment",
          provider: "pi",
          harness: "pi",
          modelProvider: "openai-codex",
          model: "gpt-5.4",
          startedAt: null,
          endedAt: null,
          durationMs: null,
          turnCount: 3,
          userMessageCount: 3,
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
          template: { artifactScore: 0, textSharePct: 0, flags: [] },
          attribution: {
            primary: "unknown",
            confidence: "low",
            reasons: ["Transcript-visible evidence was insufficient."],
          },
          title: undefined,
          evidencePreviews: [
            "copy the previous logs first as normal. then run 3",
            "Exact command for Run 3",
            "up",
          ],
          sourceRefs: [],
        },
      ],
      createV3Summary(),
    );

    expect(fact?.evidencePreviews).toEqual([
      "No durable public-safe evidence preview survived extraction for this session.",
    ]);
  });
});
