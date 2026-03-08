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

export async function ensureParentDirectory(path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
}

export async function writeJsonLinesFile(
  path: string,
  records: readonly unknown[],
): Promise<void> {
  await ensureParentDirectory(path);
  const content = records.map((record) => JSON.stringify(record)).join("\n");
  await writeFile(path, content.length > 0 ? `${content}\n` : "", "utf8");
}

export async function writeTextFile(
  path: string,
  content: string,
): Promise<void> {
  await ensureParentDirectory(path);
  await writeFile(path, content, "utf8");
}
