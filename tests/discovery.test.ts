/**
 * Purpose: Tests artifact discovery and inventory building.
 * Entrypoint: Executed by Vitest via `pnpm test`.
 * Notes: Uses temporary directories to simulate Codex home structures.
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

  it("discovers session JSONL files", async () => {
    const testDir = join(testDirBase, "basic");
    const sessionsDir = join(testDir, "sessions");
    await mkdir(sessionsDir, { recursive: true });
    await writeFile(join(sessionsDir, "test.jsonl"), "{}\n");

    const result = await discoverArtifacts(testDir);

    expect(result.sessionFiles).toHaveLength(1);
    expect(result.sessionFiles[0]).toMatch(/test\.jsonl$/);
    expect(result.codexHome).toBe(testDir);
  });

  it("discovers multiple session files", async () => {
    const testDir = join(testDirBase, "multi");
    const sessionsDir = join(testDir, "sessions");
    await mkdir(sessionsDir, { recursive: true });
    await writeFile(join(sessionsDir, "session1.jsonl"), "{}\n");
    await writeFile(join(sessionsDir, "session2.jsonl"), "{}\n");
    await writeFile(join(sessionsDir, "session3.jsonl"), "{}\n");

    const result = await discoverArtifacts(testDir);

    expect(result.sessionFiles).toHaveLength(3);
  });

  it("discovers session files in nested directories", async () => {
    const testDir = join(testDirBase, "nested");
    const nestedDir = join(testDir, "sessions", "2026", "03");
    await mkdir(nestedDir, { recursive: true });
    await writeFile(join(nestedDir, "deep-session.jsonl"), "{}\n");

    const result = await discoverArtifacts(testDir);

    expect(result.sessionFiles).toHaveLength(1);
    expect(result.sessionFiles[0]).toMatch(/deep-session\.jsonl$/);
  });

  it("ignores non-JSONL files in sessions directory", async () => {
    const testDir = join(testDirBase, "mixed");
    const sessionsDir = join(testDir, "sessions");
    await mkdir(sessionsDir, { recursive: true });
    await writeFile(join(sessionsDir, "valid.jsonl"), "{}\n");
    await writeFile(join(sessionsDir, "ignored.txt"), "text");
    await writeFile(join(sessionsDir, "ignored.json"), "{}");

    const result = await discoverArtifacts(testDir);

    expect(result.sessionFiles).toHaveLength(1);
    expect(result.sessionFiles[0]).toMatch(/valid\.jsonl$/);
  });

  it("builds inventory with correct discovered status for sessions", async () => {
    const testDir = join(testDirBase, "inventory-sessions");
    const sessionsDir = join(testDir, "sessions");
    await mkdir(sessionsDir, { recursive: true });
    await writeFile(join(sessionsDir, "test.jsonl"), "{}\n");

    const result = await discoverArtifacts(testDir);

    const sessionsRecord = result.inventory.find(
      (r) => r.kind === "session_jsonl",
    );
    expect(sessionsRecord?.discovered).toBe(true);
    expect(sessionsRecord?.required).toBe(true);
    expect(sessionsRecord?.optional).toBe(false);
  });

  it("builds inventory with missing status when sessions directory absent", async () => {
    const testDir = join(testDirBase, "no-sessions");
    await mkdir(testDir, { recursive: true });

    const result = await discoverArtifacts(testDir);

    const sessionsRecord = result.inventory.find(
      (r) => r.kind === "session_jsonl",
    );
    expect(sessionsRecord?.discovered).toBe(false);
    expect(sessionsRecord?.required).toBe(true);
    expect(result.sessionFiles).toHaveLength(0);
  });

  it("discovers state.sqlite when present", async () => {
    const testDir = join(testDirBase, "with-sqlite");
    const sessionsDir = join(testDir, "sessions");
    await mkdir(sessionsDir, { recursive: true });
    await writeFile(join(testDir, "state_5.sqlite"), "sqlite data");

    const result = await discoverArtifacts(testDir);

    const sqliteRecord = result.inventory.find(
      (r) => r.kind === "state_sqlite",
    );
    expect(sqliteRecord?.discovered).toBe(true);
    expect(sqliteRecord?.required).toBe(false);
    expect(sqliteRecord?.optional).toBe(true);
  });

  it("marks state.sqlite as missing when absent", async () => {
    const testDir = join(testDirBase, "without-sqlite");
    await mkdir(join(testDir, "sessions"), { recursive: true });

    const result = await discoverArtifacts(testDir);

    const sqliteRecord = result.inventory.find(
      (r) => r.kind === "state_sqlite",
    );
    expect(sqliteRecord?.discovered).toBe(false);
    expect(sqliteRecord?.path).toBe(join(testDir, "state_5.sqlite"));
  });

  it("discovers history.jsonl when present", async () => {
    const testDir = join(testDirBase, "with-history");
    await mkdir(join(testDir, "sessions"), { recursive: true });
    await writeFile(join(testDir, "history.jsonl"), "{}\n");

    const result = await discoverArtifacts(testDir);

    const historyRecord = result.inventory.find(
      (r) => r.kind === "history_jsonl",
    );
    expect(historyRecord?.discovered).toBe(true);
    expect(historyRecord?.required).toBe(false);
  });

  it("discovers tui log when present", async () => {
    const testDir = join(testDirBase, "with-log");
    await mkdir(join(testDir, "sessions"), { recursive: true });
    await mkdir(join(testDir, "log"), { recursive: true });
    await writeFile(join(testDir, "log", "codex-tui.log"), "log content");

    const result = await discoverArtifacts(testDir);

    const logRecord = result.inventory.find((r) => r.kind === "tui_log");
    expect(logRecord?.discovered).toBe(true);
    expect(logRecord?.path).toBe(join(testDir, "log", "codex-tui.log"));
  });

  it("discovers codex-dev.db when present", async () => {
    const testDir = join(testDirBase, "with-dev-db");
    await mkdir(join(testDir, "sessions"), { recursive: true });
    await mkdir(join(testDir, "sqlite"), { recursive: true });
    await writeFile(join(testDir, "sqlite", "codex-dev.db"), "db content");

    const result = await discoverArtifacts(testDir);

    const dbRecord = result.inventory.find((r) => r.kind === "codex_dev_db");
    expect(dbRecord?.discovered).toBe(true);
    expect(dbRecord?.path).toBe(join(testDir, "sqlite", "codex-dev.db"));
  });

  it("discovers shell_snapshots when present", async () => {
    const testDir = join(testDirBase, "with-snapshots");
    await mkdir(join(testDir, "sessions"), { recursive: true });
    await mkdir(join(testDir, "shell_snapshots"), { recursive: true });

    const result = await discoverArtifacts(testDir);

    const snapshotRecord = result.inventory.find(
      (r) => r.kind === "shell_snapshot",
    );
    expect(snapshotRecord?.discovered).toBe(true);
    expect(snapshotRecord?.path).toBe(join(testDir, "shell_snapshots"));
  });

  it("returns empty array for non-existing codex home", async () => {
    const result = await discoverArtifacts(
      "/nonexistent/path/that/does/not/exist",
    );
    expect(result.sessionFiles).toHaveLength(0);
    expect(result.inventory).toHaveLength(6);
    expect(result.codexHome).toBe("/nonexistent/path/that/does/not/exist");

    // All inventory items should be marked as not discovered
    for (const item of result.inventory) {
      expect(item.discovered).toBe(false);
    }
  });

  it("builds complete inventory with all kinds", async () => {
    const testDir = join(testDirBase, "complete");
    await mkdir(join(testDir, "sessions"), { recursive: true });
    await writeFile(join(testDir, "state_5.sqlite"), "");
    await writeFile(join(testDir, "history.jsonl"), "");
    await mkdir(join(testDir, "log"), { recursive: true });
    await writeFile(join(testDir, "log", "codex-tui.log"), "");
    await mkdir(join(testDir, "sqlite"), { recursive: true });
    await writeFile(join(testDir, "sqlite", "codex-dev.db"), "");
    await mkdir(join(testDir, "shell_snapshots"), { recursive: true });

    const result = await discoverArtifacts(testDir);

    expect(result.inventory).toHaveLength(6);

    const kinds = result.inventory.map((r) => r.kind);
    expect(kinds).toContain("session_jsonl");
    expect(kinds).toContain("state_sqlite");
    expect(kinds).toContain("history_jsonl");
    expect(kinds).toContain("tui_log");
    expect(kinds).toContain("codex_dev_db");
    expect(kinds).toContain("shell_snapshot");
  });

  it("sorts session files alphabetically", async () => {
    const testDir = join(testDirBase, "sorted");
    const sessionsDir = join(testDir, "sessions");
    await mkdir(sessionsDir, { recursive: true });
    await writeFile(join(sessionsDir, "zebra.jsonl"), "{}\n");
    await writeFile(join(sessionsDir, "alpha.jsonl"), "{}\n");
    await writeFile(join(sessionsDir, "beta.jsonl"), "{}\n");

    const result = await discoverArtifacts(testDir);

    expect(result.sessionFiles).toHaveLength(3);
    // Files should be sorted alphabetically by full path
    const names = result.sessionFiles.map((p) =>
      p.split("/").pop()?.replace(".jsonl", ""),
    );
    expect(names).toEqual(["alpha", "beta", "zebra"]);
  });
});
