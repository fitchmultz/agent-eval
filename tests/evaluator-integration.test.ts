/**
 * Purpose: Exercise the real evaluator pipeline against synthetic Codex and Claude transcript homes.
 * Responsibilities: Verify end-to-end discovery, parsing, normalization, and summary generation without mocks.
 * Scope: High-signal integration coverage for the source-aware evaluator boundary.
 * Usage: Executed by Vitest via `pnpm test`.
 * Invariants/Assumptions: Fixtures stay synthetic and local-only while covering the real supported transcript shapes.
 */
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resetConfig } from "../src/config/index.js";
import { evaluateArtifacts } from "../src/evaluator.js";

const testDirBase = join(tmpdir(), "agent-eval-evaluator-integration");

function createCodexSessionContent(sessionId: string): string {
  return [
    JSON.stringify({
      timestamp: "2026-03-06T19:00:00.000Z",
      type: "session_meta",
      payload: {
        id: sessionId,
        timestamp: "2026-03-06T19:00:00.000Z",
        cwd: "/workspace/demo",
      },
    }),
    JSON.stringify({
      timestamp: "2026-03-06T19:00:01.000Z",
      type: "turn_context",
      payload: {
        turn_id: "turn-1",
        cwd: "/workspace/demo",
      },
    }),
    JSON.stringify({
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
    }),
    JSON.stringify({
      timestamp: "2026-03-06T19:00:03.000Z",
      type: "response_item",
      payload: {
        type: "function_call",
        name: "exec_command",
        arguments: '{"cmd":"pnpm test"}',
        call_id: "call-1",
      },
    }),
    JSON.stringify({
      timestamp: "2026-03-06T19:00:04.000Z",
      type: "response_item",
      payload: {
        type: "function_call_output",
        call_id: "call-1",
        output: "Process exited with code 0",
      },
    }),
    JSON.stringify({
      timestamp: "2026-03-06T19:00:05.000Z",
      type: "response_item",
      payload: {
        type: "message",
        role: "assistant",
        content: [
          {
            type: "output_text",
            text: "I verified the fix and the tests passed.",
          },
        ],
      },
    }),
  ].join("\n");
}

function createClaudeSessionContent(sessionId: string): string {
  return [
    JSON.stringify({
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
    }),
    JSON.stringify({
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
    }),
    JSON.stringify({
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
    }),
  ].join("\n");
}

async function createCodexHome(name: string): Promise<string> {
  const homeDir = join(testDirBase, name);
  const sessionsDir = join(homeDir, "sessions", "2026", "03");
  await mkdir(sessionsDir, { recursive: true });
  await writeFile(
    join(sessionsDir, "session-1.jsonl"),
    `${createCodexSessionContent("codex-session-1")}\n`,
    "utf8",
  );
  return homeDir;
}

async function createClaudeHome(name: string): Promise<string> {
  const homeDir = join(testDirBase, name);
  const projectsDir = join(homeDir, "projects", "-Users-test-project");
  await mkdir(projectsDir, { recursive: true });
  await writeFile(
    join(projectsDir, "session-1.jsonl"),
    `${createClaudeSessionContent("claude-session-1")}\n`,
    "utf8",
  );
  return homeDir;
}

describe("evaluateArtifacts integration", () => {
  beforeEach(async () => {
    resetConfig();
    await mkdir(testDirBase, { recursive: true });
  });

  afterEach(async () => {
    resetConfig();
    await rm(testDirBase, { recursive: true, force: true });
  });

  it("evaluates a real Codex transcript home through the full pipeline", async () => {
    const homeDir = await createCodexHome("codex-home");

    const result = await evaluateArtifacts({
      source: "codex",
      home: homeDir,
    });

    expect(result.metrics.sessionCount).toBe(1);
    expect(result.metrics.inventory[0]?.provider).toBe("codex");
    expect(result.rawTurns).toHaveLength(1);
    expect(result.rawTurns?.[0]?.sessionId).toBe("codex-session-1");
    expect(result.rawTurns?.[0]?.sourceRefs[0]?.provider).toBe("codex");
    expect(result.report).toContain("# Agent Evaluator Report");
    expect(result.presentation.reportHtml).toContain("Agent Evaluator Report");
  });

  it("evaluates a real Claude transcript home through the shared summary pipeline", async () => {
    const homeDir = await createClaudeHome("claude-home");

    const result = await evaluateArtifacts({
      source: "claude",
      home: homeDir,
      outputMode: "summary",
    });

    expect(result.metrics.sessionCount).toBe(1);
    expect(result.metrics.inventory[0]?.provider).toBe("claude");
    expect(result.summary.sessions).toBe(1);
    expect(result.summary.turns).toBeGreaterThan(0);
    expect(result.rawTurns).toBeUndefined();
    expect(result.incidents).toBeUndefined();
    expect(result.report).toContain("Sources: `claude`");
    expect(result.presentation.reportHtml).toContain("Agent Evaluator Report");
  });

  it("normalizes equivalent Codex and Claude workflows to the same turn count", async () => {
    const codexHome = await createCodexHome("codex-compare");
    const claudeHome = await createClaudeHome("claude-compare");

    const [codexResult, claudeResult] = await Promise.all([
      evaluateArtifacts({
        source: "codex",
        home: codexHome,
      }),
      evaluateArtifacts({
        source: "claude",
        home: claudeHome,
      }),
    ]);

    expect(codexResult.summary.sessions).toBe(1);
    expect(claudeResult.summary.sessions).toBe(1);
    expect(codexResult.summary.turns).toBe(1);
    expect(claudeResult.summary.turns).toBe(codexResult.summary.turns);
    expect(claudeResult.rawTurns).toHaveLength(
      codexResult.rawTurns?.length ?? 0,
    );
  });
});
