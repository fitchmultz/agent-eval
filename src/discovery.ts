/**
 * Purpose: Discovers canonical transcript files and optional local enrichment stores under a Codex home directory.
 * Entrypoint: `discoverArtifacts()` is called by CLI commands before parsing or evaluation begins.
 * Notes: Transcript JSONL is the only required input for v1; everything else is inventory metadata.
 */
import { join } from "node:path";
import { listFilesRecursively, pathExists } from "./filesystem.js";
import type { InventoryRecord } from "./schema.js";

/**
 * Result of discovering Codex artifacts in a home directory.
 */
export interface DiscoveredArtifacts {
  /** Path to the Codex home directory that was scanned */
  codexHome: string;
  /** Inventory records for all expected and discovered artifact types */
  inventory: InventoryRecord[];
  /** Full paths to all discovered session JSONL files */
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

/**
 * Discovers canonical transcript files and optional local enrichment stores
 * under a Codex home directory.
 *
 * This function scans for:
 * - Required: Session JSONL files (sessions directory)
 * - Optional: SQLite state database, history JSONL, TUI logs, shell snapshots
 *
 * @param codexHome - Path to the Codex home directory (typically ~/.codex)
 * @returns Promise resolving to discovered artifacts including session files and inventory
 * @throws {FileNotFoundError} If required paths cannot be accessed
 * @throws {PermissionDeniedError} If directory access is denied
 *
 * @example
 * ```typescript
 * const discovered = await discoverArtifacts("~/.codex");
 * console.log(`Found ${discovered.sessionFiles.length} sessions`);
 * for (const item of discovered.inventory) {
 *   console.log(`${item.kind}: ${item.discovered ? "present" : "missing"}`);
 * }
 * ```
 */
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
