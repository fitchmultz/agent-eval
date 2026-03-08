/**
 * Purpose: Provides small filesystem helpers for artifact discovery and output writing.
 * Entrypoint: Imported by discovery and evaluator modules.
 * Notes: Uses async Node filesystem APIs and keeps traversal order stable for deterministic outputs.
 */
import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import {
  isEnoentError,
  isPermissionError,
  PermissionDeniedError,
} from "./errors.js";

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
 * Lists all files recursively under a root directory.
 *
 * Returns files in a stable, sorted order for deterministic outputs.
 * Directories are traversed depth-first in alphabetical order.
 *
 * @param root - The root directory to scan
 * @returns Promise resolving to an array of absolute file paths
 * @throws {FileNotFoundError} If the root directory does not exist
 * @throws {PermissionDeniedError} If directory access is denied
 *
 * @example
 * ```typescript
 * const files = await listFilesRecursively("~/.codex/sessions");
 * const jsonlFiles = files.filter(f => f.endsWith(".jsonl"));
 * ```
 */
export async function listFilesRecursively(root: string): Promise<string[]> {
  const results: string[] = [];
  const entries = await readdir(root, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of entries) {
    const entryPath = join(root, entry.name);
    if (entry.isDirectory()) {
      const nested = await listFilesRecursively(entryPath);
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
