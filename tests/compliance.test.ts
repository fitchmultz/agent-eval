/**
 * Purpose: Verifies compliance scoring reacts to writes, planning, and verification evidence.
 * Entrypoint: Executed by Vitest via `pnpm test`.
 * Notes: Keeps sessions synthetic so no local private transcript data enters the repository.
 */
import { describe, expect, it } from "vitest";

import { scoreCompliance } from "../src/compliance.js";
import type { ParsedSession, ParsedTurn } from "../src/transcript/index.js";

function createMockTurn(overrides: Partial<ParsedTurn> = {}): ParsedTurn {
  return {
    turnIndex: 0,
    userMessages: [],
    assistantMessages: [],
    toolCalls: [],
    sourceRefs: [],
    ...overrides,
  };
}

function createMockSession(
  overrides: Partial<ParsedSession> = {},
): ParsedSession {
  return {
    sessionId: "session-1",
    path: "/tmp/session.jsonl",
    turns: [],
    ...overrides,
  };
}

describe("scoreCompliance", () => {
  it("fails verification-related rules when a write has no follow-up verification", () => {
    const scorecard = scoreCompliance({
      sessionId: "session-1",
      path: "/tmp/session.jsonl",
      turns: [
        {
          turnIndex: 0,
          userMessages: ["Please fix it"],
          assistantMessages: [],
          toolCalls: [
            {
              callId: "call-1",
              toolName: "apply_patch",
              categoryHint: "custom_tool_call",
              status: "completed",
            },
          ],
          sourceRefs: [],
        },
      ],
    });

    expect(scorecard.score).toBeLessThan(100);
    expect(
      scorecard.rules.find(
        (rule) => rule.rule === "verification_after_code_changes",
      )?.status,
    ).toBe("fail");
  });

  it("passes when context, planning, and verification happen around writes", () => {
    const scorecard = scoreCompliance({
      sessionId: "session-2",
      path: "/tmp/session.jsonl",
      turns: [
        {
          turnIndex: 0,
          userMessages: ["Please fix it"],
          assistantMessages: [
            "I'll inspect the repo, make a short plan, and verify after changes.",
          ],
          toolCalls: [
            {
              callId: "call-1",
              toolName: "exec_command",
              categoryHint: "function_call",
              argumentsText: '{"cmd":"pwd"}',
              status: "completed",
            },
            {
              callId: "call-2",
              toolName: "update_plan",
              categoryHint: "function_call",
              status: "completed",
            },
            {
              callId: "call-3",
              toolName: "apply_patch",
              categoryHint: "custom_tool_call",
              status: "completed",
            },
            {
              callId: "call-4",
              toolName: "exec_command",
              categoryHint: "function_call",
              argumentsText: '{"cmd":"make ci"}',
              outputText: "Process exited with code 0",
              status: "completed",
            },
          ],
          sourceRefs: [],
        },
      ],
    });

    expect(scorecard.score).toBe(100);
    expect(scorecard.verificationPassedCount).toBe(1);
  });

  describe("edge cases", () => {
    it("handles empty session with no turns", () => {
      const scorecard = scoreCompliance(createMockSession({ turns: [] }));

      expect(scorecard.score).toBe(100);
      expect(scorecard.writeCount).toBe(0);
      expect(scorecard.verificationCount).toBe(0);
      expect(scorecard.verificationPassedCount).toBe(0);
      expect(scorecard.verificationFailedCount).toBe(0);

      // All rules should be not_applicable or pass for no-write sessions
      for (const rule of scorecard.rules) {
        expect(["pass", "not_applicable"]).toContain(rule.status);
      }
    });

    it("all rules passing gives perfect score", () => {
      const scorecard = scoreCompliance(
        createMockSession({
          turns: [
            createMockTurn({
              turnIndex: 0,
              userMessages: ["Please fix the bug"],
              assistantMessages: [
                "I'll check the current directory and create a plan before making changes.",
              ],
              toolCalls: [
                {
                  callId: "call-1",
                  toolName: "exec_command",
                  categoryHint: "function_call",
                  argumentsText: '{"cmd":"pwd"}',
                  status: "completed",
                },
                {
                  callId: "call-2",
                  toolName: "update_plan",
                  categoryHint: "function_call",
                  status: "completed",
                },
                {
                  callId: "call-3",
                  toolName: "apply_patch",
                  categoryHint: "custom_tool_call",
                  status: "completed",
                },
                {
                  callId: "call-4",
                  toolName: "exec_command",
                  categoryHint: "function_call",
                  argumentsText: '{"cmd":"npm test"}',
                  outputText: "Tests passed",
                  status: "completed",
                },
              ],
            }),
          ],
        }),
      );

      expect(scorecard.score).toBe(100);
      expect(scorecard.writeCount).toBe(1);
      expect(scorecard.verificationPassedCount).toBe(1);

      for (const rule of scorecard.rules) {
        expect(rule.status).toBe("pass");
      }
    });

    it("all rules failing gives minimum score", () => {
      const scorecard = scoreCompliance(
        createMockSession({
          turns: [
            createMockTurn({
              turnIndex: 0,
              userMessages: ["Fix it now"],
              assistantMessages: ["Okay, I'll make the changes."],
              toolCalls: [
                {
                  callId: "call-1",
                  toolName: "apply_patch",
                  categoryHint: "custom_tool_call",
                  status: "completed",
                },
              ],
            }),
          ],
        }),
      );

      // Score should be reduced from 100 (minus 20 per failing rule)
      expect(scorecard.score).toBeLessThan(100);
      expect(scorecard.writeCount).toBe(1);
      expect(scorecard.verificationPassedCount).toBe(0);

      // Most rules should fail when no context/plan/verification
      const failingRules = scorecard.rules.filter((r) => r.status === "fail");
      expect(failingRules.length).toBeGreaterThanOrEqual(3);
    });

    it("score calculation verification for partial compliance", () => {
      const scorecard = scoreCompliance(
        createMockSession({
          turns: [
            createMockTurn({
              turnIndex: 0,
              userMessages: ["Fix the bug"],
              assistantMessages: ["I'll fix it."],
              toolCalls: [
                // Has verification but no context/plan
                {
                  callId: "call-1",
                  toolName: "apply_patch",
                  categoryHint: "custom_tool_call",
                  status: "completed",
                },
                {
                  callId: "call-2",
                  toolName: "exec_command",
                  categoryHint: "function_call",
                  argumentsText: '{"cmd":"npm test"}',
                  outputText: "Tests passed",
                  status: "completed",
                },
              ],
            }),
          ],
        }),
      );

      // 100 - (3 failing rules * 20) = 40
      expect(scorecard.score).toBe(40);
      expect(scorecard.writeCount).toBe(1);
      expect(scorecard.verificationPassedCount).toBe(1);
    });

    it("detects context confirmation via pwd command", () => {
      const scorecard = scoreCompliance(
        createMockSession({
          turns: [
            createMockTurn({
              turnIndex: 0,
              userMessages: ["Fix the bug"],
              assistantMessages: [],
              toolCalls: [
                {
                  callId: "call-1",
                  toolName: "exec_command",
                  categoryHint: "function_call",
                  argumentsText: '{"cmd":"pwd"}',
                  status: "completed",
                },
                {
                  callId: "call-2",
                  toolName: "apply_patch",
                  categoryHint: "custom_tool_call",
                  status: "completed",
                },
                {
                  callId: "call-3",
                  toolName: "exec_command",
                  categoryHint: "function_call",
                  argumentsText: '{"cmd":"npm test"}',
                  outputText: "Tests passed",
                  status: "completed",
                },
              ],
            }),
          ],
        }),
      );

      // Context confirmation should pass
      const contextRule = scorecard.rules.find(
        (r) => r.rule === "cwd_or_repo_echoed_before_write",
      );
      expect(contextRule?.status).toBe("pass");
    });

    it("detects context confirmation via git status command", () => {
      const scorecard = scoreCompliance(
        createMockSession({
          turns: [
            createMockTurn({
              turnIndex: 0,
              userMessages: ["Fix the bug"],
              assistantMessages: [],
              toolCalls: [
                {
                  callId: "call-1",
                  toolName: "exec_command",
                  categoryHint: "function_call",
                  argumentsText: '{"cmd":"git status"}',
                  status: "completed",
                },
                {
                  callId: "call-2",
                  toolName: "apply_patch",
                  categoryHint: "custom_tool_call",
                  status: "completed",
                },
                {
                  callId: "call-3",
                  toolName: "exec_command",
                  categoryHint: "function_call",
                  argumentsText: '{"cmd":"npm test"}',
                  outputText: "Tests passed",
                  status: "completed",
                },
              ],
            }),
          ],
        }),
      );

      // Context confirmation should pass
      const contextRule = scorecard.rules.find(
        (r) => r.rule === "scope_confirmed_before_major_write",
      );
      expect(contextRule?.status).toBe("pass");
    });

    it("detects planning via update_plan tool", () => {
      const scorecard = scoreCompliance(
        createMockSession({
          turns: [
            createMockTurn({
              turnIndex: 0,
              userMessages: ["Fix the bug"],
              assistantMessages: [],
              toolCalls: [
                {
                  callId: "call-1",
                  toolName: "update_plan",
                  categoryHint: "function_call",
                  status: "completed",
                },
                {
                  callId: "call-2",
                  toolName: "apply_patch",
                  categoryHint: "custom_tool_call",
                  status: "completed",
                },
                {
                  callId: "call-3",
                  toolName: "exec_command",
                  categoryHint: "function_call",
                  argumentsText: '{"cmd":"npm test"}',
                  outputText: "Tests passed",
                  status: "completed",
                },
              ],
            }),
          ],
        }),
      );

      // Planning rule should pass
      const planRule = scorecard.rules.find(
        (r) => r.rule === "short_plan_before_large_change",
      );
      expect(planRule?.status).toBe("pass");
    });

    it("detects planning via 'plan' keyword in assistant message", () => {
      const scorecard = scoreCompliance(
        createMockSession({
          turns: [
            createMockTurn({
              turnIndex: 0,
              userMessages: ["Fix the bug"],
              assistantMessages: [
                "Here is my plan:\n1. First, I'll check the code\n2. Then I'll make the fix",
              ],
              toolCalls: [
                {
                  callId: "call-1",
                  toolName: "apply_patch",
                  categoryHint: "custom_tool_call",
                  status: "completed",
                },
                {
                  callId: "call-2",
                  toolName: "exec_command",
                  categoryHint: "function_call",
                  argumentsText: '{"cmd":"npm test"}',
                  outputText: "Tests passed",
                  status: "completed",
                },
              ],
            }),
          ],
        }),
      );

      // Planning rule should pass
      const planRule = scorecard.rules.find(
        (r) => r.rule === "short_plan_before_large_change",
      );
      expect(planRule?.status).toBe("pass");
    });

    it("detects verification failure and marks no_unverified_ending as fail", () => {
      const scorecard = scoreCompliance(
        createMockSession({
          turns: [
            createMockTurn({
              turnIndex: 0,
              userMessages: ["Fix the bug"],
              assistantMessages: [],
              toolCalls: [
                {
                  callId: "call-1",
                  toolName: "exec_command",
                  categoryHint: "function_call",
                  argumentsText: '{"cmd":"pwd"}',
                  status: "completed",
                },
                {
                  callId: "call-2",
                  toolName: "update_plan",
                  categoryHint: "function_call",
                  status: "completed",
                },
                {
                  callId: "call-3",
                  toolName: "apply_patch",
                  categoryHint: "custom_tool_call",
                  status: "completed",
                },
                {
                  callId: "call-4",
                  toolName: "exec_command",
                  categoryHint: "function_call",
                  argumentsText: '{"cmd":"npm test"}',
                  outputText: "Tests failed",
                  status: "errored",
                },
              ],
            }),
          ],
        }),
      );

      expect(scorecard.verificationFailedCount).toBe(1);
      expect(scorecard.verificationPassedCount).toBe(0);

      // no_unverified_ending should fail
      const unverifiedRule = scorecard.rules.find(
        (r) => r.rule === "no_unverified_ending",
      );
      expect(unverifiedRule?.status).toBe("fail");
    });

    it("counts multiple writes and verifications correctly", () => {
      const scorecard = scoreCompliance(
        createMockSession({
          turns: [
            createMockTurn({
              turnIndex: 0,
              userMessages: ["Fix bugs"],
              assistantMessages: [],
              toolCalls: [
                {
                  callId: "call-1",
                  toolName: "apply_patch",
                  categoryHint: "custom_tool_call",
                  status: "completed",
                },
                {
                  callId: "call-2",
                  toolName: "apply_patch",
                  categoryHint: "custom_tool_call",
                  status: "completed",
                },
                {
                  callId: "call-3",
                  toolName: "exec_command",
                  categoryHint: "function_call",
                  argumentsText: '{"cmd":"npm test"}',
                  outputText: "Tests passed",
                  status: "completed",
                },
              ],
            }),
          ],
        }),
      );

      expect(scorecard.writeCount).toBe(2);
      expect(scorecard.verificationCount).toBe(1);
      expect(scorecard.verificationPassedCount).toBe(1);
    });

    it("handles multiple turns with first write in later turn", () => {
      const scorecard = scoreCompliance(
        createMockSession({
          turns: [
            createMockTurn({
              turnIndex: 0,
              userMessages: ["Hello"],
              assistantMessages: ["I'll help you with that."],
              toolCalls: [
                {
                  callId: "call-1",
                  toolName: "exec_command",
                  categoryHint: "function_call",
                  argumentsText: '{"cmd":"pwd"}',
                  status: "completed",
                },
              ],
            }),
            createMockTurn({
              turnIndex: 1,
              userMessages: ["Fix the bug"],
              assistantMessages: ["I'll create a plan and fix it."],
              toolCalls: [
                {
                  callId: "call-2",
                  toolName: "update_plan",
                  categoryHint: "function_call",
                  status: "completed",
                },
                {
                  callId: "call-3",
                  toolName: "apply_patch",
                  categoryHint: "custom_tool_call",
                  status: "completed",
                },
                {
                  callId: "call-4",
                  toolName: "exec_command",
                  categoryHint: "function_call",
                  argumentsText: '{"cmd":"npm test"}',
                  outputText: "Tests passed",
                  status: "completed",
                },
              ],
            }),
          ],
        }),
      );

      // Should pass because context and plan come before first write
      expect(scorecard.score).toBe(100);
    });

    it("handles session with only verification commands (no writes)", () => {
      const scorecard = scoreCompliance(
        createMockSession({
          turns: [
            createMockTurn({
              turnIndex: 0,
              userMessages: ["Run tests"],
              assistantMessages: [],
              toolCalls: [
                {
                  callId: "call-1",
                  toolName: "exec_command",
                  categoryHint: "function_call",
                  argumentsText: '{"cmd":"npm test"}',
                  outputText: "Tests passed",
                  status: "completed",
                },
              ],
            }),
          ],
        }),
      );

      expect(scorecard.score).toBe(100);
      expect(scorecard.writeCount).toBe(0);
      expect(scorecard.verificationPassedCount).toBe(1);
    });
  });
});
