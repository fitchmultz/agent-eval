/**
 * Purpose: Provides small filesystem helpers for artifact discovery and output writing.
 * Entrypoint: Imported by discovery and evaluator modules.
 * Notes: Uses async Node filesystem APIs and keeps traversal order stable for deterministic outputs.
 *        Supports depth limits, cycle detection, and timeouts for recursive operations.
 */
import { mkdir, readdir, realpath, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import {
  isEnoentError,
  isPermissionError,
  PermissionDeniedError,
} from "./errors.js";
import { createTimeoutPromise, throwIfAborted } from "./utils/abort.js";

/**
 * Checks if a path exists.
 * Returns false for non-existent paths.
 * Re-throws permission errors and other non-ENOENT errors.
 */
/**
 * Checks if a path exists.
 *
 * Returns false for non-existent paths. Re-throws permission errors
 * and other non-ENOENT errors.
 *
 * @param path - The path to check
 * @returns Promise resolving to true if the path exists, false otherwise
 * @throws {PermissionDeniedError} If access is denied to an existing path
 *
 * @example
 * ```typescript
 * if (await pathExists("~/.codex")) {
 *   console.log("Codex home exists");
 * }
 * ```
 */
export async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (isEnoentError(error)) {
      return false;
    }
    if (isPermissionError(error)) {
      throw new PermissionDeniedError(path);
    }
    // Re-throw other unexpected errors
    throw error;
  }
}

/**
 * Options for recursive file listing operations.
 */
export interface ListOptions {
  /** Maximum directory depth to traverse. Default: 50 */
  maxDepth?: number | undefined;
  /** Maximum time for operation (milliseconds). Default: 60000 (60 seconds) */
  timeoutMs?: number | undefined;
  /** Signal to abort the operation */
  signal?: AbortSignal | undefined;
}

/**
 * Default maximum depth for recursive file listing.
 */
const DEFAULT_MAX_DEPTH = 50;

/**
 * Default timeout for recursive file listing (60 seconds).
 */
const DEFAULT_LIST_TIMEOUT_MS = 60000;

/**
 * Lists all files recursively under a root directory.
 *
 * Returns files in a stable, sorted order for deterministic outputs.
 * Directories are traversed depth-first in alphabetical order.
 * Supports depth limits, cycle detection, and cancellation via AbortSignal.
 *
 * @param root - The root directory to scan
 * @param options - Optional configuration for depth limit, timeout, and abort signal
 * @returns Promise resolving to an array of absolute file paths
 * @throws {FileNotFoundError} If the root directory does not exist
 * @throws {PermissionDeniedError} If directory access is denied
 * @throws {DOMException} with name "AbortError" if signal is aborted
 * @throws {DOMException} with name "TimeoutError" if timeout is exceeded
 *
 * @example
 * ```typescript
 * const files = await listFilesRecursively("~/.codex/sessions", { maxDepth: 10 });
 * const jsonlFiles = files.filter(f => f.endsWith(".jsonl"));
 * ```
 */
export async function listFilesRecursively(
  root: string,
  options?: ListOptions,
): Promise<string[]> {
  const maxDepth = options?.maxDepth ?? DEFAULT_MAX_DEPTH;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_LIST_TIMEOUT_MS;

  // Race between the actual work and timeout
  const listPromise = doListFilesRecursively(
    root,
    maxDepth,
    new Set<string>(),
    options?.signal,
  );

  const timeoutPromise = createTimeoutPromise(
    timeoutMs,
    `File listing timeout for ${root}`,
  );

  return Promise.race([listPromise, timeoutPromise]);
}

/**
 * Internal implementation of recursive file listing with depth tracking and cycle detection.
 */
async function doListFilesRecursively(
  root: string,
  remainingDepth: number,
  visited: Set<string>,
  signal?: AbortSignal,
): Promise<string[]> {
  // Check for abort signal
  throwIfAborted(signal);

  // Depth limit check
  if (remainingDepth <= 0) {
    return [];
  }

  // Cycle detection using realpath
  const realPath = await realpath(root).catch(() => root);
  if (visited.has(realPath)) {
    return []; // Skip cycles (symbolic links to already-visited directories)
  }
  visited.add(realPath);

  const results: string[] = [];
  const entries = await readdir(root, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of entries) {
    // Check for abort before processing each entry
    throwIfAborted(signal);

    const entryPath = join(root, entry.name);
    if (entry.isDirectory()) {
      const nested = await doListFilesRecursively(
        entryPath,
        remainingDepth - 1,
        visited,
        signal,
      );
      results.push(...nested);
      continue;
    }

    if (entry.isFile()) {
      results.push(entryPath);
    }
  }

  return results;
}

/**
 * Ensures the parent directory of a path exists, creating it if necessary.
 *
 * Creates all intermediate directories using recursive mkdir.
 *
 * @param path - The file path whose parent directory should exist
 * @returns Promise that resolves when the directory exists
 * @throws {PermissionDeniedError} If directory creation fails due to permissions
 *
 * @example
 * ```typescript
 * await ensureParentDirectory("./artifacts/report.md");
 * // Now ./artifacts/ is guaranteed to exist
 * ```
 */
export async function ensureParentDirectory(path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
}

/**
 * Writes records to a JSON Lines (JSONL) file.
 *
 * Each record is serialized as a single line of JSON. Records are
 * separated by newlines. The parent directory is created if it doesn't exist.
 *
 * @param path - The file path to write to
 * @param records - Array of records to serialize (objects, arrays, primitives)
 * @returns Promise that resolves when the file is written
 * @throws {PermissionDeniedError} If file writing fails due to permissions
 *
 * @example
 * ```typescript
 * const incidents = [{ id: "1", severity: "high" }];
 * await writeJsonLinesFile("./artifacts/incidents.jsonl", incidents);
 * ```
 */
export async function writeJsonLinesFile(
  path: string,
  records: readonly unknown[],
): Promise<void> {
  await ensureParentDirectory(path);
  const content = records.map((record) => JSON.stringify(record)).join("\n");
  await writeFile(path, content.length > 0 ? `${content}\n` : "", "utf8");
}

/**
 * Writes text content to a file.
 *
 * The parent directory is created if it doesn't exist.
 *
 * @param path - The file path to write to
 * @param content - The text content to write
 * @returns Promise that resolves when the file is written
 * @throws {PermissionDeniedError} If file writing fails due to permissions
 *
 * @example
 * ```typescript
 * await writeTextFile("./artifacts/report.md", "# Report\n\nContent here");
 * ```
 */
export async function writeTextFile(
  path: string,
  content: string,
): Promise<void> {
  await ensureParentDirectory(path);
  await writeFile(path, content, "utf8");
}

/**
 * Writes binary content to a file.
 *
 * The parent directory is created if it doesn't exist.
 *
 * @param path - The file path to write to
 * @param content - The binary content to write
 * @returns Promise that resolves when the file is written
 */
export async function writeBinaryFile(
  path: string,
  content: Uint8Array,
): Promise<void> {
  await ensureParentDirectory(path);
  await writeFile(path, content);
}
