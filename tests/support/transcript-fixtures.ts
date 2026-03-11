/**
 * Purpose: Provides shared synthetic Codex and Claude transcript fixtures for integration-style tests.
 * Responsibilities: Generate provider-shaped JSONL content and materialize temporary homes for CLI and evaluator tests.
 * Scope: Test-only helper used by cross-provider integration coverage; fixtures remain synthetic and public-facing redaction.
 * Usage: Import `createCodexHome()` or `createClaudeHome()` with a temporary base directory per test suite.
 * Invariants/Assumptions: Codex and Claude fixtures describe equivalent workflows unless a test overrides the default transcript content.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

function writeJsonl(records: readonly unknown[]): string {
  return `${records.map((record) => JSON.stringify(record)).join("\n")}\n`;
}

export function createCodexSessionContent(sessionId: string): string {
  return writeJsonl([
    {
      timestamp: "2026-03-06T19:00:00.000Z",
      type: "session_meta",
      payload: {
        id: sessionId,
        timestamp: "2026-03-06T19:00:00.000Z",
        cwd: "/workspace/demo",
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
            text: "Please fix the tests and verify before finishing.",
          },
        ],
      },
    },
    {
      timestamp: "2026-03-06T19:00:03.000Z",
      type: "response_item",
      payload: {
        type: "message",
        role: "assistant",
        content: [
          {
            type: "output_text",
            text: "I will run the tests and report back with proof.",
          },
        ],
      },
    },
    {
      timestamp: "2026-03-06T19:00:04.000Z",
      type: "response_item",
      payload: {
        type: "function_call",
        name: "exec_command",
        arguments: '{"cmd":"pnpm test"}',
        call_id: "call-1",
      },
    },
    {
      timestamp: "2026-03-06T19:00:05.000Z",
      type: "response_item",
      payload: {
        type: "function_call_output",
        call_id: "call-1",
        output: "Process exited with code 0",
      },
    },
    {
      timestamp: "2026-03-06T19:00:06.000Z",
      type: "response_item",
      payload: {
        type: "message",
        role: "assistant",
        content: [
          {
            type: "output_text",
            text: "The tests passed.",
          },
        ],
      },
    },
  ]);
}

export function createClaudeSessionContent(sessionId: string): string {
  return writeJsonl([
    {
      sessionId,
      timestamp: "2026-03-06T19:00:00.000Z",
      cwd: "/workspace/demo",
      uuid: "user-turn-1",
      message: {
        role: "user",
        content: [
          {
            type: "text",
            text: "Please fix the tests and verify before finishing.",
          },
        ],
      },
    },
    {
      sessionId,
      timestamp: "2026-03-06T19:00:01.000Z",
      cwd: "/workspace/demo",
      uuid: "assistant-turn-1",
      message: {
        role: "assistant",
        content: [
          {
            type: "text",
            text: "I will run the tests and report back with proof.",
          },
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
      sessionId,
      timestamp: "2026-03-06T19:00:02.000Z",
      cwd: "/workspace/demo",
      uuid: "user-turn-2",
      toolUseResult: { exitCode: 0 },
      message: {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "tool-1",
            content: "passed",
          },
        ],
      },
    },
    {
      sessionId,
      timestamp: "2026-03-06T19:00:03.000Z",
      cwd: "/workspace/demo",
      uuid: "assistant-turn-2",
      message: {
        role: "assistant",
        content: [
          {
            type: "text",
            text: "The tests passed.",
          },
        ],
      },
    },
  ]);
}

export async function createCodexHome(
  baseDir: string,
  name: string,
  sessionCount = 1,
): Promise<string> {
  const homeDir = join(baseDir, name);
  const sessionsDir = join(homeDir, "sessions", "2026", "03");
  await mkdir(sessionsDir, { recursive: true });

  for (let index = 0; index < sessionCount; index += 1) {
    await writeFile(
      join(sessionsDir, `session-${index + 1}.jsonl`),
      createCodexSessionContent(`codex-session-${index + 1}`),
      "utf8",
    );
  }

  return homeDir;
}

export async function createClaudeHome(
  baseDir: string,
  name: string,
  sessionCount = 1,
  options: { includeOptionalStores?: boolean } = {},
): Promise<string> {
  const homeDir = join(baseDir, name);
  const projectsDir = join(homeDir, "projects", "-Users-test-project");
  await mkdir(projectsDir, { recursive: true });

  for (let index = 0; index < sessionCount; index += 1) {
    await writeFile(
      join(projectsDir, `session-${index + 1}.jsonl`),
      createClaudeSessionContent(`claude-session-${index + 1}`),
      "utf8",
    );
  }

  if (options.includeOptionalStores) {
    await writeFile(join(homeDir, "history.jsonl"), "{}\n", "utf8");
    await mkdir(join(homeDir, "shell-snapshots"), { recursive: true });
    await writeFile(join(homeDir, "session-env"), "KEY=value\n", "utf8");
  }

  return homeDir;
}
