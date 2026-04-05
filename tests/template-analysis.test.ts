/**
 * Purpose: Verifies corpus-level template analysis detects repeated scaffold families without leaking raw scaffold text.
 * Responsibilities: Cover conservative family detection, stable IDs, public-safe family labels, and non-scaffold repeated task text.
 * Scope: Unit coverage for the Phase 2 TemplateRegistry substrate.
 * Usage: Executed by Vitest via `pnpm test`.
 * Invariants/Assumptions: Template detection requires both repetition and scaffold-like cues.
 */
import { describe, expect, it } from "vitest";

import { buildTemplateRegistry } from "../src/template-analysis.js";
import type { ParsedSession } from "../src/transcript/types.js";

function createSession(
  sessionId: string,
  userMessage: string,
  assistantMessage = "I will review this request for session-specific context.",
): ParsedSession {
  return {
    sessionId,
    provider: "codex",
    path: `/tmp/${sessionId}.jsonl`,
    turns: [
      {
        turnIndex: 0,
        userMessages: [userMessage],
        assistantMessages: [`${assistantMessage} ${sessionId}`],
        toolCalls: [],
        sourceRefs: [],
      },
    ],
  };
}

describe("buildTemplateRegistry", () => {
  it("marks repeated scaffold text with stable public-safe family labels", () => {
    const repeatedScaffold =
      "You are an autonomous coding agent. Do not stop early. Always run the relevant tests before ending your turn.";
    const registry = buildTemplateRegistry([
      createSession("s1", `${repeatedScaffold}\n\nFix login bug.`),
      createSession("s2", `${repeatedScaffold}\n\nFix billing bug.`),
    ]);

    expect(registry.familySummaries).toHaveLength(1);
    expect(registry.familySummaries[0]?.label).toBe(
      "verification_checklist_scaffold",
    );
    expect(registry.familySummaries[0]?.familyId).toMatch(/^[0-9a-f]{12}$/);

    const filtered = registry.sessionAnalyses
      .get("s1")
      ?.filteredMessages.get("s1:0:user:0");
    expect(filtered).toContain("Fix login bug.");
    expect(filtered).not.toContain("autonomous coding agent");
  });

  it("keeps same-position messages separate across sessions", () => {
    const repeatedScaffold =
      "You are an autonomous coding agent. Do not stop early. Always run the relevant tests before ending your turn.";
    const registry = buildTemplateRegistry([
      createSession("s1", `${repeatedScaffold}\n\nFix login bug.`),
      createSession("s2", `${repeatedScaffold}\n\nFix billing bug.`),
    ]);

    expect(
      registry.sessionAnalyses.get("s1")?.filteredMessages.get("s1:0:user:0"),
    ).toContain("Fix login bug.");
    expect(
      registry.sessionAnalyses.get("s2")?.filteredMessages.get("s2:0:user:0"),
    ).toContain("Fix billing bug.");
  });

  it("dedupes affected sessions when multiple scaffold variants share one label", () => {
    const scaffoldA =
      "You are an autonomous coding agent. Do not stop early when the task looks almost done.";
    const scaffoldB =
      "Always prefer simple code and stop only when the real goal is complete.";
    const registry = buildTemplateRegistry([
      createSession("s1", `${scaffoldA}\n\nFix login bug.`),
      createSession("s2", `${scaffoldA}\n\n${scaffoldB}\n\nFix billing bug.`),
      createSession("s3", `${scaffoldB}\n\nFix profile bug.`),
    ]);

    const instructionSummary = registry.labelSummaries.find(
      (summary) => summary.label === "instruction_scaffold",
    );
    expect(instructionSummary?.affectedSessionCount).toBe(3);
  });

  it("does not classify repeated ordinary task text without scaffold cues", () => {
    const registry = buildTemplateRegistry([
      createSession("s1", "Please fix the login bug before lunch."),
      createSession("s2", "Please fix the login bug before lunch."),
    ]);

    expect(registry.familySummaries).toEqual([]);
    expect(
      registry.sessionAnalyses.get("s1")?.filteredMessages.get("s1:0:user:0"),
    ).toContain("Please fix the login bug before lunch.");
  });
});
