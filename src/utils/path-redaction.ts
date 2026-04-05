/**
 * Purpose: Path redaction utilities for sanitizing file paths and path-like transcript references.
 * Entrypoint: `redactPath()` for redacting home-directory and provider-encoded user/project path fragments.
 * Scope: Shared by transcript processing, metrics aggregation, and preview sanitization.
 * Usage: Call `redactPath(path, homeDirectory)` before persisting public-safe paths.
 * Invariants/Assumptions: Public artifacts should not expose literal home directories or provider-encoded `Users-...` session roots.
 */

import { getHomeDirectory } from "./environment.js";

const ENCODED_USER_PATH_SEGMENT_PATTERNS = [
  /(^|\/)--Users-[^/]+--(?=\/|$)/g,
  /(^|\/)--home-[^/]+--(?=\/|$)/gi,
  /(^|\/)-Users-[^/]+(?=\/|$)/g,
  /(^|\/)Users-[^/]+(?=\/|$)/g,
  /(^|\/)-private-var-folders-[^/]+(?=\/|$)/g,
] as const;

function redactEncodedUserSegments(input: string): string {
  return ENCODED_USER_PATH_SEGMENT_PATTERNS.reduce(
    (redacted, pattern) =>
      redacted.replace(pattern, (match, prefix: string) => {
        const wrapped = match.startsWith("--") && match.endsWith("--");
        return `${prefix}${wrapped ? "--redacted-session-root--" : "redacted-session-root"}`;
      }),
    input,
  );
}

export function redactPath(path: string, homeDirectory?: string): string {
  const home = homeDirectory ?? getHomeDirectory();
  const homeRedacted =
    home && home.length > 0 ? path.split(home).join("~") : path;
  const tempRootRedacted = homeRedacted.replace(
    /\/private\/var\/folders\/[^/]+\/[^/]+\/[^/]+/g,
    "redacted-session-root",
  );
  return redactEncodedUserSegments(tempRootRedacted);
}
