/**
 * Purpose: Verifies artifact previews are redacted and truncated before they are emitted into public-facing redaction outputs.
 * Entrypoint: Executed by Vitest via `pnpm test`.
 * Notes: Uses synthetic text with home paths and email addresses to exercise deterministic redaction.
 */
import { describe, expect, it } from "vitest";

import {
  createMessagePreviews,
  isLowSignalPreview,
  isUnsafePreview,
  sanitizeMessageText,
} from "../src/sanitization.js";

describe("sanitizeMessageText", () => {
  it("redacts home paths and email addresses", () => {
    const sanitized = sanitizeMessageText(
      "See /Users/example/project and email me at dev@example.com for details.",
      {
        homeDirectory: "/Users/example",
        maxLength: 200,
      },
    );

    expect(sanitized).toContain("~/project");
    expect(sanitized).toContain("[redacted-email]");
    expect(sanitized).not.toContain("/Users/example");
    expect(sanitized).not.toContain("dev@example.com");
  });

  it("truncates long previews deterministically", () => {
    const sanitized = sanitizeMessageText("a".repeat(40), {
      maxLength: 12,
    });

    expect(sanitized).toBe("[redacted...");
  });

  it("redacts ssh, identity, and abusive transcript fragments", () => {
    const sanitized = sanitizeMessageText(
      "DID YOU FUCKING DELETE MY SSH KEYS??? no such identity: ~/.ssh/mitchfultz_id_ed25519 Permission denied (publickey)",
      {
        maxLength: 200,
      },
    );

    expect(sanitized).toContain("[redacted-sensitive-content]");
    expect(sanitized).not.toContain("mitchfultz_id_ed25519");
    expect(sanitized).not.toContain("SSH KEYS");
    expect(sanitized).not.toContain("FUCKING");
  });

  it("redacts milder insulting phrasing for public previews", () => {
    const sanitized = sanitizeMessageText("dumb question. obviously", {
      maxLength: 200,
    });

    expect(sanitized).toContain("[redacted-abusive-language]");
    expect(sanitized).not.toContain("dumb");
  });
});

describe("createMessagePreviews", () => {
  it("limits preview count", () => {
    const previews = createMessagePreviews(["one", "two", "three"], {
      maxItems: 2,
      maxLength: 50,
    });

    expect(previews).toEqual(["one", "two"]);
  });

  it("prefers human signal over AGENTS and environment boilerplate", () => {
    const previews = createMessagePreviews(
      [
        "# AGENTS.md instructions for /tmp/demo <INSTRUCTIONS>",
        "<environment_context> <cwd>/tmp/demo</cwd> </environment_context>",
        "Tests still fail after your patch. Please verify before ending.",
      ],
      {
        maxItems: 1,
        maxLength: 120,
      },
    );

    expect(previews).toEqual([
      "Tests still fail after your patch. Please verify before ending.",
    ]);
  });

  it("prefers safer evidence over sensitive transcript fragments", () => {
    const previews = createMessagePreviews(
      [
        "See the following: DID YOU FUCKING DELETE MY SSH KEYS??? no such identity: ~/.ssh/mitchfultz_id_ed25519",
        "Git pull failed after the deploy cutover and the repo now needs the SSH auth fix restored.",
      ],
      {
        maxItems: 1,
        maxLength: 140,
      },
    );

    expect(previews).toEqual([
      "Git pull failed after the deploy cutover and the repo now needs the SSH auth fix restored.",
    ]);
  });

  it("demotes skill catalogs and trust docs below concrete user problem statements", () => {
    const previews = createMessagePreviews(
      [
        "- create-subagent: Create custom subagents for specialized AI tasks. Use when you want to create a new type of subagent, set up task-specific agents, configure code reviewers, debuggers, or domain-specific assistants.",
        '### Repo Execution Trust - Repo-local executable settings are gated by local `.ralph/trust.jsonc`. - Trust file shape: `{"allow_project_commands": true}`.',
        "- Policy drift: the repo has a safer argv-first subprocess abstraction, but shell-string execution still leaks.",
      ],
      {
        maxItems: 1,
        maxLength: 160,
      },
    );

    expect(previews).toEqual([
      "- Policy drift: the repo has a safer argv-first subprocess abstraction, but shell-string execution still leaks.",
    ]);
  });

  it("avoids bare ssh recovery phrasing when safer same-turn evidence exists", () => {
    const previews = createMessagePreviews(
      [
        "• Checking the actual key state now. If the encrypted artifacts are usable, I’ll restore ~/.ssh immediately; if not, I’ll verify exactly where the key material still exists so we can recover it without guessing.",
        "Please make sure you have the correct access rights and the repository exists.",
      ],
      {
        maxItems: 1,
        maxLength: 160,
      },
    );

    expect(previews).toEqual([
      "Please make sure you have the correct access rights and the repository exists.",
    ]);
  });

  it("extracts higher-signal sections from structured batch briefings", () => {
    const previews = createMessagePreviews(
      [
        `# Cloop Batch 1: Loop Surface State + Next View UX

## Mission / Scope
Fully remediate loop-surface defects in the Inbox, Next, and adjacent loop-management views for Cloop's web UI.

## Defects To Eliminate
Top Incidents still shows orchestration wrappers instead of the actual user problem signal.

## Acceptance Criteria
Reports should show meaningful human evidence instead of batch boilerplate.`,
      ],
      {
        maxItems: 1,
        maxLength: 140,
      },
    );

    expect(previews).toEqual([
      "Top Incidents still shows orchestration wrappers instead of the actual user problem signal.",
    ]);
  });

  it("extracts the human question from JSON tool examples", () => {
    const previews = createMessagePreviews(
      [
        '**Ask the chat when stuck:** ```json {"tool":"chat_send","args":{"chat_id":"<same chat_id>","message":"How does X connect to Y in these files? Any edge cases I should watch for?","mode":"chat","new_chat":false}} ```',
      ],
      {
        maxItems: 1,
        maxLength: 140,
      },
    );

    expect(previews).toEqual([
      "How does X connect to Y in these files? Any edge cases I should watch for?",
    ]);
  });

  it("prefers concrete problem statements over completion-format instructions", () => {
    const previews = createMessagePreviews(
      [
        '- End your turn with a short "what changed / how to verify / what\'s next" summary.',
        "- Policy drift: the repo has a safer argv-first subprocess abstraction, but shell-string execution still leaks.",
      ],
      {
        maxItems: 1,
        maxLength: 140,
      },
    );

    expect(previews).toEqual([
      "- Policy drift: the repo has a safer argv-first subprocess abstraction, but shell-string execution still leaks.",
    ]);
  });
});

