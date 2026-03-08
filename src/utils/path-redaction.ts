/**
 * Purpose: Path redaction utilities for sanitizing file paths.
 * Entrypoint: `redactPath()` for redacting home directory in paths.
 */

import { getHomeDirectory } from "./environment.js";

export function redactPath(path: string, homeDirectory?: string): string {
  const home = homeDirectory ?? getHomeDirectory();
  if (!home || home.length === 0) return path;
  return path.split(home).join("~");
}
