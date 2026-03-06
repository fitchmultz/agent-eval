/**
 * Purpose: Discovers canonical transcript files and optional local enrichment stores under a Codex home directory.
 * Entrypoint: `discoverArtifacts()` is called by CLI commands before parsing or evaluation begins.
 * Notes: Transcript JSONL is the only required input for v1; everything else is inventory metadata.
 */
import { join } from "node:path";
import { listFilesRecursively, pathExists } from "./filesystem.js";
import type { InventoryRecord } from "./schema.js";

export interface DiscoveredArtifacts {
  codexHome: string;
  inventory: InventoryRecord[];
  sessionFiles: string[];
}

function buildInventoryRecord(
  kind: InventoryRecord["kind"],
  path: string,
  discovered: boolean,
  required: boolean,
): InventoryRecord {
  return {
    kind,
    path,
    discovered,
    required,
    optional: !required,
  };
}

export async function discoverArtifacts(
  codexHome: string,
): Promise<DiscoveredArtifacts> {
  const sessionsPath = join(codexHome, "sessions");
  const stateSqlitePath = join(codexHome, "state_5.sqlite");
  const historyPath = join(codexHome, "history.jsonl");
  const tuiLogPath = join(codexHome, "log", "codex-tui.log");
  const codexDevDbPath = join(codexHome, "sqlite", "codex-dev.db");
  const shellSnapshotsPath = join(codexHome, "shell_snapshots");

  const sessionsPathExists = await pathExists(sessionsPath);
  const sessionFiles = sessionsPathExists
    ? (await listFilesRecursively(sessionsPath)).filter((path) =>
        path.endsWith(".jsonl"),
      )
    : [];

  const inventory: InventoryRecord[] = [
    buildInventoryRecord(
      "session_jsonl",
      sessionsPath,
      sessionsPathExists,
      true,
    ),
    buildInventoryRecord(
      "state_sqlite",
      stateSqlitePath,
      await pathExists(stateSqlitePath),
      false,
    ),
    buildInventoryRecord(
      "history_jsonl",
      historyPath,
      await pathExists(historyPath),
      false,
    ),
    buildInventoryRecord(
      "tui_log",
      tuiLogPath,
      await pathExists(tuiLogPath),
      false,
    ),
    buildInventoryRecord(
      "codex_dev_db",
      codexDevDbPath,
      await pathExists(codexDevDbPath),
      false,
    ),
    buildInventoryRecord(
      "shell_snapshot",
      shellSnapshotsPath,
      await pathExists(shellSnapshotsPath),
      false,
    ),
  ];

  return {
    codexHome,
    inventory,
    sessionFiles,
  };
}
