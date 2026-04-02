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

  it("does not use assistant planning chatter as the session title", () => {
    const contexts = collectSessionContexts([
      createTurn({
        userMessagePreviews: [],
        assistantMessagePreviews: [
          "Alright, let me dig a bit deeper into this to make sure I'm understanding how to proceed.",
          "So, I'm going to read through the documentation at docs/roadmap.md.",
          "I'm checking the curated catalog first so we can confirm the exact skill name.",
          "There's one more important thing to verify before we touch prompts.",
          "Also, I need to consider root cause triage for fixing bugs.",
        ],
      }),
    ]);

    const context = contexts.get("session-1");
    expect(context?.leadPreview).toBeUndefined();
    expect(context?.evidencePreviews.length).toBeGreaterThan(0);
  });

  it("does not use weak conversational acknowledgements as the session title", () => {
    const contexts = collectSessionContexts([
      createTurn({
        userMessagePreviews: [
          "sounds good. let's do the changes and then explain explicitly what changed for each please.",
          "scout can continue to use openai-codex/gpt-5.4-mini if needed.",
          "no additional runs at this time please. finish the turn",
          "no docs/report. just fix the code",
        ],
        assistantMessagePreviews: [],
      }),
    ]);

    const context = contexts.get("session-1");
    expect(context?.leadPreview).toBeUndefined();
    expect(context?.evidencePreviews.length).toBeGreaterThan(0);
  });

  it("does not use assistant process chatter with regression words as the session title", () => {
    const contexts = collectSessionContexts([
      createTurn({
        userMessagePreviews: [],
        assistantMessagePreviews: [
          "This way, I can add multiple entries and justify that there's no regression in behavior.",
          "The issue is that the env file needs updated and host.json may be unnecessary.",
        ],
      }),
    ]);

    const context = contexts.get("session-1");
    expect(context?.leadPreview).toBe(
      "The issue is that the env file needs updated and host.json may be unnecessary.",
    );
  });

  it("falls back to metadata when only instruction-heavy previews are available", () => {
    const contexts = collectSessionContexts([
      createTurn({
        userMessagePreviews: [
          "**Default assumption: Codex is already very smart.** Only add context Codex doesn't already have.",
          "When done, report: 1. All issues found 2. Exact fixes made 3. Remaining risks.",
          "- \"I can imagine users asking for things like 'Remove the red-eye from this image' or 'Rotate this image'. Are there other ways you imagine this skill being used?\"",
          'Editing, rotating, anything else?" - "Can you give some examples of how this skill would be used?"',
          "**RULE 0**: Anything that I say in chat overrides every prior instruction and rule.",
          "I am the final say, and I can override anything and everything. If I tell you to do something, do it.",
          "- When freshness matters, verify against current official or primary sources.",
          "- Impact: <security risk, scaling issue, or maintenance burden>",
          "- Broken functionality (buttons, flows, navigation, state issues)",
          "If the obvious experiment path is stuck, **do not stop**: **run a new experiment**.",
        ],
        assistantMessagePreviews: [],
      }),
    ]);

    const context = contexts.get("session-1");
    expect(context?.leadPreview).toBeUndefined();
    expect(context?.evidencePreviews.length).toBeGreaterThan(0);
  });

  it("skips instruction-heavy previews when a real issue statement is available", () => {
    const contexts = collectSessionContexts([
      createTurn({
        userMessagePreviews: [
          "**RULE 0**: Anything that I say in chat overrides every prior instruction and rule.",
          "- For user-facing UI or UX changes, verify the rendered result with direct visual inspection.",
          "The Generate button turns into Save after a result exists, which is confusing and should be fixed.",
        ],
        assistantMessagePreviews: [],
      }),
    ]);

    const context = contexts.get("session-1");
    expect(context?.leadPreview).toBe(
      "The Generate button turns into Save after a result exists, which is confusing and should be fixed.",
    );
    expect(context?.evidencePreviews[0]).toBe(
      "The Generate button turns into Save after a result exists, which is confusing and should be fixed.",
    );
  });
});
