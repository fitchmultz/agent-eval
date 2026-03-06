/**
 * Purpose: Verifies artifact previews are redacted and truncated before they are emitted into public-safe outputs.
 * Entrypoint: Executed by Vitest via `pnpm test`.
 * Notes: Uses synthetic text with home paths and email addresses to exercise deterministic redaction.
 */
import { describe, expect, it } from "vitest";

import {
  createMessagePreviews,
  isLowSignalPreview,
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

    expect(sanitized).toBe("aaaaaaaaa...");
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
      isLowSignalPreview("Please verify after the patch and rerun the tests."),
    ).toBe(false);
  });
});
