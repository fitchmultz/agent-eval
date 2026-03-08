/**
 * Purpose: Discovers canonical transcript files and optional local enrichment stores under a Codex home directory.
 * Entrypoint: `discoverArtifacts()` is called by CLI commands before parsing or evaluation begins.
 * Notes: Transcript JSONL is the only required input for v1; everything else is inventory metadata.
 *        Supports timeout and cancellation via AbortSignal.
 */
import { join } from "node:path";
import {
  type ListOptions,
  listFilesRecursively,
  pathExists,
} from "./filesystem.js";
import type { InventoryRecord } from "./schema.js";
import { createTimeoutPromise, throwIfAborted } from "./utils/abort.js";

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
 * Default timeout for discovery operations (60 seconds).
 */
const DEFAULT_DISCOVERY_TIMEOUT_MS = 60000;

/**
 * Options for artifact discovery operations.
 */
export interface DiscoveryOptions extends ListOptions {
  /** Maximum time for discovery (milliseconds). Default: 60000 (60 seconds) */
  timeoutMs?: number | undefined;
  /** Signal to abort the operation */
  signal?: AbortSignal | undefined;
}

/**
 * Discovers canonical transcript files and optional local enrichment stores
 * under a Codex home directory.
 *
 * This function scans for:
 * - Required: Session JSONL files (sessions directory)
 * - Optional: SQLite state database, history JSONL, TUI logs, shell snapshots
 *
 * Supports timeout and cancellation via AbortSignal.
 *
 * @param codexHome - Path to the Codex home directory (typically ~/.codex)
 * @param options - Optional configuration for timeout and abort signal
 * @returns Promise resolving to discovered artifacts including session files and inventory
 * @throws {FileNotFoundError} If required paths cannot be accessed
 * @throws {PermissionDeniedError} If directory access is denied
 * @throws {DOMException} with name "AbortError" if signal is aborted
 * @throws {DOMException} with name "TimeoutError" if timeout is exceeded
 *
 * @example
 * ```typescript
 * const discovered = await discoverArtifacts("~/.codex", { timeoutMs: 30000 });
 * console.log(`Found ${discovered.sessionFiles.length} sessions`);
 * for (const item of discovered.inventory) {
 *   console.log(`${item.kind}: ${item.discovered ? "present" : "missing"}`);
 * }
 * ```
 */
export async function discoverArtifacts(
  codexHome: string,
  options?: DiscoveryOptions,
): Promise<DiscoveredArtifacts> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_DISCOVERY_TIMEOUT_MS;

  // Race between actual work and timeout
  const discoveryPromise = doDiscoverArtifacts(codexHome, options);
  const timeoutPromise = createTimeoutPromise(
    timeoutMs,
    `Discovery timeout for ${codexHome}`,
  );

  return Promise.race([discoveryPromise, timeoutPromise]);
}

/**
 * Internal implementation of artifact discovery.
 */
async function doDiscoverArtifacts(
  codexHome: string,
  options?: DiscoveryOptions,
): Promise<DiscoveredArtifacts> {
  const sessionsPath = join(codexHome, "sessions");
  const stateSqlitePath = join(codexHome, "state_5.sqlite");
  const historyPath = join(codexHome, "history.jsonl");
  const tuiLogPath = join(codexHome, "log", "codex-tui.log");
  const codexDevDbPath = join(codexHome, "sqlite", "codex-dev.db");
  const shellSnapshotsPath = join(codexHome, "shell_snapshots");

  // Check for abort
  throwIfAborted(options?.signal);

  const sessionsPathExists = await pathExists(sessionsPath);

  // Check for abort before expensive listing operation
  throwIfAborted(options?.signal);

  const sessionFiles = sessionsPathExists
    ? (
        await listFilesRecursively(sessionsPath, {
          maxDepth: options?.maxDepth,
          timeoutMs: options?.timeoutMs,
          signal: options?.signal,
        })
      ).filter((path) => path.endsWith(".jsonl"))
    : [];

  // Check for abort before building inventory
  throwIfAborted(options?.signal);

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
