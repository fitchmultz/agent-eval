/**
 * Purpose: Extract normalized command text from raw tool argument payloads.
 * Responsibilities: Parse common `cmd` and `command` argument shapes shared across transcript parsing and tool classification.
 * Scope: Shared utility for command-aware scoring, verification detection, and reporting.
 * Usage: Import `extractCommandTextFromArgumentsText()` when raw tool argument JSON needs a stable command string.
 * Invariants/Assumptions: Invalid JSON falls back to the raw payload text instead of throwing so transcript processing stays resilient.
 */

import { isRecord } from "./utils/type-guards.js";

/**
 * Extracts command text from a serialized tool argument payload.
 *
 * Supports common shapes such as `{ "cmd": "pnpm test" }` and
 * `{ "command": ["git", "status"] }`.
 */
export function extractCommandTextFromArgumentsText(
  payloadText?: string,
): string | undefined {
  if (!payloadText) {
    return undefined;
  }

  try {
    const parsedUnknown: unknown = JSON.parse(payloadText);
    if (
      typeof parsedUnknown !== "object" ||
      parsedUnknown === null ||
      Array.isArray(parsedUnknown)
    ) {
      return payloadText;
    }

    if (!isRecord(parsedUnknown)) {
      return payloadText;
    }

    // biome-ignore lint/complexity/useLiteralKeys: Record access must preserve index-signature compatibility under noPropertyAccessFromIndexSignature.
    const cmd = parsedUnknown["cmd"];
    // biome-ignore lint/complexity/useLiteralKeys: Record access must preserve index-signature compatibility under noPropertyAccessFromIndexSignature.
    const command = parsedUnknown["command"];

    if (typeof cmd === "string") {
      return cmd;
    }

    if (Array.isArray(command)) {
      const commandParts = command.filter(
        (item): item is string => typeof item === "string",
      );
      return commandParts.length > 0 ? commandParts.join(" ") : payloadText;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    // biome-ignore lint/complexity/useLiteralKeys: Environment access uses index signatures in Node typings.
    if (process.env["DEBUG"]) {
      process.stderr.write(
        `[tool-command-text] JSON parse error: ${errorMessage}\n`,
      );
    }
    return payloadText;
  }

  return undefined;
}
