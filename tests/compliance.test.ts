/**
 * Purpose: Verifies compliance scoring reacts to writes, planning, and verification evidence.
 * Entrypoint: Executed by Vitest via `pnpm test`.
 * Notes: Keeps sessions synthetic so no local private transcript data enters the repository.
 */
import { describe, expect, it } from "vitest";

import { scoreCompliance } from "../src/compliance.js";

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
            "I’ll inspect the repo, make a short plan, and verify after changes.",
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
});
