/**
 * Purpose: Verifies operator-facing session display helpers produce humane, source-aware labels.
 * Entrypoint: Executed by Vitest via `pnpm test`.
 * Notes: Covers project label fallback behavior for noisy temp paths and pi session source paths.
 */
import { describe, expect, it } from "vitest";
import type { SourceRef } from "../src/schema.js";
import { deriveSessionProjectLabel } from "../src/summary/session-display.js";

describe("deriveSessionProjectLabel", () => {
  it("falls back to project unknown for generic temp working directories", () => {
    const sourceRefs: SourceRef[] = [
      {
        provider: "claude",
        kind: "session_jsonl",
        path: "~/.claude/projects/-private-var-folders-rf-t1b4c-cn7sgc-f6tkyg0wsk00000gn-T/25751d6d.jsonl",
        line: 1,
      },
    ];

    expect(
      deriveSessionProjectLabel("/private/var/folders/rf/t1b4c/T", sourceRefs),
    ).toBe("project unknown");
  });

  it("derives a pi project name from the encoded source path when cwd is absent", () => {
    const sourceRefs: SourceRef[] = [
      {
        provider: "pi",
        kind: "session_jsonl",
        path: "~/.pi/agent/sessions/--Users-mitchfultz-Projects-AI-agent-eval--/2026-04-01T13-20-09-770Z_da2795a9-4b2a-44d8-a617-5400603bb00e.jsonl",
        line: 1,
      },
    ];

    expect(deriveSessionProjectLabel(undefined, sourceRefs)).toBe(
      "AI-agent-eval",
    );
  });
});
