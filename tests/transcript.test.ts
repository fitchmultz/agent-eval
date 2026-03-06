/**
 * Purpose: Verifies transcript parsing normalizes modern and legacy tool-call shapes into turns.
 * Entrypoint: Executed by Vitest via `pnpm test`.
 * Notes: Uses a synthetic transcript fixture with no private local machine data.
 */
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { parseTranscriptFile } from "../src/transcript.js";

const sampleTranscript = [
  {
    timestamp: "2026-03-06T19:00:00.000Z",
    type: "session_meta",
    payload: {
      id: "session-1",
      timestamp: "2026-03-06T19:00:00.000Z",
      cwd: "/workspace/demo",
      source: {
        subagent: {
          thread_spawn: {
            parent_thread_id: "parent-1",
          },
        },
      },
    },
  },
  {
    timestamp: "2026-03-06T19:00:01.000Z",
    type: "turn_context",
    payload: {
      turn_id: "turn-1",
      cwd: "/workspace/demo",
    },
  },
  {
    timestamp: "2026-03-06T19:00:02.000Z",
    type: "response_item",
    payload: {
      type: "message",
      role: "user",
      content: [
        {
          type: "input_text",
          text: "Please fix the failing tests and run make ci.",
        },
      ],
    },
  },
  {
    timestamp: "2026-03-06T19:00:03.000Z",
    type: "response_item",
    payload: {
      type: "function_call",
      name: "exec_command",
      arguments: '{"cmd":"pwd"}',
      call_id: "call-1",
    },
  },
  {
    timestamp: "2026-03-06T19:00:04.000Z",
    type: "response_item",
    payload: {
      type: "function_call_output",
      call_id: "call-1",
      output: "Process exited with code 0",
    },
  },
  {
    timestamp: "2026-03-06T19:00:05.000Z",
    type: "response_item",
    payload: {
      type: "custom_tool_call",
      status: "completed",
      name: "apply_patch",
      input: "*** Begin Patch\n*** End Patch",
      call_id: "call-2",
    },
  },
  {
    timestamp: "2026-03-06T19:00:06.000Z",
    type: "turn_context",
    payload: {
      turn_id: "turn-2",
      cwd: "/workspace/demo",
    },
  },
  {
    timestamp: "2026-03-06T19:00:07.000Z",
    type: "response_item",
    payload: {
      type: "message",
      role: "user",
      content: [
        {
          type: "input_text",
          text: "You lost context. Goals:\n- fix tests\n- verify",
        },
      ],
    },
  },
];

describe("parseTranscriptFile", () => {
  it("parses session metadata, turns, and mixed tool transports", async () => {
    const root = await mkdtemp(join(tmpdir(), "agent-eval-transcript-"));
    const sessionPath = join(
      root,
      "rollout-2026-03-06T19-00-00-session-1.jsonl",
    );
    await writeFile(
      sessionPath,
      `${sampleTranscript.map((record) => JSON.stringify(record)).join("\n")}\n`,
      "utf8",
    );

    const session = await parseTranscriptFile(sessionPath);

    expect(session.sessionId).toBe("session-1");
    expect(session.parentSessionId).toBe("parent-1");
    expect(session.turns).toHaveLength(2);
    expect(
      session.turns[0]?.toolCalls.map((toolCall) => toolCall.toolName),
    ).toEqual(["exec_command", "apply_patch"]);
    expect(session.turns[0]?.toolCalls[0]?.status).toBe("completed");
    expect(session.turns[1]?.userMessages[0]).toContain("You lost context");
  });
});