describe("isLowSignalPreview", () => {
  it("flags harness boilerplate previews", () => {
    expect(
      isLowSignalPreview(
        "# AGENTS.md instructions for /tmp/demo <INSTRUCTIONS>",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "# Parallel Integration (Mandatory) - Attempt 1/50 You are finalizing task `RQ-0025` for direct push to `origin/main`.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        '<forked_session source="demo"> If you have already received a <forked_session> block with this same delivery_id...',
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        '<subagent_notification> {"agent_id":"demo","status":{"completed":"done"}}',
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "# Deep Investigation Mode Investigate: You are an autonomous public-release hardening agent.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "$comprehensive-codebase-audit $rp-reminder group the findings based on whether an agent can remediate them together or not.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "PLEASE IMPLEMENT THIS PLAN: ## Fix Legacy Config Upgrade Path",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "<skill> <name>rp-build</name> <path>~/.agents/skills/rp-build/SKILL.md</path> repoprompt_managed: true",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "<system message> Your job is to: 1. Analyze the requested change against the provided code.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "# MISSION You are Task Builder for this repository. ## AGENT SWARM INSTRUCTION",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "# Cloop Batch 1: Loop Surface State + Next View UX ## Mission / Scope Fully remediate loop-surface defects in the Inbox and Next views.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "## Project Intent - Rust workspace with shared client logic and two frontends.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "- [ ] Any generated artifacts should either be cleaned up or placed in a project-appropriate artifact location.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "**Shell/Bash:** - unquoted variables - missing `set -euo pipefail` - backticks vs `$()` - eval usage - parsing ls output",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "- Always use `tmux` when you need persistent or interactive command execution.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "> ⚠️ **CRITICAL**: Current date is **March 2026**. Always verify information is up-to-date; never assume 2024 references are current.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "- create-subagent: Create custom subagents for specialized AI tasks. Use when you want to create a new type of subagent.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        'find-skills: Helps users discover and install agent skills when they ask questions like "how do I do X".',
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "verification-before-completion: Verify work passes all gates before claiming completion. Use before committing, creating PRs, or declaring tasks done.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "repoprompt-tool-guidance-refresh: Update documentation in `$THIS_SKILL_FOLDER/rp-prompts-wip/` based on empirical verification of the latest RepoPrompt MCP server and CLI.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "- Missing/blocked: If a named skill isn't in the list or the path can't be read, say so briefly and continue with the best fallback.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "- Safety and fallback: If a skill can't be applied cleanly, state the issue, pick the next-best approach, and continue.",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "If you want, I will do exactly one of these next, and nothing else:",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        '### Repo Execution Trust - Repo-local executable settings are gated by local `.ralph/trust.jsonc`. - Trust file shape: `{"allow_project_commands": true}`.',
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview(
        "BOTTOM LINE - what you think I want + your recommendation",
      ),
    ).toBe(true);
    expect(
      isLowSignalPreview("Please verify after the patch and rerun the tests."),
    ).toBe(false);
  });
});

describe("isUnsafePreview", () => {
  it("flags sensitive-looking or aggressively redacted previews", () => {
    expect(
      isUnsafePreview(
        "User reported [redacted-sensitive-content] after git auth failed.",
      ),
    ).toBe(true);
    expect(
      isUnsafePreview(
        "Git pull failed because the SSH key setup was missing after the migration.",
      ),
    ).toBe(true);
    expect(
      isUnsafePreview(
        "Checking the actual key state now. If the encrypted artifacts are usable, I'll restore ~/.ssh immediately.",
      ),
    ).toBe(true);
    expect(
      isUnsafePreview(
        "The pre-cutover commit still contains the plaintext private keys and I'm restoring those back into place.",
      ),
    ).toBe(true);
    expect(
      isUnsafePreview(
        "Tests still fail after the patch. Please verify before ending.",
      ),
    ).toBe(false);
  });
});
