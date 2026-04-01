/**
 * Purpose: Tests source-aware artifact discovery and inventory building.
 * Responsibilities: Verify Codex, Claude Code, and pi homes resolve the expected transcript and enrichment stores.
 * Scope: Uses temporary directories only, with synthetic files and no private local data.
 * Usage: Executed by Vitest via `pnpm test`.
 * Invariants/Assumptions: Discovery requires an explicit provider in tests so temp paths stay unambiguous.
 */
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { discoverArtifacts } from "../src/discovery.js";

describe("discoverArtifacts", () => {
  const testDirBase = join(tmpdir(), "agent-eval-discovery-test");

  afterEach(async () => {
    await rm(testDirBase, { recursive: true, force: true });
  });

  it("discovers Codex session JSONL files and enrichment inventory", async () => {
    const testDir = join(testDirBase, "codex-home");
    const sessionsDir = join(testDir, "sessions", "2026", "03");
    await mkdir(sessionsDir, { recursive: true });
    await writeFile(join(sessionsDir, "alpha.jsonl"), "{}\n");
    await writeFile(join(sessionsDir, "beta.jsonl"), "{}\n");
    await writeFile(join(testDir, "state_5.sqlite"), "sqlite");
    await writeFile(join(testDir, "history.jsonl"), "{}\n");
    await mkdir(join(testDir, "log"), { recursive: true });
    await writeFile(join(testDir, "log", "codex-tui.log"), "log");
    await mkdir(join(testDir, "sqlite"), { recursive: true });
    await writeFile(join(testDir, "sqlite", "codex-dev.db"), "db");
    await mkdir(join(testDir, "shell_snapshots"), { recursive: true });

    const result = await discoverArtifacts(testDir, { provider: "codex" });

    expect(result.provider).toBe("codex");
    expect(result.homePath).toBe(testDir);
    expect(result.sessionFiles).toHaveLength(2);
    expect(result.sessionFiles.map((path) => path.split("/").pop())).toEqual([
      "alpha.jsonl",
      "beta.jsonl",
    ]);
    expect(result.inventory).toHaveLength(6);
    expect(
      result.inventory.find((record) => record.kind === "session_jsonl"),
    ).toMatchObject({
      provider: "codex",
      discovered: true,
      required: true,
      optional: false,
      path: join(testDir, "sessions"),
    });
    expect(
      result.inventory.find((record) => record.kind === "state_sqlite"),
    ).toMatchObject({
      provider: "codex",
      discovered: true,
      optional: true,
      path: join(testDir, "state_5.sqlite"),
    });
    expect(
      result.inventory.find((record) => record.kind === "shell_snapshot"),
    ).toMatchObject({
      provider: "codex",
      discovered: true,
      path: join(testDir, "shell_snapshots"),
    });
  });

  it("marks missing Codex stores as undiscovered without failing", async () => {
    const testDir = join(testDirBase, "codex-empty");
    await mkdir(testDir, { recursive: true });

    const result = await discoverArtifacts(testDir, { provider: "codex" });

    expect(result.sessionFiles).toHaveLength(0);
    expect(result.inventory).toHaveLength(6);
    for (const record of result.inventory) {
      expect(record.provider).toBe("codex");
      expect(record.discovered).toBe(false);
    }
  });

  it("treats an empty Codex sessions directory as missing canonical transcript input", async () => {
    const testDir = join(testDirBase, "codex-empty-sessions-dir");
    await mkdir(join(testDir, "sessions"), { recursive: true });
    await mkdir(join(testDir, "shell_snapshots"), { recursive: true });

    const result = await discoverArtifacts(testDir, { provider: "codex" });

    expect(result.sessionFiles).toEqual([]);
    expect(
      result.inventory.find((record) => record.kind === "session_jsonl"),
    ).toMatchObject({
      provider: "codex",
      discovered: false,
      required: true,
      optional: false,
      path: join(testDir, "sessions"),
    });
    expect(
      result.inventory.find((record) => record.kind === "shell_snapshot"),
    ).toMatchObject({
      provider: "codex",
      discovered: true,
      optional: true,
      path: join(testDir, "shell_snapshots"),
    });
  });

  it("discovers Claude Code project transcripts and optional stores", async () => {
    const testDir = join(testDirBase, "claude-home");
    const projectsDir = join(testDir, "projects", "-Users-test-project");
    await mkdir(projectsDir, { recursive: true });
    await writeFile(join(projectsDir, "session.jsonl"), "{}\n");
    await writeFile(join(testDir, "history.jsonl"), "{}\n");
    await mkdir(join(testDir, "shell-snapshots"), { recursive: true });
    await writeFile(join(testDir, "session-env"), "KEY=value\n");

    const result = await discoverArtifacts(testDir, { provider: "claude" });

    expect(result.provider).toBe("claude");
    expect(result.homePath).toBe(testDir);
    expect(result.sessionFiles).toHaveLength(1);
    expect(result.inventory).toHaveLength(4);
    expect(
      result.inventory.find((record) => record.kind === "session_jsonl"),
    ).toMatchObject({
      provider: "claude",
      discovered: true,
      required: true,
      path: join(testDir, "projects"),
    });
    expect(
      result.inventory.find((record) => record.kind === "session_env"),
    ).toMatchObject({
      provider: "claude",
      discovered: true,
      optional: true,
      path: join(testDir, "session-env"),
    });
    expect(
      result.inventory.find((record) => record.kind === "shell_snapshot"),
    ).toMatchObject({
      provider: "claude",
      discovered: true,
      path: join(testDir, "shell-snapshots"),
    });
  });

  it("discovers pi session transcripts", async () => {
    const testDir = join(testDirBase, "pi-home");
    const sessionsDir = join(
      testDir,
      "agent",
      "sessions",
      "--Users-test-project",
    );
    await mkdir(sessionsDir, { recursive: true });
    await writeFile(join(sessionsDir, "session.jsonl"), "{}\n");

    const result = await discoverArtifacts(testDir, { provider: "pi" });

    expect(result.provider).toBe("pi");
    expect(result.homePath).toBe(testDir);
    expect(result.sessionFiles).toHaveLength(1);
    expect(result.inventory).toHaveLength(1);
    expect(result.inventory[0]).toMatchObject({
      provider: "pi",
      kind: "session_jsonl",
      discovered: true,
      required: true,
      optional: false,
      path: join(testDir, "agent", "sessions"),
    });
  });

  it("marks missing pi stores as undiscovered without failing", async () => {
    const testDir = join(testDirBase, "pi-empty");
    await mkdir(testDir, { recursive: true });

    const result = await discoverArtifacts(testDir, { provider: "pi" });

    expect(result.sessionFiles).toHaveLength(0);
    expect(result.inventory).toHaveLength(1);
    expect(result.inventory[0]).toMatchObject({
      provider: "pi",
      discovered: false,
      required: true,
      optional: false,
      path: join(testDir, "agent", "sessions"),
    });
  });

  it("marks missing Claude stores as undiscovered without failing", async () => {
    const testDir = join(testDirBase, "claude-empty");
    await mkdir(testDir, { recursive: true });

    const result = await discoverArtifacts(testDir, { provider: "claude" });

    expect(result.sessionFiles).toHaveLength(0);
    expect(result.inventory).toHaveLength(4);
    for (const record of result.inventory) {
      expect(record.provider).toBe("claude");
      expect(record.discovered).toBe(false);
    }
  });

  it("treats an empty Claude projects directory as missing canonical transcript input", async () => {
    const testDir = join(testDirBase, "claude-empty-projects-dir");
    await mkdir(join(testDir, "projects"), { recursive: true });
    await mkdir(join(testDir, "shell-snapshots"), { recursive: true });

    const result = await discoverArtifacts(testDir, { provider: "claude" });

    expect(result.sessionFiles).toEqual([]);
    expect(
      result.inventory.find((record) => record.kind === "session_jsonl"),
    ).toMatchObject({
      provider: "claude",
      discovered: false,
      required: true,
      optional: false,
      path: join(testDir, "projects"),
    });
    expect(
      result.inventory.find((record) => record.kind === "shell_snapshot"),
    ).toMatchObject({
      provider: "claude",
      discovered: true,
      optional: true,
      path: join(testDir, "shell-snapshots"),
    });
  });
});
