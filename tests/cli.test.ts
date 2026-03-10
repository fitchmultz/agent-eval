/**
 * Purpose: Tests the public CLI contract for source-aware transcript evaluation.
 * Responsibilities: Verify command dispatch, argument parsing, report titles, and both Codex and Claude workflows.
 * Scope: Uses synthetic local transcript fixtures only and writes artifacts into temporary directories.
 * Usage: Executed by Vitest via `pnpm test`.
 * Invariants/Assumptions: The CLI contract is `--source` plus `--home`; no provider-specific home flags remain.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { main } from "../src/cli.js";

function createCodexSessionContent(sessionId: string): string {
  return [
    JSON.stringify({
      timestamp: "2026-03-06T19:00:00.000Z",
      type: "session_meta",
      payload: {
        id: sessionId,
        timestamp: "2026-03-06T19:00:00.000Z",
        cwd: "/test",
      },
    }),
    JSON.stringify({
      timestamp: "2026-03-06T19:00:01.000Z",
      type: "response_item",
      payload: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "Please fix the failing test." }],
      },
    }),
    JSON.stringify({
      timestamp: "2026-03-06T19:00:02.000Z",
      type: "response_item",
      payload: {
        type: "message",
        role: "assistant",
        content: [
          { type: "output_text", text: "I will inspect and verify it." },
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
      cwd: "/test",
      uuid: "user-turn-1",
      message: {
        role: "user",
        content: [{ type: "text", text: "Please fix the failing test." }],
      },
    }),
    JSON.stringify({
      sessionId,
      timestamp: "2026-03-06T19:00:01.000Z",
      cwd: "/test",
      uuid: "assistant-turn-1",
      message: {
        role: "assistant",
        content: [
          { type: "text", text: "I will inspect and verify it." },
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
      cwd: "/test",
      uuid: "user-turn-2",
      toolUseResult: { exitCode: 0 },
      message: {
        role: "user",
        content: [
          { type: "tool_result", tool_use_id: "tool-1", content: "passed" },
        ],
      },
    }),
  ].join("\n");
}

describe("CLI", () => {
  const testDirBase = join(tmpdir(), "agent-eval-cli-test");
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    await mkdir(testDirBase, { recursive: true });
    stdoutSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    stderrSpy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function createCodexHome(
    name: string,
    sessionCount = 1,
  ): Promise<string> {
    const homeDir = join(testDirBase, name);
    const sessionsDir = join(homeDir, "sessions");
    await mkdir(sessionsDir, { recursive: true });
    for (let index = 0; index < sessionCount; index += 1) {
      await writeFile(
        join(sessionsDir, `session-${index + 1}.jsonl`),
        createCodexSessionContent(`codex-session-${index + 1}`),
      );
    }
    return homeDir;
  }

  async function createClaudeHome(name: string): Promise<string> {
    const homeDir = join(testDirBase, name);
    const projectsDir = join(homeDir, "projects", "-Users-test-project");
    await mkdir(projectsDir, { recursive: true });
    await writeFile(
      join(projectsDir, "session-1.jsonl"),
      createClaudeSessionContent("claude-session-1"),
    );
    await writeFile(join(homeDir, "history.jsonl"), "{}\n");
    await mkdir(join(homeDir, "shell-snapshots"), { recursive: true });
    await writeFile(join(homeDir, "session-env"), "KEY=value\n");
    return homeDir;
  }

  it("inspects a Codex home with the source-aware flags", async () => {
    const homeDir = await createCodexHome("inspect-codex");

    const exitCode = await main([
      "node",
      "cli",
      "inspect",
      "--source",
      "codex",
      "--home",
      homeDir,
    ]);

    expect(exitCode).toBe(0);
    expect(stdoutSpy).toHaveBeenCalledWith(
      expect.stringContaining('"sessionFileCount": 1'),
    );
    expect(stdoutSpy).toHaveBeenCalledWith(
      expect.stringContaining('"provider": "codex"'),
    );
  });

  it("inspects a Claude home and reports Claude inventory", async () => {
    const homeDir = await createClaudeHome("inspect-claude");

    const exitCode = await main([
      "node",
      "cli",
      "inspect",
      "--source",
      "claude",
      "--home",
      homeDir,
    ]);

    expect(exitCode).toBe(0);
    expect(stdoutSpy).toHaveBeenCalledWith(
      expect.stringContaining('"provider": "claude"'),
    );
    expect(stdoutSpy).toHaveBeenCalledWith(
      expect.stringContaining('"session_env"'),
    );
  });

  it("parses a Codex home and writes raw-turn artifacts", async () => {
    const homeDir = await createCodexHome("parse-codex");
    const outputDir = join(homeDir, "artifacts");
    await mkdir(outputDir, { recursive: true });

    const exitCode = await main([
      "node",
      "cli",
      "parse",
      "--source",
      "codex",
      "--home",
      homeDir,
      "--output-dir",
      outputDir,
    ]);

    expect(exitCode).toBe(0);
    expect(stdoutSpy).toHaveBeenCalledWith(
      expect.stringContaining("rawTurnCount"),
    );
    expect(
      await readFile(join(outputDir, "raw-turns.jsonl"), "utf8"),
    ).toContain('"sessionId":"codex-session-1"');
  });

  it("evaluates a Claude home in summary-only mode", async () => {
    const homeDir = await createClaudeHome("eval-claude");
    const outputDir = join(homeDir, "artifacts");
    await mkdir(outputDir, { recursive: true });

    const exitCode = await main([
      "node",
      "cli",
      "eval",
      "--source",
      "claude",
      "--home",
      homeDir,
      "--output-dir",
      outputDir,
      "--summary-only",
    ]);

    expect(exitCode).toBe(0);
    expect(stdoutSpy).toHaveBeenCalledWith(
      expect.stringContaining('"summaryOnly": true'),
    );
    expect(await readFile(join(outputDir, "summary.json"), "utf8")).toContain(
      '"sessions": 1',
    );
  });

  it("limits evaluation to the most recent discovered sessions", async () => {
    const homeDir = await createCodexHome("eval-limit", 3);
    const outputDir = join(homeDir, "artifacts");
    await mkdir(outputDir, { recursive: true });

    const exitCode = await main([
      "node",
      "cli",
      "eval",
      "--source",
      "codex",
      "--home",
      homeDir,
      "--output-dir",
      outputDir,
      "--session-limit",
      "2",
    ]);

    expect(exitCode).toBe(0);
    expect(stdoutSpy).toHaveBeenCalledWith(
      expect.stringContaining('"sessionCount": 2'),
    );
  });

  it("writes the markdown report with the source-neutral title", async () => {
    const homeDir = await createCodexHome("report-codex");
    const outputDir = join(homeDir, "artifacts");
    await mkdir(outputDir, { recursive: true });

    const exitCode = await main([
      "node",
      "cli",
      "report",
      "--source",
      "codex",
      "--home",
      homeDir,
      "--output-dir",
      outputDir,
    ]);

    expect(exitCode).toBe(0);
    expect(stdoutSpy).toHaveBeenCalledWith(
      expect.stringContaining("# Agent Evaluator Report"),
    );
    expect(await readFile(join(outputDir, "report.md"), "utf8")).toContain(
      "# Agent Evaluator Report",
    );
  });

  it("falls back to the default source home when inspect is run without flags", async () => {
    const exitCode = await main(["node", "cli", "inspect"]);

    expect(exitCode).toBe(0);
  });

  it("returns a usage error for an invalid source provider", async () => {
    const exitCode = await main([
      "node",
      "cli",
      "inspect",
      "--source",
      "invalid-provider",
    ]);

    expect(exitCode).toBe(2);
    expect(stderrSpy).toHaveBeenCalled();
  });
});
