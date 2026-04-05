/**
 * Purpose: Verifies operator-facing session display helpers produce humane, source-aware labels.
 * Entrypoint: Executed by Vitest via `pnpm test`.
 * Notes: Covers project label fallback behavior, safe source-ref handling, and preview provenance selection.
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

  it("does not derive a project name from encoded pi source paths when cwd is absent", () => {
    const sourceRefs: SourceRef[] = [
      {
        provider: "pi",
        kind: "session_jsonl",
        path: "~/.pi/agent/sessions/--Users-example-Projects-AI-agent-eval--/2026-04-01T13-20-09-770Z_da2795a9-4b2a-44d8-a617-5400603bb00e.jsonl",
        line: 1,
      },
    ];

    expect(deriveSessionProjectLabel(undefined, sourceRefs)).toBe(
      "project unknown",
    );
  });

  it("does not expose provider home names as project labels", () => {
    const sourceRefs: SourceRef[] = [
      {
        provider: "pi",
        kind: "session_jsonl",
        path: "~/.pi/agent/sessions/.pi/2026-04-01T13-20-09-770Z_da2795a9-4b2a-44d8-a617-5400603bb00e.jsonl",
        line: 1,
      },
    ];

    expect(deriveSessionProjectLabel(undefined, sourceRefs)).toBe(
      "project unknown",
    );
  });
});

function createTurn(overrides: Partial<RawTurnRecord> = {}): RawTurnRecord {
  return {
    engineVersion: "0.1.0",
    schemaVersion: "3",
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

  it("keeps assistant diagnostics but drops assistant worklog evidence chatter", () => {
    const contexts = collectSessionContexts([
      createTurn({
        userMessagePreviews: [],
        assistantMessagePreviews: [
          "the worker was misclassifying those refs as artifacts, then spending minutes timing out downloads in `downloading_artifacts` So `/oracle-auth` was not the issue. What I changed:",
          "I need one reload now so this thread picks up the Thinking fix. After you reload, I’ll immediately rerun the Thinking scenario and finish validation.",
        ],
      }),
    ]);

    const context = contexts.get("session-1");
    expect(context?.evidencePreviews).toEqual([
      "the worker was misclassifying those refs as artifacts, then spending minutes timing out downloads in `downloading_artifacts` So `/oracle-auth` was not the issue.",
    ]);
  });

  it("strips conversational lead-ins from user-facing titles", () => {
    const contexts = collectSessionContexts([
      createTurn({
        userMessagePreviews: [
          "We are not refactoring their app. That being said, we should fix any directly attached bugs to avoid slop and poor coding practices.",
        ],
        assistantMessagePreviews: [],
      }),
    ]);

    const context = contexts.get("session-1");
    expect(context?.leadPreview).toBe(
      "we should fix any directly attached bugs to avoid slop and poor coding practices.",
    );
  });

  it("prefers concrete user tasks over request-wrapper headings", () => {
    const contexts = collectSessionContexts([
      createTurn({
        userMessagePreviews: [
          "User request: Pro - Extended. Every file in this project included in the artifact upload.",
          "Port this tool for use in Cursor without MCP if possible.",
        ],
        assistantMessagePreviews: [],
      }),
    ]);

    const context = contexts.get("session-1");
    expect(context?.leadPreview).toBe(
      "Port this tool for use in Cursor without MCP if possible.",
    );
  });

  it("drops instruction-wrapper titles when a real review task is available", () => {
    const contexts = collectSessionContexts([
      createTurn({
        userMessagePreviews: [
          "When asked about: extensions (docs/extensions.md, examples/extensions/), themes (docs/themes.md), skills (docs/skills.md)",
          "let's go one by one and review each for gaps, oversights, and GPT-5.4 prompting best practices.",
        ],
        assistantMessagePreviews: [],
      }),
    ]);

    const context = contexts.get("session-1");
    expect(context?.leadPreview).toBe(
      "let's go one by one and review each for gaps, oversights, and GPT-5.4 prompting best practices.",
    );
  });

  it("trims inline numbered-list tails from surfaced titles", () => {
    const contexts = collectSessionContexts([
      createTurn({
        userMessagePreviews: [
          "Initial docs capturing the architecture and porting strategy 2. Wake-path spike implementation or proof-of-failure 3. Validation notes",
        ],
        assistantMessagePreviews: [],
      }),
    ]);

    const context = contexts.get("session-1");
    expect(context?.leadPreview).toBe(
      "Initial docs capturing the architecture and porting strategy",
    );
  });

  it("does not use assistant planning chatter as the session title", () => {
    const contexts = collectSessionContexts([
      createTurn({
        userMessagePreviews: [],
        assistantMessagePreviews: [
          "Alright, let me dig a bit deeper into this to make sure I'm understanding how to proceed.",
          "So, I'm going to read through the documentation at docs/roadmap.md.",
          "I'm checking the curated catalog first so we can confirm the exact skill name.",
          "I’m opening those exact sections to confirm whether they’re truly wrong for your setup.",
          "There's one more important thing to verify before we touch prompts.",
          "Also, I need to consider root cause triage for fixing bugs.",
          "The first pass found only two files with potential path assumptions, both under the scripts directory.",
        ],
      }),
    ]);

    const context = contexts.get("session-1");
    expect(context?.leadPreview).toBeUndefined();
    expect(context?.evidencePreviews).toEqual([]);
  });

  it("does not use weak conversational acknowledgements as the session title", () => {
    const contexts = collectSessionContexts([
      createTurn({
        userMessagePreviews: [
          "sounds good. let's do the changes and then explain explicitly what changed for each please.",
          "scout can continue to use openai-codex/gpt-5.4-mini if needed.",
          "no additional runs at this time please. finish the turn",
          "no docs/report. just fix the code",
          "Problem: Violates SRP, impossible to test, high coupling",
          "Impact: Changes require modifying 1 file, high regression risk",
          'Fix: Use parameterized queries: db.Query("SELECT * FROM users WHERE id = ?", userID)',
        ],
        assistantMessagePreviews: [],
      }),
    ]);

    const context = contexts.get("session-1");
    expect(context?.leadPreview).toBeUndefined();
    expect(context?.evidencePreviews).toEqual([]);
  });

  it("does not use tree output or token-budget checklist chatter as session evidence", () => {
    const contexts = collectSessionContexts([
      createTurn({
        userMessagePreviews: [],
        assistantMessagePreviews: [
          "│ │ ├── planning-ui-verify-2026-03-16",
          "31,188 tokens — well within the 158,500 budget. Let me verify the pre-halt checklist:",
        ],
      }),
    ]);

    const context = contexts.get("session-1");
    expect(context?.leadPreview).toBeUndefined();
    expect(context?.evidencePreviews).toEqual([]);
  });

  it("demotes teaching-meta user phrasing when a concrete task is available", () => {
    const contexts = collectSessionContexts([
      createTurn({
        userMessagePreviews: [
          "The key point: understanding is not 'I recognize this when I see it.'",
          "How do I add a print statement to manually debug and see the outputs?",
          "small concise hint, do I need a set to keep track of indices already added to the output list?",
          "I either do not get it or you are being intentionally confusing",
          'Why do I need the , 0 part here? """ seen.get(compliment,',
          "I think I need to revisit this in the morning after some sleep",
          '* Do not give long lectures unless I am blocked after multiple attempts. * Do not let me hide behind "I get it." * Prefer tiny drills over large explanations.',
        ],
        assistantMessagePreviews: [],
      }),
    ]);

    const context = contexts.get("session-1");
    expect(context?.leadPreview).toBe(
      "How do I add a print statement to manually debug and see the outputs?",
    );
  });

  it("demotes generic imperative stubs in favor of better nearby evidence", () => {
    const contexts = collectSessionContexts([
      createTurn({
        userMessagePreviews: [
          "I just created a fork of this repo.",
          "I need you to dig through system logs and see if you can find logs of when it has issues.",
          "implement this change",
          "fix it",
          "do it",
          "If you need sudo and can't use it let me know and I can run commands and pipe to files for you to review, but try it yourself first.",
          "staging tests to assert `.tmp/` and `.ralph/` are excluded **Bottom Line** If we want one coherent repo policy, I'd implement:",
          "If we want one coherent repo policy, I'd implement:",
        ],
        assistantMessagePreviews: [
          "The worker was misclassifying those refs as artifacts, then spending minutes timing out downloads.",
        ],
      }),
    ]);

    const context = contexts.get("session-1");
    expect(context?.leadPreview).toBe(
      "I need you to dig through system logs and see if you can find logs of when it has issues.",
    );
    expect(context?.evidencePreviews).not.toContain("implement this change");
  });

  it("falls back to assistant diagnosis when only setup chatter and generic debug asks remain", () => {
    const contexts = collectSessionContexts([
      createTurn({
        userMessagePreviews: [
          "i just re-ran oracle-auth in a separate window btw. continue",
          "Please debug.",
          'Do not put filenames on their own lines or in a dedicated file list." Is 100% NOT the way to make hacky, fragile, brittle code work. Unless I am missing something this mandate should NOT be a requirement.',
        ],
        assistantMessagePreviews: [
          "the worker was misclassifying those refs as artifacts, then spending minutes timing out downloads in downloading_artifacts.",
        ],
      }),
    ]);

    const context = contexts.get("session-1");
    expect(context?.leadPreview).toBe(
      "the worker was misclassifying those refs as artifacts, then spending minutes timing out downloads in downloading_artifacts.",
    );
  });

  it("does not promote weak control text ahead of real user evidence", () => {
    const contexts = collectSessionContexts([
      createTurn({
        userMessagePreviews: [
          "no additional runs at this time please. finish the turn",
          "The export path is still broken after the rename and needs a focused fix.",
        ],
        assistantMessagePreviews: [],
      }),
    ]);

    const context = contexts.get("session-1");
    expect(context?.evidencePreviews[0]).toBe(
      "The export path is still broken after the rename and needs a focused fix.",
    );
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
    expect(context?.evidencePreviews).toEqual([]);
  });

  it("prefers metadata and no evidence over loop boilerplate", () => {
    const contexts = collectSessionContexts([
      createTurn({
        userMessagePreviews: [
          "**Action-biased**: next experiment, cleanup, revert, promotion, or handoff improvement.",
          "**Good turn**: substantive improvement + log + commit + push + clean tree.",
          "is repo state clean and up to date with remote?",
        ],
        assistantMessagePreviews: [
          "The canonical MLX baseline smoke test passed. Now I need to run the full shared protocol.",
        ],
      }),
    ]);

    const context = contexts.get("session-1");
    expect(context?.leadPreview).toBeUndefined();
    expect(context?.evidencePreviews).toEqual([]);
  });

  it("drops loop reinjection text from evidence when the preview is only prompt-cycle boilerplate", () => {
    const contexts = collectSessionContexts([
      createTurn({
        userMessagePreviews: [
          "After **each** turn you finish, the system **automatically sends this entire prompt again**. That repeats **until the human manually interrupts**.",
        ],
        assistantMessagePreviews: [],
      }),
    ]);

    const context = contexts.get("session-1");
    expect(context?.leadPreview).toBeUndefined();
    expect(context?.evidencePreviews).toEqual([]);
  });

  it("strips numbered list prefixes from strong user titles", () => {
    const contexts = collectSessionContexts([
      createTurn({
        userMessagePreviews: [
          "5. Agreed but which value do we change? Stability is important but we want to maximize throughput and not be too conservative.",
        ],
        assistantMessagePreviews: [],
      }),
    ]);

    const context = contexts.get("session-1");
    expect(context?.leadPreview).toBe("Agreed but which value do we change?");
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

  it("prefers concrete assistant findings over user instruction debris in evidence", () => {
    const contexts = collectSessionContexts([
      createTurn({
        userMessagePreviews: [
          "The skills at [redacted-url] are preinstalled, so no need to help users install those.",
          'Example: When designing a `frontend-webapp-builder` skill for queries like "Build me a todo app," the analysis shows:',
        ],
        assistantMessagePreviews: [
          "I’ve narrowed it down to one real path bug and one doc that just needs clearer wording.",
          "scan all skills in ~/.agents/skills for any incorrect path references. You might need to look for CODEX_HOME too.",
        ],
      }),
    ]);

    const context = contexts.get("session-1");
    expect(context?.leadPreview).toBeUndefined();
    expect(context?.evidencePreviews).toEqual([
      "I’ve narrowed it down to one real path bug and one doc that just needs clearer wording.",
      "scan all skills in ~/.agents/skills for any incorrect path references. You might need to look for CODEX_HOME too.",
    ]);
  });

  it("uses direct user questions as medium-confidence session titles before metadata", () => {
    const contexts = collectSessionContexts([
      createTurn({
        userMessagePreviews: [
          "Is this the best we can do for time to completion, or are we leaving obvious speed on the table?",
        ],
        assistantMessagePreviews: [],
      }),
    ]);

    const context = contexts.get("session-1");
    expect(context?.leadPreview).toBe(
      "Is this the best we can do for time to completion, or are we leaving obvious speed on the table?",
    );
    expect(context?.leadPreviewSource).toBe("user");
    expect(context?.leadPreviewConfidence).toBe("medium");
  });
});
