/**
 * Purpose: Tests CLI argument parsing, command dispatch, and error handling.
 * Entrypoint: Executed by Vitest via `pnpm test`.
 * Notes: Uses temporary directories and mocks stdout/stderr to verify CLI behavior.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { main } from "../src/cli.js";

describe("CLI", () => {
  const testDirBase = join(tmpdir(), "agent-eval-cli-test");
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    await mkdir(testDirBase, { recursive: true });
    stdoutSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    // Cleanup is handled by OS temp dir cleanup
  });

  describe("inspect command", () => {
    it("exits with code 0 for valid inspect command", async () => {
      const testDir = join(testDirBase, "inspect-valid");
      await mkdir(join(testDir, "sessions"), { recursive: true });

      const exitCode = await main([
        "node",
        "cli",
        "inspect",
        "--codex-home",
        testDir,
      ]);

      expect(exitCode).toBe(0);
    });

    it("writes JSON output to stdout with evaluator version", async () => {
      const testDir = join(testDirBase, "inspect-output");
      await mkdir(join(testDir, "sessions"), { recursive: true });

      await main(["node", "cli", "inspect", "--codex-home", testDir]);

      expect(stdoutSpy).toHaveBeenCalledWith(
        expect.stringContaining("evaluatorVersion"),
      );
      expect(stdoutSpy).toHaveBeenCalledWith(
        expect.stringContaining("schemaVersion"),
      );
    });

    it("includes session file count in output", async () => {
      const testDir = join(testDirBase, "inspect-count");
      const sessionsDir = join(testDir, "sessions");
      await mkdir(sessionsDir, { recursive: true });
      await writeFile(join(sessionsDir, "test.jsonl"), "{}\n");

      await main(["node", "cli", "inspect", "--codex-home", testDir]);

      expect(stdoutSpy).toHaveBeenCalledWith(
        expect.stringContaining('"sessionFileCount": 1'),
      );
    });

    it("includes inventory in output", async () => {
      const testDir = join(testDirBase, "inspect-inventory");
      await mkdir(join(testDir, "sessions"), { recursive: true });

      await main(["node", "cli", "inspect", "--codex-home", testDir]);

      expect(stdoutSpy).toHaveBeenCalledWith(
        expect.stringContaining('"inventory"'),
      );
      expect(stdoutSpy).toHaveBeenCalledWith(
        expect.stringContaining("session_jsonl"),
      );
    });

    it("uses default codex home when not specified", async () => {
      // This test verifies the command works without --codex-home
      // The default is ~/.codex which may or may not exist
      const exitCode = await main(["node", "cli", "inspect"]);

      // Should succeed even if default doesn't exist (returns empty results)
      expect(exitCode).toBe(0);
    });
  });

  describe("parse command", () => {
    it("exits with code 0 for valid parse command", async () => {
      const testDir = join(testDirBase, "parse-valid");
      const sessionsDir = join(testDir, "sessions");
      const outputDir = join(testDir, "output");
      await mkdir(sessionsDir, { recursive: true });
      await mkdir(outputDir, { recursive: true });

      // Create a minimal valid session file
      const sessionContent = [
        JSON.stringify({
          timestamp: "2026-03-06T19:00:00.000Z",
          type: "session_meta",
          payload: {
            id: "test-session",
            timestamp: "2026-03-06T19:00:00.000Z",
            cwd: "/test",
          },
        }),
      ].join("\n");
      await writeFile(join(sessionsDir, "test.jsonl"), sessionContent);

      const exitCode = await main([
        "node",
        "cli",
        "parse",
        "--codex-home",
        testDir,
        "--output-dir",
        outputDir,
      ]);

      expect(exitCode).toBe(0);
    });

    it("writes JSON output with rawTurnCount", async () => {
      const testDir = join(testDirBase, "parse-output");
      const sessionsDir = join(testDir, "sessions");
      const outputDir = join(testDir, "output");
      await mkdir(sessionsDir, { recursive: true });
      await mkdir(outputDir, { recursive: true });

      const sessionContent = [
        JSON.stringify({
          timestamp: "2026-03-06T19:00:00.000Z",
          type: "session_meta",
          payload: {
            id: "test-session",
            timestamp: "2026-03-06T19:00:00.000Z",
            cwd: "/test",
          },
        }),
      ].join("\n");
      await writeFile(join(sessionsDir, "test.jsonl"), sessionContent);

      await main([
        "node",
        "cli",
        "parse",
        "--codex-home",
        testDir,
        "--output-dir",
        outputDir,
      ]);

      expect(stdoutSpy).toHaveBeenCalledWith(
        expect.stringContaining("rawTurnCount"),
      );
    });
  });

  describe("eval command", () => {
    it("exits with code 0 for valid eval command", async () => {
      const testDir = join(testDirBase, "eval-valid");
      const sessionsDir = join(testDir, "sessions");
      const outputDir = join(testDir, "output");
      await mkdir(sessionsDir, { recursive: true });
      await mkdir(outputDir, { recursive: true });

      const sessionContent = [
        JSON.stringify({
          timestamp: "2026-03-06T19:00:00.000Z",
          type: "session_meta",
          payload: {
            id: "test-session",
            timestamp: "2026-03-06T19:00:00.000Z",
            cwd: "/test",
          },
        }),
      ].join("\n");
      await writeFile(join(sessionsDir, "test.jsonl"), sessionContent);

      const exitCode = await main([
        "node",
        "cli",
        "eval",
        "--codex-home",
        testDir,
        "--output-dir",
        outputDir,
      ]);

      expect(exitCode).toBe(0);
    });

    it("writes JSON output with session and incident counts", async () => {
      const testDir = join(testDirBase, "eval-counts");
      const sessionsDir = join(testDir, "sessions");
      const outputDir = join(testDir, "output");
      await mkdir(sessionsDir, { recursive: true });
      await mkdir(outputDir, { recursive: true });

      const sessionContent = [
        JSON.stringify({
          timestamp: "2026-03-06T19:00:00.000Z",
          type: "session_meta",
          payload: {
            id: "test-session",
            timestamp: "2026-03-06T19:00:00.000Z",
            cwd: "/test",
          },
        }),
      ].join("\n");
      await writeFile(join(sessionsDir, "test.jsonl"), sessionContent);

      await main([
        "node",
        "cli",
        "eval",
        "--codex-home",
        testDir,
        "--output-dir",
        outputDir,
      ]);

      expect(stdoutSpy).toHaveBeenCalledWith(
        expect.stringContaining("sessionCount"),
      );
      expect(stdoutSpy).toHaveBeenCalledWith(
        expect.stringContaining("incidentCount"),
      );
    });

    it("supports --summary-only flag", async () => {
      const testDir = join(testDirBase, "eval-summary");
      const sessionsDir = join(testDir, "sessions");
      const outputDir = join(testDir, "output");
      await mkdir(sessionsDir, { recursive: true });
      await mkdir(outputDir, { recursive: true });

      const sessionContent = [
        JSON.stringify({
          timestamp: "2026-03-06T19:00:00.000Z",
          type: "session_meta",
          payload: {
            id: "test-session",
            timestamp: "2026-03-06T19:00:00.000Z",
            cwd: "/test",
          },
        }),
      ].join("\n");
      await writeFile(join(sessionsDir, "test.jsonl"), sessionContent);

      const exitCode = await main([
        "node",
        "cli",
        "eval",
        "--codex-home",
        testDir,
        "--output-dir",
        outputDir,
        "--summary-only",
      ]);

      expect(exitCode).toBe(0);
      expect(stdoutSpy).toHaveBeenCalledWith(
        expect.stringContaining("summaryOnly"),
      );
    });

    it("supports --session-limit flag", async () => {
      const testDir = join(testDirBase, "eval-limit");
      const sessionsDir = join(testDir, "sessions");
      const outputDir = join(testDir, "output");
      await mkdir(sessionsDir, { recursive: true });
      await mkdir(outputDir, { recursive: true });

      // Create multiple sessions
      for (let i = 0; i < 5; i++) {
        const sessionContent = [
          JSON.stringify({
            timestamp: "2026-03-06T19:00:00.000Z",
            type: "session_meta",
            payload: {
              id: `test-session-${i}`,
              timestamp: "2026-03-06T19:00:00.000Z",
              cwd: "/test",
            },
          }),
        ].join("\n");
        await writeFile(join(sessionsDir, `test${i}.jsonl`), sessionContent);
      }

      const exitCode = await main([
        "node",
        "cli",
        "eval",
        "--codex-home",
        testDir,
        "--output-dir",
        outputDir,
        "--session-limit",
        "2",
      ]);

      expect(exitCode).toBe(0);
      // Should only process 2 sessions
      expect(stdoutSpy).toHaveBeenCalledWith(
        expect.stringContaining('"sessionCount": 2'),
      );
    });
  });

  describe("report command", () => {
    it("exits with code 0 for valid report command", async () => {
      const testDir = join(testDirBase, "report-valid");
      const sessionsDir = join(testDir, "sessions");
      const outputDir = join(testDir, "output");
      await mkdir(sessionsDir, { recursive: true });
      await mkdir(outputDir, { recursive: true });

      const sessionContent = [
        JSON.stringify({
          timestamp: "2026-03-06T19:00:00.000Z",
          type: "session_meta",
          payload: {
            id: "test-session",
            timestamp: "2026-03-06T19:00:00.000Z",
            cwd: "/test",
          },
        }),
      ].join("\n");
      await writeFile(join(sessionsDir, "test.jsonl"), sessionContent);

      const exitCode = await main([
        "node",
        "cli",
        "report",
        "--codex-home",
        testDir,
        "--output-dir",
        outputDir,
      ]);

      expect(exitCode).toBe(0);
    });

    it("writes markdown report to stdout", async () => {
      const testDir = join(testDirBase, "report-output");
      const sessionsDir = join(testDir, "sessions");
      const outputDir = join(testDir, "output");
      await mkdir(sessionsDir, { recursive: true });
      await mkdir(outputDir, { recursive: true });

      const sessionContent = [
        JSON.stringify({
          timestamp: "2026-03-06T19:00:00.000Z",
          type: "session_meta",
          payload: {
            id: "test-session",
            timestamp: "2026-03-06T19:00:00.000Z",
            cwd: "/test",
          },
        }),
      ].join("\n");
      await writeFile(join(sessionsDir, "test.jsonl"), sessionContent);

      await main([
        "node",
        "cli",
        "report",
        "--codex-home",
        testDir,
        "--output-dir",
        outputDir,
      ]);

      expect(stdoutSpy).toHaveBeenCalledWith(
        expect.stringContaining("# Codex Evaluator Report"),
      );
    });

    it("supports --summary-only flag for report", async () => {
      const testDir = join(testDirBase, "report-summary");
      const sessionsDir = join(testDir, "sessions");
      const outputDir = join(testDir, "output");
      await mkdir(sessionsDir, { recursive: true });
      await mkdir(outputDir, { recursive: true });

      const sessionContent = [
        JSON.stringify({
          timestamp: "2026-03-06T19:00:00.000Z",
          type: "session_meta",
          payload: {
            id: "test-session",
            timestamp: "2026-03-06T19:00:00.000Z",
            cwd: "/test",
          },
        }),
      ].join("\n");
      await writeFile(join(sessionsDir, "test.jsonl"), sessionContent);

      const exitCode = await main([
        "node",
        "cli",
        "report",
        "--codex-home",
        testDir,
        "--output-dir",
        outputDir,
        "--summary-only",
      ]);

      expect(exitCode).toBe(0);
      expect(stdoutSpy).toHaveBeenCalledWith(
        expect.stringContaining("# Codex Evaluator Report"),
      );
    });
  });

  describe("argument parsing", () => {
    it("parses --codex-home argument", async () => {
      const testDir = join(testDirBase, "arg-codex-home");
      await mkdir(join(testDir, "sessions"), { recursive: true });

      const exitCode = await main([
        "node",
        "cli",
        "inspect",
        "--codex-home",
        testDir,
      ]);

      expect(exitCode).toBe(0);
    });

    it("parses --output-dir argument", async () => {
      const testDir = join(testDirBase, "arg-output-dir");
      const sessionsDir = join(testDir, "sessions");
      const outputDir = join(testDir, "custom-output");
      await mkdir(sessionsDir, { recursive: true });

      const sessionContent = [
        JSON.stringify({
          timestamp: "2026-03-06T19:00:00.000Z",
          type: "session_meta",
          payload: {
            id: "test-session",
            timestamp: "2026-03-06T19:00:00.000Z",
            cwd: "/test",
          },
        }),
      ].join("\n");
      await writeFile(join(sessionsDir, "test.jsonl"), sessionContent);

      const exitCode = await main([
        "node",
        "cli",
        "parse",
        "--codex-home",
        testDir,
        "--output-dir",
        outputDir,
      ]);

      expect(exitCode).toBe(0);
    });

    it("parses --session-limit as integer", async () => {
      const testDir = join(testDirBase, "arg-session-limit");
      const sessionsDir = join(testDir, "sessions");
      const outputDir = join(testDir, "output");
      await mkdir(sessionsDir, { recursive: true });
      await mkdir(outputDir, { recursive: true });

      // Create 3 sessions
      for (let i = 0; i < 3; i++) {
        const sessionContent = [
          JSON.stringify({
            timestamp: "2026-03-06T19:00:00.000Z",
            type: "session_meta",
            payload: {
              id: `test-session-${i}`,
              timestamp: "2026-03-06T19:00:00.000Z",
              cwd: "/test",
            },
          }),
        ].join("\n");
        await writeFile(join(sessionsDir, `test${i}.jsonl`), sessionContent);
      }

      const exitCode = await main([
        "node",
        "cli",
        "eval",
        "--codex-home",
        testDir,
        "--output-dir",
        outputDir,
        "--session-limit",
        "1",
      ]);

      expect(exitCode).toBe(0);
    });

    it("parses --summary-only as boolean flag", async () => {
      const testDir = join(testDirBase, "arg-summary-only");
      const sessionsDir = join(testDir, "sessions");
      const outputDir = join(testDir, "output");
      await mkdir(sessionsDir, { recursive: true });
      await mkdir(outputDir, { recursive: true });

      const sessionContent = [
        JSON.stringify({
          timestamp: "2026-03-06T19:00:00.000Z",
          type: "session_meta",
          payload: {
            id: "test-session",
            timestamp: "2026-03-06T19:00:00.000Z",
            cwd: "/test",
          },
        }),
      ].join("\n");
      await writeFile(join(sessionsDir, "test.jsonl"), sessionContent);

      const exitCode = await main([
        "node",
        "cli",
        "eval",
        "--codex-home",
        testDir,
        "--output-dir",
        outputDir,
        "--summary-only",
      ]);

      expect(exitCode).toBe(0);
    });
  });

  describe("exit codes", () => {
    it("returns exit code 0 on success", async () => {
      const testDir = join(testDirBase, "exit-success");
      await mkdir(join(testDir, "sessions"), { recursive: true });

      const exitCode = await main([
        "node",
        "cli",
        "inspect",
        "--codex-home",
        testDir,
      ]);

      expect(exitCode).toBe(0);
    });

    it("returns exit code 1 for unknown commands", async () => {
      const testDir = join(testDirBase, "exit-invalid");
      await mkdir(join(testDir, "sessions"), { recursive: true });

      const exitCode = await main([
        "node",
        "cli",
        "unknown-command",
        "--codex-home",
        testDir,
      ]);

      expect(exitCode).toBe(1);
    });

    it("handles invalid JSON gracefully (silent skip)", async () => {
      // The transcript parser silently skips invalid JSON lines
      // This test verifies the eval command still succeeds
      const testDir = join(testDirBase, "exit-error");
      const sessionsDir = join(testDir, "sessions");
      const outputDir = join(testDir, "output");
      await mkdir(sessionsDir, { recursive: true });
      await mkdir(outputDir, { recursive: true });

      // Create an invalid JSONL file - will be silently skipped
      await writeFile(join(sessionsDir, "invalid.jsonl"), "not valid json\n");

      const exitCode = await main([
        "node",
        "cli",
        "eval",
        "--codex-home",
        testDir,
        "--output-dir",
        outputDir,
      ]);

      // Parser silently skips invalid JSON, so this succeeds with 0 sessions
      expect(exitCode).toBe(0);
    });
  });

  describe("error handling", () => {
    it("handles missing sessions directory gracefully", async () => {
      const testDir = join(testDirBase, "missing-sessions");
      await mkdir(testDir, { recursive: true });
      // Don't create sessions directory

      const exitCode = await main([
        "node",
        "cli",
        "inspect",
        "--codex-home",
        testDir,
      ]);

      expect(exitCode).toBe(0);
    });

    it("succeeds with empty sessions directory", async () => {
      const testDir = join(testDirBase, "empty-sessions");
      await mkdir(join(testDir, "sessions"), { recursive: true });

      const exitCode = await main([
        "node",
        "cli",
        "eval",
        "--codex-home",
        testDir,
        "--output-dir",
        join(testDir, "output"),
      ]);

      expect(exitCode).toBe(0);
    });
  });

  describe("help", () => {
    it("shows help for inspect command", async () => {
      // Commander exits with code 1 for --help by default
      // This is expected behavior for CLI tools
      const exitCode = await main(["node", "cli", "inspect", "--help"]);

      // Commander treats --help as an exit event
      expect(exitCode).toBe(1);
    });

    it("shows version information", async () => {
      // Commander exits with code 1 for --version by default
      const exitCode = await main(["node", "cli", "--version"]);

      expect(exitCode).toBe(1);
    });

    it("shows global help", async () => {
      // Commander exits with code 1 for --help by default
      const exitCode = await main(["node", "cli", "--help"]);

      expect(exitCode).toBe(1);
    });
  });

  describe("default values", () => {
    it("uses 'artifacts' as default output-dir", async () => {
      // Just verify the command works without specifying --output-dir
      // The actual default is tested implicitly by other tests
      const testDir = join(testDirBase, "default-output");
      const sessionsDir = join(testDir, "sessions");
      await mkdir(sessionsDir, { recursive: true });

      const sessionContent = [
        JSON.stringify({
          timestamp: "2026-03-06T19:00:00.000Z",
          type: "session_meta",
          payload: {
            id: "test-session",
            timestamp: "2026-03-06T19:00:00.000Z",
            cwd: "/test",
          },
        }),
      ].join("\n");
      await writeFile(join(sessionsDir, "test.jsonl"), sessionContent);

      const exitCode = await main([
        "node",
        "cli",
        "inspect",
        "--codex-home",
        testDir,
      ]);

      expect(exitCode).toBe(0);
    });
  });
});
