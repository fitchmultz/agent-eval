/**
 * Purpose: Tests the public CLI contract for source-aware transcript evaluation.
 * Responsibilities: Verify command dispatch, argument parsing, report titles, and both Codex and Claude workflows.
 * Scope: Uses synthetic local transcript fixtures only and writes artifacts into temporary directories.
 * Usage: Executed by Vitest via `pnpm test`.
 * Invariants/Assumptions: The CLI contract is `--source` plus `--home`; no provider-specific home flags remain.
 */
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildCliOverrides, getDefaultOutputDir } from "../src/cli/options.js";
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
    vi.unstubAllEnvs();
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
    await expect(access(join(outputDir, "metrics.json"))).rejects.toBeDefined();
    await expect(access(join(outputDir, "summary.json"))).rejects.toBeDefined();
    await expect(access(join(outputDir, "report.md"))).rejects.toBeDefined();
    await expect(access(join(outputDir, "report.html"))).rejects.toBeDefined();
    await expect(
      access(join(outputDir, "label-counts.svg")),
    ).rejects.toBeDefined();
    await expect(
      access(join(outputDir, "compliance-summary.svg")),
    ).rejects.toBeDefined();
    await expect(
      access(join(outputDir, "severity-breakdown.svg")),
    ).rejects.toBeDefined();
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
      expect.stringContaining("# Transcript Analytics Report"),
    );
    expect(await readFile(join(outputDir, "report.md"), "utf8")).toContain(
      "# Transcript Analytics Report",
    );
  });

  it("renders a deterministic empty-state report for a valid empty home", async () => {
    const homeDir = join(testDirBase, "report-empty");
    const outputDir = join(homeDir, "artifacts");
    await mkdir(join(homeDir, "sessions"), { recursive: true });
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
      expect.stringContaining("## No Data Yet"),
    );
    expect(await readFile(join(outputDir, "report.md"), "utf8")).toContain(
      "The selected source home has the expected transcript layout, but no session JSONL files were discovered yet.",
    );
    expect(await readFile(join(outputDir, "metrics.json"), "utf8")).toContain(
      '"sessionCount": 0',
    );
    expect(await readFile(join(outputDir, "report.html"), "utf8")).toContain(
      "No Data Yet",
    );
  });

  it("falls back to the default source home when inspect is run without flags", async () => {
    const exitCode = await main(["node", "cli", "inspect"]);

    expect(exitCode).toBe(0);
  });

  it("reads CODEX_EVAL_OUTPUT_DIR for the default artifact path", () => {
    vi.stubEnv("CODEX_EVAL_OUTPUT_DIR", "/tmp/agent-eval-from-env");

    expect(getDefaultOutputDir()).toBe("/tmp/agent-eval-from-env");
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

  it("returns a usage error for a non-positive session limit", async () => {
    const homeDir = await createCodexHome(testDirBase, "bad-session-limit");

    const exitCode = await main([
      "node",
      "cli",
      "eval",
      "--source",
      "codex",
      "--home",
      homeDir,
      "--session-limit",
      "0",
    ]);

    expect(exitCode).toBe(2);
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining("--session-limit must be a positive integer."),
    );
  });

  it("fails clearly when canonical transcript input is missing", async () => {
    const homeDir = join(testDirBase, "missing-home");
    const outputDir = join(testDirBase, "missing-out");
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
    ]);

    expect(exitCode).toBe(1);
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining("Canonical transcript directory not found"),
    );
  });

  it("fails clearly on malformed config files", async () => {
    const homeDir = await createCodexHome(testDirBase, "bad-config");
    await writeFile(join(homeDir, ".agent-evalrc"), "{ invalid json\n");

    const originalCwd = process.cwd();
    process.chdir(homeDir);

    try {
      const exitCode = await main([
        "node",
        "cli",
        "eval",
        "--source",
        "codex",
        "--home",
        homeDir,
      ]);

      expect(exitCode).toBe(2);
      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining("Failed to parse config file"),
      );
    } finally {
      process.chdir(originalCwd);
    }
  });

  it("applies --concurrency to summary and full evaluation modes", () => {
    expect(
      buildCliOverrides({
        source: "codex",
        home: "/tmp/home",
        outputDir: "/tmp/out",
        concurrency: 3,
      }),
    ).toEqual({
      concurrency: {
        full: 3,
        summary: 3,
      },
    });
  });
});
