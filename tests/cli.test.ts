/**
 * Purpose: Tests the public CLI contract for source-aware transcript evaluation.
 * Responsibilities: Verify command dispatch, argument parsing, report titles, and both Codex and Claude workflows.
 * Scope: Uses synthetic local transcript fixtures only and writes artifacts into temporary directories.
 * Usage: Executed by Vitest via `pnpm test`.
 * Invariants/Assumptions: The CLI contract is `--source` plus `--home`; no provider-specific home flags remain.
 */
import { mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { main } from "../src/cli.js";
import {
  createClaudeHome,
  createCodexHome,
} from "./support/transcript-fixtures.js";

describe("CLI", () => {
  const testDirBase = join(tmpdir(), "agent-eval-cli-test");
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    await rm(testDirBase, { recursive: true, force: true });
    await mkdir(testDirBase, { recursive: true });
    stdoutSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    stderrSpy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
  });

  afterEach(async () => {
    await rm(testDirBase, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("inspects a Codex home with the source-aware flags", async () => {
    const homeDir = await createCodexHome(testDirBase, "inspect-codex");

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
    const homeDir = await createClaudeHome(testDirBase, "inspect-claude", 1, {
      includeOptionalStores: true,
    });

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
    const homeDir = await createCodexHome(testDirBase, "parse-codex");
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
    const homeDir = await createClaudeHome(testDirBase, "eval-claude");
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
    const homeDir = await createCodexHome(testDirBase, "eval-limit", 3);
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
    const homeDir = await createCodexHome(testDirBase, "report-codex");
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
