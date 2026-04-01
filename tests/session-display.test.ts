/**
 * Purpose: Verifies operator-facing session display helpers produce humane, source-aware labels.
 * Entrypoint: Executed by Vitest via `pnpm test`.
 * Notes: Covers project label fallback behavior, pi project derivation, and preview provenance selection.
 */
import { describe, expect, it } from "vitest";
import type { RawTurnRecord, SourceRef } from "../src/schema.js";
import {
  collectSessionContexts,
  deriveSessionProjectLabel,
} from "../src/summary/session-display.js";

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

function createTurn(overrides: Partial<RawTurnRecord> = {}): RawTurnRecord {
  return {
    engineVersion: "0.1.0",
    schemaVersion: "2",
    sessionId: "session-1",
    turnId: "turn-1",
    turnIndex: 0,
    startedAt: "2026-03-06T19:00:00.000Z",
    cwd: "/workspace/agent-eval",
    userMessageCount: 1,
    assistantMessageCount: 1,
    userMessagePreviews: [],
    assistantMessagePreviews: [],
    toolCalls: [],
    labels: [],
    sourceRefs: [
      {
        provider: "codex",
        kind: "session_jsonl",
        path: "~/.codex/sessions/2026/03/06/session-1.jsonl",
        line: 1,
      },
    ],
    ...overrides,
  };
}

describe("collectSessionContexts", () => {
  it("prefers user problem statements over assistant or code-like previews", () => {
    const contexts = collectSessionContexts([
      createTurn({
        userMessagePreviews: [
          "Please fix login and rerun the tests before finishing.",
        ],
        assistantMessagePreviews: [
          "I might inspect a few files first.",
          "const failingRoutes = routes.filter((route) => route.secure);",
        ],
      }),
    ]);

    const context = contexts.get("session-1");
    expect(context?.leadPreview).toBe(
      "Please fix login and rerun the tests before finishing.",
    );
    expect(context?.leadPreviewSource).toBe("user");
    expect(context?.evidencePreviews[0]).toBe(
      "Please fix login and rerun the tests before finishing.",
    );
  });

  it("falls back to assistant text when no user preview is available", () => {
    const contexts = collectSessionContexts([
      createTurn({
        userMessagePreviews: [],
        assistantMessagePreviews: [
          "I confirmed the issue is in the login callback and will verify the patch.",
        ],
      }),
    ]);

    const context = contexts.get("session-1");
    expect(context?.leadPreviewSource).toBe("assistant");
    expect(context?.leadPreview).toContain("login callback");
  });

  it("falls back to metadata when only instruction-heavy previews are available", () => {
    const contexts = collectSessionContexts([
      createTurn({
        userMessagePreviews: [
          "**Default assumption: Codex is already very smart.** Only add context Codex doesn't already have.",
          "When done, report: 1. All issues found 2. Exact fixes made 3. Remaining risks.",
        ],
        assistantMessagePreviews: [],
      }),
    ]);

    const context = contexts.get("session-1");
    expect(context?.leadPreview).toBeUndefined();
    expect(context?.evidencePreviews.length).toBeGreaterThan(0);
  });
});
