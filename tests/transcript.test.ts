/**
 * Purpose: Verifies transcript parsing normalizes modern and legacy tool-call shapes into turns.
 * Entrypoint: Executed by Vitest via `pnpm test`.
 * Notes: Uses a synthetic transcript fixture with no private local machine data.
 */
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { TranscriptParseError } from "../src/errors.js";
import {
  parseClaudeTranscriptFile,
  parseEventLine,
  parseTranscriptFile,
} from "../src/transcript/index.js";

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

  it("skips malformed lines in non-strict mode", async () => {
    const root = await mkdtemp(join(tmpdir(), "agent-eval-transcript-"));
    const sessionPath = join(root, "malformed.jsonl");

    const content = [
      JSON.stringify(sampleTranscript[0]), // session_meta
      "this is not valid json",
      JSON.stringify(sampleTranscript[1]), // turn_context
      JSON.stringify(sampleTranscript[2]), // message (adds content to turn)
    ].join("\n");

    await writeFile(sessionPath, content, "utf8");

    const session = await parseTranscriptFile(sessionPath);

    expect(session.sessionId).toBe("session-1");
    expect(session.turns).toHaveLength(1);
    expect(session.turns[0]?.userMessages).toHaveLength(1);
    expect(session.turns[0]?.userMessages[0]).toContain("Please fix");
  });

  it("throws TranscriptParseError in strict mode on malformed lines", async () => {
    const root = await mkdtemp(join(tmpdir(), "agent-eval-transcript-"));
    const sessionPath = join(root, "malformed-strict.jsonl");

    const content = [
      JSON.stringify(sampleTranscript[0]),
      "this is not valid json",
      JSON.stringify(sampleTranscript[1]),
    ].join("\n");

    await writeFile(sessionPath, content, "utf8");

    await expect(
      parseTranscriptFile(sessionPath, { strict: true }),
    ).rejects.toThrow(TranscriptParseError);
  });

  it("calls onParseError callback for malformed lines", async () => {
    const root = await mkdtemp(join(tmpdir(), "agent-eval-transcript-"));
    const sessionPath = join(root, "callback-test.jsonl");

    const badLine = "this is not valid json";
    const content = [
      JSON.stringify(sampleTranscript[0]),
      badLine,
      JSON.stringify(sampleTranscript[1]),
    ].join("\n");

    await writeFile(sessionPath, content, "utf8");

    const errors: { line: string; lineNumber: number; error: Error }[] = [];

    await parseTranscriptFile(sessionPath, {
      onParseError: (line, lineNumber, error) => {
        errors.push({ line, lineNumber, error });
      },
    });

    expect(errors).toHaveLength(1);
    expect(errors[0]?.line).toBe(badLine);
    expect(errors[0]?.lineNumber).toBe(2);
    expect(errors[0]?.error).toBeInstanceOf(Error);
  });

  it("handles empty files gracefully", async () => {
    const root = await mkdtemp(join(tmpdir(), "agent-eval-transcript-"));
    const sessionPath = join(root, "empty.jsonl");

    await writeFile(sessionPath, "", "utf8");

    const session = await parseTranscriptFile(sessionPath);

    expect(session.turns).toHaveLength(0);
  });

  it("handles files with only empty lines", async () => {
    const root = await mkdtemp(join(tmpdir(), "agent-eval-transcript-"));
    const sessionPath = join(root, "whitespace.jsonl");

    await writeFile(sessionPath, "\n\n\n", "utf8");

    const session = await parseTranscriptFile(sessionPath);

    expect(session.turns).toHaveLength(0);
  });
});

