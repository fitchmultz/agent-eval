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
        "Tests still fail after the patch. Please verify before ending.",
      ),
    ).toBe(false);
  });
});
