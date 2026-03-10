/**
 * Purpose: Discovers canonical transcript files and optional local enrichment stores under a supported agent home directory.
 * Responsibilities: Source-aware inventory building for Codex and Claude Code transcript stores.
 * Scope: Called by CLI commands before parsing or evaluation begins.
 * Usage: `discoverArtifacts(homePath, { provider })` to inventory one source home.
 * Invariants/Assumptions: Transcript JSONL remains the only required canonical input for each provider.
 */
import { join } from "node:path";
import { ValidationError } from "./errors.js";
import {
  type ListOptions,
  listFilesRecursively,
  pathExists,
} from "./filesystem.js";
import type { InventoryRecord, SourceProvider } from "./schema.js";
import { detectSourceProviderFromPath } from "./sources.js";
import { createTimeoutPromise, throwIfAborted } from "./utils/abort.js";

/**
 * Result of discovering source artifacts in a home directory.
 */
export interface DiscoveredArtifacts {
  /** Source provider that was scanned */
  provider: SourceProvider;
  /** Path to the source home directory that was scanned */
  homePath: string;
  /** Inventory records for all expected and discovered artifact types */
  inventory: InventoryRecord[];
  /** Full paths to all discovered session JSONL files */
  sessionFiles: string[];
}

function buildInventoryRecord(
  provider: SourceProvider,
  kind: InventoryRecord["kind"],
  path: string,
  discovered: boolean,
  required: boolean,
): InventoryRecord {
  return {
    provider,
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
  /** Explicit source provider for the selected home path. */
  provider: SourceProvider;
  /** Maximum time for discovery (milliseconds). Default: 60000 (60 seconds) */
  timeoutMs?: number | undefined;
  /** Signal to abort the operation */
  signal?: AbortSignal | undefined;
}

/**
 * Discovers canonical transcript files and optional local enrichment stores
 * under a supported agent home directory.
 *
 * This function scans for:
 * - Required: Session JSONL files (sessions directory)
 * - Optional: SQLite state database, history JSONL, TUI logs, shell snapshots
 *
 * Supports timeout and cancellation via AbortSignal.
 *
 * @param homePath - Path to the source home directory (typically ~/.codex or ~/.claude)
 * @param options - Optional configuration for timeout and abort signal
 * @returns Promise resolving to discovered artifacts including session files and inventory
 * @throws {FileNotFoundError} If required paths cannot be accessed
 * @throws {PermissionDeniedError} If directory access is denied
 * @throws {DOMException} with name "AbortError" if signal is aborted
 * @throws {DOMException} with name "TimeoutError" if timeout is exceeded
 *
 * @example
 * ```typescript
 * const discovered = await discoverArtifacts("~/.claude", { provider: "claude" });
 * console.log(`Found ${discovered.sessionFiles.length} sessions`);
 * for (const item of discovered.inventory) {
 *   console.log(`${item.kind}: ${item.discovered ? "present" : "missing"}`);
 * }
 * ```
 */
export async function discoverArtifacts(
  homePath: string,
  options?: DiscoveryOptions,
): Promise<DiscoveredArtifacts> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_DISCOVERY_TIMEOUT_MS;

  // Race between actual work and timeout
  const discoveryPromise = doDiscoverArtifacts(homePath, options);
  const timeoutPromise = createTimeoutPromise(
    timeoutMs,
    `Discovery timeout for ${homePath}`,
  );

  return Promise.race([discoveryPromise, timeoutPromise]);
}

/**
 * Internal implementation of artifact discovery.
 */
async function doDiscoverArtifacts(
  homePath: string,
  options?: DiscoveryOptions,
): Promise<DiscoveredArtifacts> {
  const provider = options?.provider ?? detectSourceProviderFromPath(homePath);
  if (!provider) {
    throw new ValidationError(
      `Unable to determine transcript source for ${homePath}. Pass an explicit provider.`,
    );
  }
  const sessionsPath =
    provider === "claude"
      ? join(homePath, "projects")
      : join(homePath, "sessions");
  const stateSqlitePath = join(homePath, "state_5.sqlite");
  const historyPath = join(homePath, "history.jsonl");
  const tuiLogPath = join(homePath, "log", "codex-tui.log");
  const codexDevDbPath = join(homePath, "sqlite", "codex-dev.db");
  const shellSnapshotsPath =
    provider === "claude"
      ? join(homePath, "shell-snapshots")
      : join(homePath, "shell_snapshots");
  const sessionEnvPath = join(homePath, "session-env");

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
      provider,
      "session_jsonl",
      sessionsPath,
      sessionsPathExists,
      true,
    ),
    ...(provider === "codex"
      ? [
          buildInventoryRecord(
            provider,
            "state_sqlite",
            stateSqlitePath,
            await pathExists(stateSqlitePath),
            false,
          ),
        ]
      : []),
    buildInventoryRecord(
      provider,
      "history_jsonl",
      historyPath,
      await pathExists(historyPath),
      false,
    ),
    buildInventoryRecord(
      provider,
      "shell_snapshot",
      shellSnapshotsPath,
      await pathExists(shellSnapshotsPath),
      false,
    ),
    ...(provider === "codex"
      ? [
          buildInventoryRecord(
            provider,
            "tui_log",
            tuiLogPath,
            await pathExists(tuiLogPath),
            false,
          ),
          buildInventoryRecord(
            provider,
            "codex_dev_db",
            codexDevDbPath,
            await pathExists(codexDevDbPath),
            false,
          ),
        ]
      : [
          buildInventoryRecord(
            provider,
            "session_env",
            sessionEnvPath,
            await pathExists(sessionEnvPath),
            false,
          ),
        ]),
  ];

  return {
    provider,
    homePath,
    inventory,
    sessionFiles,
  };
}