describe("parseEventLine", () => {
  it("parses valid JSONL lines", () => {
    const line = JSON.stringify({
      type: "session_meta",
      payload: { id: "test" },
    });
    const result = parseEventLine(line, 1, "/test.jsonl");

    expect(result.type).toBe("session_meta");
    expect(result.payload).toEqual({ id: "test" });
  });

  it("returns empty object for invalid JSON in non-strict mode", () => {
    const result = parseEventLine("not valid json", 1, "/test.jsonl");
    expect(result).toEqual({});
  });

  it("throws TranscriptParseError for invalid JSON in strict mode", () => {
    expect(() => {
      parseEventLine("not valid json", 5, "/test.jsonl", { strict: true });
    }).toThrow(TranscriptParseError);
  });

  it("calls onParseError callback in non-strict mode", () => {
    const errors: { line: string; lineNumber: number; error: Error }[] = [];

    parseEventLine("not valid json", 3, "/test.jsonl", {
      onParseError: (line, lineNumber, error) => {
        errors.push({ line, lineNumber, error });
      },
    });

    expect(errors).toHaveLength(1);
    expect(errors[0]?.line).toBe("not valid json");
    expect(errors[0]?.lineNumber).toBe(3);
  });

  it("returns empty object for non-object JSON values", () => {
    const result = parseEventLine("123", 1, "/test.jsonl");
    expect(result).toEqual({});
  });

  it("returns empty object for array JSON values", () => {
    const result = parseEventLine('["a", "b"]', 1, "/test.jsonl");
    expect(result).toEqual({});
  });

  it("extracts timestamp, type, and payload from valid events", () => {
    const event = {
      timestamp: "2026-03-06T19:00:00.000Z",
      type: "response_item",
      payload: { type: "message", role: "user" },
    };
    const result = parseEventLine(JSON.stringify(event), 1, "/test.jsonl");

    expect(result.timestamp).toBe("2026-03-06T19:00:00.000Z");
    expect(result.type).toBe("response_item");
    expect(result.payload).toEqual({ type: "message", role: "user" });
  });

  it("includes path and line number in strict mode error", () => {
    try {
      parseEventLine("bad json", 42, "/path/to/transcript.jsonl", {
        strict: true,
      });
      expect.fail("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(TranscriptParseError);
      const parseError = error as TranscriptParseError;
      expect(parseError.path).toBe("/path/to/transcript.jsonl");
      expect(parseError.lineNumber).toBe(42);
      expect(parseError.message).toContain("/path/to/transcript.jsonl:42");
    }
  });
});

describe("parseClaudeTranscriptFile", () => {
  async function writeClaudeTranscript(
    name: string,
    records: unknown[],
  ): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), "agent-eval-claude-transcript-"));
    const projectsDir = join(root, "projects", "-Users-test-project");
    await mkdir(projectsDir, { recursive: true });
    await writeFile(
      join(projectsDir, `${name}.jsonl`),
      `${records.map((record) => JSON.stringify(record)).join("\n")}\n`,
      "utf8",
    );
    return join(projectsDir, `${name}.jsonl`);
  }

  it("merges a user prompt, assistant tool use, and tool result into one turn", async () => {
    const sessionPath = await writeClaudeTranscript("single-turn", [
      {
        sessionId: "claude-session-1",
        timestamp: "2026-03-06T19:00:00.000Z",
        cwd: "/workspace/demo",
        uuid: "user-1",
        message: {
          role: "user",
          content: [
            { type: "text", text: "Please run the tests and report back." },
          ],
        },
      },
      {
        sessionId: "claude-session-1",
        timestamp: "2026-03-06T19:00:01.000Z",
        cwd: "/workspace/demo",
        uuid: "assistant-1",
        message: {
          role: "assistant",
          content: [
            { type: "text", text: "I will run the tests now." },
            {
              type: "tool_use",
              id: "tool-1",
              name: "exec_command",
              input: { cmd: "pnpm test" },
            },
          ],
        },
      },
      {
        sessionId: "claude-session-1",
        timestamp: "2026-03-06T19:00:02.000Z",
        cwd: "/workspace/demo",
        uuid: "tool-result-1",
        toolUseResult: { exitCode: 0, stdout: "passed" },
        message: {
          role: "user",
          content: [
            { type: "tool_result", tool_use_id: "tool-1", content: "passed" },
          ],
        },
      },
    ]);

    const session = await parseClaudeTranscriptFile(sessionPath);

    expect(session.turns).toHaveLength(1);
    expect(session.turns[0]?.userMessages).toEqual([
      "Please run the tests and report back.",
    ]);
    expect(session.turns[0]?.assistantMessages).toContain(
      "I will run the tests now.",
    );
    expect(session.turns[0]?.toolCalls).toHaveLength(1);
    expect(session.turns[0]?.toolCalls[0]?.outputText).toContain(
      '"exitCode":0',
    );
  });

  it("starts a new turn only for a new user-authored prompt", async () => {
    const sessionPath = await writeClaudeTranscript("multi-turn", [
      {
        sessionId: "claude-session-2",
        timestamp: "2026-03-06T19:00:00.000Z",
        cwd: "/workspace/demo",
        uuid: "user-1",
        message: {
          role: "user",
          content: [{ type: "text", text: "Inspect the repo first." }],
        },
      },
      {
        sessionId: "claude-session-2",
        timestamp: "2026-03-06T19:00:01.000Z",
        cwd: "/workspace/demo",
        uuid: "assistant-1",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "I will inspect it now." }],
        },
      },
      {
        sessionId: "claude-session-2",
        timestamp: "2026-03-06T19:00:02.000Z",
        cwd: "/workspace/demo",
        uuid: "user-2",
        message: {
          role: "user",
          content: [{ type: "text", text: "Now fix the failing test." }],
        },
      },
    ]);

    const session = await parseClaudeTranscriptFile(sessionPath);

    expect(session.turns).toHaveLength(2);
    expect(session.turns[0]?.userMessages[0]).toBe("Inspect the repo first.");
    expect(session.turns[1]?.userMessages[0]).toBe("Now fix the failing test.");
  });

  it("keeps assistant-first Claude sessions in a valid first turn", async () => {
    const sessionPath = await writeClaudeTranscript("assistant-first", [
      {
        sessionId: "claude-session-3",
        timestamp: "2026-03-06T19:00:00.000Z",
        cwd: "/workspace/demo",
        uuid: "assistant-1",
        message: {
          role: "assistant",
          content: [
            { type: "text", text: "I started by inspecting the repo." },
          ],
        },
      },
      {
        sessionId: "claude-session-3",
        timestamp: "2026-03-06T19:00:01.000Z",
        cwd: "/workspace/demo",
        uuid: "user-1",
        message: {
          role: "user",
          content: [{ type: "text", text: "Continue and fix the bug." }],
        },
      },
    ]);

    const session = await parseClaudeTranscriptFile(sessionPath);

    expect(session.turns).toHaveLength(2);
    expect(session.turns[0]?.assistantMessages[0]).toBe(
      "I started by inspecting the repo.",
    );
    expect(session.turns[1]?.userMessages[0]).toBe("Continue and fix the bug.");
  });

  it("does not create an extra turn for tool-result-only user records", async () => {
    const sessionPath = await writeClaudeTranscript("tool-result-only", [
      {
        sessionId: "claude-session-4",
        timestamp: "2026-03-06T19:00:00.000Z",
        cwd: "/workspace/demo",
        uuid: "user-1",
        message: {
          role: "user",
          content: [
            { type: "text", text: "Check status and tell me what you find." },
          ],
        },
      },
      {
        sessionId: "claude-session-4",
        timestamp: "2026-03-06T19:00:01.000Z",
        cwd: "/workspace/demo",
        uuid: "assistant-1",
        message: {
          role: "assistant",
          content: [
            {
              type: "tool_use",
              id: "tool-1",
              name: "exec_command",
              input: { cmd: "git status" },
            },
          ],
        },
      },
      {
        sessionId: "claude-session-4",
        timestamp: "2026-03-06T19:00:02.000Z",
        cwd: "/workspace/demo",
        uuid: "tool-result-1",
        toolUseResult: { exitCode: 0, stdout: "clean" },
        message: {
          role: "user",
          content: [
            { type: "tool_result", tool_use_id: "tool-1", content: "clean" },
          ],
        },
      },
      {
        sessionId: "claude-session-4",
        timestamp: "2026-03-06T19:00:03.000Z",
        cwd: "/workspace/demo",
        uuid: "assistant-2",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "The repo is clean." }],
        },
      },
    ]);

    const session = await parseClaudeTranscriptFile(sessionPath);

    expect(session.turns).toHaveLength(1);
    expect(session.turns[0]?.assistantMessages).toContain("The repo is clean.");
    expect(session.turns[0]?.toolCalls[0]?.outputText).toContain("clean");
  });

  it("honors abort signals on the Claude parser path", async () => {
    const sessionPath = await writeClaudeTranscript("aborted", [
      {
        sessionId: "claude-session-5",
        timestamp: "2026-03-06T19:00:00.000Z",
        cwd: "/workspace/demo",
        uuid: "user-1",
        message: {
          role: "user",
          content: [{ type: "text", text: "Inspect the repo." }],
        },
      },
    ]);
    const abortController = new AbortController();
    abortController.abort();

    await expect(
      parseTranscriptFile(sessionPath, {
        sourceProvider: "claude",
        signal: abortController.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
