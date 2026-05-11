/**
 * Purpose: Provides shared synthetic Codex, Claude, pi, and opencode transcript fixtures for integration-style tests.
 * Responsibilities: Generate provider-shaped content and materialize temporary homes for CLI and evaluator tests.
 * Scope: Test-only helper used by cross-provider integration coverage; fixtures remain synthetic and public-facing redaction.
 * Usage: Import `createCodexHome()`, `createClaudeHome()`, or `createPiHome()` with a temporary base directory per test suite.
 * Invariants/Assumptions: Provider fixtures describe equivalent workflows unless a test overrides the default transcript content.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

function writeJsonl(records: readonly unknown[]): string {
  return `${records.map((record) => JSON.stringify(record)).join("\n")}\n`;
}

function writeJson(record: unknown): string {
  return JSON.stringify(record, null, 2);
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
            text: "I will run the tests and report back with terminal verification status.",
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
            text: "I will run the tests and report back with terminal verification status.",
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

export async function createCodexHomeFromSessions(
  baseDir: string,
  name: string,
  sessions: readonly { filename: string; content: string }[],
): Promise<string> {
  const homeDir = join(baseDir, name);
  const sessionsDir = join(homeDir, "sessions", "2026", "03");
  await mkdir(sessionsDir, { recursive: true });

  for (const session of sessions) {
    await writeFile(
      join(sessionsDir, session.filename),
      session.content,
      "utf8",
    );
  }

  return homeDir;
}

export async function createCodexHome(
  baseDir: string,
  name: string,
  sessionCount = 1,
): Promise<string> {
  return createCodexHomeFromSessions(
    baseDir,
    name,
    Array.from({ length: sessionCount }, (_, index) => ({
      filename: `session-${index + 1}.jsonl`,
      content: createCodexSessionContent(`codex-session-${index + 1}`),
    })),
  );
}

export function createPiSessionContent(sessionId: string): string {
  return writeJsonl([
    {
      type: "session",
      version: 3,
      id: sessionId,
      timestamp: "2026-03-06T19:00:00.000Z",
      cwd: "/workspace/demo",
    },
    {
      type: "model_change",
      id: "model-1",
      parentId: null,
      timestamp: "2026-03-06T19:00:00.100Z",
      provider: "anthropic",
      modelId: "claude-sonnet-4-6",
    },
    {
      type: "message",
      id: "user-1",
      parentId: "model-1",
      timestamp: "2026-03-06T19:00:01.000Z",
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
      type: "message",
      id: "assistant-1",
      parentId: "user-1",
      timestamp: "2026-03-06T19:00:02.000Z",
      message: {
        role: "assistant",
        content: [
          {
            type: "thinking",
            thinking:
              "I will run the tests and report back with terminal verification status.",
          },
          {
            type: "toolCall",
            id: "tool-1",
            name: "bash",
            arguments: { command: "pnpm test" },
          },
        ],
      },
    },
    {
      type: "message",
      id: "tool-result-1",
      parentId: "assistant-1",
      timestamp: "2026-03-06T19:00:03.000Z",
      message: {
        role: "toolResult",
        toolCallId: "tool-1",
        toolName: "bash",
        content: [
          {
            type: "text",
            text: "Process exited with code 0",
          },
        ],
        isError: false,
      },
    },
    {
      type: "message",
      id: "assistant-2",
      parentId: "tool-result-1",
      timestamp: "2026-03-06T19:00:04.000Z",
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

export async function createClaudeHomeFromSessions(
  baseDir: string,
  name: string,
  sessions: readonly { filename: string; content: string }[],
  options: { includeOptionalStores?: boolean } = {},
): Promise<string> {
  const homeDir = join(baseDir, name);
  const projectsDir = join(homeDir, "projects", "-Users-test-project");
  await mkdir(projectsDir, { recursive: true });

  for (const session of sessions) {
    await writeFile(
      join(projectsDir, session.filename),
      session.content,
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

export async function createClaudeHome(
  baseDir: string,
  name: string,
  sessionCount = 1,
  options: { includeOptionalStores?: boolean } = {},
): Promise<string> {
  return createClaudeHomeFromSessions(
    baseDir,
    name,
    Array.from({ length: sessionCount }, (_, index) => ({
      filename: `session-${index + 1}.jsonl`,
      content: createClaudeSessionContent(`claude-session-${index + 1}`),
    })),
    options,
  );
}

export async function createPiHomeFromSessions(
  baseDir: string,
  name: string,
  sessions: readonly { filename: string; content: string }[],
): Promise<string> {
  const homeDir = join(baseDir, name);
  const sessionsDir = join(
    homeDir,
    "agent",
    "sessions",
    "--Users-test-project--",
  );
  await mkdir(sessionsDir, { recursive: true });

  for (const session of sessions) {
    await writeFile(
      join(sessionsDir, session.filename),
      session.content,
      "utf8",
    );
  }

  return homeDir;
}

export async function createPiHome(
  baseDir: string,
  name: string,
  sessionCount = 1,
): Promise<string> {
  return createPiHomeFromSessions(
    baseDir,
    name,
    Array.from({ length: sessionCount }, (_, index) => ({
      filename: `session-${index + 1}.jsonl`,
      content: createPiSessionContent(`pi-session-${index + 1}`),
    })),
  );
}

export async function createOpencodeHome(
  baseDir: string,
  name: string,
): Promise<string> {
  const homeDir = join(baseDir, name);
  const sessionId = "ses_opencode_1";
  const projectId = "project-1";
  const userMessageId = "msg_opencode_user_1";
  const assistantMessageId = "msg_opencode_assistant_1";
  await mkdir(join(homeDir, "storage", "session", projectId), {
    recursive: true,
  });
  await mkdir(join(homeDir, "storage", "message", sessionId), {
    recursive: true,
  });
  await mkdir(join(homeDir, "storage", "part", userMessageId), {
    recursive: true,
  });
  await mkdir(join(homeDir, "storage", "part", assistantMessageId), {
    recursive: true,
  });

  await writeFile(
    join(homeDir, "storage", "session", projectId, `${sessionId}.json`),
    writeJson({
      id: sessionId,
      projectID: projectId,
      directory: "/workspace/demo",
      title: "Fix tests",
      time: { created: 1770000000000, updated: 1770000004000 },
    }),
    "utf8",
  );
  await writeFile(
    join(homeDir, "storage", "message", sessionId, `${userMessageId}.json`),
    writeJson({
      id: userMessageId,
      sessionID: sessionId,
      role: "user",
      time: { created: 1770000000001 },
      model: { providerID: "anthropic", modelID: "claude-sonnet-4" },
      path: { cwd: "/workspace/demo" },
    }),
    "utf8",
  );
  await writeFile(
    join(homeDir, "storage", "part", userMessageId, "prt_user.json"),
    writeJson({
      id: "prt_user",
      sessionID: sessionId,
      messageID: userMessageId,
      type: "text",
      text: "Please fix the tests and verify before finishing.",
      time: { start: 1770000000002 },
    }),
    "utf8",
  );
  await writeFile(
    join(
      homeDir,
      "storage",
      "message",
      sessionId,
      `${assistantMessageId}.json`,
    ),
    writeJson({
      id: assistantMessageId,
      sessionID: sessionId,
      role: "assistant",
      parentID: userMessageId,
      providerID: "anthropic",
      modelID: "claude-sonnet-4",
      time: { created: 1770000001000, completed: 1770000003000 },
      tokens: { input: 100, output: 25 },
      path: { cwd: "/workspace/demo" },
    }),
    "utf8",
  );
  await writeFile(
    join(homeDir, "storage", "part", assistantMessageId, "prt_text.json"),
    writeJson({
      id: "prt_text",
      sessionID: sessionId,
      messageID: assistantMessageId,
      type: "text",
      text: "I will run the tests and report back with terminal verification status.",
      time: { start: 1770000001001 },
    }),
    "utf8",
  );
  await writeFile(
    join(homeDir, "storage", "part", assistantMessageId, "prt_tool.json"),
    writeJson({
      id: "prt_tool",
      sessionID: sessionId,
      messageID: assistantMessageId,
      type: "tool",
      callID: "call_opencode_1",
      tool: "bash",
      state: {
        status: "completed",
        input: { command: "pnpm test" },
        output: "Process exited with code 0",
        time: { start: 1770000002000, end: 1770000002500 },
      },
    }),
    "utf8",
  );

  return homeDir;
}
